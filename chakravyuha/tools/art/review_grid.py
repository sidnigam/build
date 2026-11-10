#!/usr/bin/env python3
"""
review_grid.py — labelled contact grid for one-read review passes (Phase 05.4 D-10a).

Usage:
  python tools/art/review_grid.py --out PNG --cell 384 [--cols 4] \
      [--repeat 2x2|3x1] [--bg checker|grey] FILE[=LABEL]...

Composes a single labelled grid image from FILE[=LABEL] pairs (LABEL defaults to the file's
basename without extension), laid out --cols wide. Each cell fits the image (contain,
centered) into --cell x --cell pixels with a text label drawn beneath it.

--repeat 2x2 or 3x1 tiles the image edge-to-edge inside the cell BEFORE fitting, for seam
review of floor tiles (2x2) or wall strips (3x1).

--bg checker composites RGBA input onto an 8px checkerboard so cutout alpha (props/decals)
is visible; --bg grey (default) composites onto flat mid-grey (128,128,128). RGB input
passes through unchanged.

Prints the grid path on the last line of stdout.
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

LABEL_H = 28
PAD = 6


def checker_bg(size, sq=8):
    w, h = size
    img = Image.new("RGB", (w, h))
    px = img.load()
    light, dark = (200, 200, 200), (150, 150, 150)
    for y in range(h):
        row_base = (y // sq) % 2
        for x in range(w):
            px[x, y] = light if ((x // sq) % 2 == row_base) else dark
    return img


def flatten(img, bg_mode):
    """Composite an RGBA image onto a checker/grey background; RGB passes through."""
    if img.mode != "RGBA":
        return img.convert("RGB")
    bg = checker_bg(img.size) if bg_mode == "checker" else Image.new("RGB", img.size, (128, 128, 128))
    bg.paste(img, (0, 0), img)
    return bg


def make_repeat(img, mode):
    """Tile img into a 2x2 or 3x1 grid of itself (seam-review preview)."""
    w, h = img.size
    if mode == "2x2":
        canvas = Image.new(img.mode, (w * 2, h * 2))
        for gy in range(2):
            for gx in range(2):
                canvas.paste(img, (gx * w, gy * h))
        return canvas
    if mode == "3x1":
        canvas = Image.new(img.mode, (w * 3, h))
        for gx in range(3):
            canvas.paste(img, (gx * w, 0))
        return canvas
    raise ValueError(f"Unknown --repeat mode: {mode!r}")


def fit_contain(img, cell):
    w, h = img.size
    scale = min(cell / w, cell / h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    resized = img.resize((nw, nh), Image.LANCZOS)
    bg_color = (0, 0, 0, 0) if img.mode == "RGBA" else (40, 40, 40)
    canvas = Image.new(img.mode, (cell, cell), bg_color)
    canvas.paste(resized, ((cell - nw) // 2, (cell - nh) // 2))
    return canvas


def build_cell(path, label, cell, repeat, bg_mode):
    img = Image.open(path)
    if repeat:
        img = make_repeat(img, repeat)
    img = fit_contain(img, cell)
    img = flatten(img, bg_mode)

    out = Image.new("RGB", (cell, cell + LABEL_H), (30, 30, 30))
    out.paste(img, (0, 0))
    draw = ImageDraw.Draw(out)
    font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), label, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((max(0, (cell - tw) // 2), cell + 6), label, fill=(255, 255, 255), font=font)
    return out


def main():
    ap = argparse.ArgumentParser(description="Labelled review grid for env-art / god-portrait review passes.")
    ap.add_argument("--out", required=True)
    ap.add_argument("--cell", type=int, default=384)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--repeat", choices=["2x2", "3x1"], default=None)
    ap.add_argument("--bg", choices=["checker", "grey"], default="grey")
    ap.add_argument("files", nargs="+", help="FILE or FILE=LABEL")
    args = ap.parse_args()

    entries = []
    for spec in args.files:
        if "=" in spec:
            path, label = spec.split("=", 1)
        else:
            path, label = spec, os.path.splitext(os.path.basename(spec))[0]
        entries.append((path, label))

    cells = []
    for path, label in entries:
        if not os.path.exists(path):
            print(f"WARNING: missing file {path}, skipping", file=sys.stderr)
            continue
        cells.append(build_cell(path, label, args.cell, args.repeat, args.bg))

    if not cells:
        print("ERROR: no valid input files", file=sys.stderr)
        sys.exit(1)

    cols = max(1, args.cols)
    rows = (len(cells) + cols - 1) // cols
    cw = args.cell
    ch = args.cell + LABEL_H
    grid = Image.new("RGB", (cols * cw + (cols + 1) * PAD, rows * ch + (rows + 1) * PAD), (20, 20, 20))
    for i, cell_img in enumerate(cells):
        r, c = divmod(i, cols)
        x = PAD + c * (cw + PAD)
        y = PAD + r * (ch + PAD)
        grid.paste(cell_img, (x, y))

    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    grid.save(args.out, "PNG")
    print(args.out)


if __name__ == "__main__":
    main()
