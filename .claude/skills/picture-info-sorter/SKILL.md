---
name: picture-info-sorter
description: Use when managing picture_info.json — adding images to the 图库/ directory, updating image metadata, re-sorting the image catalog, or when the user mentions "图片信息", "图库排序", "picture_info", or updating the image index file.
---

# Picture Info Sorter

## Overview

Manage the `picture_info.json` file that catalogs all images in the `图库/` directory. Extract EXIF metadata from images, store structured metadata, and maintain sort order by shooting date (ascending).

## When to Use

- Adding new images to the `图库/` directory that need to be indexed
- Updating `picture_info.json` after images are added, removed, or modified
- Re-sorting the image catalog when the sort order is wrong
- User asks to "更新图片信息", "刷新图库索引", or similar

**Do NOT use for:** editing individual image EXIF data, image processing/resizing, or anything unrelated to the catalog index.

## picture_info.json Structure

The file lives at the project root: `picture_info.json`.

```json
{
  "image_count": 235,
  "last_updated": "2026-06-02 17:53:28",
  "sort_rule": {
    "primary_key": "shooting_date",
    "order": "ascending",
    "description": "按拍摄时间递增排序，没有拍摄时间的图片按文件名排序并放置在最后"
  },
  "images": [
    {
      "filename": "IMG_20240711_151136-1.jpg",
      "path": "图库/IMG_20240711_151136-1.jpg",
      "width": 3305,
      "height": 4406,
      "format": "JPEG",
      "file_size": 6633749,
      "file_size_mb": 6.33,
      "updated_at": "2026-06-01 15:57:58",
      "camera": {
        "make": "vivo",
        "model": "iQOO Neo5"
      },
      "latitude": null,
      "longitude": null,
      "shooting_date": "2024-07-11 15:11:36",
      "sort_order": 1
    }
  ]
}
```

### Field Reference

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `filename` | string | File system | Image filename with extension |
| `path` | string | Computed | Relative path: `图库/<filename>` |
| `width` | integer | EXIF `ImageWidth` | Image width in pixels |
| `height` | integer | EXIF `ImageHeight` | Image height in pixels |
| `format` | string | Fixed | Always `"JPEG"` |
| `file_size` | integer | `os.path.getsize()` | File size in bytes |
| `file_size_mb` | float | Computed | File size in MB (2 decimal places) |
| `updated_at` | string | `os.path.getmtime()` | File modification time, format `YYYY-MM-DD HH:mm:ss` |
| `camera.make` | string | EXIF `Make` | Camera manufacturer |
| `camera.model` | string | EXIF `Model` | Camera model name |
| `latitude` | null | Reserved | GPS latitude — leave as `null` |
| `longitude` | null | Reserved | GPS longitude — leave as `null` |
| `shooting_date` | string | EXIF `DateTimeOriginal` | Format `YYYY-MM-DD HH:mm:ss` |
| `sort_order` | integer | Computed | 1-based position after sorting |

## Sorting Rule

**Primary sort key:** `shooting_date` in **ascending** order (earliest first).

**Fallback:** Images without a `shooting_date` are placed at the end, sorted alphabetically by `filename`.

**Implementation:**
```python
def sort_key(img):
    sd = img.get('shooting_date', '')
    if sd:
        return (0, sd)  # Has date: sort by date
    return (1, img['filename'])  # No date: sort by filename, placed last

images.sort(key=sort_key)
```

**After sorting:** Re-assign `sort_order` sequentially starting from 1.

## Update Workflow

### Step 1: Extract EXIF Data

Use exiftool (located at `图库/exiftool.exe`) to extract metadata from all JPEG images:

```bash
cd "<project-root>"
./图库/exiftool.exe -json \
  -DateTimeOriginal -FileName -ImageWidth -ImageHeight \
  -FileSize -MIMEType -Make -Model \
  -GPSLatitude -GPSLongitude -GPSLatitudeRef -GPSLongitudeRef \
  "图库/" -ext jpg -ext jpeg > /tmp/exif_data.json
```

### Step 2: Process and Sort

Parse the exiftool JSON output:
1. For each entry, read actual file size from the filesystem (`os.path.getsize()`)
2. Read file modification time for `updated_at`
3. Parse `DateTimeOriginal` from `YYYY:MM:DD HH:mm:ss` to `YYYY-MM-DD HH:mm:ss`
4. GPS fields are reserved — always set `latitude` and `longitude` to `null`
5. Sort by shooting_date ascending (see Sorting Rule above)
6. Assign sequential `sort_order`

### Step 3: Write Output

Update `image_count`, `last_updated` timestamp, and write to `picture_info.json` with `ensure_ascii=False, indent=2`.

### Complete Example Script

See `scripts/update_picture_info.py` for the reusable update script. Run it:
```bash
python scripts/update_picture_info.py
```

## Handling Edge Cases

- **Images without `DateTimeOriginal`**: These get placed at the end with `shooting_date: ""` and sorted by filename
- **Duplicate shooting dates**: Stable sort is sufficient — images with the same date keep their relative order
- **Missing files**: If a file listed in EXIF data doesn't exist on disk, skip it
- **New images added to 图库/**: Always run a full regeneration rather than incremental update to maintain correct sort order
- **Non-JPEG files**: Only `*.jpg` and `*.jpeg` extensions are processed

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using exiftool's human-readable `FileSize` (e.g., "3.2 MB") | Use `os.path.getsize()` for exact byte count |
| Leaving old `sort_order` values after adding images | Always re-assign sort_order after sorting |
| Forgetting to update `image_count` | Set to `len(images)` after processing |
| Mixing date formats | Always convert to `YYYY-MM-DD HH:mm:ss` |
| GPS fields filled with EXIF data | Always set `latitude` and `longitude` to `null` (reserved for future use) |
