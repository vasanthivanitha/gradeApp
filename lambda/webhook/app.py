import base64
import time

import stripe

from grade_common import ClientError, Problem, conflict, endpoint, get, key, metric, response, transact
from grade_stripe import active_subscriptions, config, price

EVENTS = {'checkout.session.completed', 'customer.subscription.updated',
          'customer.subscription.deleted', 'invoice.payment_failed', 'invoice.paid'}


@endpoint
def handler(event, context):
    secret = config()
    signature = {k.lower(): v for k, v in event.get('headers', {}).items()}.get('stripe-signature')
    if not signature:
        raise Problem(400, 'Missing Stripe signature.')
    body = event.get('body') or ''
    try:
        if event.get('isBase64Encoded'):
            body = base64.b64decode(body)
        notification = stripe.Webhook.construct_event(body, signature, secret['webhookSecret'])
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise Problem(400, 'Invalid Stripe signature or body.') from exc
    if notification.type not in EVENTS:
        return response(200, {'received': True})
    event_key = {'PK': 'STRIPE#' + notification.id, 'SK': 'EVENT'}
    if get(event_key):
        return response(200, {'received': True})
    customer_id = notification.data.object.get('customer')
    if not customer_id:
        return response(200, {'received': True})
    customer = stripe.Customer.retrieve(customer_id)
    uid = customer.get('metadata', {}).get('account')
    if not uid:
        return response(200, {'received': True})
    for _ in range(5):
        item = get(key(uid))
        if not item or item.get('deleting') or item.get('stripeCustomerId') != customer_id:
            return response(200, {'received': True})
        candidates = []
        for subscription in active_subscriptions(customer_id):
            for entry in subscription['items']['data']:
                for plan in ('monthly', 'yearly'):
                    if entry.price.id == price(plan):
                        candidates.append((subscription, entry, plan))
        candidates.sort(key=lambda row: (row[0].status in ('active', 'trialing'), row[0].created), reverse=True)
        if candidates:
            subscription, entry, plan = candidates[0]
            start = entry.current_period_start
            end = entry.current_period_end
            status = subscription.status
            subscription_id = subscription.id
        else:
            start, end, plan, status, subscription_id = 0, 0, 'trial', 'canceled', ''
        converted = status in ('active', 'trialing') and not item.get('converted')
        values = {':plan': plan, ':status': status, ':sub': subscription_id, ':start': start, ':end': end,
            ':next': item['revision'] + 1, ':old': item['revision'], ':customer': customer_id,
            ':converted': bool(converted or item.get('converted'))}
        try:
            transact(('Put', {'Item': {**event_key, 'expiresAt': int(time.time()) + 35 * 86400},
                            'ConditionExpression': 'attribute_not_exists(PK)'}),
                     ('Update', {'Key': key(uid), 'ConditionExpression':
                         'revision = :old AND stripeCustomerId = :customer AND attribute_not_exists(deleting)',
                         'UpdateExpression': 'SET #plan = :plan, #status = :status, stripeSubscriptionId = :sub, '
                             'periodStart = :start, periodEnd = :end, revision = :next, converted = :converted',
                         'ExpressionAttributeNames': {'#plan': 'plan', '#status': 'status'},
                         'ExpressionAttributeValues': values}))
        except ClientError as exc:
            if not conflict(exc):
                raise
            if get(event_key):
                return response(200, {'received': True})
            continue
        if converted:
            metric(Conversions=1)
        return response(200, {'received': True})
    raise Problem(503, 'Billing synchronization is busy.')
