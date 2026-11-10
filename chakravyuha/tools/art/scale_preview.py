#!/usr/bin/env python3
"""
scale_preview.py — 05.6-03 Task 3 review tool. Renders OLD-vs-NEW character frames at their
actual on-screen size over a home-biome floor crop, as a LANCZOS-downscale proxy for
mipmapped trilinear sampling at render resolution 1 and 2. Review only: writes to --out-dir,
never into assets/.

Usage:
  python tools/art/scale_preview.py [--old-dir $SCRATCH/old-atlases] [--out-dir $SCRATCH/scale-preview]
                                     [--only a,b]

For each actor: takes its OLD idle frame (from --old-dir/_raw/...) and its current NEW
_raw frame, downscales each with LANCZOS to on-screen height r*4 (res 1) and r*8 (res 2),
and pastes them side by side (old | new) on:
  - a crop of the actor's home-biome background (assets/sprites/biomes/<biome>-bg.png,
    darkened by an approximation of the in-game bridge wash: floorTint 0.55 + darken 0.25)
  - a mid-grey background
Also renders a 4x nearest-neighbour zoom of the res-1 player/preta/tataka crops so outline
edges can be inspected closely.

Writes {out_dir}/{actor}.png and {out_dir}/all.png.
"""
import argparse
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "assets/sprites/_raw"
BIOMES_DIR = REPO_ROOT / "assets/sprites/biomes"

HOME_BIOME = {
    "preta": "naraka", "bhuta": "naraka", "tataka": "naraka", "player": "naraka",
    "naga": "patala", "vetala": "patala", "ahiravana": "patala",
    "rakshasa": "ranabhoomi", "archer": "ranabhoomi", "daitya": "ranabhoomi", "kumbhakarna": "ranabhoomi",
    "yatudhana": "vaitarani", "yama": "vaitarani",
}

ACTOR_R = {
    "player": 13, "preta": 11, "rakshasa": 15, "archer": 13, "naga": 14, "vetala": 13,
    "bhuta": 21, "daitya": 19, "yatudhana": 14, "tataka": 34, "ahiravana": 30,
    "kumbhakarna": 46, "yama": 36,
}
ACTOR_KIND = {
    "player": "player", "preta": "enemy", "rakshasa": "enemy", "archer": "enemy", "naga": "enemy",
    "vetala": "enemy", "bhuta": "enemy", "daitya": "enemy", "yatudhana": "enemy",
    "tataka": "boss", "ahiravana": "boss", "kumbhakarna": "boss", "yama": "boss",
}
# 05.7.1-12: new actors (no "old" frame) are previewed LEFT = a committed same-biome reference
# actor at its own r, RIGHT = the new actor at its r, for outline-weight/style comparison.
NEW_ACTORS = {
    # key: (home biome, r, kind, reference actor)
    "pishacha": ("naraka", 9, "enemy", "preta"),
    "kumbhipaka": ("naraka", 16, "enemy", "bhuta"),
    "nagaguard": ("patala", 17, "enemy", "naga"),
    "mayavi": ("patala", 14, "enemy", "vetala"),
    "javelineer": ("ranabhoomi", 14, "enemy", "archer"),
    "bannerman": ("ranabhoomi", 16, "enemy", "daitya"),
    "brahmarakshasa": ("vaitarani", 15, "enemy", "yatudhana"),
    "jalarakshasa": ("vaitarani", 16, "enemy", "yatudhana"),
    "subahu": ("naraka", 24, "boss", "tataka"),
    "mahiravana": ("patala", 24, "boss", "ahiravana"),
    "alambusha": ("ranabhoomi", 24, "boss", "kumbhakarna"),
    "maricha": ("vaitarani", 22, "boss", "yama"),
}
REFERENCE_ACTOR = {}
for _k, (_b, _r, _kind, _ref) in NEW_ACTORS.items():
    HOME_BIOME[_k], ACTOR_R[_k], ACTOR_KIND[_k], REFERENCE_ACTOR[_k] = _b, _r, _kind, _ref
KIND_DIR = {"player": "player", "enemy": "enemies", "boss": "bosses"}
ZOOM_ACTORS = {"player", "preta", "tataka"}

BRIDGE_TINT = (0.55, 0.55, 0.55)  # floorTint approximation
BRIDGE_DARKEN = 0.25


def raw_frame(base_dir, actor):
    kind = ACTOR_KIND[actor]
    if kind == "player":
        return base_dir / "player" / "player_idle_0.png"
    return base_dir / KIND_DIR[kind] / actor / f"{actor}_idle_0.png"


def floor_crop(biome, w, h, seed=0):
    bg_path = BIOMES_DIR / f"{biome}-bg.png"
    if not bg_path.exists():
        return Image.new("RGBA", (w, h), (90, 90, 90, 255))
    bg = Image.open(bg_path).convert("RGB")
    bw, bh = bg.size
    rng = np.random.RandomState(hash(biome) & 0xFFFF)
    x0 = int(rng.randint(0, max(1, bw - w))) if bw > w else 0
    y0 = int(rng.randint(0, max(1, bh - h))) if bh > h else 0
    crop = bg.crop((x0, y0, x0 + w, y0 + h)).convert("RGBA")
    arr = np.array(crop).astype(np.float64)
    arr[:, :, 0] *= BRIDGE_TINT[0]
    arr[:, :, 1] *= BRIDGE_TINT[1]
    arr[:, :, 2] *= BRIDGE_TINT[2]
    arr[:, :, :3] *= (1.0 - BRIDGE_DARKEN)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def downscale_to_height(img, target_h):
    w, h = img.size
    if h == 0:
        return img
    scale = target_h / h
    new_w = max(1, round(w * scale))
    return img.resize((new_w, target_h), Image.LANCZOS)


def paste_pair(bg, old_img, new_img, gap=4):
    ow, oh = old_img.size
    nw, nh = new_img.size
    h = max(oh, nh)
    canvas = bg.crop((0, 0, ow + gap + nw, h)).convert("RGBA")
    canvas.alpha_composite(old_img, (0, h - oh))
    canvas.alpha_composite(new_img, (ow + gap, h - nh))
    return canvas


def build_actor_panel(actor, old_dir, out_dir):
    r = ACTOR_R[actor]
    biome = HOME_BIOME[actor]
    # old_dir mirrors _raw/<kind>/<actor>/<file> under old_dir/_raw/...
    kind = ACTOR_KIND[actor]
    ref = REFERENCE_ACTOR.get(actor)
    if ref:
        old_frame_path = raw_frame(RAW_DIR, ref)
    elif kind == "player":
        old_frame_path = old_dir / "_raw" / "player" / "player_idle_0.png"
    else:
        old_frame_path = old_dir / "_raw" / KIND_DIR[kind] / actor / f"{actor}_idle_0.png"
    new_frame_path = raw_frame(RAW_DIR, actor)

    if not old_frame_path.exists() or not new_frame_path.exists():
        print(f"SKIP {actor}: missing old={old_frame_path.exists()} new={new_frame_path.exists()}", file=sys.stderr)
        return None

    old_img = Image.open(old_frame_path).convert("RGBA")
    new_img = Image.open(new_frame_path).convert("RGBA")

    rows = []
    for dpr, label in ((1, "res1"), (2, "res2")):
        target_h = max(8, r * 4 * dpr)
        ref_h = max(8, ACTOR_R[ref] * 4 * dpr) if ref else target_h
        old_s = downscale_to_height(old_img, ref_h)
        new_s = downscale_to_height(new_img, target_h)
        row_w = old_s.size[0] + new_s.size[0] + 4
        row_h = max(target_h, ref_h)
        floor_bg = floor_crop(biome, row_w, row_h)
        grey_bg = Image.new("RGBA", (row_w, row_h), (110, 110, 110, 255))
        rows.append((label, paste_pair(floor_bg, old_s, new_s), paste_pair(grey_bg, old_s, new_s)))

    width = max(r[1].size[0] for r in rows)
    pad, label_h = 6, 14
    total_h = sum(r[1].size[1] + r[2].size[1] + label_h * 2 + pad for r in rows) + pad
    panel = Image.new("RGBA", (width + pad * 2, total_h), (40, 40, 40, 255))
    y = pad
    for label, floor_row, grey_row in rows:
        panel.alpha_composite(floor_row, (pad, y))
        y += floor_row.size[1] + label_h
        panel.alpha_composite(grey_row, (pad, y))
        y += grey_row.size[1] + label_h + pad

    if actor in ZOOM_ACTORS:
        res1_h = max(8, r * 4)
        old_s = downscale_to_height(old_img, res1_h)
        new_s = downscale_to_height(new_img, res1_h)
        zoom = 4
        old_z = old_s.resize((old_s.size[0] * zoom, old_s.size[1] * zoom), Image.NEAREST)
        new_z = new_s.resize((new_s.size[0] * zoom, new_s.size[1] * zoom), Image.NEAREST)
        zoom_bg = Image.new("RGBA", (old_z.size[0] + new_z.size[0] + 8, max(old_z.size[1], new_z.size[1])), (60, 60, 60, 255))
        zoom_bg.alpha_composite(old_z, (0, 0))
        zoom_bg.alpha_composite(new_z, (old_z.size[0] + 8, 0))
        combined = Image.new("RGBA", (max(panel.size[0], zoom_bg.size[0]), panel.size[1] + zoom_bg.size[1] + pad), (30, 30, 30, 255))
        combined.alpha_composite(panel, (0, 0))
        combined.alpha_composite(zoom_bg, (0, panel.size[1] + pad))
        panel = combined

    out_path = out_dir / f"{actor}.png"
    panel.convert("RGB").save(out_path, "PNG")
    return out_path, panel


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    default_scratch = os.environ.get(
        "GSD_SCRATCH",
        "/private/tmp/claude-501/-Users-sidnigam-Documents-coding-build-chakravyuha/"
        "1d54dd11-935d-453d-b5f2-51d5ff78390e/scratchpad",
    )
    ap.add_argument("--old-dir", default=f"{default_scratch}/old-atlases")
    ap.add_argument("--out-dir", default=f"{default_scratch}/scale-preview")
    ap.add_argument("--only", default=None)
    args = ap.parse_args()

    old_dir = Path(args.old_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    actors = list(ACTOR_R.keys()) if not args.only else args.only.split(",")
    panels = []
    for actor in actors:
        result = build_actor_panel(actor, old_dir, out_dir)
        if result:
            out_path, panel = result
            panels.append(panel)
            print(f"{actor}: {out_path}")

    if panels:
        max_w = max(p.size[0] for p in panels)
        total_h = sum(p.size[1] for p in panels) + 8 * (len(panels) + 1)
        all_img = Image.new("RGBA", (max_w, total_h), (20, 20, 20, 255))
        y = 8
        for p in panels:
            all_img.alpha_composite(p, (0, y))
            y += p.size[1] + 8
        all_path = out_dir / "all.png"
        all_img.convert("RGB").save(all_path, "PNG")
        print(f"all: {all_path}")


if __name__ == "__main__":
    main()
