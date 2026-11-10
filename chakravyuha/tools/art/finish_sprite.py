#!/usr/bin/env python3
"""
finish_sprite.py — rembg background removal + despeckle + trim + bottom-aligned resize.

Usage:
  python tools/art/finish_sprite.py --in RAW.png --out FRAME.png --size 128|256 \
      [--silhouette SIL.png] [--mirror]

  05.6-03 additive flags (character atlas rebuild at 2x; default CLI behaviour unchanged):
  python tools/art/finish_sprite.py --in RAW.png --out FRAME.png --size 256 \
      [--margin N] [--matte u2net|isnet-general-use|birefnet-general] \
      [--sharpen [--sharpen-radius 1.2] [--sharpen-percent 60] [--sharpen-threshold 2]] \
      [--outline N [--outline-color '#140b08'] [--outline-alpha 235] [--outline-feather 0.6]] \
      [--silhouette SIL.png] [--mirror]

Pipeline:
  1. rembg.remove() with a u2net session by default (semantic background removal);
     --matte selects isnet-general-use or birefnet-general instead (05.6-03 matte
     comparison; sessions are cached per matte name across calls in-process).
  2. Zero out alpha < 16 (clean up soft edges rembg leaves behind).
  3. Crop to the alpha bounding box, keeping only the largest connected alpha
     component plus components >= 2% of the largest component's area (despeckle).
  4. Fit into size x size keeping aspect ratio with a margin (default 4px, or 4+N when
     --outline N is set and --margin is not given), bottom-center aligned (feet at the
     bottom edge - margin), LANCZOS resample, transparent background.
  5. Optional --sharpen: bleed RGB color from the nearest opaque pixel into fully
     transparent pixels (nearest-opaque dilation — avoids dark halos), then
     PIL ImageFilter.UnsharpMask on RGB only, keeping the original alpha untouched.
  6. Optional --outline N: a baked dark painted outline — disk-structured binary
     dilation of alpha>0 by N px, a small gaussian feather, colorised, composited
     UNDER the sprite.
  7. Optionally flip horizontally (--mirror) so the art faces right
     (SPRITES.CFG.DEFAULT_FACING = +1).
  8. Optionally write a black-on-white silhouette PNG of the final alpha, for the
     readability self-review.

Order: cutout -> clean -> despeckle -> fit (LANCZOS) -> [sharpen] -> [outline] -> [mirror].
--sharpen/--outline/--matte/--margin do not change output when absent/default — this is
required because 05.4's finish_env.py imports load_and_cutout/clean_alpha/despeckle/
alpha_bbox/fit_bottom_aligned/make_silhouette with the old call signatures.

Prints the alpha bbox and fill ratio (alpha-pixel-count / bbox-area) on success.
"""
import argparse
import sys

import numpy as np
from PIL import Image, ImageFilter
from rembg import remove, new_session
from scipy import ndimage

ALPHA_THRESHOLD = 16
DESPECKLE_MIN_FRACTION = 0.02
SIZE_CHOICES = (128, 192, 256, 384, 512)
MATTE_CHOICES = ("u2net", "isnet-general-use", "birefnet-general")
DEFAULT_OUTLINE_COLOR = (0x14, 0x0B, 0x08)
DEFAULT_OUTLINE_ALPHA = 235
DEFAULT_OUTLINE_FEATHER = 0.6

_SESSION_CACHE = {}


def get_session(matte):
    """Cache rembg sessions by matte name (model load is expensive — birefnet-general's
    weights are ~970MB), matching finish_portrait.py's pattern."""
    if matte not in _SESSION_CACHE:
        _SESSION_CACHE[matte] = new_session(matte)
    return _SESSION_CACHE[matte]


def load_and_cutout(in_path, matte="u2net"):
    img = Image.open(in_path).convert("RGBA")
    session = get_session(matte)
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


def sharpen_rgba(img, radius=1.2, percent=60, threshold=2):
    """Color-bleed RGB into fully-transparent (alpha==0) pixels via nearest-opaque-pixel
    lookup (so UnsharpMask has no transparent-black neighbours to halo against), then run
    PIL's UnsharpMask on RGB only, keeping the original alpha channel untouched."""
    arr = np.array(img)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3].copy()

    transparent = alpha == 0
    if transparent.any() and (~transparent).any():
        indices = ndimage.distance_transform_edt(transparent, return_distances=False, return_indices=True)
        rgb = np.ascontiguousarray(rgb[indices[0], indices[1]])

    rgb_img = Image.fromarray(rgb, "RGB").filter(
        ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=threshold)
    )
    out = np.dstack([np.array(rgb_img), alpha])
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def add_outline(img, px, color=DEFAULT_OUTLINE_COLOR, alpha=DEFAULT_OUTLINE_ALPHA, feather=DEFAULT_OUTLINE_FEATHER):
    """Baked dark painted outline: disk-structured binary dilation of alpha>0 by `px`,
    a small gaussian feather, colorised, composited UNDER the sprite (so only the ring
    outside the original silhouette shows)."""
    if px <= 0:
        return img
    arr = np.array(img)
    mask = arr[:, :, 3] > 0

    yy, xx = np.ogrid[-px:px + 1, -px:px + 1]
    disk = (xx * xx + yy * yy) <= px * px
    dilated = ndimage.binary_dilation(mask, structure=disk)

    dilated_f = dilated.astype(np.float64)
    if feather > 0:
        dilated_f = ndimage.gaussian_filter(dilated_f, sigma=feather)
    outline_alpha = np.clip(dilated_f, 0.0, 1.0) * (alpha / 255.0)

    layer = np.zeros((*mask.shape, 4), dtype=np.uint8)
    layer[:, :, 0] = color[0]
    layer[:, :, 1] = color[1]
    layer[:, :, 2] = color[2]
    layer[:, :, 3] = np.clip(outline_alpha * 255.0, 0, 255).astype(np.uint8)
    outline_img = Image.fromarray(layer, "RGBA")
    return Image.alpha_composite(outline_img, img)


def parse_hex_color(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def main():
    ap = argparse.ArgumentParser(description="rembg + despeckle + trim + bottom-aligned resize.")
    ap.add_argument("--in", dest="in_path", required=True)
    ap.add_argument("--out", dest="out_path", required=True)
    ap.add_argument("--size", type=int, required=True, choices=SIZE_CHOICES)
    ap.add_argument("--margin", type=int, default=None,
                     help="Default 4, or 4+N when --outline N is set and --margin is omitted.")
    ap.add_argument("--silhouette", dest="silhouette_path", default=None)
    ap.add_argument("--mirror", action="store_true", help="Flip horizontally after trim (art must face right).")
    ap.add_argument("--matte", choices=MATTE_CHOICES, default="u2net",
                     help="rembg model for the cutout (05.6-03 matte comparison).")
    ap.add_argument("--sharpen", action="store_true",
                     help="Color-bleed + UnsharpMask on RGB only (05.6-03 GFX-08).")
    ap.add_argument("--sharpen-radius", dest="sharpen_radius", type=float, default=1.2)
    ap.add_argument("--sharpen-percent", dest="sharpen_percent", type=int, default=60)
    ap.add_argument("--sharpen-threshold", dest="sharpen_threshold", type=int, default=2)
    ap.add_argument("--outline", type=int, default=0, help="Outline width in px (0 = none).")
    ap.add_argument("--outline-color", dest="outline_color", default="#140b08")
    ap.add_argument("--outline-alpha", dest="outline_alpha", type=int, default=DEFAULT_OUTLINE_ALPHA)
    ap.add_argument("--outline-feather", dest="outline_feather", type=float, default=DEFAULT_OUTLINE_FEATHER)
    args = ap.parse_args()

    try:
        margin = args.margin
        if margin is None:
            margin = 4 + args.outline if args.outline > 0 else 4

        cut = load_and_cutout(args.in_path, matte=args.matte)
        cut = clean_alpha(cut)
        cut = despeckle(cut)
        fitted, bbox = fit_bottom_aligned(cut, args.size, margin=margin)
        if args.sharpen:
            fitted = sharpen_rgba(fitted, args.sharpen_radius, args.sharpen_percent, args.sharpen_threshold)
        if args.outline > 0:
            outline_color = parse_hex_color(args.outline_color)
            fitted = add_outline(fitted, args.outline, color=outline_color,
                                  alpha=args.outline_alpha, feather=args.outline_feather)
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
