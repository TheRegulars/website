import os
import sys
import json
import requests
import logging
import tempfile
import boto3
import mapshots


REGULARS_GROUPS = frozenset(['regulars-mappers', 'regulars-admins'])
DISCORD_WEBHOOK_URL = os.environ['DISCORD_WEBHOOK_URL']
BUCKET = os.environ['S3_BUCKET']
logger = logging.getLogger()
logger.setLevel(logging.INFO)
s3 = boto3.resource('s3')
file_bucket = s3.Bucket(BUCKET)
mapshot_storage = mapshots.open_storage(f"s3://{BUCKET}/mapshots")
MAX_MAPSHOTS = 9


def sizeof_fmt(num, suffix="B"):
    for unit in ("", "Ki", "Mi", "Gi", "Ti", "Pi", "Ei", "Zi"):
        if abs(num) < 1024.0:
            return f"{num:3.1f}{unit}{suffix}"
        num /= 1024.0
    return f"{num:.1f}Yi{suffix}"


def update_mapshots(obj_key):
    mapshot_urls = []

    with tempfile.TemporaryFile() as pk3_file:
        def upload_callback(filename, fileobj, mapname):
            mapshot_storage.upload(filename, fileobj)

            if filename.endswith(".jpg") and len(mapshot_urls) < MAX_MAPSHOTS:
                mapshot_urls.append((mapname, f"https://dl.regulars.win/mapshots/{filename}"))

        try:
            file_bucket.download_fileobj(obj_key, pk3_file)
            pk3_file.seek(0)
            maps = mapshots.generate_mapshots(pk3_file, upload_callback)
        except:
            logger.error("Error while processing: %s", obj_key)
            maps = []

    return maps, mapshot_urls


def process_record(session, record, user_mapping):
    try:
        user_id = record['userIdentity'].get('principalId', 'slava')
        event_type = record['eventName']
        file_key = record['s3']['object']['key']
        bucket = record['s3']['bucket']['name']
    except KeyError:
        return

    if bucket != BUCKET:
        return

    if not file_key.startswith("maps/"):
        return

    user_id = user_id.removeprefix("AWS:")
    file_name = file_key.removeprefix("maps/")
    user = user_mapping.get(user_id, "admin")
    usersp = " " * max(0, 16 - len(user))
    data = {}
    if event_type.startswith("ObjectCreated:"):
        maps, mapshot_urls = update_mapshots(file_key)
        embeds = []
        try:
            file_size = record['s3']['object']['size']
            file_size_str = sizeof_fmt(file_size)
        except KeyError:
            file_size = None
            file_size_str = "Unknown"

        link = f"https://dl.regulars.win/{file_key}"
        text =  f":white_check_mark:      **{user}**{usersp} uploaded *{file_name}*\n"

        if maps:
            text += f"Maps: {', '.join(maps)}\n"

        text += f"Link: {link:<72} (Size: *{file_size_str}*)\n"

        for mapname, mapshot in mapshot_urls:
            embeds.append({
                'title': mapname,
                'type': 'image',
                'image': {
                    'url': mapshot
                }
            })

        data['embeds'] = embeds
    elif event_type.startswith("ObjectRemoved:"):
        text =  f":x:      **{user}**{usersp} removed  *{file_name}*\n "
    else:
        return

    data["content"] =  text
    logger.debug("discord text: %r", text)
    result = session.post(DISCORD_WEBHOOK_URL, json=data)
    result.raise_for_status()


def get_user_mapping():
    iam = boto3.client('iam')
    response = iam.get_account_authorization_details(Filter=['User'])
    dct = {}
    for user_detail in response['UserDetailList']:
        groups = set(user_detail['GroupList'])
        if REGULARS_GROUPS & groups:
            dct[user_detail['UserId']] = user_detail['UserName']

    return dct


def lambda_handler(event, context):
    user_mapping = get_user_mapping()
    logger.info("user mapping %r", user_mapping)
    logger.debug("event: %r", event)
    with requests.Session() as session:
        for record in event.get('Records', []):
            message = json.loads(record['Sns']['Message'])
            for record in message['Records']:
                logger.info("processing record: %r", record)
                process_record(session, record, user_mapping)


def main():
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)

    if len(sys.argv) != 2:
        return

    event_file = sys.argv[1]
    with open(event_file, "r") as f:
        event = json.load(f)
        lambda_handler(event, None)


if __name__ == '__main__':
    main()
