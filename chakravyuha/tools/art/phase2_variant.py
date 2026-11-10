#!/usr/bin/env python3
"""
phase2_variant.py — deterministic post-process of a finished boss idle frame into its
phase-2 (enraged / empowered) variant. No additional generation.

Usage:
  python tools/art/phase2_variant.py --in FRAME.png --out FRAME_P2.png --mode ember|divine

Modes:
  ember (asura bosses: tataka, ahiravana, kumbhakarna):
    - hue shift toward red (-18 degrees) on hues NOT already near red (>340 or <20 deg untouched)
    - darken value channel 15%, saturation +15%
    - ember rim glow behind the sprite: dilate alpha 3px -> gaussian blur sigma=6 -> colorize
      #ff5a1e at opacity 0.85, composited UNDER the sprite

  divine (Yama only, D-15a — restrained "divine wrath", never demonic):
    - NO hue shift, darken at most 3% (well under the 5% cap), contrast +8%
    - two-layer glow behind the sprite: inner #9fb8ff blur sigma=5 opacity 0.8,
      outer #ffd34d blur sigma=12 opacity 0.45

Canvas size (width/height) is preserved exactly; the glow may extend into the
transparent margin already present around the trimmed sprite.
"""
import argparse
import sys

import numpy as np
from PIL import Image, ImageEnhance
from scipy import ndimage

EMBER_COLOR = (0xFF, 0x5A, 0x1E)
DIVINE_INNER_COLOR = (0x9F, 0xB8, 0xFF)
DIVINE_OUTER_COLOR = (0xFF, 0xD3, 0x4D)


def rgb_to_hsv_arr(rgb_float):
    """rgb_float: (...,3) array in 0..1. Returns (h,s,v) each (...,) in 0..1 / 0..1 / 0..1 (h in turns)."""
    r, g, b = rgb_float[..., 0], rgb_float[..., 1], rgb_float[..., 2]
    maxc = np.max(rgb_float, axis=-1)
    minc = np.min(rgb_float, axis=-1)
    v = maxc
    delta = maxc - minc
    safe_delta = np.where(delta == 0, 1, delta)
    s = np.where(maxc == 0, 0, delta / np.where(maxc == 0, 1, maxc))

    rc = (maxc - r) / safe_delta
    gc = (maxc - g) / safe_delta
    bc = (maxc - b) / safe_delta

    h = np.zeros_like(maxc)
    h = np.where(maxc == r, bc - gc, h)
    h = np.where(maxc == g, 2.0 + rc - bc, h)
    h = np.where(maxc == b, 4.0 + gc - rc, h)
    h = (h / 6.0) % 1.0
    h = np.where(delta == 0, 0, h)
    return h, s, v


def hsv_to_rgb_arr(h, s, v):
    i = np.floor(h * 6.0)
    f = h * 6.0 - i
    p = v * (1.0 - s)
    q = v * (1.0 - f * s)
    t = v * (1.0 - (1.0 - f) * s)
    i = i.astype(np.int64) % 6

    conditions = [i == k for k in range(6)]
    r = np.select(conditions, [v, q, p, p, t, v], default=v)
    g = np.select(conditions, [t, v, v, q, p, p], default=v)
    b = np.select(conditions, [p, p, t, v, v, q], default=v)
    return np.stack([r, g, b], axis=-1)


def apply_ember(rgba, scale=1.0):
    arr = np.array(rgba).astype(np.float64)
    rgb = arr[:, :, :3] / 255.0
    alpha = arr[:, :, 3]

    h, s, v = rgb_to_hsv_arr(rgb)
    h_deg = h * 360.0

    non_red = (h_deg >= 20) & (h_deg <= 340)
    h_deg_new = np.where(non_red, (h_deg - 18) % 360, h_deg)
    h_new = h_deg_new / 360.0

    v_new = np.clip(v * 0.85, 0, 1)
    s_new = np.clip(s * 1.15, 0, 1)

    rgb_new = hsv_to_rgb_arr(h_new, s_new, v_new)
    out = np.zeros_like(arr)
    out[:, :, :3] = np.clip(rgb_new * 255.0, 0, 255)
    out[:, :, 3] = alpha
    result = Image.fromarray(out.astype(np.uint8), "RGBA")

    glow = build_glow(alpha.astype(np.uint8), dilate_px=round(3 * scale), blur_sigma=6 * scale,
                       color=EMBER_COLOR, opacity=0.85)
    return composite_under(result, [glow])


def apply_divine(rgba, scale=1.0):
    arr = np.array(rgba)
    alpha = arr[:, :, 3]

    rgb_img = Image.fromarray(arr[:, :, :3], "RGB")
    rgb_img = ImageEnhance.Contrast(rgb_img).enhance(1.08)
    rgb_arr = np.array(rgb_img).astype(np.float64) * 0.97  # <=5% darken cap (using 3%)
    rgb_arr = np.clip(rgb_arr, 0, 255)

    out = np.zeros_like(arr)
    out[:, :, :3] = rgb_arr.astype(np.uint8)
    out[:, :, 3] = alpha
    result = Image.fromarray(out, "RGBA")

    inner = build_glow(alpha, dilate_px=round(2 * scale), blur_sigma=5 * scale,
                        color=DIVINE_INNER_COLOR, opacity=0.8)
    outer = build_glow(alpha, dilate_px=round(4 * scale), blur_sigma=12 * scale,
                        color=DIVINE_OUTER_COLOR, opacity=0.45)
    return composite_under(result, [outer, inner])


def build_glow(alpha_u8, dilate_px, blur_sigma, color, opacity):
    mask = alpha_u8 > 0
    if dilate_px > 0:
        structure = np.ones((2 * dilate_px + 1, 2 * dilate_px + 1))
        mask = ndimage.binary_dilation(mask, structure=structure)
    blurred = ndimage.gaussian_filter(mask.astype(np.float32), sigma=blur_sigma)
    if blurred.max() > 0:
        blurred = blurred / blurred.max()
    glow_alpha = np.clip(blurred * opacity * 255.0, 0, 255).astype(np.uint8)

    layer = np.zeros((*mask.shape, 4), dtype=np.uint8)
    layer[:, :, 0] = color[0]
    layer[:, :, 1] = color[1]
    layer[:, :, 2] = color[2]
    layer[:, :, 3] = glow_alpha
    return Image.fromarray(layer, "RGBA")


def composite_under(sprite_rgba, glow_layers_back_to_front):
    canvas = Image.new("RGBA", sprite_rgba.size, (0, 0, 0, 0))
    for layer in glow_layers_back_to_front:
        canvas = Image.alpha_composite(canvas, layer)
    canvas = Image.alpha_composite(canvas, sprite_rgba)
    return canvas


def main():
    ap = argparse.ArgumentParser(description="Deterministic boss phase-2 variant (ember|divine).")
    ap.add_argument("--in", dest="in_path", required=True)
    ap.add_argument("--out", dest="out_path", required=True)
    ap.add_argument("--mode", required=True, choices=["ember", "divine"])
    ap.add_argument("--scale", type=float, default=1.0,
                     help="Multiplies dilate px and every gaussian sigma (05.6-03: bosses at "
                          "512 use --scale 2 to keep exactly the Phase-2 look). Default 1.0 "
                          "reproduces the old output byte-identically.")
    args = ap.parse_args()

    try:
        src = Image.open(args.in_path).convert("RGBA")
        if args.mode == "ember":
            result = apply_ember(src, scale=args.scale)
        else:
            result = apply_divine(src, scale=args.scale)
        assert result.size == src.size, "phase2_variant must preserve canvas size"
        result.save(args.out_path, "PNG")
        print(f"mode={args.mode} size={result.size} out={args.out_path}")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
