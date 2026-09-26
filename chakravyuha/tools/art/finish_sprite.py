#!/usr/bin/env python3
"""
finish_sprite.py — rembg background removal + despeckle + trim + bottom-aligned resize.

Usage:
  python tools/art/finish_sprite.py --in RAW.png --out FRAME.png --size 128|256 \
      [--silhouette SIL.png] [--mirror]

Pipeline:
  1. rembg.remove() with a u2net session (semantic background removal).
  2. Zero out alpha < 16 (clean up soft edges rembg leaves behind).
  3. Crop to the alpha bounding box, keeping only the largest connected alpha
     component plus components >= 2% of the largest component's area (despeckle).
  4. Fit into size x size keeping aspect ratio with a 4px margin, bottom-center
     aligned (feet at the bottom edge - 4px), LANCZOS resample, transparent background.
  5. Optionally flip horizontally (--mirror) so the art faces right
     (SPRITES.CFG.DEFAULT_FACING = +1).
  6. Optionally write a black-on-white silhouette PNG of the final alpha, for the
     readability self-review.

Prints the alpha bbox and fill ratio (alpha-pixel-count / bbox-area) on success.
"""
import argparse
import sys

import numpy as np
from PIL import Image
from rembg import remove, new_session
from scipy import ndimage

ALPHA_THRESHOLD = 16
DESPECKLE_MIN_FRACTION = 0.02


def load_and_cutout(in_path):
    img = Image.open(in_path).convert("RGBA")
    session = new_session("u2net")
    cut = remove(img, session=session)
    return cut


def clean_alpha(img):
    arr = np.array(img)
    alpha = arr[:, :, 3]
    alpha = np.where(alpha < ALPHA_THRESHOLD, 0, alpha)
    arr[:, :, 3] = alpha
    return Image.fromarray(arr, "RGBA")


def despeckle(img):
    arr = np.array(img)
    alpha = arr[:, :, 3]
    mask = alpha > 0
    if not mask.any():
        return img
    labeled, num = ndimage.label(mask, structure=np.ones((3, 3)))
    if num <= 1:
        return img
    sizes = ndimage.sum(mask, labeled, range(1, num + 1))
    largest = sizes.max()
    keep_labels = [i + 1 for i, s in enumerate(sizes) if s >= largest * DESPECKLE_MIN_FRACTION]
    keep_mask = np.isin(labeled, keep_labels)
    arr[:, :, 3] = np.where(keep_mask, alpha, 0)
    return Image.fromarray(arr, "RGBA")


def alpha_bbox(img):
    alpha = np.array(img)[:, :, 3]
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        raise RuntimeError("No non-transparent pixels found after background removal")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def fit_bottom_aligned(img, size, margin=4):
    bbox = alpha_bbox(img)
    cropped = img.crop(bbox)
    cw, ch = cropped.size

    avail = size - 2 * margin
    scale = min(avail / cw, avail / ch)
    new_w = max(1, round(cw * scale))
    new_h = max(1, round(ch * scale))
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - new_w) // 2
    y = size - margin - new_h
    canvas.paste(resized, (x, y), resized)
    return canvas, bbox


def make_silhouette(img):
    alpha = np.array(img)[:, :, 3]
    mask = alpha > 0
    sil = np.full((*mask.shape, 3), 255, dtype=np.uint8)
    sil[mask] = [0, 0, 0]
    return Image.fromarray(sil, "RGB")


def main():
    ap = argparse.ArgumentParser(description="rembg + despeckle + trim + bottom-aligned resize.")
    ap.add_argument("--in", dest="in_path", required=True)
    ap.add_argument("--out", dest="out_path", required=True)
    ap.add_argument("--size", type=int, required=True, choices=[128, 256])
    ap.add_argument("--silhouette", dest="silhouette_path", default=None)
    ap.add_argument("--mirror", action="store_true", help="Flip horizontally after trim (art must face right).")
    args = ap.parse_args()

    try:
        cut = load_and_cutout(args.in_path)
        cut = clean_alpha(cut)
        cut = despeckle(cut)
        fitted, bbox = fit_bottom_aligned(cut, args.size)
        if args.mirror:
            fitted = fitted.transpose(Image.FLIP_LEFT_RIGHT)
        fitted.save(args.out_path, "PNG")

        alpha = np.array(fitted)[:, :, 3]
        fill_ratio = float((alpha > 0).sum()) / float(args.size * args.size)
        print(f"bbox={bbox} fill_ratio={fill_ratio:.3f} out={args.out_path}")

        if args.silhouette_path:
            sil = make_silhouette(fitted)
            sil.save(args.silhouette_path, "PNG")
            print(f"silhouette={args.silhouette_path}")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
