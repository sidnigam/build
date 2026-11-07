#!/usr/bin/env python3
"""
retouch_mark.py — deterministic removal of a small painted mark (05.7-02, Agni tilak) from a
generated raw image. Used only when Flux repeatedly paints a sacred-mark the prompt cannot
suppress (the model is positive-prompt-only, so it cannot be told "no tilak").

Usage:
  python tools/art/retouch_mark.py --in RAW.png --out OUT.png --box x0,y0,x1,y1 [--dilate 3] [--radius 6]

Inside --box, pixels that are near-white (min channel > 165) or strongly red (r>170, g<110, b<110) -- plus, with --warm, any warm paint (r>g+8, r>110)
form the mask (dilated by --dilate px); the mask is filled with cv2.inpaint (Telea) from the
surrounding skin. Pixels outside the box are untouched. Prints the mask area fraction.
"""
import argparse
import json

import cv2
import numpy as np
from PIL import Image


def retouch(img, box, dilate=3, radius=6, warm=False):
    arr = np.array(img.convert("RGB"))
    x0, y0, x1, y1 = box
    sub = arr[y0:y1, x0:x1].astype(np.int32)
    r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
    white = sub.min(axis=2) > 165
    red = (r > 170) & (g < 110) & (b < 110)
    warm_m = (r > g + 8) & (r > 110) if warm else np.zeros_like(white)
    m_sub = (white | red | warm_m).astype(np.uint8) * 255
    mask = np.zeros(arr.shape[:2], dtype=np.uint8)
    mask[y0:y1, x0:x1] = m_sub
    if dilate:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate + 1, 2 * dilate + 1))
        mask = cv2.dilate(mask, k)
        # keep the dilated mask inside the box so nothing outside is altered
        keep = np.zeros_like(mask)
        keep[y0:y1, x0:x1] = 255
        mask = cv2.bitwise_and(mask, keep)
    out = cv2.inpaint(cv2.cvtColor(arr, cv2.COLOR_RGB2BGR), mask, radius, cv2.INPAINT_TELEA)
    out = cv2.cvtColor(out, cv2.COLOR_BGR2RGB)
    return Image.fromarray(out), float((mask > 0).sum()) / mask.size


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="in_path", required=True)
    ap.add_argument("--out", dest="out_path", required=True)
    ap.add_argument("--box", required=True)
    ap.add_argument("--dilate", type=int, default=3)
    ap.add_argument("--radius", type=int, default=6)
    ap.add_argument("--warm", action="store_true",
                    help="also mask warm (red/orange/yellow, r>g+8, r>110) paint, for marks on green/blue skin")
    a = ap.parse_args()
    box = tuple(int(v) for v in a.box.split(","))
    img, frac = retouch(Image.open(a.in_path), box, a.dilate, a.radius, a.warm)
    img.save(a.out_path, "PNG")
    print(json.dumps({"out": a.out_path, "box": list(box), "mask_frac": round(frac, 5)}))


if __name__ == "__main__":
    main()
