import time

import boto3
import stripe
from boto3.dynamodb.conditions import Key
from grade_common import BUCKET, db, finish, get, os, s3
from grade_stripe import active_subscriptions, config


def purge(item, context):
    uid = item['PK'].removeprefix('USER#')
    pkey = {'PK': item['PK'], 'SK': 'PROFILE'}
    current = get(pkey)
    if not current or not current.get('deleting'):
        return
    if current.get('stripeCustomerId') and not current.get('stripeClosed'):
        config()
        customer = current['stripeCustomerId']
        try:
            if not stripe.Customer.retrieve(customer).get('deleted'):
                for session in stripe.checkout.Session.list(customer=customer, status='open', limit=100).auto_paging_iter():
                    stripe.checkout.Session.expire(session.id)
                for sub in active_subscriptions(customer):
                    stripe.Subscription.cancel(sub.id)
                stripe.Customer.delete(customer)
        except stripe.InvalidRequestError as exc:
            if exc.code != 'resource_missing':
                raise
        db.update_item(Key=pkey, UpdateExpression='SET stripeClosed = :yes',
                       ConditionExpression='deleting = :yes', ExpressionAttributeValues={':yes': True})
    auth = boto3.client('cognito-idp')
    try:
        auth.admin_delete_user(UserPoolId=os.environ['USER_POOL'], Username=current.get('cognitoUsername', uid))
    except auth.exceptions.UserNotFoundException:
        pass
    while context.get_remaining_time_in_millis() > 12000:
        objects = s3.list_objects_v2(Bucket=BUCKET, Prefix=f'uploads/{uid}/', MaxKeys=1000).get('Contents', [])
        if not objects:
            break
        deleted = s3.delete_objects(Bucket=BUCKET, Delete={'Quiet': True,
            'Objects': [{'Key': obj['Key']} for obj in objects]})
        if deleted.get('Errors'):
            raise RuntimeError('Object deletion incomplete')
    else:
        return
    while context.get_remaining_time_in_millis() > 12000:
        page = db.query(
            KeyConditionExpression=Key('PK').eq(item['PK']), ConsistentRead=True)
        with db.batch_writer() as batch:
            for row in page['Items']:
                if row['SK'] != 'PROFILE':
                    batch.delete_item(Key={'PK': row['PK'], 'SK': row['SK']})
        if not page.get('LastEvaluatedKey'):
            db.delete_item(Key=pkey)
            return


def handler(event, context):
    now = int(time.time())
    query = {'IndexName': 'Pending', 'KeyConditionExpression':
        Key('pending').eq('OPEN') & Key('pendingUntil').lte(now)}
    failures = 0
    while context.get_remaining_time_in_millis() > 15000:
        page = db.query(**query, Limit=25)
        for item in page['Items']:
            if context.get_remaining_time_in_millis() <= 15000:
                break
            try:
                if item['SK'] == 'PROFILE':
                    purge(item, context)
                    continue
                message = ('The upload did not finish. Please upload the sheet again.' if item['status'] == 'uploading'
                    else 'Grading took too long. Please try the sheet again.')
                finish(item, 'error', {'errorMessage': message}, expired_before=now)
            except Exception as exc:
                failures += 1
                print({'maintenanceErrorType': type(exc).__name__})
        if 'LastEvaluatedKey' not in page:
            break
        query['ExclusiveStartKey'] = page['LastEvaluatedKey']
    if failures:
        raise RuntimeError('Some maintenance operations need to be retried')
