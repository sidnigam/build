#!/usr/bin/env python3
"""
env_contact_sheet.py — human-review contact sheet for the Phase 05.4 environment kits (D-16, ENV-08).

Usage:
  python tools/art/env_contact_sheet.py --out assets/sprites/_review/env-contact-sheet.png \
      [--shots DIR] [--biomes naraka,patala,ranabhoomi,vaitarani] [--split]

One section per biome, read from that biome's D-11 manifest (assets/sprites/env/{biome}/{biome}-env.json):
  * tiles as 2x2 repeats (floor_a, floor_b, water if present, wallcap) so seams are visible, plus
    the wallface as a 3x1 strip;
  * every atlas frame (the finished frame PNG under assets/sprites/_raw/env/{biome}/frames/) on a
    checker background, labelled `key · role · worldH · seed` — worldH (or worldW for decals) from
    the manifest, the seed from PROVENANCE.json looked up by the frame filename;
  * with --shots DIR (a tools/art/env_shots.mjs output dir), one in-game centre shot of that biome
    scaled to 640 wide.

The single sheet is kept under ~4000px tall; if it would exceed MAX_H (or with --split) it writes
one `env-contact-sheet-{biome}.png` per biome next to --out instead. Prints the written path(s),
one per line. Deterministic for identical inputs (no timestamps drawn).
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from review_grid import checker_bg, make_repeat  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
BIOMES = ["naraka", "patala", "ranabhoomi", "vaitarani"]
WIDTH = 1920
PAD = 10
HEADER_H = 40
TILE_CELL = 200
LABEL_H = 34
FRAME_CELL = 136
SHOT_W = 640
MAX_H = 4000
BG = (24, 22, 26)
FG = (232, 226, 214)
FG_DIM = (170, 164, 156)


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


F_HEAD = font(22)
F_LABEL = font(12)


def load_provenance():
    with open(os.path.join(ROOT, "assets", "sprites", "PROVENANCE.json")) as f:
        prov = json.load(f)
    return {a.get("filename"): a for a in prov.get("assets", [])}


def fit(img, w, h):
    s = min(w / img.width, h / img.height)
    return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)


def pick_shot(shots_dir, biome):
    if not shots_dir or not os.path.isdir(shots_dir):
        return None
    cands = sorted(f for f in os.listdir(shots_dir) if f.startswith(biome + "-") and f.endswith("-center.png"))
    return os.path.join(shots_dir, cands[0]) if cands else None


def biome_section(biome, prov, shots_dir):
    mpath = os.path.join(ROOT, "assets", "sprites", "env", biome, f"{biome}-env.json")
    with open(mpath) as f:
        m = json.load(f)
    tiles = m.get("tiles", {})
    frames = m.get("frames", {})

    # ---- row A: tiles (2x2), wallface strip (3x1), in-game shot ----
    tile_keys = [k for k in ("floor_a", "floor_b", "water", "wallcap") if k in tiles]
    row_a_cells = []
    for k in tile_keys:
        img = Image.open(os.path.join(ROOT, tiles[k]["path"])).convert("RGB")
        rep = make_repeat(img, "2x2").resize((TILE_CELL, TILE_CELL), Image.LANCZOS)
        row_a_cells.append((rep, [f"{k} (2x2)", f"{tiles[k]['size'][0]}x{tiles[k]['size'][1]} · {tiles[k]['role']}"]))
    strip = None
    if "wallface" in tiles:
        wf = Image.open(os.path.join(ROOT, tiles["wallface"]["path"])).convert("RGB")
        strip = fit(make_repeat(wf, "3x1"), 2 * TILE_CELL + PAD, TILE_CELL)
    shot_path = pick_shot(shots_dir, biome)
    shot = None
    if shot_path:
        sh = Image.open(shot_path).convert("RGB")
        shot = sh.resize((SHOT_W, round(sh.height * SHOT_W / sh.width)), Image.LANCZOS)
    row_a_h = max(TILE_CELL + LABEL_H, (shot.height + LABEL_H) if shot else 0)

    # ---- row B: every atlas frame on checker ----
    keys = sorted(frames.keys(), key=lambda k: (["column", "gate", "prop", "decal", "hazard-skin"].index(frames[k].get("role"))
                                                if frames[k].get("role") in ("column", "gate", "prop", "decal", "hazard-skin") else 9, k))
    cols = max(1, (WIDTH - PAD) // (FRAME_CELL + PAD))
    rows_b = (len(keys) + cols - 1) // cols
    row_b_h = rows_b * (FRAME_CELL + LABEL_H + PAD)

    H = HEADER_H + row_a_h + PAD + row_b_h + PAD
    sec = Image.new("RGB", (WIDTH, H), BG)
    d = ImageDraw.Draw(sec)
    n_props = sum(1 for k in keys if frames[k].get("role") == "prop")
    n_dec = sum(1 for k in keys if frames[k].get("role") == "decal")
    d.text((PAD, 8), f"{biome.upper()}  -  {len(tiles)} tiles · {len(keys)} atlas frames "
                     f"({n_props} props, {n_dec} decals) · all provisional", fill=FG, font=F_HEAD)
    y = HEADER_H
    x = PAD
    for img, lab in row_a_cells:
        sec.paste(img, (x, y))
        d.text((x, y + TILE_CELL + 2), lab[0], fill=FG, font=F_LABEL)
        d.text((x, y + TILE_CELL + 17), lab[1], fill=FG_DIM, font=F_LABEL)
        x += TILE_CELL + PAD
    if strip is not None:
        sec.paste(strip, (x, y + (TILE_CELL - strip.height) // 2))
        d.text((x, y + TILE_CELL + 2), "wallface (3x1)", fill=FG, font=F_LABEL)
        d.text((x, y + TILE_CELL + 17), f"{tiles['wallface']['size'][0]}x{tiles['wallface']['size'][1]}", fill=FG_DIM, font=F_LABEL)
        x += strip.width + PAD
    if shot is not None:
        sx = WIDTH - PAD - shot.width
        sec.paste(shot, (sx, y))
        d.text((sx, y + shot.height + 2), f"in-game: {os.path.basename(shot_path)}", fill=FG, font=F_LABEL)

    y = HEADER_H + row_a_h + PAD
    for i, k in enumerate(keys):
        fdef = frames[k]
        fname = fdef.get("frame") or f"{biome}_{k}_0.png"
        entry = prov.get(fname, {})
        fpath = os.path.join(ROOT, entry["path"]) if entry.get("path") else \
            os.path.join(ROOT, "assets", "sprites", "_raw", "env", biome, "frames", fname)
        cx = PAD + (i % cols) * (FRAME_CELL + PAD)
        cy = y + (i // cols) * (FRAME_CELL + LABEL_H + PAD)
        cell = checker_bg((FRAME_CELL, FRAME_CELL))
        if os.path.isfile(fpath):
            im = Image.open(fpath).convert("RGBA")
            im = fit(im, FRAME_CELL - 6, FRAME_CELL - 6)
            cell.paste(im, ((FRAME_CELL - im.width) // 2, (FRAME_CELL - im.height) // 2), im)
        else:
            ImageDraw.Draw(cell).text((6, 6), "missing", fill=(200, 40, 40), font=F_LABEL)
        sec.paste(cell, (cx, cy))
        size_v = fdef.get("worldH")
        size_lab = f"wH {size_v}" if size_v is not None else (f"wW {fdef['worldW']}" if fdef.get("worldW") is not None else "wH -")
        seed = entry.get("seed", "?")
        # `key · role` / `worldH · seed` on two lines so long keys don't run into the next cell
        d.text((cx, cy + FRAME_CELL + 2), f"{k} · {fdef.get('role')}", fill=FG, font=F_LABEL)
        d.text((cx, cy + FRAME_CELL + 17), f"{size_lab} · seed {seed}", fill=FG_DIM, font=F_LABEL)
    return sec


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--shots")
    ap.add_argument("--biomes", default=",".join(BIOMES))
    ap.add_argument("--split", action="store_true")
    args = ap.parse_args(argv)

    prov = load_provenance()
    biomes = [b.strip() for b in args.biomes.split(",") if b.strip()]
    sections = [(b, biome_section(b, prov, args.shots)) for b in biomes]
    total_h = sum(s.height for _, s in sections) + PAD * (len(sections) + 1)
    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)
    written = []
    if args.split or total_h > MAX_H:
        stem, ext = os.path.splitext(os.path.basename(args.out))
        for b, s in sections:
            p = os.path.join(out_dir, f"{stem}-{b}{ext}")
            s.save(p, optimize=True)
            written.append(p)
    else:
        sheet = Image.new("RGB", (WIDTH, total_h), (12, 11, 14))
        y = PAD
        for _, s in sections:
            sheet.paste(s, (0, y))
            y += s.height + PAD
        sheet.save(args.out, optimize=True)
        written.append(os.path.abspath(args.out))
    for p in written:
        print(os.path.relpath(p, ROOT) if p.startswith(ROOT) else p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
