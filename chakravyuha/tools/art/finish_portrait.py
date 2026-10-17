#!/usr/bin/env python3
"""
finish_portrait.py — rembg cutout + despeckle + trim + 600x768 bust fit + bottom feather.

Usage:
  python tools/art/finish_portrait.py --in RAW.png --out OUT.png \
      [--width 600] [--height 768] [--top-margin 12] [--feather 0.12] \
      [--matte u2net|isnet-general-use|birefnet-general] [--alpha-matting] \
      [--keyfill] [--key-de 18] [--key-max-growth 0.15] [--despeckle-min 0.02] \
      [--mirror] [--silhouette SIL.png] [--subject SUBJECT_ID]
  python tools/art/finish_portrait.py --self-test

Pipeline (D-08, 05.5-CONTEXT; matte ladder + keyfill: D-31, 05.5-04 Task 3):
  1. rembg cutout (--matte, default u2net; optional --alpha-matting)
  2. clean alpha (<16 -> 0)
  3. optional --keyfill: recover thin held props lost to the cutout via a colour-distance key
     against the sampled backdrop, guarded against runaway growth (keyfill_core)
  4. despeckle (keep components >= --despeckle-min of the largest, default 2% -- Vayu's
     scarves and Agni's flames survive)
  5. crop to the alpha bbox
  6. scale to fit width W and height (H - top_margin), preserving aspect, LANCZOS
  7. paste bottom-center on a transparent WxH canvas (bottom edge flush; bust crop is fine)
  8. multiply alpha by a linear ramp from 1 -> 0 across the bottom feather*H rows
  9. optional mirror
  10. save RGBA PNG
  11. optional black-on-white silhouette

Never mirror Krishna or Durga (D-08): flute/mudra handedness is iconographic. Passing
--mirror with --subject krishna or --subject durga is refused (exit 2); regenerate instead.

bria-rmbg is never offered as a --matte choice: its license (RMBG-1.4) is non-commercial.

Prints "bbox=... fill_ratio=... out=..." plus "matte=... keyfill_added=...% skipped=..." on
success (the latter is recorded by Task 4 into provenance post_processing). Exits 1 with
"ERROR:" on failure.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image
from rembg import remove, new_session
from scipy import ndimage
from skimage.color import rgb2lab

ALPHA_THRESHOLD = 16
DESPECKLE_MIN_FRACTION = 0.02
NO_MIRROR_SUBJECTS = {"krishna", "durga"}
MATTE_CHOICES = ("u2net", "isnet-general-use", "birefnet-general")  # bria-rmbg is never offered (non-commercial license)
KEY_DE_DEFAULT = 18.0
KEY_MAX_GROWTH_DEFAULT = 0.15

_SESSION_CACHE = {}


def get_session(matte):
    """Cache rembg sessions by matte name (model downloads/loads are expensive)."""
    if matte not in _SESSION_CACHE:
        _SESSION_CACHE[matte] = new_session(matte)
    return _SESSION_CACHE[matte]


def load_and_cutout(in_path, matte="u2net", alpha_matting=False):
    img = Image.open(in_path).convert("RGBA")
    session = get_session(matte)
    cut = remove(img, session=session, alpha_matting=alpha_matting)
    return img, cut


def clean_alpha(img):
    arr = np.array(img)
    alpha = arr[:, :, 3]
    alpha = np.where(alpha < ALPHA_THRESHOLD, 0, alpha)
    arr[:, :, 3] = alpha
    return Image.fromarray(arr, "RGBA")


def keyfill_core(rgb, matte_alpha, key_de=KEY_DE_DEFAULT, key_max_growth=KEY_MAX_GROWTH_DEFAULT):
    """Recover thin held props the rembg cutout lost, via a colour-distance key against the
    sampled backdrop (D-31). Pure function; no file or session I/O.

    rgb: (H,W,3) uint8 array of the ORIGINAL raw image (pre-cutout; the backdrop must still be
    present at the border for sampling).
    matte_alpha: (H,W) uint8 alpha from the rembg cutout (same size as rgb).

    Steps: background colour = median of a 16px border ring -> per-pixel deltaE76 in Lab ->
    key = deltaE > key_de -> label 8-connected components of key, keep only those touching the
    (2px-dilated) matte -> alpha-ramp the added pixels from deltaE in [key_de, 2*key_de] to
    0..255 -> alpha = max(matte, added) -> growth guard: if added pixels exceed
    key_max_growth * matte area, return the matte UNCHANGED with keyfill_skipped=True.

    Returns (alpha_uint8, stats) where stats = {matte_px, added_px, added_frac, key_de,
    keyfill_skipped}.
    """
    ring = 16
    h, w = matte_alpha.shape[:2]
    border = np.concatenate([
        rgb[:ring, :, :].reshape(-1, 3),
        rgb[max(0, h - ring):, :, :].reshape(-1, 3),
        rgb[:, :ring, :].reshape(-1, 3),
        rgb[:, max(0, w - ring):, :].reshape(-1, 3),
    ], axis=0)
    bg_rgb = np.median(border, axis=0)

    lab = rgb2lab(rgb.astype(np.float64) / 255.0)
    bg_lab = rgb2lab((bg_rgb / 255.0).reshape(1, 1, 3))[0, 0]
    delta_e = np.sqrt(np.sum((lab - bg_lab) ** 2, axis=2))

    key = delta_e > key_de
    matte_bool = matte_alpha > 127
    matte_dilated = ndimage.binary_dilation(matte_bool, iterations=2)

    labeled, num = ndimage.label(key, structure=np.ones((3, 3)))
    if num > 0:
        touching_labels = set(np.unique(labeled[matte_dilated & key])) - {0}
    else:
        touching_labels = set()
    candidate = np.isin(labeled, list(touching_labels)) if touching_labels else np.zeros_like(key)
    added_candidate = candidate & ~matte_bool

    matte_px = int(matte_bool.sum())
    added_px = int(added_candidate.sum())
    added_frac = (added_px / matte_px) if matte_px > 0 else 0.0

    stats = {
        "matte_px": matte_px, "added_px": added_px, "added_frac": added_frac,
        "key_de": key_de, "keyfill_skipped": False,
    }

    if matte_px > 0 and added_frac > key_max_growth:
        stats["keyfill_skipped"] = True
        return matte_alpha.copy(), stats

    ramp = np.clip((delta_e - key_de) / key_de, 0.0, 1.0) * 255.0
    added_alpha = np.where(added_candidate, ramp, 0).astype(np.uint8)
    alpha_out = np.maximum(matte_alpha, added_alpha)
    return alpha_out, stats


def despeckle(img, min_fraction=DESPECKLE_MIN_FRACTION):
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
    keep_labels = [i + 1 for i, s in enumerate(sizes) if s >= largest * min_fraction]
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


def _make_synthetic_raw(w=896, h=1152, bg=(118, 118, 118)):
    """Synthetic self-test fixture (D-31 behaviour spec): a flat grey background, a warm
    ellipse body, a 4px x 300px rod touching the body with a 40px ball at its end (a gada),
    and a detached 6px speck far from everything. Returns
    (rgb uint8 HxWx3, body_mask, rod_and_ball_mask, speck_mask) boolean masks at full size."""
    rgb = np.full((h, w, 3), bg, dtype=np.uint8)
    yy, xx = np.mgrid[0:h, 0:w]

    cx, cy = int(w * 0.35), int(h * 0.55)
    rx, ry = int(w * 0.18), int(h * 0.30)
    body_mask = ((xx - cx) ** 2 / rx ** 2 + (yy - cy) ** 2 / ry ** 2) <= 1.0
    rgb[body_mask] = (200, 140, 90)  # warm skin tone, well clear of the grey backdrop

    rod_x0 = cx + rx - 5  # overlaps the body's right edge so the rod "touches the body"
    rod_y0 = cy - 2
    rod_mask = np.zeros((h, w), dtype=bool)
    rod_mask[rod_y0:rod_y0 + 4, rod_x0:min(w, rod_x0 + 300)] = True

    ball_cx, ball_cy = min(w - 21, rod_x0 + 300), rod_y0 + 2
    ball_mask = ((xx - ball_cx) ** 2 + (yy - ball_cy) ** 2) <= 20 ** 2
    rod_and_ball = rod_mask | ball_mask
    rgb[rod_and_ball] = (185, 155, 65)  # gold, also clear of the backdrop

    speck_cx, speck_cy = int(w * 0.08), int(h * 0.08)
    speck_mask = np.zeros((h, w), dtype=bool)
    speck_mask[speck_cy:speck_cy + 6, speck_cx:speck_cx + 6] = True
    rgb[speck_mask] = (210, 150, 100)

    return rgb, body_mask, rod_and_ball, speck_mask


def _self_test():
    """Synthetic-image-only assertions (no rembg): keyfill_core recovers a lost prop, the
    growth guard trips on a vignette backdrop, and despeckle removes a detached speck."""
    rgb, body_mask, rod_and_ball, speck_mask = _make_synthetic_raw()
    h, w = body_mask.shape

    # matte "without the rod" -- simulates rembg losing a thin held prop.
    matte_without_rod = np.zeros((h, w), dtype=np.uint8)
    matte_without_rod[body_mask] = 255
    matte_without_rod[speck_mask] = 255

    alpha_out, stats = keyfill_core(rgb, matte_without_rod, key_de=KEY_DE_DEFAULT,
                                     key_max_growth=KEY_MAX_GROWTH_DEFAULT)
    assert not stats["keyfill_skipped"], f"keyfill unexpectedly skipped on a flat backdrop: {stats}"
    recovered_frac = float((alpha_out[rod_and_ball] > 0).mean())
    assert recovered_frac >= 0.95, f"keyfill only recovered {recovered_frac:.3f} of the rod/ball"

    # despeckle removes a detached speck (independent of keyfill).
    full_alpha = np.zeros((h, w), dtype=np.uint8)
    full_alpha[body_mask | rod_and_ball | speck_mask] = 255
    full_img = Image.fromarray(np.dstack([rgb, full_alpha]), "RGBA")
    despeckled = despeckle(full_img)
    d_alpha = np.array(despeckled)[:, :, 3]
    assert (d_alpha[speck_mask] > 0).sum() == 0, "despeckle did not remove the detached speck"
    assert (d_alpha[body_mask] > 0).mean() > 0.99, "despeckle incorrectly ate the body"

    # growth guard: a strong gradient/vignette backdrop should trip keyfill_skipped.
    grad_row = np.linspace(10, 170, w).astype(np.uint8)
    grad_img = np.tile(grad_row.reshape(1, w, 1), (h, 1, 3)).astype(np.uint8)
    fg_mask = body_mask | rod_and_ball | speck_mask
    vignette_rgb = np.where(fg_mask[:, :, None], rgb, grad_img).astype(np.uint8)

    alpha_out2, stats2 = keyfill_core(vignette_rgb, matte_without_rod, key_de=KEY_DE_DEFAULT,
                                       key_max_growth=KEY_MAX_GROWTH_DEFAULT)
    assert stats2["keyfill_skipped"], f"expected the growth guard to trip on a vignette backdrop: {stats2}"
    assert np.array_equal(alpha_out2, matte_without_rod), "keyfill_skipped must return the matte unchanged"

    # Default CLI behaviour sanity: despeckle() with no min_fraction arg matches the module
    # constant (legacy default unchanged).
    import inspect
    assert inspect.signature(despeckle).parameters["min_fraction"].default == DESPECKLE_MIN_FRACTION

    print("finish_portrait.py --self-test: ALL PASSED")


def main():
    ap = argparse.ArgumentParser(description="rembg cutout + despeckle + trim + bust fit + bottom feather.")
    ap.add_argument("--self-test", dest="self_test", action="store_true",
                     help="Run offline, rembg-free assertions for keyfill_core/despeckle.")
    ap.add_argument("--in", dest="in_path", required=False)
    ap.add_argument("--out", dest="out_path", required=False)
    ap.add_argument("--width", type=int, default=600)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--top-margin", dest="top_margin", type=int, default=12)
    ap.add_argument("--feather", type=float, default=0.12)
    ap.add_argument("--matte", choices=MATTE_CHOICES, default="u2net",
                     help="rembg model (bria-rmbg is never offered -- non-commercial license).")
    ap.add_argument("--alpha-matting", dest="alpha_matting", action="store_true",
                     help="rembg alpha_matting=True with default thresholds.")
    ap.add_argument("--keyfill", action="store_true",
                     help="Recover thin held props lost to the cutout via a colour-distance key (D-31).")
    ap.add_argument("--key-de", dest="key_de", type=float, default=KEY_DE_DEFAULT)
    ap.add_argument("--key-max-growth", dest="key_max_growth", type=float, default=KEY_MAX_GROWTH_DEFAULT)
    ap.add_argument("--despeckle-min", dest="despeckle_min", type=float, default=DESPECKLE_MIN_FRACTION)
    ap.add_argument("--mirror", action="store_true", help="Flip horizontally (refused for krishna/durga).")
    ap.add_argument("--silhouette", dest="silhouette_path", default=None)
    ap.add_argument("--subject", default=None, help="Subject id, used to refuse --mirror for krishna/durga.")
    args = ap.parse_args()

    if args.self_test:
        _self_test()
        return

    if not args.in_path or not args.out_path:
        print("ERROR: --in and --out are required unless --self-test is used", file=sys.stderr)
        sys.exit(1)

    if args.mirror and args.subject in NO_MIRROR_SUBJECTS:
        print(f"ERROR: --mirror refused for subject {args.subject!r} — handedness is iconographic "
              f"(flute/mudra). Regenerate a right-facing attempt instead.", file=sys.stderr)
        sys.exit(2)

    try:
        out_dir = os.path.dirname(args.out_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)
        if args.silhouette_path:
            sil_dir = os.path.dirname(args.silhouette_path)
            if sil_dir:
                os.makedirs(sil_dir, exist_ok=True)

        raw_img, cut = load_and_cutout(args.in_path, matte=args.matte, alpha_matting=args.alpha_matting)
        cut = clean_alpha(cut)

        keyfill_added_pct = 0.0
        keyfill_skipped = False
        if args.keyfill:
            raw_rgb = np.array(raw_img.convert("RGB").resize(cut.size)) if raw_img.size != cut.size \
                else np.array(raw_img.convert("RGB"))
            cut_arr = np.array(cut)
            new_alpha, kf_stats = keyfill_core(raw_rgb, cut_arr[:, :, 3],
                                                key_de=args.key_de, key_max_growth=args.key_max_growth)
            cut_arr[:, :, 3] = new_alpha
            cut = Image.fromarray(cut_arr, "RGBA")
            keyfill_added_pct = kf_stats["added_frac"] * 100.0
            keyfill_skipped = kf_stats["keyfill_skipped"]

        cut = despeckle(cut, min_fraction=args.despeckle_min)
        fitted, bbox = fit_bust(cut, args.width, args.height, args.top_margin)
        fitted = bottom_feather(fitted, args.feather)
        if args.mirror:
            fitted = fitted.transpose(Image.FLIP_LEFT_RIGHT)
        fitted.save(args.out_path, "PNG")

        alpha = np.array(fitted)[:, :, 3]
        fill_ratio = float((alpha > 0).sum()) / float(args.width * args.height)
        print(f"bbox={bbox} fill_ratio={fill_ratio:.3f} out={args.out_path}")
        print(f"matte={args.matte} keyfill_added={keyfill_added_pct:.1f}% skipped={keyfill_skipped}")

        if args.silhouette_path:
            sil = make_silhouette(fitted)
            sil.save(args.silhouette_path, "PNG")
            print(f"silhouette={args.silhouette_path}")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
