"""补齐图片页缺失的缩略图与中间图。

    python make_derivatives.py --check   # 只报告缺多少
    python make_derivatives.py           # 生成缺失的那些

缩略图 480 宽、中间图 1280 宽，WebP q=90；只写缺失文件，不覆盖已有的。
原图在仓库根的 图库/（junction 到 Pictures/watermark），EXIF 方向会先摆正，
导出时不带任何元数据（原图里的 GPS 不该跟着进网页）。
"""

import argparse
import json
import pathlib
import sys

from PIL import Image, ImageOps

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LIBRARY = ROOT / "图库"
INFO = HERE.parent / "picture_info.json"

SPECS = (("thumbs", 480, 90), ("medium", 1280, 90))


def load_filenames():
    data = json.loads(INFO.read_text(encoding="utf-8"))
    items = data if isinstance(data, list) else data.get("images", [])
    names = []
    for item in items:
        name = item.get("filename") or item.get("file")
        if name:
            names.append(name)
    return names


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="只统计，不写文件")
    args = parser.parse_args()

    names = load_filenames()
    missing = []
    for name in names:
        stem = pathlib.Path(name).stem
        for sub, width, quality in SPECS:
            dst = HERE / sub / f"{stem}.webp"
            if not dst.exists():
                missing.append((name, dst, width, quality))

    if args.check:
        print(f"picture_info: {len(names)} 张；缺衍生图 {len(missing)} 个文件")
        for name, dst, width, _ in missing[:20]:
            print(f"  {dst.parent.name}/{dst.stem}.webp  <- {name}")
        return 0 if not missing else 1

    if not missing:
        print("没有缺失，什么都不用做。")
        return 0

    failed = []
    for name, dst, width, quality in missing:
        src = LIBRARY / name
        if not src.exists():
            failed.append((name, "原图不存在"))
            continue
        try:
            with Image.open(src) as raw:
                im = ImageOps.exif_transpose(raw).convert("RGB")
            im.thumbnail((width, width * 4), Image.Resampling.LANCZOS)
            dst.parent.mkdir(parents=True, exist_ok=True)
            im.save(dst, "WEBP", quality=quality, method=6)
            print(f"{dst.parent.name}/{dst.name}  {im.width}x{im.height}  {dst.stat().st_size // 1024} KB")
        except Exception as exc:  # noqa: BLE001
            failed.append((name, str(exc)))

    if failed:
        print("\n失败：", file=sys.stderr)
        for name, why in failed:
            print(f"  {name}: {why}", file=sys.stderr)
        return 1
    print(f"\n完成，生成 {len(missing)} 个文件。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
