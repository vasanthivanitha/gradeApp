import os
import random
import re
import time
import uuid
from datetime import datetime, timezone

from grade_common import (
    BUCKET, KINDS, SUBJECTS, ClientError, Problem, conflict, endpoint,
    entitlement, identity, key, payload, profile, response, s3, transact,
)


@endpoint
def handler(event, context):
    uid = identity(event)
    data = payload(event)
    name, subject, mime, size, filename = (data.get(field) for field in
        ('studentName', 'subject', 'fileType', 'size', 'fileName'))
    if not isinstance(name, str) or not re.fullmatch(r"[^\W\d_][\w'’-]{0,39}", name.strip()):
        raise Problem(400, 'Enter a first name or a one-word nickname.')
    if (subject not in SUBJECTS or not isinstance(mime, str) or mime not in KINDS or
        type(size) is not int or not 0 < size <= 20 * 1024**2 or
        not isinstance(filename, str) or not filename or len(filename) > 200 or
        any(ord(c) < 32 for c in filename)):
        raise Problem(400, 'Choose a subject and a JPEG, PNG, WebP, PDF, or DOCX up to 20 MB.')
    assessment = data.get('assessment', 'questions')
    grade_level = data.get('gradeLevel')
    if assessment not in ('questions', 'writing'):
        raise Problem(400, 'Choose a question sheet or a writing sample.')
    if (assessment == 'writing' or grade_level is not None) and (
            type(grade_level) is not int or not 0 <= grade_level <= 5):
        raise Problem(400, 'Choose Kindergarten or a grade from 1 through 5.')
    extension = KINDS[mime]
    if extension == 'txt' and (assessment != 'writing' or size > 12000):
        raise Problem(400, 'Typed writing drafts must be under 12 KB.')
    if extension in ('jpeg', 'png', 'webp') and size > int(os.environ['MAX_IMAGE_BYTES']):
        raise Problem(400, 'This grading model requires photos to be smaller. Resize the photo or upload a PDF.')
    if extension == 'pdf' and size > int(os.environ['MAX_PDF_BYTES']):
        raise Problem(400, 'This grading model requires a smaller PDF. Compress it or upload fewer pages.')
    sid = str(uuid.uuid4())
    now = int(time.time())
    stamp = datetime.fromtimestamp(now, timezone.utc).isoformat()
    sk = f'SUB#{stamp}#{sid}'
    object_key = f'uploads/{uid}/{sid}.{extension}'
    headers = {'Content-Type': mime, 'If-None-Match': '*'}
    url = s3.generate_presigned_url('put_object', Params={'Bucket': BUCKET, 'Key': object_key,
        'ContentType': mime, 'ContentLength': size, 'IfNoneMatch': '*'}, ExpiresIn=300)
    daily_key = key(uid, 'DAY#' + stamp[:10])
    for attempt in range(10):
        current = profile(uid)
        usage = entitlement(current, now)
        trial = usage['plan'] == 'trial'
        if not usage['remaining']:
            message = 'Your sheet allowance is used up.'
            if usage['subscriptionStatus'] in ('past_due', 'unpaid', 'canceled'):
                message = 'Your subscription is inactive and no trial sheets remain.'
            raise Problem(402, message, code='QUOTA_EXHAUSTED', usage=usage)
        values = {':revision': current['revision']}
        check = 'revision = :revision AND attribute_not_exists(deleting)'
        if trial:
            update = 'ADD trialRemaining :minus'
            check += ' AND trialRemaining > :zero'
            values.update({':minus': -1, ':zero': 0})
        elif current.get('usageWindow') == usage['window']:
            update = 'ADD usedThisPeriod :one'
            check += ' AND usageWindow = :window AND usedThisPeriod < :limit'
            values.update({':window': usage['window'], ':one': 1, ':limit': usage['limit']})
        else:
            update = 'SET usageWindow = :window, usedThisPeriod = :one'
            check += ' AND (attribute_not_exists(usageWindow) OR usageWindow < :window)'
            values.update({':window': usage['window'], ':one': 1})
        item = {**key(uid, sk), 'submissionId': sid, 'studentName': name.strip(),
            'subject': subject, 'fileName': filename, 's3Key': object_key, 'fileType': mime,
            'size': size, 'status': 'uploading', 'createdAt': stamp,
            'reservation': 'trial' if trial else 'paid', 'reservedWindow': usage.get('window', 0),
            'pending': 'OPEN', 'pendingUntil': now + 900}
        if assessment == 'writing':
            item['assessment'] = assessment
        if grade_level is not None:
            item['gradeLevel'] = grade_level
        try:
            transact(
                ('Update', {'Key': key(uid), 'UpdateExpression': update,
                    'ConditionExpression': check, 'ExpressionAttributeValues': values}),
                ('Update', {'Key': daily_key, 'UpdateExpression': 'SET expiresAt = :ttl ADD sheetCount :one',
                    'ConditionExpression': 'attribute_not_exists(sheetCount) OR sheetCount < :cap',
                    'ExpressionAttributeValues': {':ttl': now + 172800, ':one': 1,
                        ':cap': int(os.environ['DAILY_CAP'])}}),
                ('Put', {'Item': item, 'ConditionExpression': 'attribute_not_exists(PK)'}))
            return response(201, {'submissionId': sid, 'uploadUrl': url, 'headers': headers})
        except ClientError as exc:
            if not conflict(exc):
                raise
            reasons = exc.response.get('CancellationReasons', [])
            if len(reasons) > 1 and reasons[1].get('Code') == 'ConditionalCheckFailed':
                raise Problem(429, 'Your daily upload limit has been reached. Try again tomorrow.') from exc
            time.sleep(random.uniform(0, min(0.2, 0.01 * 2**attempt)))
    raise Problem(409, 'Uploads are busy. Try again in a moment.')
