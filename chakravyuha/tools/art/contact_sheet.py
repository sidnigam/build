#!/usr/bin/env python3
"""
contact_sheet.py — build one PNG contact sheet for human art review (D-14a).

Usage:
  python tools/art/contact_sheet.py --out assets/sprites/_review/contact-sheet.png

Reads:
  - assets/sprites/_raw/bosses/{key}/{key}_idle_0.png, {key}_phase2_0.png
  - assets/sprites/_raw/enemies/{key}/{key}_idle_0.png
  - assets/sprites/_raw/player/player_idle_{0..3}.png
  - assets/sprites/biomes/{id}-bg.png
  - assets/sprites/PROVENANCE.json (seed / rejected_count labels)
  - js/data.js (parsed with a regex for enemy/boss r values, with a fallback table)

Produces one PNG on a #0b0710 background with a title row and five sections:
  (a) Bosses: idle, phase2, silhouette, labelled key/seed/rejected
  (b) Enemies: idle, silhouette, labelled key/seed/rejected
  (c) Player: the 4 idle frames
  (d) In-game scale strip: every character scaled to r*4 px tall, composited
      over a darkened crop of naraka-bg.png, feet on a shared baseline
  (e) Biomes: 4 thumbnails at 320x180
"""
import argparse
import json
import os
import re
import sys
import datetime

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SPRITES = os.path.join(ROOT, "assets", "sprites")
BG_COLOR = (11, 7, 16, 255)
TEXT_COLOR = (230, 220, 210, 255)
DIM_TEXT = (160, 150, 145, 255)
PAD = 24

BOSS_KEYS = ["tataka", "ahiravana", "kumbhakarna", "yama"]
ENEMY_KEYS = ["preta", "rakshasa", "archer", "naga", "vetala", "bhuta", "daitya", "yatudhana"]
BIOME_KEYS = ["naraka", "patala", "ranabhoomi", "vaitarani"]

# Fallback r values (from 02-11-PLAN interfaces), used if js/data.js regex parse fails.
FALLBACK_R = {
    "preta": 11, "rakshasa": 15, "archer": 13, "naga": 14, "vetala": 13,
    "bhuta": 21, "daitya": 19, "yatudhana": 14,
    "tataka": 34, "ahiravana": 30, "kumbhakarna": 46, "yama": 36,
}


def font(size):
    return ImageFont.load_default(size=size)


def load_provenance():
    path = os.path.join(SPRITES, "PROVENANCE.json")
    with open(path) as f:
        data = json.load(f)
    by_filename = {}
    for entry in data.get("assets", []):
        by_filename[entry.get("filename")] = entry
    return by_filename


def label_for(prov, atlas_filename):
    e = prov.get(atlas_filename)
    if not e:
        return "seed ? / rej ?"
    seed = e.get("seed")
    rej = e.get("rejected_count", 0)
    flagged = "FLAGGED " if str(e.get("self_review", "")).startswith("FLAGGED") else ""
    return f"{flagged}seed {seed} / rej {rej}"


def parse_r_values():
    r_values = dict(FALLBACK_R)
    js_path = os.path.join(ROOT, "js", "data.js")
    try:
        with open(js_path) as f:
            text = f.read()
        for m in re.finditer(r"id:\s*'(\w+)'.*?\br:\s*(\d+)", text):
            key, r = m.group(1), int(m.group(2))
            if key in FALLBACK_R:
                r_values[key] = r
    except Exception as e:
        print(f"WARN: could not parse js/data.js r values, using fallback table: {e}", file=sys.stderr)
    return r_values


def make_silhouette(img):
    arr = np.array(img.convert("RGBA"))
    alpha = arr[:, :, 3]
    mask = alpha > 0
    sil = np.full((*mask.shape, 3), 235, dtype=np.uint8)
    sil[mask] = [15, 15, 15]
    return Image.fromarray(sil, "RGB")


def load_rgba(path):
    if not os.path.exists(path):
        print(f"WARN: missing {path}", file=sys.stderr)
        return None
    return Image.open(path).convert("RGBA")


def paste_labelled(canvas, img, x, y, cell_size, label_lines, draw, f_small):
    if img is not None:
        thumb = img.copy()
        thumb.thumbnail((cell_size, cell_size), Image.LANCZOS)
        px = x + (cell_size - thumb.width) // 2
        py = y + (cell_size - thumb.height) // 2
        canvas.alpha_composite(thumb.convert("RGBA"), (px, py))
    ty = y + cell_size + 4
    for line in label_lines:
        draw.text((x, ty), line, font=f_small, fill=DIM_TEXT)
        ty += 14


def section_header(draw, x, y, text, f_header):
    draw.text((x, y), text, font=f_header, fill=TEXT_COLOR)
    return y + 28


def main():
    ap = argparse.ArgumentParser(description="Build the Phase 2 art review contact sheet.")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    prov = load_provenance()
    r_values = parse_r_values()

    f_title = font(20)
    f_header = font(16)
    f_label = font(12)

    width = 1420
    # Compute a generous height; we crop/trim at the end.
    height = 3400
    canvas = Image.new("RGBA", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(canvas)

    y = PAD
    today = datetime.date.today().isoformat()
    draw.text((PAD, y), "CHAKRAVYUHA - Phase 2 art (PROVISIONAL - awaiting human art review)", font=f_title, fill=TEXT_COLOR)
    y += 26
    draw.text((PAD, y), today, font=f_label, fill=DIM_TEXT)
    y += 36

    # (a) Bosses
    y = section_header(draw, PAD, y, "Bosses (idle / phase2 / silhouette, 256px)", f_header)
    cell = 160
    col_gap = 20
    row_h = cell + 60
    for i, key in enumerate(BOSS_KEYS):
        row_y = y + i * row_h
        idle = load_rgba(os.path.join(SPRITES, "_raw", "bosses", key, f"{key}_idle_0.png"))
        phase2 = load_rgba(os.path.join(SPRITES, "_raw", "bosses", key, f"{key}_phase2_0.png"))
        sil = make_silhouette(idle) if idle is not None else None
        lbl = label_for(prov, f"{key}-atlas.png")
        paste_labelled(canvas, idle, PAD, row_y, cell, [key, "idle"], draw, f_label)
        paste_labelled(canvas, phase2, PAD + (cell + col_gap), row_y, cell, [key, "phase2"], draw, f_label)
        if sil is not None:
            sil_rgba = sil.convert("RGBA")
        else:
            sil_rgba = None
        paste_labelled(canvas, sil_rgba, PAD + 2 * (cell + col_gap), row_y, cell, [key, lbl], draw, f_label)
    y += len(BOSS_KEYS) * row_h + 10

    # (b) Enemies
    y = section_header(draw, PAD, y, "Enemies (idle / silhouette, 128px)", f_header)
    cell = 110
    cols = 4
    row_h = cell + 46
    col_w = 2 * (cell + col_gap) + 20
    for i, key in enumerate(ENEMY_KEYS):
        col = i % cols
        row = i // cols
        cx = PAD + col * col_w
        cy = y + row * row_h
        idle = load_rgba(os.path.join(SPRITES, "_raw", "enemies", key, f"{key}_idle_0.png"))
        sil = make_silhouette(idle).convert("RGBA") if idle is not None else None
        lbl = label_for(prov, f"{key}-atlas.png")
        paste_labelled(canvas, idle, cx, cy, cell, [key], draw, f_label)
        paste_labelled(canvas, sil, cx + cell + col_gap, cy, cell, [lbl], draw, f_label)
    rows = (len(ENEMY_KEYS) + cols - 1) // cols
    y += rows * row_h + 10

    # (c) Player
    y = section_header(draw, PAD, y, "Player (Abhimanyu idle atlas, 4 frames)", f_header)
    cell = 128
    for i in range(4):
        p = load_rgba(os.path.join(SPRITES, "_raw", "player", f"player_idle_{i}.png"))
        paste_labelled(canvas, p, PAD + i * (cell + col_gap), y, cell, [f"idle_{i}"], draw, f_label)
    y += cell + 40

    # (d) In-game scale strip
    y = section_header(draw, PAD, y, "In-game scale strip (height = r*4 px, over naraka-bg)", f_header)
    strip_w, strip_h = 1280, 200
    naraka_path = os.path.join(SPRITES, "biomes", "naraka-bg.png")
    if os.path.exists(naraka_path):
        bg = Image.open(naraka_path).convert("RGB")
        bg = bg.crop((0, 0, min(strip_w, bg.width), min(strip_h, bg.height)))
        if bg.size != (strip_w, strip_h):
            bg = bg.resize((strip_w, strip_h), Image.LANCZOS)
        # Darken/tint like the in-game floor dimming.
        arr = np.array(bg).astype(np.float32)
        arr = arr * 0.55
        arr[:, :, 2] = np.clip(arr[:, :, 2] * 1.05, 0, 255)
        strip = Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA")
    else:
        strip = Image.new("RGBA", (strip_w, strip_h), (30, 20, 25, 255))

    baseline = strip_h - 30
    cursor_x = 10
    label_positions = []
    all_keys = ENEMY_KEYS + BOSS_KEYS
    for key in all_keys:
        kind_dir = "bosses" if key in BOSS_KEYS else "enemies"
        img = load_rgba(os.path.join(SPRITES, "_raw", kind_dir, key, f"{key}_idle_0.png"))
        if img is None:
            continue
        r = r_values.get(key, 15)
        target_h = max(8, r * 4)
        scale = target_h / img.height
        target_w = max(1, round(img.width * scale))
        resized = img.resize((target_w, target_h), Image.LANCZOS)
        px = cursor_x
        py = baseline - target_h
        strip.alpha_composite(resized, (px, py))
        label_positions.append((px, key))
        cursor_x += target_w + 14
    canvas.alpha_composite(strip, (PAD, y))
    for px, key in label_positions:
        draw.text((PAD + px, y + strip_h + 4), key, font=f_label, fill=DIM_TEXT)
    y += strip_h + 24 + 40

    # (e) Biomes
    y = section_header(draw, PAD, y, "Biomes (320x180 thumbnails)", f_header)
    thumb_w, thumb_h = 320, 180
    for i, key in enumerate(BIOME_KEYS):
        path = os.path.join(SPRITES, "biomes", f"{key}-bg.png")
        cx = PAD + i * (thumb_w + col_gap)
        if os.path.exists(path):
            img = Image.open(path).convert("RGB").resize((thumb_w, thumb_h), Image.LANCZOS)
            canvas.alpha_composite(img.convert("RGBA"), (cx, y))
        draw.text((cx, y + thumb_h + 4), key, font=f_label, fill=DIM_TEXT)
    y += thumb_h + 30

    final = canvas.crop((0, 0, width, min(height, y + PAD)))
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    final.convert("RGB").save(args.out, "PNG", optimize=True)
    print(f"out={args.out} size={final.size}")


if __name__ == "__main__":
    main()
