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
import os


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


class BaseMapStorage:

    def __init__(self, url):
        self.url = urllib.parse.urlparse(url)
        self.basepath = os.path.abspath(self.url.path)

    def filepath(self, filename):
        res = os.path.join(self.basepath, filename)
        prefix = os.path.commonprefix([self.basepath, res])
        if not prefix.startswith(self.basepath):
            raise ValueError("Bad filepath: %r" % filename)

        return res

    def upload(self, filename, fileobj):
        raise NotImplementedError

    def remove(self, filename):
        raise NotImplementedError

    def list(self):
        raise NotImplementedError

    def remove_many(self, filenames):
        for filename in filenames:
            self.remove(filename)


class FSMapshotStorage(BaseMapStorage):

    def __init__(self, url):
        super().__init__(url)
        if self.url.scheme not in ('dir', ''):
            raise ValueError('Invalid storage url: %r' % url)

        if self.url.netloc:
            raise ValueError('Invalid storage url: %r' % url)

        if not os.path.isdir(self.basepath):
            raise ValueError("Path should exist: %r" % self.basepath)

    def upload(self, filename, fileobj):
        with open(self.filepath(filename), "wb") as f:
            shutil.copyfileobj(fileobj, f)

    def remove(self, filename):
        return os.remove(self.filepath(filename))

    def list(self):
        return os.listdir(self.basepath)


class S3MapshotStorage(BaseMapStorage):

    def __init__(self, url):
        try:
            self.url = urllib.parse.urlparse(url)
        except ValueError:
            raise ValueError("Invalid S3 URL: %r" % url)

        if self.url.scheme != 's3':
            raise ValueError("Invalid S3 URL: %r" % url)

        if not self.url.netloc:
            raise ValueError("Invalid S3 bucket name: %r" % url)

        self.s3 = boto3.resource('s3')
        self.bucket = self.s3.Bucket(self.url.netloc)
        self.prefix = self.url.path
        if self.prefix.startswith("/"):
            self.prefix = self.prefix[1:]

        if not self.prefix.endswith("/"):
            self.prefix += "/"

        self.basepath = self.prefix

    def upload(self, filename, fileobj):
        self.bucket.upload_fileobj(fileobj, self.filepath(filename))

    def remove(self, filename):
        self.remove_many([filename])

    def remove_many(self, filenames):
        objs = [{'Key': self.filepath(f)} for f in filenames]
        resp = self.bucket.delete_objects(Delete={'Objects': objs, 'Quiet': True})
        assert resp['ResponseMetadata']['HTTPStatusCode'] == 200

    def list(self):
        res = []
        prefix_len = len(self.prefix)
        for obj in self.bucket.objects.filter(Prefix=self.prefix, Delimiter="/"):
            if obj.key.startswith(self.prefix):
                key = obj.key[prefix_len:]
                if key.startswith("/"):
                    key = key[1:]

                res.append(key)

        return res


def open_storage(url):
    url = url.lower()
    if url.startswith("s3://"):
        return S3MapshotStorage(url)
    else:
        return FSMapshotStorage(url)


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


def has_alpha(img):
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        alpha = img.convert('RGBA').split()[-1]
        for p in alpha.getdata():
            if p != 255:
                return True

    return False


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
                logger.warning("Mapshot to big: %r, pk3: %s", mapshot, pk3_filepath)
                continue
            elif info.file_size <= 0:
                logger.warning("Mapshot is empty: %r, pk3: %s", mapshot, pk3_filepath)
                continue

            with zip_file.open(mapshot) as imgf:
                try:
                    img = Image.open(imgf)
                    img.thumbnail(MAPSHOT_RESOLUTION, resample=Image.LANCZOS,
                                  reducing_gap=2.5)
                except PIL.UnidentifiedImageError:
                    logger.warning("Image error: %r, pk3: %s", mapshot, pk3_filepath)
                    continue

                with io.BytesIO() as output_image:
                    if has_alpha(img):
                        mapshot_filename = "{mapname}.png".format(mapname=mapname)
                        img.save(output_image, format='PNG', optimize=True, compress_level=9)
                    else:
                        if img.mode != 'RGB':
                            # JPEG can not save images in RGBA format
                            img = img.convert('RGB')

                        mapshot_filename = "{mapname}.jpg".format(mapname=mapname)
                        img.save(output_image, format='JPEG', optimize=True, quality=80)

                    logger.info("Uploading %r, from pk3: %s", mapshot_filename, pk3_filepath)
                    output_image.seek(0, io.SEEK_SET)  # reset buffer to start
                    upload_callback(mapshot_filename, output_image)

                with io.BytesIO() as output_image:
                    mapshot_filename = "{mapname}.webp".format(mapname=mapname)
                    img.save(output_image, format='WEBP', method=6, quality=80)
                    output_image.seek(0, io.SEEK_SET)
                    logger.info("Uploading %r, from pk3: %s", mapshot_filename, pk3_filepath)
                    upload_callback(mapshot_filename, output_image)


def main():
    parser = argparse.ArgumentParser(description='Mapshot uploader')
    parser.add_argument('-d', '--path', help='datadir path', type=str, nargs='+', required=True)
    parser.add_argument('--upload-path', help='Filepath or S3 upload url', type=open_storage, required=True)
    parser.add_argument('--cleanup', help='Remove old mapshots', action='store_true')
    args = parser.parse_args()

    if args.cleanup:
        current_objects = set(args.upload_path.list())

    def upload_callback(filename, fileobj):
        args.upload_path.upload(filename, fileobj)

        if args.cleanup:
            current_objects.discard(filename)

    for path in args.path:
        for obj in Path(path).iterdir():
            # TODO: pk3dir
            if obj.suffix == '.pk3' and obj.is_file():
                try:
                    generate_mapshots(str(obj), upload_callback)
                except zipfile.BadZipFile:
                    logger.warning("Bad zip file: %r", obj)

    if args.cleanup:
        args.upload_path.remove_many(list(current_objects))


if __name__ == '__main__':
    main()
