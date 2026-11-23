import time
import uuid

from boto3.dynamodb.conditions import Key
from grade_common import (
    BUCKET, ClientError, Problem, conflict, db, endpoint, entitlement,
    get, identity, key, payload, profile, response, s3,
)

PUBLIC = ('submissionId', 'studentName', 'subject', 'fileName', 'status', 'createdAt',
          'scorePct', 'grade', 'totalEarned', 'totalMax', 'feedback', 'errorMessage', 'reservation', 'assessment', 'gradeLevel', 'skillBreakdown', 'retrySavedAt')


def view(item, summary=False):
    fields = PUBLIC if summary else (*PUBLIC, 'retry')
    return {k: item[k] for k in fields if k in item and (not summary or k != 'feedback')}


def save_retry(event, uid, row):
    if row['status'] != 'done':
        raise Problem(409, 'Wait until grading finishes to save a retry.')
    data = payload(event)
    kind, index = data.get('kind'), data.get('index')
    feedback = row.get('feedback', {})
    if kind == 'writing':
        options = feedback.get('revisionExamples', [])
    elif kind == 'question':
        options = feedback.get('questions', [])
    else:
        options = []
    if (type(index) is not int or not 0 <= index < len(options) or
            (kind == 'question' and options[index].get('status') not in ('incorrect', 'partial'))):
        raise Problem(400, 'Choose an item from this sheet to retry.')
    answer, explanation = data.get('answer'), data.get('explanation')
    if (not isinstance(answer, str) or not 1 <= len(answer.strip()) <= 1200 or
            not isinstance(explanation, str) or not 1 <= len(explanation.strip()) <= 600):
        raise Problem(400, 'Enter a new answer and a short explanation of what changed.')
    saved_at = int(time.time())
    retry = {'kind': kind, 'index': index, 'answer': answer.strip(), 'explanation': explanation.strip()}
    try:
        db.update_item(Key=key(uid, row['SK']), UpdateExpression='SET #retry = :retry, retrySavedAt = :stamp',
            ConditionExpression='attribute_exists(PK) AND #status = :done',
            ExpressionAttributeNames={'#retry': 'retry', '#status': 'status'},
            ExpressionAttributeValues={':retry': retry, ':stamp': saved_at, ':done': 'done'})
    except ClientError as exc:
        if conflict(exc):
            raise Problem(409, 'This sheet is no longer available for retry.') from exc
        raise
    return response(200, {'retry': retry, 'retrySavedAt': saved_at})


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
    if route == 'POST /submissions/{id}/retry':
        return save_retry(event, uid, row)
    if row['status'] not in ('done', 'error'):
        raise Problem(409, 'Wait for the sheet to finish processing before deleting it.')
    s3.delete_object(Bucket=BUCKET, Key=row['s3Key'])
    db.delete_item(Key=key(uid, row['SK']))
    return response(200, {'deleted': True})
