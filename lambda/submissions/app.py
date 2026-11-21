import time
import uuid

from boto3.dynamodb.conditions import Key
from grade_common import (
    BUCKET, ClientError, Problem, conflict, db, endpoint, entitlement,
    get, identity, key, profile, response, s3,
)

PUBLIC = ('submissionId', 'studentName', 'subject', 'fileName', 'status', 'createdAt',
          'scorePct', 'grade', 'totalEarned', 'totalMax', 'feedback', 'errorMessage', 'reservation')


def view(item, summary=False):
    return {k: item[k] for k in PUBLIC if k in item and (not summary or k != 'feedback')}


@endpoint
def handler(event, context):
    uid = identity(event)
    route = event['routeKey']
    item = profile(uid, deleting=route == 'DELETE /me')
    if route == 'DELETE /me':
        if not item.get('deleting'):
            now = int(time.time())
            try:
                db.update_item(Key=key(uid), UpdateExpression='SET deleting = :yes, pending = :pending, pendingUntil = :until',
                    ConditionExpression='attribute_exists(PK) AND attribute_not_exists(deleting)',
                    ExpressionAttributeValues={':yes': True, ':pending': 'OPEN',
                        ':until': max(now + 330, int(item.get('checkoutLockUntil', 0)) + 30)})
            except ClientError as exc:
                if not conflict(exc):
                    raise
        return response(202, {'message': 'Account deletion has been scheduled.'})
    if route == 'GET /me/usage':
        usage = entitlement(item, int(time.time()))
        return response(200, {**usage, 'hasBillingAccount': bool(item.get('stripeCustomerId')),
            'trialRemaining': item['trialRemaining'], 'trialCompleted': item.get('trialCompleted', 0)})
    if route == 'GET /submissions':
        query = {'KeyConditionExpression': Key('PK').eq(key(uid)['PK']) & Key('SK').begins_with('SUB#'),
                'ScanIndexForward': False, 'Limit': 25, 'ConsistentRead': True,
                'ProjectionExpression': ', '.join('#f' + str(i) for i in range(len(PUBLIC) - 1)) + ', PK, SK',
                'ExpressionAttributeNames': {'#f' + str(i): k for i, k in enumerate(k for k in PUBLIC if k != 'feedback')}}
        cursor = (event.get('queryStringParameters') or {}).get('cursor')
        if cursor:
            if not cursor.startswith('SUB#') or len(cursor) > 100:
                raise Problem(400, 'Invalid history cursor.')
            query['ExclusiveStartKey'] = key(uid, cursor)
        page = db.query(**query)
        return response(200, {'items': [view(row, summary=True) for row in page['Items']],
            'cursor': page.get('LastEvaluatedKey', {}).get('SK')})
    sid = event['pathParameters']['id']
    try:
        if str(uuid.UUID(sid)) != sid:
            raise ValueError()
    except ValueError as exc:
        raise Problem(404, 'Sheet not found.') from exc
    rows = db.query(IndexName='SubmissionId',
        KeyConditionExpression=Key('submissionId').eq(sid) & Key('PK').eq(key(uid)['PK']))['Items']
    row = get(key(uid, rows[0]['SK'])) if rows else None
    if not row:
        raise Problem(404, 'Sheet not found.')
    if route == 'GET /submissions/{id}':
        return response(200, view(row))
    if row['status'] not in ('done', 'error'):
        raise Problem(409, 'Wait for the sheet to finish processing before deleting it.')
    s3.delete_object(Bucket=BUCKET, Key=row['s3Key'])
    db.delete_item(Key=key(uid, row['SK']))
    return response(200, {'deleted': True})
