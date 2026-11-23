import calendar
import json
import os
import time
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

TABLE = os.environ['TABLE']
db = boto3.resource('dynamodb').Table(TABLE)
ddb = db.meta.client
s3 = boto3.client('s3', config=Config(signature_version='s3v4'))
BUCKET = os.environ['UPLOAD_BUCKET']
TRIAL = 5
KINDS = {
    'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp',
    'application/pdf': 'pdf', 'text/plain': 'txt',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}
SUBJECTS = ('English', 'Math', 'Science')


def key(uid, sk='PROFILE'):
    return {'PK': 'USER#' + uid, 'SK': sk}


def get(k):
    return db.get_item(Key=k, ConsistentRead=True).get('Item')


def transact(*operations):
    # boto3's DynamoDB resource client serializes native Python values.
    ddb.transact_write_items(TransactItems=[
        {name: {'TableName': TABLE, **params}} for name, params in operations
    ])


def conflict(exc):
    if exc.response['Error']['Code'] == 'ConditionalCheckFailedException':
        return True
    return any(r.get('Code') in ('ConditionalCheckFailed', 'TransactionConflict')
               for r in exc.response.get('CancellationReasons', []))


def metric(**values):
    print(json.dumps({'_aws': {'Timestamp': int(time.time() * 1000),
        'CloudWatchMetrics': [{'Namespace': os.environ['METRIC_NAMESPACE'],
            'Dimensions': [[]], 'Metrics': [{'Name': k} for k in values]}]}, **values}))


def response(status, body=None):
    return {'statusCode': status, 'headers': {
        'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
        'body': json.dumps(body, default=lambda n: int(n) if n % 1 == 0 else float(n))}


class Problem(Exception):
    def __init__(self, status, message, **details):
        self.status = status
        self.body = {'message': message, **details}


def endpoint(func):
    def handler(event, context):
        try:
            return func(event, context)
        except Problem as exc:
            return response(exc.status, exc.body)
        except Exception as exc:
            print(json.dumps({'errorType': type(exc).__name__, 'requestId': context.aws_request_id}))
            metric(ApiFailures=1)
            return response(500, {'message': 'The request could not be completed. Please try again.'})
    return handler


def identity(event):
    claims = event['requestContext']['authorizer']['jwt']['claims']
    if (claims.get('token_use') != 'id' or
            str(claims.get('email_verified')).lower() != 'true'):
        raise Problem(403, 'Verify your email before continuing.')
    return claims['sub']


def payload(event):
    try:
        data = json.loads(event.get('body') or '{}')
        if isinstance(data, dict):
            return data
    except ValueError:
        pass
    raise Problem(400, 'Send a JSON object.')


def profile(uid, deleting=False):
    item = get(key(uid))
    if not item or (item.get('deleting') and not deleting):
        raise Problem(403, 'This account is unavailable.')
    return item


def month_offset(anchor, offset):
    current = datetime.fromtimestamp(anchor, timezone.utc)
    year, month = divmod(current.year * 12 + current.month - 1 + offset, 12)
    month += 1
    return int(current.replace(year=year, month=month,
        day=min(current.day, calendar.monthrange(year, month)[1])).timestamp())


def entitlement(item, now):
    plan = item.get('plan', 'trial')
    end = int(item.get('periodEnd', 0))
    if plan not in ('monthly', 'yearly') or item.get('status') not in ('active', 'trialing') or now >= end:
        if os.environ.get('UNLIMITED_TRIAL') == 'true':
            return {'plan': 'trial', 'unlimited': True, 'limit': None, 'remaining': None,
                    'renewal': None, 'subscriptionStatus': item.get('status', 'trial')}
        return {'plan': 'trial', 'limit': TRIAL, 'remaining': int(item['trialRemaining']),
                'used': TRIAL - int(item['trialRemaining']), 'renewal': None,
                'subscriptionStatus': item.get('status', 'trial')}
    start = int(item['periodStart'])
    if plan == 'yearly':
        anchor = start
        for offset in range(1, 13):
            boundary = month_offset(anchor, offset)
            if boundary > now:
                end = min(end, boundary)
                break
            start = boundary
    limit = int(os.environ[plan.upper() + '_QUOTA'])
    used = int(item.get('usedThisPeriod', 0)) if item.get('usageWindow') == start else 0
    return {'plan': plan, 'limit': limit, 'remaining': max(0, limit - used), 'used': used,
            'renewal': end, 'window': start, 'subscriptionStatus': item['status']}


def finish(item, state, data, *, lease=None, expired_before=None):
    names = {'#status': 'status'}
    values = {':old': item['status'], ':state': state, ':stamp': int(time.time())}
    condition = '#status = :old'
    if lease is not None:
        condition += ' AND lease = :lease'
        values[':lease'] = lease
    if expired_before is not None:
        condition += ' AND pendingUntil <= :deadline'
        values[':deadline'] = expired_before
    assignments = ['#status = :state', 'finishedAt = :stamp']
    for index, (field, value) in enumerate(data.items()):
        names[f'#f{index}'] = field
        values[f':v{index}'] = value
        assignments.append(f'#f{index} = :v{index}')
    update = ('Update', {'Key': {k: item[k] for k in ('PK', 'SK')},
        'ConditionExpression': condition, 'ExpressionAttributeNames': names,
        'ExpressionAttributeValues': values,
        'UpdateExpression': 'SET ' + ', '.join(assignments) + ' REMOVE pending, pendingUntil, lease'})
    pkey = {'PK': item['PK'], 'SK': 'PROFILE'}
    if state == 'done':
        if item['reservation'] != 'trial':
            transact(update)
            metric(Completed=1, Failed=0)
            return
        for _ in range(8):
            owner = get(pkey)
            if not owner or owner.get('deleting'):
                return
            previous = owner.get('trialCompleted', 0)
            count = previous + 1
            try:
                transact(update, ('Update', {'Key': pkey,
                    'UpdateExpression': 'SET trialCompleted = :count',
                    'ConditionExpression': 'attribute_exists(PK) AND attribute_not_exists(deleting) AND '
                        '(attribute_not_exists(trialCompleted) OR trialCompleted = :previous)',
                    'ExpressionAttributeValues': {':count': count, ':previous': previous}}))
            except ClientError as exc:
                if not conflict(exc):
                    raise
                latest = get(update[1]['Key'])
                if not latest or latest.get('status') != item['status'] or latest.get('lease') != item.get('lease'):
                    return
                continue
            metric(Completed=1, Failed=0, TrialSheets=1, **{f'TrialReached{count}': 1})
            return
        raise RuntimeError('Could not count trial completion')
    for _ in range(6):
        current = get(pkey)
        refund = None
        if current and not current.get('deleting'):
            if item['reservation'] == 'trial':
                refund = ('Update', {'Key': pkey, 'UpdateExpression': 'ADD trialRemaining :one',
                    'ConditionExpression': 'attribute_exists(PK) AND attribute_not_exists(deleting) AND trialRemaining < :limit',
                    'ExpressionAttributeValues': {':one': 1, ':limit': TRIAL}})
            elif (item['reservation'] == 'paid' and current.get('usageWindow') == item['reservedWindow']
                  and current.get('usedThisPeriod', 0) > 0):
                refund = ('Update', {'Key': pkey, 'UpdateExpression': 'ADD usedThisPeriod :minus',
                    'ConditionExpression': 'usageWindow = :window AND usedThisPeriod > :zero AND attribute_not_exists(deleting)',
                    'ExpressionAttributeValues': {':minus': -1, ':window': item['reservedWindow'], ':zero': 0}})
        try:
            transact(update, *([refund] if refund else []))
            metric(Completed=1, Failed=1)
            return
        except ClientError as exc:
            if not conflict(exc):
                raise
            latest = get(update[1]['Key'])
            if not latest or latest.get('status') != item['status'] or latest.get('lease') != item.get('lease'):
                return
    raise RuntimeError('Could not release reservation')
