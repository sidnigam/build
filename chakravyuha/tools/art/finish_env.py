#!/usr/bin/env python3
"""
finish_env.py — env-art finishing: tile / strip / prop / decal modes (Phase 05.4 D-03/D-04/D-05).

Usage:
  python tools/art/finish_env.py tile --in RAW.png --out OUT.png --size 1024 [--grade-limits]
  python tools/art/finish_env.py strip --in RAW.png --out OUT.png --crop x0,y0,x1,y1 \
      --width 1024 [--preview PREVIEW.png]
  python tools/art/finish_env.py prop --in RAW.png --out OUT.png --max 384|448|512 \
      [--grade prop|architecture] [--silhouette SIL.png]
  python tools/art/finish_env.py decal --in RAW.png --out OUT.png --max 384 \
      [--max-alpha 0.55] [--grade decal]
  python tools/art/finish_env.py --self-test

Every mode prints one JSON line on success: {"mode","out","size","luma_mean","luma_std",
"sat_mean","grading"}. Grading (D-08a) is deterministic: env_grade profiles (prop/
architecture/decal: HSV saturation x val scale) come from tools/art/prompts.json env_grade.

make_seamless (used by tile/strip) rolls the image by half on the seamed axis/axes and
cross-blends with a feathered center-weighted mask, so the wrap edges are built from content
that was originally interior (continuous), while the center keeps the original (also
continuous there) — see make_seamless() docstring for the exact algorithm.
"""
import argparse
import copy
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import finish_sprite as fsprite  # rembg cutout helpers (load_and_cutout/clean_alpha/despeckle)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROMPTS_PATH = os.path.join(ROOT, "tools", "art", "prompts.json")


# ---------------------------------------------------------------------------
# make_seamless
# ---------------------------------------------------------------------------

def _feather_mask_1d(n, feather_frac):
    """1D mask of length n: 0 at both edges, ramping via a cosine ease to 1 across the outer
    feather_frac*n band on each side, 1 through the center."""
    ramp = max(1, int(round(n * feather_frac)))
    ramp = min(ramp, n // 2) if n > 1 else 1
    mask = np.ones(n, dtype=np.float64)
    t = np.linspace(0, 1, ramp, endpoint=False)
    curve = 0.5 - 0.5 * np.cos(np.pi * t)  # 0 -> ~1 cosine ease
    mask[:ramp] = curve
    mask[n - ramp:] = curve[::-1]
    return mask


def make_seamless(img, axis="xy", feather_frac=0.22):
    """Roll img by half on `axis` ('x' or 'xy') and cross-blend with a feathered mask so the
    result wraps continuously on that axis/axes.

    out = original*mask + rolled*(1-mask). mask is 1 in the center (keep the original, which
    is continuous there) and 0 at the edges (take the rolled copy, whose edges are what was
    originally near the center — also continuous, since the roll moved the *original* seam
    to the middle of the frame, away from both the output's own edges and its center).
    """
    arr = np.array(img).astype(np.float64)
    h, w = arr.shape[:2]

    if axis == "x":
        rolled = np.roll(arr, shift=w // 2, axis=1)
        mask = np.tile(_feather_mask_1d(w, feather_frac)[np.newaxis, :], (h, 1))
    elif axis == "xy":
        rolled = np.roll(np.roll(arr, shift=h // 2, axis=0), shift=w // 2, axis=1)
        mask_x = _feather_mask_1d(w, feather_frac)
        mask_y = _feather_mask_1d(h, feather_frac)
        mask = np.outer(mask_y, mask_x)
    else:
        raise ValueError(f"Unknown axis: {axis!r}")

    if arr.ndim == 3:
        mask = mask[:, :, np.newaxis]

    out = arr * mask + rolled * (1 - mask)
    out = np.clip(out, 0, 255).astype(np.uint8)
    return Image.fromarray(out, img.mode)


# ---------------------------------------------------------------------------
# tile stats + deterministic grading (D-08/D-08a)
# ---------------------------------------------------------------------------

def compute_tile_stats(img):
    """Return {"luma_mean","luma_std","sat_mean"} on a 0..1 scale for an RGB(A) image."""
    arr = np.array(img.convert("RGB")).astype(np.float64) / 255.0
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    maxc = arr.max(axis=-1)
    minc = arr.min(axis=-1)
    sat = np.where(maxc > 1e-6, (maxc - minc) / np.clip(maxc, 1e-6, None), 0.0)
    return {
        "luma_mean": float(luma.mean()),
        "luma_std": float(luma.std()),
        "sat_mean": float(sat.mean()),
    }


def grade_tile(img, limits):
    """Deterministic grade: contrast-compress luma toward its mean, then HSV-saturation-scale,
    then value-scale — value last, since desaturating a vivid image raises its luma (the min
    channel rises toward the max/"V" channel), so only a final value pass can reliably land
    luma_mean under the limit regardless of what saturation did. Each step only runs if the
    corresponding stat exceeds `limits`. Returns (graded_img, info) where info = {"graded":
    bool, "contrast_factor", "sat_factor", "val_factor", "stats"} (final stats, post-grade)."""
    arr = np.array(img.convert("RGB")).astype(np.float64) / 255.0

    stats = compute_tile_stats(img)
    contrast_factor = 1.0
    if limits.get("luma_std") is not None and stats["luma_std"] > limits["luma_std"] > 0:
        contrast_factor = min(1.0, limits["luma_std"] / stats["luma_std"])
        mean_l = arr.mean()
        arr = mean_l + (arr - mean_l) * contrast_factor
        arr = np.clip(arr, 0, 1)

    arr_u8 = (arr * 255).astype(np.uint8)
    stats2 = compute_tile_stats(Image.fromarray(arr_u8))
    sat_factor = 1.0
    if limits.get("sat_mean") is not None and stats2["sat_mean"] > limits["sat_mean"] > 0:
        sat_factor = limits["sat_mean"] / stats2["sat_mean"]
        hsv = np.array(Image.fromarray(arr_u8, "RGB").convert("HSV")).astype(np.float64)
        hsv[..., 1] = np.clip(hsv[..., 1] * sat_factor, 0, 255)
        arr_u8 = np.array(Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB"))

    stats3 = compute_tile_stats(Image.fromarray(arr_u8))
    val_factor = 1.0
    if limits.get("luma_mean") is not None and stats3["luma_mean"] > limits["luma_mean"] > 0:
        val_factor = limits["luma_mean"] / stats3["luma_mean"]
        arr_u8 = np.clip(arr_u8.astype(np.float64) * val_factor, 0, 255).astype(np.uint8)

    graded = Image.fromarray(arr_u8, "RGB")
    final_stats = compute_tile_stats(graded)
    graded_flag = contrast_factor != 1.0 or sat_factor != 1.0 or val_factor != 1.0
    return graded, {
        "graded": graded_flag,
        "contrast_factor": contrast_factor,
        "sat_factor": sat_factor,
        "val_factor": val_factor,
        "stats": final_stats,
    }


# ---------------------------------------------------------------------------
# env_grade (prop/architecture/decal HSV sat/val scale, D-08a)
# ---------------------------------------------------------------------------

def apply_grade_rgb(img, grade):
    """Scale HSV saturation/value on the RGB channels by grade['sat']/grade['val'].
    RGBA alpha, if present, is preserved untouched."""
    has_alpha = img.mode == "RGBA"
    alpha = img.split()[3] if has_alpha else None
    rgb = img.convert("RGB")
    hsv = np.array(rgb.convert("HSV")).astype(np.float64)
    hsv[..., 1] = np.clip(hsv[..., 1] * grade.get("sat", 1.0), 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * grade.get("val", 1.0), 0, 255)
    graded = Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")
    if has_alpha:
        graded = graded.convert("RGBA")
        graded.putalpha(alpha)
    return graded


# ---------------------------------------------------------------------------
# prop finishing (rembg cutout -> clean -> despeckle -> trim -> fit, D-05)
# ---------------------------------------------------------------------------

def prop_finish_core(cut, max_side, grade=None, margin=4):
    """Deterministic post-cutout pipeline shared by prop_finish() and the self-test: takes an
    already-cutout RGBA image (alpha=255 on subject, 0 on background — whatever produced it),
    cleans/despeckles the alpha, trims to bbox, and fits into a max_side x max_side box
    keeping aspect. Unlike finish_sprite's square output, the returned canvas is sized to the
    trimmed content + margin (not padded to a square) — bottom-aligned in the sense that a
    caller places the frame's anchor at the canvas bottom edge; there is no extra vertical
    padding to align within."""
    cut = fsprite.clean_alpha(cut)
    cut = fsprite.despeckle(cut)
    bbox = fsprite.alpha_bbox(cut)
    cropped = cut.crop(bbox)
    cw, ch = cropped.size
    avail = max(1, max_side - 2 * margin)
    scale = min(avail / cw, avail / ch)
    new_w, new_h = max(1, round(cw * scale)), max(1, round(ch * scale))
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (new_w + 2 * margin, new_h + 2 * margin), (0, 0, 0, 0))
    canvas.paste(resized, (margin, margin), resized)
    if grade:
        canvas = apply_grade_rgb(canvas, grade)
    return canvas, bbox


def prop_finish(in_path, max_side, grade=None, margin=4):
    cut = fsprite.load_and_cutout(in_path)
    return prop_finish_core(cut, max_side, grade=grade, margin=margin)


# ---------------------------------------------------------------------------
# decal finishing (background-difference alpha key, D-03a)
# ---------------------------------------------------------------------------

def estimate_decal_alpha(rgb_arr, max_alpha=0.55, t0=10.0, t1=60.0, feather_sigma=2.0, border=24):
    """rgb_arr: HxWx3 float array (0..255). Returns an HxW alpha array in [0, max_alpha],
    estimated from RGB-Euclidean distance to the median border-ring background color,
    Gaussian-feathered, thresholded between t0/t1 on a 0-255 scale."""
    h, w, _ = rgb_arr.shape
    b = min(border, h // 2, w // 2) or 1
    ring = np.concatenate([
        rgb_arr[:b].reshape(-1, 3), rgb_arr[-b:].reshape(-1, 3),
        rgb_arr[:, :b].reshape(-1, 3), rgb_arr[:, -b:].reshape(-1, 3),
    ], axis=0)
    bg_color = np.median(ring, axis=0)
    delta_e = np.sqrt(((rgb_arr - bg_color) ** 2).sum(axis=-1))
    alpha = np.clip((delta_e - t0) / (t1 - t0), 0, 1)
    alpha = ndimage.gaussian_filter(alpha, sigma=feather_sigma)
    return np.clip(alpha * max_alpha, 0, max_alpha)


def decal_finish(in_path, max_side, max_alpha=0.55, grade=None):
    img = Image.open(in_path).convert("RGB")
    arr = np.array(img).astype(np.float64)
    alpha = estimate_decal_alpha(arr, max_alpha=max_alpha)
    alpha_u8 = (alpha * 255 / max(max_alpha, 1e-6)).astype(np.uint8) if max_alpha > 0 else np.zeros_like(alpha, dtype=np.uint8)
    # store the true (already alpha-capped) alpha, not renormalized, in the RGBA output:
    alpha_u8 = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    rgba = np.dstack([arr.astype(np.uint8), alpha_u8])
    img_rgba = Image.fromarray(rgba, "RGBA")

    mask = alpha_u8 > 2
    if mask.any():
        ys, xs = np.where(mask)
        bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    else:
        bbox = (0, 0, img.width, img.height)
    cropped = img_rgba.crop(bbox)
    cw, ch = cropped.size
    scale = min(max_side / cw, max_side / ch)
    new_w, new_h = max(1, round(cw * scale)), max(1, round(ch * scale))
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)
    if grade:
        resized = apply_grade_rgb(resized, grade)
    return resized, bbox


# ---------------------------------------------------------------------------
# strip finishing (wall band crop -> resize -> x-seamless, D-04)
# ---------------------------------------------------------------------------

def strip_finish(in_path, crop, width):
    img = Image.open(in_path).convert("RGB")
    cropped = img.crop(crop)
    cw, ch = cropped.size
    new_h = max(1, round(ch * (width / cw)))
    resized = cropped.resize((width, new_h), Image.LANCZOS)
    return make_seamless(resized, axis="x")


# ---------------------------------------------------------------------------
# env manifest merge (D-11: structural fields refresh, tuning fields preserved)
# ---------------------------------------------------------------------------

STRUCTURAL_TILE_FIELDS = {"path", "size", "role", "ground_safe"}
STRUCTURAL_FRAME_FIELDS = {"frame", "size", "role", "ground_safe"}
TUNING_BLOCKS = ("floor", "walls", "skins", "hazards", "lights", "grade")


def merge_manifest(existing, new):
    """Merge a freshly-built structural manifest `new` with a previously-written manifest
    `existing` (tuning-preserving, D-11). Structural per-tile/frame fields (path/frame/size/
    role/ground_safe) always come from `new`. Everything else about an existing tile/frame
    entry (worldH, worldW, alpha, zones, weight, light, anchor, footW, hazard, low, ...) is
    preserved from `existing`. New tile/frame ids not present in `existing` are added
    wholesale (their role defaults already computed by the caller). Top-level tuning blocks
    (floor/walls/skins/hazards/lights/grade) are kept wholesale from `existing` when present,
    else taken from `new`. Returns a new dict; does not mutate either argument."""
    if not existing:
        return copy.deepcopy(new)

    merged = copy.deepcopy(new)

    for section, structural_fields in (("tiles", STRUCTURAL_TILE_FIELDS), ("frames", STRUCTURAL_FRAME_FIELDS)):
        existing_section = existing.get(section, {}) or {}
        new_section = new.get(section, {}) or {}
        merged_section = {}
        for key, new_entry in new_section.items():
            if key in existing_section:
                combined = dict(existing_section[key])
                for f in structural_fields:
                    if f in new_entry:
                        combined[f] = new_entry[f]
                merged_section[key] = combined
            else:
                merged_section[key] = new_entry
        merged[section] = merged_section

    for block in TUNING_BLOCKS:
        if block in existing:
            merged[block] = copy.deepcopy(existing[block])
        elif block in new:
            merged[block] = copy.deepcopy(new[block])

    return merged


# ---------------------------------------------------------------------------
# self-test (5 behaviours, run before any real ComfyUI generation exists)
# ---------------------------------------------------------------------------

def _synthetic_gradient_noise(w=256, h=256, seed=0):
    rng = np.random.default_rng(seed)
    x = np.linspace(0, 255, w)
    y = np.linspace(0, 255, h)
    grad = (x[np.newaxis, :] + y[:, np.newaxis]) / 2.0  # non-tiling diagonal gradient
    noise = rng.normal(0, 8, size=(h, w))
    arr = np.clip(grad + noise, 0, 255).astype(np.uint8)
    rgb = np.stack([arr, arr, arr], axis=-1)
    return Image.fromarray(rgb, "RGB")


def _interior_adjacent_diff(arr):
    dx = np.mean(np.abs(arr[:, 1:] - arr[:, :-1]))
    dy = np.mean(np.abs(arr[1:, :] - arr[:-1, :]))
    return float((dx + dy) / 2.0)


def _seam_diff(arr, axis):
    col_diff = float(np.mean(np.abs(arr[:, -1] - arr[:, 0])))
    if axis == "x":
        return col_diff
    row_diff = float(np.mean(np.abs(arr[-1, :] - arr[0, :])))
    return (col_diff + row_diff) / 2.0


def test_make_seamless():
    ok = True
    for axis, seed in (("xy", 1), ("x", 2)):
        img = _synthetic_gradient_noise(seed=seed)
        out = make_seamless(img, axis=axis)
        arr = np.array(out).astype(np.float64)
        interior = _interior_adjacent_diff(arr)
        seam = _seam_diff(arr, axis)
        if not (seam <= 1.5 * interior + 1e-6):
            print(f"FAIL make_seamless axis={axis}: seam={seam:.3f} > 1.5x interior={interior:.3f}", file=sys.stderr)
            ok = False
    return ok


def _synthetic_bright_tile(w=128, h=128, seed=5):
    rng = np.random.default_rng(seed)
    hue = (rng.uniform(0, 1, size=(h, w)) * 255).astype(np.uint8)
    sat = np.full((h, w), 230, dtype=np.uint8)
    val = np.clip(0.85 + rng.normal(0, 0.05, size=(h, w)), 0, 1)
    val = (val * 255).astype(np.uint8)
    hsv = np.stack([hue, sat, val], axis=-1)
    return Image.fromarray(hsv, "HSV").convert("RGB")


def test_tile_grade():
    limits = {"luma_mean": 0.45, "luma_std": 0.15, "sat_mean": 0.32}
    img = _synthetic_bright_tile()
    before = compute_tile_stats(img)
    graded, info = grade_tile(img, limits)
    after = info["stats"]
    tol = 0.03
    ok = (after["luma_mean"] <= limits["luma_mean"] + tol and
          after["luma_std"] <= limits["luma_std"] + tol and
          after["sat_mean"] <= limits["sat_mean"] + tol)
    if not ok:
        print(f"FAIL tile grade: before={before} after={after} limits={limits}", file=sys.stderr)
    return ok


def test_prop():
    w, h = 200, 200
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., :3] = 160  # grey background
    yy, xx = np.mgrid[0:h, 0:w]
    disc = (yy - h // 2) ** 2 + (xx - w // 2) ** 2 <= 60 ** 2
    rgba[disc] = [200, 120, 60, 255]
    cut = Image.fromarray(rgba, "RGBA")

    out, bbox = prop_finish_core(cut, max_side=128, grade={"sat": 0.85, "val": 0.88})
    arr = np.array(out)
    ok = True
    if out.mode != "RGBA":
        print("FAIL prop: output not RGBA", file=sys.stderr)
        ok = False
    if max(out.size) > 128:
        print(f"FAIL prop: max side {out.size} > 128", file=sys.stderr)
        ok = False
    corner_alpha = int(arr[0, 0, 3]) + int(arr[-1, -1, 3]) + int(arr[0, -1, 3]) + int(arr[-1, 0, 3])
    if corner_alpha != 0:
        print(f"FAIL prop: corners not transparent (sum alpha={corner_alpha})", file=sys.stderr)
        ok = False
    if not (arr[:, :, 3] > 0).any():
        print("FAIL prop: no opaque pixels after trim", file=sys.stderr)
        ok = False
    return ok


def test_decal():
    w, h = 128, 128
    arr = np.full((h, w, 3), 128.0)
    yy, xx = np.mgrid[0:h, 0:w]
    blotch = (yy - h // 2) ** 2 + (xx - w // 2) ** 2 <= 20 ** 2
    arr[blotch] = 40.0

    max_alpha = 0.55
    alpha = estimate_decal_alpha(arr, max_alpha=max_alpha)
    corner_alpha = np.concatenate([alpha[:10, :10].ravel(), alpha[-10:, -10:].ravel()])
    blotch_alpha = alpha[blotch]
    ok = True
    if corner_alpha.mean() >= 0.05:
        print(f"FAIL decal: background alpha not ~0 ({corner_alpha.mean():.3f})", file=sys.stderr)
        ok = False
    if blotch_alpha.mean() <= 0.3:
        print(f"FAIL decal: blotch alpha not > 0 ({blotch_alpha.mean():.3f})", file=sys.stderr)
        ok = False
    if alpha.max() > max_alpha + 1e-6:
        print(f"FAIL decal: alpha exceeds max_alpha ({alpha.max():.3f} > {max_alpha})", file=sys.stderr)
        ok = False
    return ok


def test_manifest_merge():
    existing = {
        "schema": 1, "biome": "naraka",
        "tiles": {"floor_a": {"path": "old/path.png", "size": [512, 512], "role": "floor", "ground_safe": True}},
        "frames": {"column": {"frame": "naraka_column_0.png", "size": [180, 480], "role": "column",
                               "worldH": 999, "footW": 140, "anchor": [0.5, 0.96]}},
        "floor": {"tileScale": 0.42, "macroScale": 1.7, "macroAlpha": 0.35},
        "grade": {"floorTint": 0.9, "floorDarken": 0.9, "outerDim": 0.9, "vignette": 0.99, "propTint": "#custom"},
    }
    new = {
        "schema": 1, "biome": "naraka",
        "tiles": {"floor_a": {"path": "new/path.png", "size": [1024, 1024], "role": "floor", "ground_safe": True}},
        "frames": {"column": {"frame": "naraka_column_0.png", "size": [200, 512], "role": "column",
                               "worldH": 150, "footW": 150, "anchor": [0.5, 0.96]},
                   "gate": {"frame": "naraka_gate_0.png", "size": [420, 480], "role": "gate", "worldH": 210}},
        "floor": {"tileScale": 0.6, "macroScale": 1.7, "macroAlpha": 0.35},
        "grade": {"floorTint": 0.55, "floorDarken": 0.25, "outerDim": 0.6, "vignette": 0.4, "propTint": "#d8d0cc"},
    }
    merged = merge_manifest(existing, new)
    ok = True
    if merged["tiles"]["floor_a"]["path"] != "new/path.png" or merged["tiles"]["floor_a"]["size"] != [1024, 1024]:
        print("FAIL manifest merge: tile structural fields not refreshed", file=sys.stderr)
        ok = False
    if merged["frames"]["column"]["size"] != [200, 512]:
        print("FAIL manifest merge: frame structural field (size) not refreshed", file=sys.stderr)
        ok = False
    if merged["frames"]["column"]["worldH"] != 999 or merged["frames"]["column"]["footW"] != 140:
        print("FAIL manifest merge: frame tuning fields (worldH/footW) not preserved", file=sys.stderr)
        ok = False
    if "gate" not in merged["frames"]:
        print("FAIL manifest merge: new frame not added", file=sys.stderr)
        ok = False
    if merged["floor"]["tileScale"] != 0.42:
        print("FAIL manifest merge: floor.tileScale tuning block not preserved", file=sys.stderr)
        ok = False
    if merged["grade"]["vignette"] != 0.99:
        print("FAIL manifest merge: grade.* tuning block not preserved", file=sys.stderr)
        ok = False
    return ok


def self_test():
    results = [
        ("make_seamless", test_make_seamless()),
        ("tile stats + grade", test_tile_grade()),
        ("prop mode", test_prop()),
        ("decal mode", test_decal()),
        ("manifest merge", test_manifest_merge()),
    ]
    all_ok = True
    for name, ok in results:
        print(f"{'PASS' if ok else 'FAIL'} {name}")
        all_ok = all_ok and ok
    return all_ok


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _load_prompts():
    with open(PROMPTS_PATH) as f:
        return json.load(f)


def _report(mode, out_path, img, grading=None):
    stats = compute_tile_stats(img)
    print(json.dumps({
        "mode": mode, "out": out_path, "size": list(img.size),
        "luma_mean": stats["luma_mean"], "luma_std": stats["luma_std"], "sat_mean": stats["sat_mean"],
        "grading": grading,
    }))


def main():
    ap = argparse.ArgumentParser(description="Env-art finishing: tile/strip/prop/decal modes.")
    ap.add_argument("--self-test", action="store_true", dest="self_test_flag")
    sub = ap.add_subparsers(dest="mode")

    p_tile = sub.add_parser("tile")
    p_tile.add_argument("--in", dest="in_path", required=True)
    p_tile.add_argument("--out", dest="out_path", required=True)
    p_tile.add_argument("--size", type=int, default=1024)
    p_tile.add_argument("--grade-limits", action="store_true")

    p_strip = sub.add_parser("strip")
    p_strip.add_argument("--in", dest="in_path", required=True)
    p_strip.add_argument("--out", dest="out_path", required=True)
    p_strip.add_argument("--crop", required=True, help="x0,y0,x1,y1")
    p_strip.add_argument("--width", type=int, default=1024)
    p_strip.add_argument("--preview", default=None)

    p_prop = sub.add_parser("prop")
    p_prop.add_argument("--in", dest="in_path", required=True)
    p_prop.add_argument("--out", dest="out_path", required=True)
    p_prop.add_argument("--max", type=int, default=384, choices=[384, 448, 512])
    p_prop.add_argument("--grade", choices=["prop", "architecture"], default=None)
    p_prop.add_argument("--silhouette", dest="silhouette_path", default=None)

    p_decal = sub.add_parser("decal")
    p_decal.add_argument("--in", dest="in_path", required=True)
    p_decal.add_argument("--out", dest="out_path", required=True)
    p_decal.add_argument("--max", type=int, default=384)
    p_decal.add_argument("--max-alpha", dest="max_alpha", type=float, default=0.55)
    p_decal.add_argument("--grade", choices=["decal"], default=None)

    args = ap.parse_args()

    if args.self_test_flag:
        ok = self_test()
        sys.exit(0 if ok else 1)

    if not args.mode:
        ap.error("a mode (tile/strip/prop/decal) or --self-test is required")

    prompts = _load_prompts()
    env_grade = prompts.get("env_grade", {})

    out_dir = os.path.dirname(os.path.abspath(args.out_path))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    if args.mode == "tile":
        img = Image.open(args.in_path).convert("RGB")
        w, h = img.size
        side = min(w, h)
        cropped = img.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side))
        resized = cropped.resize((args.size, args.size), Image.LANCZOS)
        seamless = make_seamless(resized, axis="xy")
        grading = None
        if args.grade_limits and "tile_limits" in env_grade:
            seamless, grading = grade_tile(seamless, env_grade["tile_limits"])
        seamless.save(args.out_path, "PNG")
        _report("tile", args.out_path, seamless, grading)

    elif args.mode == "strip":
        crop = tuple(int(v) for v in args.crop.split(","))
        out_img = strip_finish(args.in_path, crop, args.width)
        out_img.save(args.out_path, "PNG")
        if args.preview:
            preview_dir = os.path.dirname(os.path.abspath(args.preview))
            if preview_dir:
                os.makedirs(preview_dir, exist_ok=True)
            w, h = out_img.size
            preview = Image.new("RGB", (w * 3, h))
            for i in range(3):
                preview.paste(out_img, (i * w, 0))
            preview.save(args.preview, "PNG")
        _report("strip", args.out_path, out_img, None)

    elif args.mode == "prop":
        grade = env_grade.get(args.grade) if args.grade else None
        out_img, bbox = prop_finish(args.in_path, args.max, grade=grade)
        out_img.save(args.out_path, "PNG")
        if args.silhouette_path:
            sil_dir = os.path.dirname(os.path.abspath(args.silhouette_path))
            if sil_dir:
                os.makedirs(sil_dir, exist_ok=True)
            fsprite.make_silhouette(out_img).save(args.silhouette_path, "PNG")
        _report("prop", args.out_path, out_img, grade)

    elif args.mode == "decal":
        grade = env_grade.get(args.grade) if args.grade else None
        out_img, bbox = decal_finish(args.in_path, args.max, max_alpha=args.max_alpha, grade=grade)
        out_img.save(args.out_path, "PNG")
        _report("decal", args.out_path, out_img, grade)


if __name__ == "__main__":
    main()
