#!/usr/bin/env python3
import re
import zipfile
import enum
import argparse
from pathlib import Path
import os.path
from collections import defaultdict
import logging
import io
import boto3
from PIL import Image
import urllib.parse
import PIL
import shutil


MAP_NAME_RE = re.compile("^maps/(?P<mapname>[^\/]+)\.bsp$", re.I)
MAP_SCREEN_RE = re.compile("^maps/(?P<mapname>[^\/]+)\.(?P<ext>jpg|tga|png)$", re.I)
logger = logging.getLogger(__name__)
MAPSHOT_RESOLUTION = 512, 512


class MapshotTypes(enum.Enum):
    PNG = 'png'
    TGA = 'tga'
    JPG = 'jpg'


class MapObjects(enum.Enum):
    BSP = 'bsp'
    SCREENSHOT = 'screen'


def filepath_or_s3_url(input_url):
    if input_url.lower().startswith("s3://"):
        try:
            url = urllib.parse.urlparse(input_url)
        except ValueError:
            raise argparse.ArgumentTypeError("Invalid s3 URL")
        if url.scheme != 's3':
            raise argparse.ArgumentTypeError("Bad s3 URL, scheme should be s3")
        if not url.netloc:
            raise argparse.ArgumentTypeError("Invalid s3 bucket name")

        s3 = boto3.resource('s3')
        bucket = s3.Bucket(url.netloc)
        return ('s3', bucket, url.path)
    else:
        if os.path.isdir(input_url):
            return ('dir', input_url)
        else:
            raise argparse.ArgumentError("Path should exist")


def get_mapshot_type(filename):
    match = MAP_SCREEN_RE.match(filename)
    if match is None:
        return None
    ext = match.groupdict().get('ext', '')
    try:
        return MapshotTypes(ext.lower())
    except ValueError:
        return None


def iterate_pk3_objects(zip_file):
    for name in zip_file.namelist():
        m_bsp = MAP_NAME_RE.match(name)
        m_screen = MAP_SCREEN_RE.match(name)
        if m_bsp is not None:
            yield (name, MapObjects.BSP, m_bsp.groupdict()['mapname'])
        elif m_screen is not None:
            mapname = m_screen.groupdict()['mapname']
            yield (name, MapObjects.SCREENSHOT, mapname)


def generate_thumbnail(imgf, outputf):
    img = Image.open(imgf)
    img.thumbnail(MAPSHOT_RESOLUTION, Image.ANTIALIAS)
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        alpha = img.convert('RGBA').split()[-1]
        has_alpha = False
        for p in alpha.getdata():
            if p != 255:
                has_alpha = True
                break

        if has_alpha:
            img.save(outputf, format='PNG')
            return MapshotTypes.PNG

    if img.mode != 'RGB':
        img = img.convert('RGB')
    img.save(outputf, format='JPEG')
    return MapshotTypes.JPG


def generate_mapshots(pk3_filepath, upload_callback):
    maps = set([])
    mapshots = defaultdict(dict)
    found_mapshots = {}
    with zipfile.ZipFile(pk3_filepath, mode='r') as zip_file:
        for filename, obj_type, mapname in iterate_pk3_objects(zip_file):
            if obj_type == MapObjects.BSP:
                maps.add(mapname.lower())
            elif obj_type == MapObjects.SCREENSHOT:
                mapshot_type = get_mapshot_type(filename)
                mapshots[mapshot_type][mapname.lower()] = filename

        for mapname in maps:
            if mapname == '_hudsetup':
                # ignore hudsetup
                continue
            for mapshot_type in MapshotTypes:
                try:
                    mapshot = mapshots[mapshot_type][mapname]
                except KeyError:
                    pass
                else:
                    found_mapshots[mapname] = (mapshot, mapshot_type)
                    break

        for mapname, (mapshot, mtype) in found_mapshots.items():
            info = zip_file.getinfo(mapshot)
            if info.file_size > 1024 * 1024 * 24:
                # this mapshot is bigger than 24 Mb
                # let's ignore it and log error
                logger.warning("Mapshot to big: %r, pk3: %s", mapshot, mapname)
                continue
            with io.BytesIO() as output_buffer:
                mapshot_filename = None
                with zip_file.open(mapshot) as f:
                    try:
                        output_type = generate_thumbnail(f, output_buffer)
                    except PIL.UnidentifiedImageError:
                        logger.warning("Image error: %r, pk3: %s", mapshot, pk3_filepath)
                        continue

                if output_type == MapshotTypes.PNG:
                    mapshot_filename = "{mapname}.png".format(mapname=mapname)
                else:
                    mapshot_filename = "{mapname}.jpg".format(mapname=mapname)

                logger.info("Uploading %r, from pk3: %s", mapshot_filename, pk3_filepath)
                output_buffer.seek(0, 0)  # reset buffer to start
                upload_callback(output_buffer, mapshot_filename, mapname)


def main():
    parser = argparse.ArgumentParser(description='Mapshot uploader')
    parser.add_argument('-d', '--path', help='datadir path', type=str, nargs='+', required=True)
    parser.add_argument('--upload-path', help='Filepath or S3 upload url', type=filepath_or_s3_url)
    args = parser.parse_args()

    if args.upload_path[0] == 'dir':
        save_dir = args.upload_path[1]

        def save_callback(mapshotf, mapshotname, mapname):
            mapshot_path = os.path.join(save_dir, mapshotname)
            with open(mapshot_path, "wb") as f:
                shutil.copyfileobj(mapshotf, f)

    else:
        s3_bucket, s3_prefix = args.upload_path[1], args.upload_path[2]

        def save_callback(mapshotf, mapshotname, mapname):
            mapshot_path = os.path.join(s3_prefix, mapshotname)
            s3_bucket.upload_fileobj(mapshotf, mapshot_path)

    for path in args.path:
        for obj in Path(path).iterdir():
            if obj.suffix == '.pk3' and obj.is_file():
                try:
                    generate_mapshots(str(obj), save_callback)
                except zipfile.BadZipFile:
                    logger.warning("Bad zip file: %s", obj)


if __name__ == '__main__':
    main()
