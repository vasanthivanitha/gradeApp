import time
import uuid

import stripe

from grade_common import ClientError, Problem, conflict, db, endpoint, identity, key, os, payload, profile, response
from grade_stripe import config, ensure_no_subscription, price


@endpoint
def handler(event, context):
    uid = identity(event)
    item = profile(uid)
    config()
    origin = os.environ['SITE_ORIGIN']
    if event['routeKey'] == 'POST /billing/portal':
        if not item.get('stripeCustomerId'):
            raise Problem(409, 'Choose a plan before opening the billing portal.')
        session = stripe.billing_portal.Session.create(customer=item['stripeCustomerId'],
            return_url=origin + '/billing')
        return response(200, {'url': session.url})
    plan = payload(event).get('plan')
    if plan not in ('monthly', 'yearly'):
        raise Problem(400, 'Choose monthly or yearly billing.')
    customer_id = item.get('stripeCustomerId')
    if not customer_id:
        customer = stripe.Customer.create(email=event['requestContext']['authorizer']['jwt']['claims']['email'],
            metadata={'account': uid}, idempotency_key='customer:' + uid)
        customer_id = customer.id
        try:
            db.update_item(Key=key(uid), UpdateExpression='SET stripeCustomerId = :customer',
                ConditionExpression='attribute_exists(PK) AND '
                    '(attribute_not_exists(stripeCustomerId) OR stripeCustomerId = :customer)',
                ExpressionAttributeValues={':customer': customer_id})
        except ClientError as exc:
            if not conflict(exc):
                raise
            if not profile(uid).get('stripeCustomerId'):
                raise Problem(409, 'Billing is temporarily unavailable.') from exc
            customer_id = profile(uid)['stripeCustomerId']
    ensure_no_subscription(customer_id)
    # Keep one live checkout per account. A new selection expires the prior one.
    lock = str(uuid.uuid4())
    now = int(time.time())
    try:
        db.update_item(Key=key(uid), UpdateExpression='SET checkoutLock = :lock, checkoutLockUntil = :until',
            ConditionExpression='attribute_exists(PK) AND attribute_not_exists(deleting) AND '
                '(attribute_not_exists(checkoutLockUntil) OR checkoutLockUntil < :now)',
            ExpressionAttributeValues={':lock': lock, ':until': now + 120, ':now': now})
    except ClientError as exc:
        if conflict(exc):
            raise Problem(409, 'Another checkout request is in progress. Try again shortly.') from exc
        raise
    try:
        for old in stripe.checkout.Session.list(customer=customer_id, status='open', limit=100).auto_paging_iter():
            if old.mode == 'subscription':
                stripe.checkout.Session.expire(old.id)
        ensure_no_subscription(customer_id)
        session = stripe.checkout.Session.create(mode='subscription', customer=customer_id,
            line_items=[{'price': price(plan), 'quantity': 1}],
            success_url=origin + '/billing?checkout=success',
            cancel_url=origin + '/pricing', expires_at=now + 3600, idempotency_key='checkout:' + lock)
        return response(200, {'url': session.url})
    finally:
        try:
            db.update_item(Key=key(uid), UpdateExpression='REMOVE checkoutLock, checkoutLockUntil',
                ConditionExpression='checkoutLock = :lock', ExpressionAttributeValues={':lock': lock})
        except ClientError as exc:
            if not conflict(exc):
                raise
