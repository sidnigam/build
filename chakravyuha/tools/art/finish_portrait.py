#!/usr/bin/env python3
"""
finish_portrait.py — rembg cutout + despeckle + trim + 600x768 bust fit + bottom feather.

Usage:
  python tools/art/finish_portrait.py --in RAW.png --out OUT.png \
      [--width 600] [--height 768] [--top-margin 12] [--feather 0.12] \
      [--mirror] [--silhouette SIL.png] [--subject SUBJECT_ID]

Pipeline (D-08, 05.5-CONTEXT):
  1. rembg u2net cutout
  2. clean alpha (<16 -> 0)
  3. despeckle (keep components >= 2% of the largest -- Vayu's scarves and Agni's flames survive)
  4. crop to the alpha bbox
  5. scale to fit width W and height (H - top_margin), preserving aspect, LANCZOS
  6. paste bottom-center on a transparent WxH canvas (bottom edge flush; bust crop is fine)
  7. multiply alpha by a linear ramp from 1 -> 0 across the bottom feather*H rows
  8. optional mirror
  9. save RGBA PNG
  10. optional black-on-white silhouette

Never mirror Krishna or Durga (D-08): flute/mudra handedness is iconographic. Passing
--mirror with --subject krishna or --subject durga is refused (exit 2); regenerate instead.

Prints "bbox=... fill_ratio=... out=..." on success. Exits 1 with "ERROR:" on failure.
"""
import argparse
import sys

import numpy as np
from PIL import Image
from rembg import remove, new_session
from scipy import ndimage

ALPHA_THRESHOLD = 16
DESPECKLE_MIN_FRACTION = 0.02
NO_MIRROR_SUBJECTS = {"krishna", "durga"}


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


def fit_bust(img, width, height, top_margin):
    """Scale to fit width x (height - top_margin), bottom-aligned, crop allowed."""
    bbox = alpha_bbox(img)
    cropped = img.crop(bbox)
    cw, ch = cropped.size

    avail_h = height - top_margin
    scale = min(width / cw, avail_h / ch)
    new_w = max(1, round(cw * scale))
    new_h = max(1, round(ch * scale))
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = (width - new_w) // 2
    y = height - new_h  # bottom edge flush; crop allowed if new_w/new_h exceed canvas
    canvas.paste(resized, (x, y), resized)
    return canvas, bbox


def bottom_feather(img, feather_fraction):
    """Multiply alpha by a linear ramp from 1 -> 0 across the bottom feather_fraction*H rows."""
    arr = np.array(img).astype(np.float64)
    h = arr.shape[0]
    feather_rows = max(1, round(h * feather_fraction))
    ramp = np.ones(h, dtype=np.float64)
    start = h - feather_rows
    ramp[start:] = np.linspace(1.0, 0.0, feather_rows)
    arr[:, :, 3] = arr[:, :, 3] * ramp[:, None]
    arr = np.clip(arr, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def make_silhouette(img):
    alpha = np.array(img)[:, :, 3]
    mask = alpha > 0
    sil = np.full((*mask.shape, 3), 255, dtype=np.uint8)
    sil[mask] = [0, 0, 0]
    return Image.fromarray(sil, "RGB")


def main():
    ap = argparse.ArgumentParser(description="rembg cutout + despeckle + trim + bust fit + bottom feather.")
    ap.add_argument("--in", dest="in_path", required=True)
    ap.add_argument("--out", dest="out_path", required=True)
    ap.add_argument("--width", type=int, default=600)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--top-margin", dest="top_margin", type=int, default=12)
    ap.add_argument("--feather", type=float, default=0.12)
    ap.add_argument("--mirror", action="store_true", help="Flip horizontally (refused for krishna/durga).")
    ap.add_argument("--silhouette", dest="silhouette_path", default=None)
    ap.add_argument("--subject", default=None, help="Subject id, used to refuse --mirror for krishna/durga.")
    args = ap.parse_args()

    if args.mirror and args.subject in NO_MIRROR_SUBJECTS:
        print(f"ERROR: --mirror refused for subject {args.subject!r} — handedness is iconographic "
              f"(flute/mudra). Regenerate a right-facing attempt instead.", file=sys.stderr)
        sys.exit(2)

    try:
        cut = load_and_cutout(args.in_path)
        cut = clean_alpha(cut)
        cut = despeckle(cut)
        fitted, bbox = fit_bust(cut, args.width, args.height, args.top_margin)
        fitted = bottom_feather(fitted, args.feather)
        if args.mirror:
            fitted = fitted.transpose(Image.FLIP_LEFT_RIGHT)
        fitted.save(args.out_path, "PNG")

        alpha = np.array(fitted)[:, :, 3]
        fill_ratio = float((alpha > 0).sum()) / float(args.width * args.height)
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
