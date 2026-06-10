#!/usr/bin/env python3
"""
Update picture_info.json from images in the 图库/ directory.

Extracts EXIF metadata using exiftool, collects file info from the filesystem,
sorts images by shooting_date ascending, and writes the updated catalog.

Usage:
    python update_picture_info.py

Requirements:
    - exiftool.exe must exist at 图库/exiftool.exe
    - Images must be in the 图库/ directory
"""

import json
import os
import subprocess
import sys
from datetime import datetime

# Paths relative to the project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMAGE_DIR = os.path.join(PROJECT_ROOT, '图库')
EXIFTOOL = os.path.join(IMAGE_DIR, 'exiftool.exe')
OUTPUT_FILE = os.path.join(PROJECT_ROOT, 'picture_info.json')
TMP_EXIF = os.path.join(os.environ.get('TEMP', '/tmp'), 'exif_data.json')


def extract_exif():
    """Run exiftool to extract metadata from all JPEG images."""
    if not os.path.exists(EXIFTOOL):
        print(f'Error: exiftool not found at {EXIFTOOL}', file=sys.stderr)
        sys.exit(1)

    cmd = [
        EXIFTOOL,
        '-json',
        '-DateTimeOriginal', '-FileName', '-ImageWidth', '-ImageHeight',
        '-FileSize', '-MIMEType', '-Make', '-Model',
        '-GPSLatitude', '-GPSLongitude', '-GPSLatitudeRef', '-GPSLongitudeRef',
        IMAGE_DIR,
        '-ext', 'jpg', '-ext', 'jpeg',
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
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


def process_images(exif_data):
    """Process exiftool data into the picture_info.json format."""
    images = []
    skipped = 0

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

        # Camera info
        make = entry.get('Make', '')
        model = entry.get('Model', '')

        image_info = {
            'filename': filename,
            'path': f'图库/{filename}',
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
            'latitude': None,   # Reserved for future use
            'longitude': None,  # Reserved for future use
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

    return images, skipped


def main():
    print('Extracting EXIF data from images...')
    exif_data = extract_exif()
    print(f'Found {len(exif_data)} entries from exiftool')

    print('Processing images...')
    images, skipped = process_images(exif_data)

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
