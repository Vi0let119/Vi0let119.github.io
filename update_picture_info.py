import json
import os
import re
from datetime import datetime
from PIL import Image

img_dir = r"D:\虚拟C盘\网站html练习\图库"
json_path = r"D:\虚拟C盘\网站html练习\picture_info.json"

def extract_date_from_filename(fname):
    """Try to extract shooting date from filename patterns."""
    # Pattern 1: IMG_YYYYMMDD_HHMMSS-* or IMG_YYYYMMDD_HHMMSS(*)-*
    m = re.search(r'IMG_(\d{8})[_-](\d{6})', fname)
    if m:
        return datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")

    # Pattern 2: YYYYMMDD-IMG_... (date prefix before IMG)
    m = re.search(r'^(\d{8})-', fname)
    if m:
        return datetime.strptime(m.group(1), "%Y%m%d")

    # Pattern 3: Image_<unix_timestamp_ms>-*.jpg
    m = re.search(r'Image_(\d{10,13})', fname)
    if m:
        ts = int(m.group(1))
        if ts > 1e12:  # milliseconds
            ts = ts / 1000
        return datetime.fromtimestamp(ts)

    return None

def extract_date_from_exif(img):
    """Try to extract date from EXIF (DateTimeOriginal -> DateTime)."""
    exif = img.getexif()
    if not exif:
        return None
    dt_str = exif.get(36867) or exif.get(306)  # DateTimeOriginal or DateTime
    if dt_str:
        try:
            return datetime.strptime(dt_str, "%Y:%m:%d %H:%M:%S")
        except Exception:
            pass
    return None

images = []
no_date_count = 0

for fname in sorted(os.listdir(img_dir)):
    fpath = os.path.join(img_dir, fname)
    if not os.path.isfile(fpath):
        continue
    try:
        img = Image.open(fpath)
    except Exception:
        continue

    w, h = img.size
    fmt = img.format or "JPEG"
    fsize = os.path.getsize(fpath)
    mtime = datetime.fromtimestamp(os.path.getmtime(fpath)).strftime("%Y-%m-%d %H:%M:%S")

    # Prefer filename date, then EXIF
    dt_obj = extract_date_from_filename(fname)
    if dt_obj is None:
        dt_obj = extract_date_from_exif(img)

    if dt_obj:
        dt_display = dt_obj.strftime("%Y-%m-%d %H:%M:%S")
    else:
        dt_display = None
        no_date_count += 1

    images.append({
        "filename": fname,
        "path": f"图库/{fname}",
        "width": w,
        "height": h,
        "format": fmt,
        "file_size": fsize,
        "file_size_mb": round(fsize / (1024 * 1024), 2),
        "updated_at": mtime,
        "latitude": None,
        "longitude": None,
        "_shooting_dt": dt_obj,
        "shooting_date": dt_display,
    })

# Sort by shooting date descending (newest first); images without date go last
images_with_date = [img for img in images if img["_shooting_dt"] is not None]
images_no_date = [img for img in images if img["_shooting_dt"] is None]
images_with_date.sort(key=lambda x: x["_shooting_dt"], reverse=True)
images = images_with_date + images_no_date

for i, img in enumerate(images):
    del img["_shooting_dt"]
    img["sort_order"] = i + 1

result = {
    "image_count": len(images),
    "images": images,
}

with open(json_path, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"Done. {len(images)} images written to picture_info.json")
print(f"First: #{images[0]['sort_order']} {images[0]['filename']} -> {images[0]['shooting_date']}")
print(f"Last:  #{images[-1]['sort_order']} {images[-1]['filename']} -> {images[-1]['shooting_date']}")
if no_date_count:
    print(f"Images without shooting date: {no_date_count}")
    for img in images:
        if img['shooting_date'] is None:
            print(f"  - {img['filename']}")
