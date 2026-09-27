#!/usr/bin/env python3
"""
gods_sheet.py — build the god-portrait review sheet for human cultural review (D-10).

Usage:
  python tools/art/gods_sheet.py --out assets/sprites/_review/gods-contact-sheet.png

Reads:
  - assets/sprites/gods/{id}-portrait.png (finished 600x768 RGBA portraits, if shipped)
  - assets/sprites/_gen/gods/{id}/{id}_sil.png (silhouette, if present)
  - assets/sprites/PROVENANCE.json (seed / rejected_count / self_review labels)

For each of the 6 gods, draws one row containing:
  (a) the portrait at 384px tall over a radial glow in the god's color (an in-UI mock)
  (b) the silhouette at 192px
  (c) a 64px circular thumbnail (center-top crop)
  (d) a label: id, seed, rejected_count, and FLAGGED if self_review starts with it

Missing gods get a "NOT SHIPPED — symbol fallback" row.

After writing, upserts the top-level "review_sheet_gods" key into PROVENANCE.json.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SPRITES = os.path.join(ROOT, "assets", "sprites")
GODS_DIR = os.path.join(SPRITES, "gods")
GEN_GODS_DIR = os.path.join(SPRITES, "_gen", "gods")
PROVENANCE_PATH = os.path.join(SPRITES, "PROVENANCE.json")

BG_COLOR = (11, 7, 16, 255)
TEXT_COLOR = (230, 220, 210, 255)
DIM_TEXT = (160, 150, 145, 255)
FLAG_COLOR = (240, 120, 90, 255)
PAD = 24

GOD_ORDER = ["hanuman", "agni", "indra", "vayu", "krishna", "durga"]

# 02-UI-SPEC god identity colors
GOD_COLORS = {
    "hanuman": (255, 140, 66),
    "agni": (255, 68, 48),
    "indra": (255, 211, 77),
    "vayu": (127, 220, 183),
    "krishna": (92, 124, 255),
    "durga": (232, 74, 138),
}


def font(size):
    return ImageFont.load_default(size=size)


def load_provenance():
    if not os.path.exists(PROVENANCE_PATH):
        return {}
    with open(PROVENANCE_PATH) as f:
        data = json.load(f)
    return {e.get("filename"): e for e in data.get("assets", [])}


def load_rgba(path):
    if not os.path.exists(path):
        return None
    return Image.open(path).convert("RGBA")


def make_radial_glow(w, h, color):
    """A simple radial glow tinted with the god's color, centered, to mock the in-game CSS aura."""
    cy, cx = h * 0.55, w * 0.5
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    max_r = max(w, h) * 0.55
    t = np.clip(1.0 - dist / max_r, 0.0, 1.0) ** 1.6
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :, 0] = color[0]
    arr[:, :, 1] = color[1]
    arr[:, :, 2] = color[2]
    arr[:, :, 3] = (t * 140).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def circular_thumb(img, size=64):
    """Center-top crop to a square, resize, and mask to a circle."""
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = 0  # center-top crop
    square = img.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.ellipse((0, 0, size - 1, size - 1), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(square, (0, 0), mask)
    return out


def main():
    ap = argparse.ArgumentParser(description="Build the gods portrait review sheet.")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    prov = load_provenance()

    f_title = font(20)
    f_header = font(16)
    f_label = font(13)

    portrait_h = 384
    portrait_w = 300
    sil_h = 192
    sil_w = 150
    thumb_size = 64
    row_h = portrait_h + 70
    col_gap = 40

    width = PAD * 2 + portrait_w + col_gap + sil_w + col_gap + thumb_size + col_gap + 420
    height = PAD * 2 + 60 + row_h * len(GOD_ORDER)

    canvas = Image.new("RGBA", (width, height), BG_COLOR)
    draw = ImageDraw.Draw(canvas)

    y = PAD
    draw.text((PAD, y), "CHAKRAVYUHA — God Portraits (PROVISIONAL — awaiting human cultural review)",
              font=f_title, fill=TEXT_COLOR)
    y += 28
    draw.text((PAD, y), "Reverence gate: 05.5-CONTEXT Iconography Bible (H1-H7 + per-god H-god)",
              font=f_label, fill=DIM_TEXT)
    y += 32

    for god_id in GOD_ORDER:
        row_y = y
        color = GOD_COLORS[god_id]
        portrait_path = os.path.join(GODS_DIR, f"{god_id}-portrait.png")
        portrait = load_rgba(portrait_path)

        label_x = PAD

        if portrait is None:
            draw.text((label_x, row_y + portrait_h // 2), f"{god_id}: NOT SHIPPED — symbol fallback",
                      font=f_header, fill=FLAG_COLOR)
            y += row_h
            continue

        # (a) portrait over a radial glow mock panel
        panel = Image.new("RGBA", (portrait_w, portrait_h), (18, 12, 22, 255))
        glow = make_radial_glow(portrait_w, portrait_h, color)
        panel.alpha_composite(glow)
        p = portrait.copy()
        p.thumbnail((portrait_w, portrait_h), Image.LANCZOS)
        px = (portrait_w - p.width) // 2
        py = portrait_h - p.height
        panel.alpha_composite(p, (px, py))
        canvas.alpha_composite(panel, (label_x, row_y))
        cursor_x = label_x + portrait_w + col_gap

        # (b) silhouette
        sil_path = os.path.join(GEN_GODS_DIR, god_id, f"{god_id}_sil.png")
        sil = load_rgba(sil_path)
        if sil is not None:
            sil_thumb = sil.copy()
            sil_thumb.thumbnail((sil_w, sil_h), Image.LANCZOS)
            sil_panel_y = row_y + (portrait_h - sil_thumb.height)
            canvas.alpha_composite(sil_thumb.convert("RGBA"), (cursor_x, sil_panel_y))
        cursor_x += sil_w + col_gap

        # (c) 64px circular thumbnail
        thumb = circular_thumb(portrait, thumb_size)
        canvas.alpha_composite(thumb, (cursor_x, row_y + portrait_h - thumb_size))
        cursor_x += thumb_size + col_gap

        # (d) label
        entry = prov.get(f"{god_id}-portrait.png", {})
        seed = entry.get("seed", "?")
        rejected = entry.get("rejected_count", "?")
        self_review = str(entry.get("self_review", ""))
        flagged = self_review.startswith("FLAGGED")
        label_color = FLAG_COLOR if flagged else TEXT_COLOR
        ly = row_y + 8
        draw.text((cursor_x, ly), god_id.upper(), font=f_header, fill=label_color)
        ly += 22
        draw.text((cursor_x, ly), f"seed {seed}", font=f_label, fill=DIM_TEXT)
        ly += 18
        draw.text((cursor_x, ly), f"rejected {rejected}", font=f_label, fill=DIM_TEXT)
        ly += 18
        if flagged:
            draw.text((cursor_x, ly), "FLAGGED", font=f_label, fill=FLAG_COLOR)
            ly += 18
        cultural_review = entry.get("cultural_review", "")
        if cultural_review:
            draw.text((cursor_x, ly), cultural_review, font=f_label, fill=DIM_TEXT)

        y += row_h

    final = canvas.crop((0, 0, width, min(height, y + PAD)))
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    final.convert("RGB").save(args.out, "PNG", optimize=True)
    print(f"out={args.out} size={final.size}")

    # Upsert review_sheet_gods into PROVENANCE.json.
    if os.path.exists(PROVENANCE_PATH):
        with open(PROVENANCE_PATH) as f:
            provenance = json.load(f)
    else:
        provenance = {"schema_version": 1, "assets": []}
    rel_out = os.path.relpath(args.out, ROOT) if os.path.isabs(args.out) else args.out
    provenance["review_sheet_gods"] = rel_out
    with open(PROVENANCE_PATH, "w") as f:
        json.dump(provenance, f, indent=2)
        f.write("\n")
    print(f"review_sheet_gods={rel_out}")


if __name__ == "__main__":
    main()
