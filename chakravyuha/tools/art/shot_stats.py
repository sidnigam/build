#!/usr/bin/env python3
"""
shot_stats.py — per-screenshot floor readability metrics vs the D-08b limits (Phase 05.4 ENV-07).

Usage:
  python tools/art/shot_stats.py SHOT.png... [--json OUT] [--quiet]

For every screenshot (as written by tools/art/env_shots.mjs) this samples the central 60% of the
frame (x and y in [20%, 80%]) as "the floor", after excluding pixels that look like entities,
HUD text or telegraph highlights: HSV saturation > 0.55 or luma > 0.65. The excluded fraction is
reported so a shot dominated by actors/UI is visible as such.

Over the remaining floor pixels it computes (0..1 scale, same definitions as finish_env.py's
compute_tile_stats so tile-time D-08 and screen-time D-08b numbers are comparable):
  luma      = 0.2126 R + 0.7152 G + 0.0722 B   (on gamma-encoded sRGB values)
  sat       = HSV saturation (max - min) / max
and flags FAIL when luma_mean > 0.30, luma_std > 0.12 or sat_mean > 0.30 (D-08b).

For `*-combat.png` shots it also reports the peak telegraph contrast: the maximum luma among
pixels matching the biome's telegraph colour, minus the median floor luma. "Matching" means hue
within +-12 degrees of the hazard colour and s >= 0.35 (so grey floor noise with an arbitrary hue
doesn't count) — except Vaitarani, whose riverCurrent surge warning is drawn in WHITE strokes
(game.js renderHazards: strokeStyle = warning ? '#ffffff' : def.color), so there the match is
achromatic (s <= 0.2). The biome is the filename prefix before the first '-'. The top 100px /
bottom 30px HUD bands are excluded from the search (HUD colours share the hazard hues, and the
HUD text is white). Besides the peak it counts the "telegraph area": matching pixels at least
0.25 brighter than the floor median; a lone bright pixel (the white crosshair, an ember) cannot
stand in for a telegraph. WARN if the peak < 0.25 or the area < MIN_TELEGRAPH_PX.

Prints a table and exits non-zero on any FAIL (WARNs alone exit 0 but are listed).
"""
import argparse
import colorsys
import json
import os
import sys

import numpy as np
from PIL import Image

LIMITS = {"luma_mean": 0.30, "luma_std": 0.12, "sat_mean": 0.30}
EXCL_SAT = 0.55
EXCL_LUMA = 0.65
TELEGRAPH_MIN = 0.25
HUE_TOL = 12.0
TELEGRAPH_MIN_SAT = 0.35
MIN_TELEGRAPH_PX = 150
ACHROMATIC_MAX_SAT = 0.2
HUD_TOP = 100
HUD_BOTTOM = 30

# DATA.HAZARDS colours (js/data.js), keyed by the biome that hosts each hazard.
HAZARD_COLOR = {
    "naraka": "#ff7a2a",      # fireVent
    "patala": "#7dff5a",      # venomPool
    "ranabhoomi": "#ffcf5c",  # arrowVolley
    "vaitarani": "#ffffff",   # riverCurrent: surgeWarn strokes are white (fill is #9fb8ff @0.18)
}


def hex_hue_deg(hx):
    hx = hx.lstrip("#")
    r, g, b = (int(hx[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    h, _s, _v = colorsys.rgb_to_hsv(r, g, b)
    return h * 360.0


def hsv_arrays(rgb):
    """rgb float (H,W,3) 0..1 -> hue degrees, saturation, luma arrays."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    maxc = rgb.max(axis=-1)
    minc = rgb.min(axis=-1)
    delta = maxc - minc
    sat = np.where(maxc > 1e-6, delta / np.clip(maxc, 1e-6, None), 0.0)
    safe = np.where(delta > 1e-6, delta, 1.0)
    hue = np.zeros_like(maxc)
    rm = (maxc == r) & (delta > 1e-6)
    gm = (maxc == g) & (delta > 1e-6) & ~rm
    bm = (maxc == b) & (delta > 1e-6) & ~rm & ~gm
    hue = np.where(rm, ((g - b) / safe) % 6.0, hue)
    hue = np.where(gm, ((b - r) / safe) + 2.0, hue)
    hue = np.where(bm, ((r - g) / safe) + 4.0, hue)
    hue = hue * 60.0
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return hue, sat, luma


def shot_stats(path):
    img = Image.open(path).convert("RGB")
    a = np.asarray(img).astype(np.float32) / 255.0
    H, W = a.shape[:2]
    y0, y1 = int(H * 0.2), int(H * 0.8)
    x0, x1 = int(W * 0.2), int(W * 0.8)
    region = a[y0:y1, x0:x1]
    hue, sat, luma = hsv_arrays(region)
    excl = (sat > EXCL_SAT) | (luma > EXCL_LUMA)
    keep = ~excl
    n = keep.sum()
    floor_l = luma[keep] if n else luma.ravel()
    floor_s = sat[keep] if n else sat.ravel()
    out = {
        "name": os.path.basename(path),
        "luma_mean": float(floor_l.mean()),
        "luma_std": float(floor_l.std()),
        "sat_mean": float(floor_s.mean()),
        "excluded": float(excl.mean()),
        "status": "PASS",
        "flags": [],
    }
    for k, lim in LIMITS.items():
        if out[k] > lim:
            out["status"] = "FAIL"
            out["flags"].append(f"{k} {out[k]:.3f} > {lim}")

    if os.path.basename(path).endswith("-combat.png"):
        biome = os.path.basename(path).split("-")[0]
        hx = HAZARD_COLOR.get(biome)
        if hx:
            achromatic = hx.lower() == "#ffffff"
            target = hex_hue_deg(hx)
            # whole frame width (telegraphs can sit anywhere the camera sees), minus the HUD bands
            # (top HUD_TOP px: health bar/boons/title are red-orange/gold/teal and would match
            # the hazard hues; bottom HUD_BOTTOM px: credits line / boss bar)
            fh, fs, fl = hsv_arrays(a[HUD_TOP:H - HUD_BOTTOM])
            if achromatic:
                match = fs <= ACHROMATIC_MAX_SAT
            else:
                dh = np.abs(((fh - target) + 180.0) % 360.0 - 180.0)
                match = (dh <= HUE_TOL) & (fs >= TELEGRAPH_MIN_SAT)
            npx = int(match.sum())
            med = float(np.median(floor_l))
            peak = float(fl[match].max() - med) if npx else 0.0
            area = int((match & (fl - med >= TELEGRAPH_MIN)).sum())
            out["telegraph"] = {"hazard_color": hx, "pixels": npx, "area": area, "floor_median": med, "peak_contrast": peak}
            if area < MIN_TELEGRAPH_PX:
                out["flags"].append(f"telegraph: only {area} px >= {TELEGRAPH_MIN} above the floor")
                if out["status"] == "PASS":
                    out["status"] = "WARN"
            elif peak < TELEGRAPH_MIN:
                out["flags"].append(f"telegraph contrast {peak:.3f} < {TELEGRAPH_MIN}")
                if out["status"] == "PASS":
                    out["status"] = "WARN"
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("shots", nargs="+")
    ap.add_argument("--json", dest="json_out")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    rows = []
    for p in args.shots:
        base = os.path.basename(p)
        if not base.lower().endswith(".png") or base.startswith("grid-"):
            continue
        if not os.path.isfile(p):
            print(f"WARNING: missing {p}", file=sys.stderr)
            continue
        rows.append(shot_stats(p))

    if not args.quiet:
        hdr = f"{'shot':44s} {'luma':>6s} {'std':>6s} {'sat':>6s} {'excl':>6s} {'tele':>6s}  status"
        print(hdr)
        print("-" * len(hdr))
        for r in rows:
            tele = f"{r['telegraph']['peak_contrast']:.3f}" if "telegraph" in r else "  -   "
            line = f"{r['name']:44s} {r['luma_mean']:6.3f} {r['luma_std']:6.3f} {r['sat_mean']:6.3f} {r['excluded']:6.3f} {tele:>6s}  {r['status']}"
            if r["flags"]:
                line += "  (" + "; ".join(r["flags"]) + ")"
            print(line)
    fails = [r for r in rows if r["status"] == "FAIL"]
    warns = [r for r in rows if r["status"] == "WARN"]
    print(f"{len(rows)} shots: {len(rows) - len(fails) - len(warns)} PASS, {len(warns)} WARN, {len(fails)} FAIL")
    if args.json_out:
        with open(args.json_out, "w") as f:
            json.dump({"limits": LIMITS, "telegraph_min": TELEGRAPH_MIN, "shots": rows}, f, indent=2)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
