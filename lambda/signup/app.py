from grade_common import ClientError, conflict, db, key, metric


def handler(event, context):
    if event['triggerSource'] != 'PostConfirmation_ConfirmSignUp':
        return event
    uid = event['request']['userAttributes']['sub']
    try:
        db.put_item(Item={**key(uid), 'plan': 'trial', 'status': 'trial', 'trialRemaining': 5,
            'cognitoUsername': event.get('userName', uid), 'trialCompleted': 0, 'usedThisPeriod': 0, 'revision': 0}, ConditionExpression='attribute_not_exists(PK)')
        metric(TrialSignups=1)
    except ClientError as exc:
        if not conflict(exc):
            raise
    return event
