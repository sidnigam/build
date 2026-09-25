#!/usr/bin/env python3
"""
finish_biome.py — cover-crop a generated biome background to the game's 1280x720 canvas.

Usage:
  python tools/art/finish_biome.py --in RAW.png --out BG.png

Pipeline: cover-scale 1344x768 -> 1280x731 (LANCZOS, preserves aspect, slight upscale
of the shorter edge) -> center-crop to exactly 1280x720 -> convert to RGB -> save PNG
with optimize=True. Prints the output file size in bytes.
"""
import argparse
import os
import sys

from PIL import Image

TARGET_W, TARGET_H = 1280, 720


def cover_crop(img, target_w, target_h):
    src_w, src_h = img.size
    scale = max(target_w / src_w, target_h / src_h)
    new_w = round(src_w * scale)
    new_h = round(src_h * scale)
    resized = img.resize((new_w, new_h), Image.LANCZOS)

    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def main():
    ap = argparse.ArgumentParser(description="Cover-crop a biome background to 1280x720.")
    ap.add_argument("--in", dest="in_path", required=True)
    ap.add_argument("--out", dest="out_path", required=True)
    args = ap.parse_args()

    try:
        img = Image.open(args.in_path).convert("RGB")
        finished = cover_crop(img, TARGET_W, TARGET_H)
        assert finished.size == (TARGET_W, TARGET_H)
        finished.save(args.out_path, "PNG", optimize=True)
        size_bytes = os.path.getsize(args.out_path)
        print(f"out={args.out_path} size={finished.size} bytes={size_bytes}")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
