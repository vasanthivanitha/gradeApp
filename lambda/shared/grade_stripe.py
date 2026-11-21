import json
import os
from functools import lru_cache

import boto3
import stripe

from grade_common import Problem


@lru_cache(maxsize=1)
def config():
    secret = boto3.client('secretsmanager').get_secret_value(SecretId=os.environ['STRIPE_SECRET'])
    result = json.loads(secret['SecretString'])
    stripe.api_key = result['secretKey']
    stripe.api_version = '2025-08-27.basil'
    stripe.max_network_retries = 2
    return result


def price(plan):
    return os.environ[plan.upper() + '_PRICE']


def active_subscriptions(customer):
    for subscription in stripe.Subscription.list(customer=customer, status='all', limit=100).auto_paging_iter():
        if subscription.status not in ('canceled', 'incomplete_expired'):
            yield subscription


def ensure_no_subscription(customer):
    if next(active_subscriptions(customer), None):
        raise Problem(409, 'You already have a subscription. Manage it in the billing portal.')
