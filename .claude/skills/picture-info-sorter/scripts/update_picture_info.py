#!/usr/bin/env python3
"""
Update picture_info.json from images in the 图库/ directory.

Extracts EXIF metadata using exiftool, collects file info from the filesystem,
sorts images by shooting_date ascending, and writes the updated catalog.

Usage:
    python update_picture_info.py              # rebuild, keep existing GPS
    python update_picture_info.py --reset-gps  # rebuild, ignore existing GPS

Requirements:
    - exiftool.exe must exist at 图库/exiftool.exe
    - Images must be in the 图库/ directory

Note:
    Watermark exports strip the GPS EXIF block, so the coordinates in an
    existing picture_info.json are the only copy. Rebuilding therefore
    inherits latitude/longitude (and camera info) from the previous catalog
    by file name; pass --reset-gps to drop them on purpose.
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime

# Paths relative to the project root
# Script is at .claude/skills/picture-info-sorter/scripts/ — go up 5 levels to project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
IMAGE_DIR = os.path.join(PROJECT_ROOT, '图库')
EXIFTOOL = os.path.join(IMAGE_DIR, 'exiftool.exe')
OUTPUT_FILE = os.path.join(PROJECT_ROOT, 'pictures', 'picture_info.json')
TMP_EXIF = os.path.join(os.environ.get('TEMP', '/tmp'), 'exif_data.json')


def _parse_gps_coordinate(value, ref):
    """Parse exiftool GPS coordinate (DMS string or decimal) to decimal degrees.

    exiftool -json may return GPS as:
      - "30 deg 59' 47.49\\" N" (combined string with direction)
      - "30 deg 59' 47.49\\"" (string without direction, ref separate)
      - 30.996525 (already decimal)
    """
    if value is None:
        return None

    s = str(value).strip()
    if not s:
        return None

    # --- already a plain number ---
    try:
        return round(float(s), 6)
    except ValueError:
        pass

    # --- DMS string possibly with trailing direction letter ---
    direction = None
    last_char = s[-1].upper()
    if last_char in 'NSEW':
        direction = last_char
        s = s[:-1].strip()

    m = re.match(r"([\d.]+)\s*deg\s*([\d.]+)'?\s*([\d.]+)\"?", s)
    if m:
        deg = float(m.group(1))
        mn = float(m.group(2))
        sec = float(m.group(3))
        decimal = deg + mn / 60.0 + sec / 3600.0

        # direction from ref parameter if not embedded
        if direction is None and ref:
            ref_str = str(ref).strip()
            if ref_str:
                direction = ref_str[0].upper()

        if direction in ('S', 'W'):
            decimal = -decimal

        return round(decimal, 6)

    return None


EXIF_TAGS = [
    '-DateTimeOriginal', '-FileName', '-ImageWidth', '-ImageHeight',
    '-FileSize', '-MIMEType', '-Make', '-Model',
    '-GPSLatitude', '-GPSLongitude', '-GPSLatitudeRef', '-GPSLongitudeRef',
]


def _query_exif(paths):
    """Run exiftool on the given files/directory and return parsed JSON entries."""
    cmd = [EXIFTOOL, '-json'] + EXIF_TAGS + list(paths)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True,
                                encoding='utf-8', timeout=120)
        if result.returncode != 0:
            print(f'Error running exiftool: {result.stderr}', file=sys.stderr)
            sys.exit(1)
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        print('Error: exiftool timed out', file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f'Error parsing exiftool output: {e}', file=sys.stderr)
        sys.exit(1)


def extract_exif():
    """Run exiftool to extract metadata from all JPEG images."""
    if not os.path.exists(EXIFTOOL):
        print(f'Error: exiftool not found at {EXIFTOOL}', file=sys.stderr)
        sys.exit(1)

    entries = _query_exif([IMAGE_DIR, '-ext', 'jpg', '-ext', 'jpeg'])

    # exiftool mangles non-ASCII file names on Windows (system codepage
    # conversion), so those entries never match a file on disk. Re-query the
    # leftovers one file at a time: the per-file call receives the path via
    # the wide API and the file name comes from our own directory listing.
    def resolvable(e):
        return os.path.exists(os.path.join(IMAGE_DIR, e.get('FileName', '')))

    matched = {e.get('FileName') for e in entries if resolvable(e)}
    missing = [f for f in sorted(os.listdir(IMAGE_DIR))
               if f.lower().endswith(('.jpg', '.jpeg')) and f not in matched]
    if missing:
        extra = _query_exif([os.path.join(IMAGE_DIR, f) for f in missing])
        if len(extra) == len(missing):
            print(f'Re-queried {len(missing)} file(s) whose names exiftool '
                  f'mangled: {", ".join(missing)}')
            for fname, entry in zip(missing, extra):
                entry['FileName'] = fname
            entries = [e for e in entries if resolvable(e)] + extra
        else:
            print(f'Warning: rescue query mismatched '
                  f'({len(missing)} files, {len(extra)} results); '
                  f'falling back to batch results', file=sys.stderr)

    return entries


def load_previous():
    """Load the current catalog so coordinates survive a rebuild.

    GPS EXIF is stripped from the watermark exports, so latitude/longitude
    already stored in picture_info.json are the source of truth. Returns a
    {filename: entry} map; an unreadable catalog yields an empty map.
    """
    if not os.path.exists(OUTPUT_FILE):
        return {}
    try:
        with open(OUTPUT_FILE, encoding='utf-8') as f:
            data = json.load(f)
        return {img['filename']: img for img in data.get('images', [])
                if img.get('filename')}
    except (OSError, json.JSONDecodeError, KeyError) as e:
        print(f'Warning: could not read previous catalog ({e}); '
              f'GPS will come from EXIF only', file=sys.stderr)
        return {}


def process_images(exif_data, previous=None):
    """Process exiftool data into the picture_info.json format."""
    previous = previous or {}
    images = []
    skipped = 0
    inherited = 0

    for entry in exif_data:
        filename = entry.get('FileName', '')
        filepath = os.path.join(IMAGE_DIR, filename)

        # Skip if file doesn't exist
        if not os.path.exists(filepath):
            skipped += 1
            continue

        # File size
        try:
            file_size_bytes = os.path.getsize(filepath)
        except OSError:
            file_size_bytes = 0
        file_size_mb = round(file_size_bytes / (1024 * 1024), 2) if file_size_bytes else 0

        # Modification time
        try:
            mtime = os.path.getmtime(filepath)
            updated_at = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
        except OSError:
            updated_at = ''

        # Shooting date from EXIF
        shooting_date = ''
        dt_original = entry.get('DateTimeOriginal', '')
        if dt_original:
            try:
                dt = datetime.strptime(dt_original, '%Y:%m:%d %H:%M:%S')
                shooting_date = dt.strftime('%Y-%m-%d %H:%M:%S')
            except ValueError:
                shooting_date = dt_original

        # Camera info (fall back to the previous catalog when EXIF is gone)
        prev = previous.get(filename) or {}
        make = entry.get('Make', '') or (prev.get('camera') or {}).get('make', '')
        model = entry.get('Model', '') or (prev.get('camera') or {}).get('model', '')

        # GPS coordinates from EXIF, else keep what the catalog already had
        lat = _parse_gps_coordinate(
            entry.get('GPSLatitude'),
            entry.get('GPSLatitudeRef'),
        )
        lng = _parse_gps_coordinate(
            entry.get('GPSLongitude'),
            entry.get('GPSLongitudeRef'),
        )
        if lat is None and lng is None:
            lat = prev.get('latitude')
            lng = prev.get('longitude')
            if lat is not None or lng is not None:
                inherited += 1

        image_info = {
            'filename': filename,
            'path': f'../../图库/{filename}',
            'width': entry.get('ImageWidth', 0),
            'height': entry.get('ImageHeight', 0),
            'format': 'JPEG',
            'file_size': file_size_bytes,
            'file_size_mb': file_size_mb,
            'updated_at': updated_at,
            'camera': {
                'make': make,
                'model': model,
            },
            'latitude': lat,
            'longitude': lng,
            'shooting_date': shooting_date,
        }

        images.append(image_info)

    # Sort by shooting_date ascending; images without date go to the end
    def sort_key(img):
        sd = img.get('shooting_date', '')
        if sd:
            return (0, sd)
        return (1, img['filename'])

    images.sort(key=sort_key)

    # Assign sort_order
    for i, img in enumerate(images):
        img['sort_order'] = i + 1

    return images, skipped, inherited


def main():
    print('Extracting EXIF data from images...')
    exif_data = extract_exif()
    print(f'Found {len(exif_data)} entries from exiftool')

    reset_gps = '--reset-gps' in sys.argv[1:]
    previous = {} if reset_gps else load_previous()
    if previous:
        with_coords = sum(1 for e in previous.values()
                          if e.get('latitude') is not None)
        print(f'Previous catalog loaded: {len(previous)} entries '
              f'({with_coords} with coordinates)')

    print('Processing images...')
    images, skipped, inherited = process_images(exif_data, previous)
    if inherited:
        print(f'Preserved coordinates for {inherited} image(s) '
              f'from the previous catalog')

    if skipped:
        print(f'Skipped {skipped} missing files')

    # Build output
    output = {
        'image_count': len(images),
        'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'sort_rule': {
            'primary_key': 'shooting_date',
            'order': 'ascending',
            'description': '按拍摄时间递增排序，没有拍摄时间的图片按文件名排序并放置在最后',
        },
        'images': images,
    }

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # Summary
    date_range = 'N/A'
    if images:
        first = images[0].get('shooting_date', '?')
        last = images[-1].get('shooting_date', '?')
        date_range = f'{first} ~ {last}'

    print(f'Done! {len(images)} images written to {OUTPUT_FILE}')
    print(f'Date range: {date_range}')


if __name__ == '__main__':
    main()
