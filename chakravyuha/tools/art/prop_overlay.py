#!/usr/bin/env python3
"""
prop_overlay.py -- deterministic overlay toolkit (05.7-03).

Code-drawn props (classic double-ended vajra, buffalo-horn finial) composited onto AI portraits,
plus the mask / fill / metric helpers used to remove an old object and prove nothing else changed.

Every subcommand prints exactly ONE JSON line on stdout. Exit 1 on a failed metric / diffcheck.
Run with ~/ComfyUI/venv/bin/python (PIL, numpy, cv2, scipy, rembg live there).

  grid      crop + labelled coordinate grid (read exact coordinates off it)
  mask      polygon / rect union mask, optional fg-only, dilate, keep-skin
  fill      bg or Telea fill under a mask
  fgmask    foreground mask inside a box
  handmask  skin component (or polygon) = the fingers to re-layer over a prop
  realpha   blend a repaired RGB into the original RGBA with the soft mask + rembg alpha
  vajra     draw a classic vajra layer + geometry metrics
  horns     draw a buffalo-horn finial layer + metrics (Yama, plan 05.7-04)
  composite shadow + layer + front-mask restore, --footprint-out
  recolor   hue-window recolour inside boxes
  peaks     count upward points of a silhouette in a box (trident = 3)
  diffcheck count changed pixels outside the allowed masks
  preview   multi-height side-by-side review sheet
  --self-test

Code-drawn overlays are NOT AI: disclose them in PROVENANCE (procedural_overlay.ai_generated=false).
"""
import argparse
import json
import math
import os
import sys
import tempfile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

INK = (46, 26, 6)
DEF_GOLD = ((122, 78, 12), (214, 160, 40), (252, 226, 120))
DEF_BONE = ((110, 80, 40), (200, 170, 110), (240, 220, 170))


# ----------------------------------------------------------------------------- helpers
def jprint(obj):
    print(json.dumps(obj, default=lambda o: o.item() if hasattr(o, "item") else str(o)))


def pbox(s):
    v = [int(round(float(x))) for x in s.split(",")]
    assert len(v) == 4, "box needs x0,y0,x1,y1"
    return v


def ppoly(s):
    pts = []
    for pair in s.split():
        x, y = pair.split(",")
        pts.append((float(x), float(y)))
    return pts


def ppair(s):
    a, b = s.split(",")
    return float(a), float(b)


def hexcolor(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def border_median(rgb, ring=8):
    h, w = rgb.shape[:2]
    m = np.zeros((h, w), bool)
    m[:ring] = m[-ring:] = True
    m[:, :ring] = m[:, -ring:] = True
    return tuple(int(v) for v in np.median(rgb[m], axis=0))


def resolve_bg(arg, rgb):
    if arg is None or arg == "auto":
        return border_median(rgb)
    return hexcolor(arg)


def load_rgb(p):
    return np.array(Image.open(p).convert("RGB"))


def fg_of(im, bg="auto", tol=40):
    if im.mode == "RGBA":
        return np.array(im)[:, :, 3] > 128
    rgb = np.array(im.convert("RGB")).astype(np.float32)
    b = np.array(resolve_bg(bg, rgb.astype(np.uint8)), np.float32)
    return np.sqrt(((rgb - b) ** 2).sum(-1)) > tol


def load_mask(p):
    m = np.array(Image.open(p).convert("L"))
    return m > 127


def save_mask(m, p):
    Image.fromarray((m.astype(np.uint8) * 255)).save(p)


def kern(r):
    r = int(r)
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def dilate(m, r):
    if r <= 0:
        return m.copy()
    return cv2.dilate(m.astype(np.uint8), kern(r)) > 0


def erode(m, r):
    if r <= 0:
        return m.copy()
    return cv2.erode(m.astype(np.uint8), kern(r)) > 0


def skin_rule(rgb):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    H = hsv[:, :, 0] * 2.0
    S = hsv[:, :, 1] / 255.0
    V = hsv[:, :, 2] / 255.0
    return ((H <= 35) | (H >= 345)) & (S >= 0.20) & (S <= 0.80) & (V >= 0.20) & (V <= 0.95)


def flatten(im, bg=(118, 118, 118)):
    if im.mode == "RGBA":
        base = Image.new("RGBA", im.size, bg + (255,))
        return Image.alpha_composite(base, im).convert("RGB")
    return im.convert("RGB")


def get_font(size=10):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def contour_overlay(rgb, mask, tint=(255, 0, 0)):
    out = rgb.astype(np.float32)
    out[mask] = out[mask] * 0.5 + np.array(tint, np.float32) * 0.5
    out = out.astype(np.uint8)
    edge = mask & ~erode(mask, 1)
    out[edge] = (255, 255, 0)
    return out


def soft_mask(mask, grow, feather):
    """M used by guided_inpaint AND realpha: grow then Gaussian sigma=feather; 0 outside grow+3*feather."""
    g = dilate(mask, grow).astype(np.float32)
    m = cv2.GaussianBlur(g, (0, 0), max(feather, 0.01)) if feather > 0 else g
    hard = dilate(mask, int(grow + 3 * feather))
    m = np.where(hard, m, 0.0)
    return np.clip(m, 0, 1)


# ----------------------------------------------------------------------------- grid
def cmd_grid(a):
    x0, y0, x1, y1 = pbox(a.box)
    im = flatten(Image.open(a.inp)).crop((x0, y0, x1, y1))
    sc = a.scale
    im = im.resize((im.width * sc, im.height * sc), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    font = get_font(10)
    start = (x0 // a.step) * a.step
    for X in range(start, x1 + 1, a.step):
        if X < x0:
            continue
        px = (X - x0) * sc
        col = (255, 255, 0) if (X // a.step) % 5 == 0 else (0, 255, 255)
        d.line([(px, 0), (px, im.height)], fill=col, width=1)
        if (X // a.step) % 2 == 0:
            d.text((px + 2, 1), str(X), fill=(0, 0, 0), font=font)
    start = (y0 // a.step) * a.step
    for Y in range(start, y1 + 1, a.step):
        if Y < y0:
            continue
        py = (Y - y0) * sc
        col = (255, 255, 0) if (Y // a.step) % 5 == 0 else (0, 255, 255)
        d.line([(0, py), (im.width, py)], fill=col, width=1)
        if (Y // a.step) % 2 == 0:
            d.text((2, py + 1), str(Y), fill=(0, 0, 0), font=font)
    im.save(a.out)
    jprint({"out": a.out, "size": im.size})


# ----------------------------------------------------------------------------- mask
def build_mask(im, polys, rects, keep_skin, fg_only, bg, tol, dil):
    w, h = im.size
    mi = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mi)
    for p in polys:
        d.polygon(p, fill=255)
    for r in rects:
        d.rectangle(r, fill=255)
    m = np.array(mi) > 0
    if fg_only:
        m &= fg_of(im, bg, tol)
    m = dilate(m, dil)
    if keep_skin:
        rgb = np.array(im.convert("RGB"))
        sk = skin_rule(rgb)
        for (x0, y0, x1, y1) in keep_skin:
            box = np.zeros_like(m)
            box[y0:y1, x0:x1] = True
            m &= ~(box & sk)
    return m


def cmd_mask(a):
    im = Image.open(a.inp)
    polys = [ppoly(p) for p in (a.poly or [])]
    rects = [pbox(r) for r in (a.rect or [])]
    ks = [pbox(r) for r in (a.keep_skin or [])]
    m = build_mask(im, polys, rects, ks, a.fg_only, a.bg, a.tol, a.dilate)
    save_mask(m, a.out)
    if a.preview:
        Image.fromarray(contour_overlay(np.array(flatten(im)), m)).save(a.preview)
    ys, xs = np.where(m)
    bb = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else None
    jprint({"area_px": int(m.sum()), "frac": float(m.mean()), "bbox": bb})


# ----------------------------------------------------------------------------- fill
def cmd_fill(a):
    im = Image.open(a.inp)
    rgb = np.array(im.convert("RGB"))
    m = load_mask(a.mask)
    bg = resolve_bg(a.bg, rgb)
    if a.mode == "bg":
        out = rgb.copy()
        out[m] = bg
        ring = dilate(m, 3) & ~erode(m, 3)
        out = cv2.inpaint(out, (ring.astype(np.uint8) * 255), 3, cv2.INPAINT_TELEA)
    else:
        out = cv2.inpaint(rgb, (m.astype(np.uint8) * 255), a.radius, cv2.INPAINT_TELEA)
    res = Image.fromarray(out)
    if im.mode == "RGBA":
        res = res.convert("RGBA")
        res.putalpha(im.getchannel("A"))
    res.save(a.out)
    jprint({"out": a.out, "mode": a.mode, "filled_px": int(m.sum())})


def cmd_fgmask(a):
    im = Image.open(a.inp)
    x0, y0, x1, y1 = pbox(a.box)
    fg = fg_of(im, a.bg, a.tol)
    m = np.zeros_like(fg)
    m[y0:y1, x0:x1] = fg[y0:y1, x0:x1]
    save_mask(m, a.out)
    if a.preview:
        Image.fromarray(contour_overlay(np.array(flatten(im)), m)).save(a.preview)
    jprint({"area_px": int(m.sum())})


def cmd_handmask(a):
    im = Image.open(a.inp)
    x0, y0, x1, y1 = pbox(a.box)
    w, h = im.size
    if a.poly:
        mi = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mi).polygon(ppoly(a.poly), fill=255)
        m = np.array(mi) > 0
    else:
        sk = skin_rule(np.array(im.convert("RGB")))
        m = np.zeros((w and h, w), bool)
        m[y0:y1, x0:x1] = sk[y0:y1, x0:x1]
        m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, kern(3)) > 0
        n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
        if n > 1:
            k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
            m = lab == k
    save_mask(m, a.out)
    if a.preview:
        Image.fromarray(contour_overlay(np.array(flatten(im)), m, (0, 255, 0))).save(a.preview)
    jprint({"area_px": int(m.sum())})


# ----------------------------------------------------------------------------- realpha
def cmd_realpha(a):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import finish_portrait as fp
    from rembg import remove

    orig = np.array(Image.open(a.orig).convert("RGBA")).astype(np.float32)
    rgb = np.array(Image.open(a.rgb).convert("RGB")).astype(np.float32)
    mask = load_mask(a.mask)
    M = soft_mask(mask, a.grow, a.feather)
    sess = fp.get_session(a.matte)
    cut = remove(Image.open(a.rgb).convert("RGB"), session=sess)
    a_new = np.array(cut.convert("RGBA"))[:, :, 3].astype(np.float32)
    h, w = a_new.shape
    ramp = fp.bottom_feather(Image.new("RGBA", (w, h), (255, 255, 255, 255)), a.bottom_feather)
    ramp_a = np.array(ramp)[:, :, 3].astype(np.float32) / 255.0
    a_new = np.where(a_new < 16, 0, a_new) * ramp_a
    out = orig.copy()
    out[:, :, :3] = orig[:, :, :3] * (1 - M[..., None]) + rgb * M[..., None]
    out[:, :, 3] = orig[:, :, 3] * (1 - M) + a_new * M
    res = np.clip(np.round(out), 0, 255).astype(np.uint8)
    keep = M <= 0
    res[keep] = orig[keep].astype(np.uint8)
    Image.fromarray(res, "RGBA").save(a.out)
    jprint({"out": a.out, "blended_px": int((M > 0).sum())})


# ----------------------------------------------------------------------------- palette
def sample_palette(img_path, mask_path, gold, default):
    if not img_path:
        return default
    im = Image.open(img_path)
    rgba = np.array(im.convert("RGBA"))
    sel = rgba[:, :, 3] > 0
    if mask_path:
        sel &= load_mask(mask_path)
    rgb = rgba[:, :, :3]
    if gold:
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
        H, S, V = hsv[:, :, 0] * 2.0, hsv[:, :, 1] / 255.0, hsv[:, :, 2] / 255.0
        sel &= (H >= 30) & (H <= 65) & (S >= 0.35) & (V >= 0.35)
    px = rgb[sel].astype(np.float32)
    if len(px) < 200:
        return default
    lum = px @ np.array([0.299, 0.587, 0.114], np.float32)
    order = np.argsort(lum)
    px = px[order]
    n = len(px)

    def med(lo, hi):
        seg = px[int(n * lo):max(int(n * hi), int(n * lo) + 1)]
        return tuple(int(round(v)) for v in np.median(seg, axis=0))

    return med(0.05, 0.20), med(0.40, 0.60), med(0.85, 0.98)


# ----------------------------------------------------------------------------- stroke geometry
def bez(P0, P1, P2, P3, n=64):
    t = np.linspace(0, 1, n)[:, None]
    P0, P1, P2, P3 = [np.array(p, np.float64) for p in (P0, P1, P2, P3)]
    return ((1 - t) ** 3) * P0 + 3 * ((1 - t) ** 2) * t * P1 + 3 * (1 - t) * (t ** 2) * P2 + (t ** 3) * P3


def normals(pts):
    d = np.gradient(pts, axis=0)
    nrm = np.stack([-d[:, 1], d[:, 0]], axis=1)
    ln = np.linalg.norm(nrm, axis=1, keepdims=True)
    return nrm / np.maximum(ln, 1e-9)


def up_normals(pts):
    """Normals oriented toward smaller y (image up)."""
    n = normals(pts)
    flip = n[:, 1] > 0
    n[flip] *= -1
    return n


def band_poly(pts, widths, lo, hi):
    """Polygon of the stroke band between fractional offsets lo..hi of width (-.5..+.5), up-oriented."""
    n = up_normals(pts)
    a = pts + n * (widths[:, None] * hi)
    b = pts + n * (widths[:, None] * lo)
    poly = np.concatenate([a, b[::-1]], axis=0)
    return [tuple(p) for p in poly]


def poly_mask(size, polys, ss_scale=1.0):
    mi = Image.new("L", size, 0)
    d = ImageDraw.Draw(mi)
    for p in polys:
        d.polygon([(x * ss_scale, y * ss_scale) for x, y in p], fill=255)
    return np.array(mi) > 127


def lerp3(c0, c1, t):
    return tuple(c0[i] + (c1[i] - c0[i]) * t for i in range(3))


# ----------------------------------------------------------------------------- vajra
def vajra_metrics(alpha, L):
    """Geometry metrics on an UNROTATED vajra alpha. See README (05.7-03)."""
    a = np.asarray(alpha) > 127
    if not a.any():
        return {"pass": False, "fails": ["empty"]}
    cols = np.where(a.any(0))[0]
    rows = np.where(a.any(1))[0]
    x0, x1, y0, y1 = cols[0], cols[-1], rows[0], rows[-1]
    sub = a[y0:y1 + 1, x0:x1 + 1]
    length = sub.shape[1]
    anyc = sub.any(0)
    top = np.argmax(sub, axis=0)
    bot = sub.shape[0] - 1 - np.argmax(sub[::-1], axis=0)
    widths = np.where(anyc, bot - top + 1, 0).astype(np.float64)
    maxw = widths.max()
    u = (np.arange(length) - (length - 1) / 2.0) / float(L)
    aspect = length / maxw
    center_ratio = widths[np.abs(u) <= 0.15].max() / maxw
    n = max(1, int(round(0.04 * length)))
    tip_l = widths[:n].max() / maxw
    tip_r = widths[-n:].max() / maxw

    def iou(x, y):
        un = (x | y).sum()
        return float((x & y).sum() / un) if un else 0.0

    mlr = iou(sub, sub[:, ::-1])
    mud = iou(sub, sub[::-1, :])
    ncomp = cv2.connectedComponents(a.astype(np.uint8), connectivity=8)[0] - 1
    widest = float(np.abs(u[widths >= 0.98 * maxw]).max())
    m = {
        "aspect": float(aspect), "center_ratio": float(center_ratio),
        "tip_ratio_l": float(tip_l), "tip_ratio_r": float(tip_r),
        "mirror_iou_lr": mlr, "mirror_iou_ud": mud,
        "components": int(ncomp), "widest_abs_u": widest,
    }
    fails = []
    if not (3.0 <= aspect <= 5.0):
        fails.append("aspect")
    if center_ratio > 0.80:
        fails.append("center_ratio")
    if tip_l > 0.60:
        fails.append("tip_ratio_l")
    if tip_r > 0.60:
        fails.append("tip_ratio_r")
    if mlr < 0.97:
        fails.append("mirror_iou_lr")
    if mud < 0.97:
        fails.append("mirror_iou_ud")
    if ncomp != 1:
        fails.append("components")
    if widest < 0.25:
        fails.append("widest_abs_u")
    m["fails"] = fails
    m["pass"] = not fails
    return m


def draw_vajra(L, outline=2, pal=DEF_GOLD, glow=0.0):
    """Return (RGBA PIL image, unrotated, centred at (w/2,h/2)). All geometry in fractions of L."""
    SS = 4
    shadow, mid, light = pal
    pad = int(L * 0.06) + outline + 4
    Wc = int(L * 1.0) + 2 * pad
    Hc = int(L * 0.40) + 2 * pad
    Wc += Wc % 2
    Hc += Hc % 2
    W, H = Wc * SS, Hc * SS
    cx, cy = W / 2.0, H / 2.0
    LS = L * SS

    def P(u, v):
        return (cx + u * LS, cy - v * LS)

    # vertical gradient (v-based), top light -> mid(0.45) -> bottom shadow
    ys = np.arange(H, dtype=np.float64)
    v = (cy - ys) / LS
    t = np.clip((0.121 - v) / 0.242, 0, 1)
    grad = np.zeros((H, 3), np.float64)
    for i in range(3):
        grad[:, i] = np.where(t < 0.45,
                              light[i] + (mid[i] - light[i]) * (t / 0.45),
                              mid[i] + (shadow[i] - mid[i]) * ((t - 0.45) / 0.55))
    grad_img = np.repeat(grad[:, None, :], W, axis=1)
    rgb = np.zeros((H, W, 3), np.float64)
    alpha = np.zeros((H, W), bool)

    def paint(m, ink_extra=None, spec=None):
        nonlocal rgb, alpha
        col = grad_img.copy()
        edge = m & ~erode(m, 2 * SS)
        col[edge] = col[edge] * 0.5 + np.array(shadow, np.float64) * 0.5
        if spec is not None:
            sp = spec & m
            col[sp] = col[sp] * 0.65 + np.array((255, 245, 200), np.float64) * 0.35
        ring = m & ~erode(m, SS)
        col[ring] = INK
        if ink_extra is not None:
            ie = ink_extra & m
            col[ie] = INK
        rgb[m] = col[m]
        alpha |= m

    def pm(polys):
        return poly_mask((W, H), polys)

    def stroke(P0, P1, P2, P3, w0, w1):
        pts = bez(P(*P0), P(*P1), P(*P2), P(*P3), 64)
        wd = np.linspace(w0, w1, len(pts)) * LS
        poly = band_poly(pts, wd, -0.5, 0.5)
        spec = band_poly(pts, wd, 0.25, 0.5)
        return poly, spec

    # outer prongs, inner prongs (both ends, upper/lower)
    outer, outer_s, inner, inner_s = [], [], [], []
    for s in (1, -1):
        for sv in (1, -1):
            p, sp = stroke((s * 0.229, sv * 0.050), (s * 0.300, sv * 0.150), (s * 0.420, sv * 0.120), (s * 0.497, sv * 0.004), 0.026, 0.010)
            outer.append(p)
            outer_s.append(sp)
            p, sp = stroke((s * 0.229, sv * 0.028), (s * 0.290, sv * 0.085), (s * 0.400, sv * 0.070), (s * 0.470, sv * 0.006), 0.018, 0.008)
            inner.append(p)
            inner_s.append(sp)
    paint(pm(outer), spec=pm(outer_s))
    paint(pm(inner), spec=pm(inner_s))
    cen = []
    for s in (1, -1):
        cen.append([P(s * 0.229, 0.020), P(s * 0.500, 0.0), P(s * 0.229, -0.020)])
    paint(pm(cen))

    def rrect(u, hl, hh):
        mi = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(mi)
        x0, y0 = P(u - hl, hh)
        x1, y1 = P(u + hl, -hh)
        d.rounded_rectangle([x0, y0, x1, y1], radius=min(x1 - x0, y1 - y0) / 2.0, fill=255)
        return np.array(mi) > 127

    r2 = rrect(0.215, 0.014, 0.062) | rrect(-0.215, 0.014, 0.062)
    paint(r2)

    def ell(u, a_, b_, fill=True, width=0):
        mi = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(mi)
        x0, y0 = P(u - a_, b_)
        x1, y1 = P(u + a_, -b_)
        if fill:
            d.ellipse([x0, y0, x1, y1], fill=255)
        else:
            d.ellipse([x0, y0, x1, y1], outline=255, width=max(1, width))
        return np.array(mi) > 127

    lot = ell(0.150, 0.055, 0.072) | ell(-0.150, 0.055, 0.072)
    petals = np.zeros_like(lot)
    for s in (1, -1):
        for f in (0.30, 0.62, 0.95):
            petals |= ell(s * 0.150, 0.055 * f, 0.072, fill=False, width=SS)
    paint(lot, ink_extra=petals)
    r1 = rrect(0.090, 0.016, 0.080) | rrect(-0.090, 0.016, 0.080)
    paint(r1)
    ball = ell(0.0, 0.070, 0.070)
    ribs = np.zeros_like(ball)
    for f in (0.35, 0.70, 0.02):
        ribs |= ell(0.0, 0.070 * f, 0.070, fill=False, width=SS)
    paint(ball, ink_extra=ribs)

    # outline under the object
    ol = dilate(alpha, outline * SS) if outline > 0 else alpha
    out = np.zeros((H, W, 4), np.float64)
    out[ol, :3] = INK
    out[ol, 3] = 255
    out[alpha, :3] = rgb[alpha]
    out[alpha, 3] = 255
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")
    if glow > 0:
        g = Image.new("RGBA", (W, H), (255, 255, 255, 0))
        gd = np.zeros((H, W), np.float32)
        yy, xx = np.mgrid[0:H, 0:W]
        r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (0.14 * LS)
        gd = np.clip(1 - r, 0, 1) * glow * 255
        g.putalpha(Image.fromarray(gd.astype(np.uint8)))
        img = Image.alpha_composite(g, img)
    img = img.resize((Wc, Hc), Image.LANCZOS)
    return img


def cmd_vajra(a):
    W, H = [int(float(x)) for x in a.size.split(",")]
    cx, cy = ppair(a.center)
    L = a.length
    pal = sample_palette(a.palette_from, a.palette_mask, a.palette_gold, DEF_GOLD) if a.palette_from else DEF_GOLD
    img = draw_vajra(L, a.outline, pal, a.glow)
    metrics = vajra_metrics(np.array(img)[:, :, 3], L)
    metrics["palette"] = {"shadow": pal[0], "mid": pal[1], "light": pal[2]}
    rot = img.rotate(a.angle, resample=Image.BICUBIC, expand=True) if abs(a.angle) > 1e-6 else img
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x = int(round(cx - rot.width / 2.0))
    y = int(round(cy - rot.height / 2.0))
    sx, sy = max(0, -x), max(0, -y)
    dx, dy = max(0, x), max(0, y)
    cw, ch = min(rot.width - sx, W - dx), min(rot.height - sy, H - dy)
    if cw > 0 and ch > 0:
        canvas.alpha_composite(rot.crop((sx, sy, sx + cw, sy + ch)), dest=(dx, dy))
    canvas.save(a.out)
    if a.standalone:
        bb = img.getbbox()
        cr = img.crop(bb)
        sheet = Image.new("RGB", (256 + 64 + 30, int(cr.height * 256 / cr.width) + 20), (118, 118, 118))
        big = cr.resize((256, max(1, int(cr.height * 256 / cr.width))), Image.LANCZOS)
        small = cr.resize((64, max(1, int(cr.height * 64 / cr.width))), Image.LANCZOS)
        sheet.paste(big, (10, 10), big)
        sheet.paste(small, (256 + 20, 10), small)
        sheet.save(a.standalone)
    if a.metrics:
        with open(a.metrics, "w") as f:
            json.dump(metrics, f, indent=2)
    jprint(metrics)
    return 0 if metrics["pass"] else 1


# ----------------------------------------------------------------------------- horns
def build_horns(W, H, px, py, Wh, s_l, s_r, dome, pal, lift, outline, avoid=None):
    SS = 3
    shadow, mid, light = pal
    mid = tuple(min(255, int(c * lift)) for c in mid)
    light = tuple(min(255, int(c * lift)) for c in light)
    ink = (20, 11, 8)
    w, h = W * SS, H * SS
    rgb = np.zeros((h, w, 3), np.float64)
    alpha = np.zeros((h, w), bool)
    sc = lambda p: (p[0] * SS, p[1] * SS)

    def curve(s, sx):
        def pt(dx, dy):
            return (px + sx * (0.28 * Wh + dx * Wh), py + dy * Wh)
        P0 = pt(0, 0.30)
        P1 = pt(0.50 * s, 0.12)
        P2 = pt(0.78 * s, 0.60)
        P3 = pt(0.45 * s, 1.00)
        return bez(P0, P1, P2, P3, 80)

    horn_alpha = np.zeros((h, w), bool)
    dome_alpha = np.zeros((h, w), bool)
    tip_masks = []
    tips_y = []
    if dome:
        mi = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mi).ellipse([(px - 0.30 * Wh) * SS, (py - 0.24 * Wh) * SS, (px + 0.30 * Wh) * SS, (py + 0.24 * Wh) * SS], fill=255)
        dm = np.array(mi) > 127
        yy = (np.arange(h) / SS - (py - 0.24 * Wh)) / (0.48 * Wh)
        tt = np.clip(yy, 0, 1)
        g = np.zeros((h, 3))
        for i in range(3):
            g[:, i] = np.where(tt < 0.4, light[i] + (mid[i] - light[i]) * tt / 0.4, mid[i] + (shadow[i] - mid[i]) * (tt - 0.4) / 0.6)
        gi = np.repeat(g[:, None, :], w, axis=1)
        edge = dm & ~erode(dm, SS)
        gi[edge] = ink
        rgb[dm] = gi[dm]
        alpha |= dm
        dome_alpha |= dm
    for s, sx in ((s_r, 1), (s_l, -1)):
        pts = curve(s, sx) * SS
        wd = np.linspace(0.24, 0.05, len(pts)) * Wh * SS
        poly = band_poly(pts, wd, -0.5, 0.5)
        mi = Image.new("L", (w, h), 0)
        d = ImageDraw.Draw(mi)
        d.polygon(poly, fill=255)
        r = wd[-1] / 2.0
        d.ellipse([pts[-1][0] - r, pts[-1][1] - r, pts[-1][0] + r, pts[-1][1] + r], fill=255)
        hm = np.array(mi) > 127
        # three shading bands: up side light, centre mid, low side shadow
        lightm = poly_mask((w, h), [band_poly(pts, wd, 0.15, 0.5)]) & hm
        shadm = poly_mask((w, h), [band_poly(pts, wd, -0.5, -0.15)]) & hm
        col = np.zeros((h, w, 3))
        col[hm] = mid
        col[lightm] = light
        col[shadm] = shadow
        edge = hm & ~erode(hm, SS)
        col[edge] = ink
        ridge = Image.new("L", (w, h), 0)
        rd = ImageDraw.Draw(ridge)
        n = up_normals(pts)
        for tr in (0.15, 0.28, 0.41, 0.54, 0.67, 0.80):
            i = int(tr * (len(pts) - 1))
            p0 = pts[i] + n[i] * wd[i] / 2
            p1 = pts[i] - n[i] * wd[i] / 2
            rd.line([tuple(p0), tuple(p1)], fill=255, width=max(1, int(0.015 * Wh * SS)))
        rm = (np.array(ridge) > 127) & hm
        col[rm] = ink
        rgb[hm] = col[hm]
        alpha |= hm
        horn_alpha |= hm
        k = int(0.85 * (len(pts) - 1))
        tip_poly = band_poly(pts[k:], wd[k:], -0.5, 0.5)
        tm = poly_mask((w, h), [tip_poly])
        tip_masks.append(tm)
        tips_y.append(pts[-1][1] / SS)
    ol = dilate(alpha, outline * SS)
    out = np.zeros((h, w, 4))
    out[ol, :3] = ink
    out[ol, 3] = 255
    out[alpha, :3] = rgb[alpha]
    out[alpha, 3] = 255
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA").resize((W, H), Image.LANCZOS)
    A = np.array(img)[:, :, 3] > 127

    def ys(mask):
        r = np.where(mask.any(1))[0]
        return float(r.min() / SS) if len(r) else float("inf")

    horn_top = ys(horn_alpha)
    dome_top = ys(dome_alpha) if dome else None
    xs = np.arange(W)
    xm = np.round(2 * px - 1 - xs).astype(int)
    ok = (xm >= 0) & (xm < W)
    flip = np.zeros_like(A)
    flip[:, ok] = A[:, xm[ok]]
    un = (A | flip).sum()
    miou = float((A & flip).sum() / un) if un else 0.0
    m = {"horn_top_y": horn_top, "dome_top_y": dome_top, "tips_y": tips_y}
    fails = []
    m["gap_ok"] = bool(horn_top >= dome_top + 0.25 * Wh) if dome else bool(horn_top >= py)
    if not m["gap_ok"]:
        fails.append("gap_ok")
    m["tips_down"] = bool(all(t >= py + 0.8 * Wh for t in tips_y))
    if not m["tips_down"]:
        fails.append("tips_down")
    if abs(s_l - s_r) < 1e-9:
        m["mirror_iou"] = miou
        if miou < 0.97:
            fails.append("mirror_iou")
    else:
        m["mirror_iou_info"] = miou
    if avoid is not None:
        av = np.kron(avoid.astype(np.uint8), np.ones((SS, SS), np.uint8)) > 0
        for nm, tm in zip(("r", "l"), tip_masks):
            tot = tm.sum()
            ov = float((tm & av).sum() / tot) if tot else 0.0
            m["tip_overlap_" + nm] = ov
            if ov > 0.30:
                fails.append("tip_overlap_" + nm)
    m["fails"] = fails
    m["pass"] = not fails
    return img, m


def cmd_horns(a):
    W, H = [int(float(x)) for x in a.size.split(",")]
    px, py = ppair(a.poll)
    pal = sample_palette(a.palette_from, a.palette_mask, a.palette_gold, DEF_BONE) if a.palette_from else DEF_BONE
    sl = a.reach_l if a.reach_l is not None else a.reach_scale
    sr = a.reach_r if a.reach_r is not None else a.reach_scale
    avoid = load_mask(a.avoid_mask) if a.avoid_mask else None
    img, m = build_horns(W, H, px, py, a.head_w, sl, sr, bool(a.dome), pal, a.lift, a.outline, avoid)
    img.save(a.out)
    if a.metrics:
        with open(a.metrics, "w") as f:
            json.dump(m, f, indent=2)
    jprint(m)
    return 0 if m["pass"] else 1


# ----------------------------------------------------------------------------- composite
def composite_images(base, layer, front=None, shadow=0.35, offset=(3, 4), blur=3.0):
    base = base.convert("RGBA") if base.mode != "RGBA" else base
    layer = layer.convert("RGBA")
    la = np.array(layer)[:, :, 3]
    sh_a = np.zeros_like(la)
    if shadow > 0:
        sh = np.zeros_like(la)
        dx, dy = int(offset[0]), int(offset[1])
        H, W = la.shape
        ys0, ys1 = max(0, dy), min(H, H + dy)
        xs0, xs1 = max(0, dx), min(W, W + dx)
        sh[ys0:ys1, xs0:xs1] = la[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
        shf = cv2.GaussianBlur(sh.astype(np.float32), (0, 0), max(blur, 0.01)) if blur > 0 else sh.astype(np.float32)
        sh_a = np.clip(np.round(shf * shadow), 0, 255).astype(np.uint8)
    barr = np.array(base)
    sh_a_base = np.round(sh_a.astype(np.float32) * barr[:, :, 3] / 255.0).astype(np.uint8)
    out = base
    if shadow > 0:
        sl = np.zeros_like(barr)
        sl[:, :, 3] = sh_a_base
        out = Image.alpha_composite(out, Image.fromarray(sl, "RGBA"))
    out = Image.alpha_composite(out, layer)
    if front is not None:
        res = np.array(out)
        res[front] = barr[front]
        out = Image.fromarray(res, "RGBA")
    footprint = (la > 0) | (sh_a_base > 0) | (sh_a > 0)
    return out, footprint


def cmd_composite(a):
    base = Image.open(a.base)
    mode = base.mode
    layer = Image.open(a.layer)
    front = load_mask(a.front_mask) if a.front_mask else None
    off = tuple(int(float(x)) for x in a.shadow_offset.split(","))
    out, fp = composite_images(base, layer, front, a.shadow, off, a.shadow_blur)
    if mode != "RGBA":
        out = out.convert(mode)
    out.save(a.out)
    if a.footprint_out:
        save_mask(fp, a.footprint_out)
    jprint({"out": a.out, "footprint_px": int(fp.sum())})


# ----------------------------------------------------------------------------- recolor
def recolor_arr(rgb, boxes, hue_lo, hue_hi, sat_min, val_min, to_hue, sat_scale, val_scale):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    H = hsv[:, :, 0] * 2.0
    S = hsv[:, :, 1] / 255.0
    V = hsv[:, :, 2] / 255.0
    sel = (H >= hue_lo) & (H <= hue_hi) & (S >= sat_min) & (V >= val_min)
    inbox = np.zeros(sel.shape, bool)
    for (x0, y0, x1, y1) in boxes:
        inbox[y0:y1, x0:x1] = True
    sel &= inbox
    nh = np.where(sel, to_hue, H)
    ns = np.where(sel, np.clip(S * sat_scale, 0, 1), S)
    nv = np.where(sel, np.clip(V * val_scale, 0, 1), V)
    out = np.stack([np.clip(nh / 2.0, 0, 179), ns * 255, nv * 255], -1).round().astype(np.uint8)
    res = cv2.cvtColor(out, cv2.COLOR_HSV2RGB)
    res[~sel] = rgb[~sel]
    return res, sel


def cmd_recolor(a):
    im = Image.open(a.inp)
    rgb = np.array(im.convert("RGB"))
    res, sel = recolor_arr(rgb, [pbox(b) for b in a.box], a.hue_lo, a.hue_hi, a.sat_min, a.val_min, a.to_hue, a.sat_scale, a.val_scale)
    out = Image.fromarray(res)
    if im.mode == "RGBA":
        out = out.convert("RGBA")
        out.putalpha(im.getchannel("A"))
    out.save(a.out)
    if a.preview:
        pv = Image.new("RGB", (im.width * 2, im.height))
        pv.paste(flatten(im), (0, 0))
        pv.paste(flatten(out), (im.width, 0))
        pv.save(a.preview)
    jprint({"changed_px": int(sel.sum())})


# ----------------------------------------------------------------------------- peaks
def count_peaks(fg, box, min_prom_frac=0.08):
    from scipy.signal import find_peaks
    x0, y0, x1, y1 = box
    sub = fg[y0:y1, x0:x1]
    cols = sub.any(0)
    xs = np.where(cols)[0]
    if len(xs) == 0:
        return 0, [], []
    top = np.argmax(sub, axis=0)[xs].astype(np.float64)
    k = 5
    pad = np.pad(top, (k // 2, k // 2), mode="edge")
    sm = np.convolve(pad, np.ones(k) / k, mode="valid")
    prom = min_prom_frac * (y1 - y0)
    # pad both ends with the box floor so a peak touching the box edge still counts
    ext = np.concatenate([[y1 - y0], sm, [y1 - y0]])
    pk, _ = find_peaks(-ext, prominence=prom)
    pk = pk - 1
    return len(pk), [int(xs[i] + x0) for i in pk], [int(round(sm[i] + y0)) for i in pk]


def cmd_peaks(a):
    im = Image.open(a.inp)
    n, pxs, pys = count_peaks(fg_of(im, a.bg, a.tol), pbox(a.box), a.min_prom_frac)
    jprint({"peaks": n, "peak_xs": pxs, "peak_ys": pys})


# ----------------------------------------------------------------------------- diffcheck
def diff_outside(A, B, allows, grow):
    d = np.any(A != B, axis=2)
    allow = np.zeros(d.shape, bool)
    for m in allows:
        allow |= dilate(m, grow)
    return int((d & ~allow).sum())


def cmd_diffcheck(a):
    A = np.array(Image.open(a.a).convert("RGBA"))
    B = np.array(Image.open(a.b).convert("RGBA"))
    if A.shape != B.shape:
        jprint({"changed_outside": -1, "error": "size mismatch"})
        return 1
    n = diff_outside(A, B, [load_mask(p) for p in (a.allow or [])], a.grow)
    jprint({"changed_outside": n})
    return 1 if n > 0 else 0


# ----------------------------------------------------------------------------- preview
def cmd_preview(a):
    heights = [int(x) for x in a.heights.split(",")]
    bg = hexcolor(a.bg)
    ims = [Image.open(p).convert("RGBA") for p in a.inp]
    stems = [os.path.splitext(os.path.basename(p))[0] for p in a.inp]
    font = get_font(11)
    panels = []
    for im, st in zip(ims, stems):
        for hh in heights:
            ww = max(1, int(im.width * hh / im.height))
            r = im.resize((ww, hh), Image.LANCZOS)
            panels.append((r, f"{st} {hh}"))
    row1w = sum(p[0].width + 10 for p in panels) + 10
    row1h = max(p[0].height for p in panels) + 24
    crops = []
    if a.crop:
        x0, y0, x1, y1 = pbox(a.crop)
        for im, st in zip(ims, stems):
            c = im.crop((x0, y0, x1, y1))
            c = c.resize((int(c.width * a.zoom), int(c.height * a.zoom)), Image.LANCZOS)
            crops.append((c, f"{st} crop x{a.zoom}"))
    row2w = sum(c[0].width + 10 for c in crops) + 10 if crops else 0
    row2h = max(c[0].height for c in crops) + 24 if crops else 0
    sheet = Image.new("RGB", (max(row1w, row2w), row1h + row2h), bg)
    d = ImageDraw.Draw(sheet)
    x = 10
    for r, lab in panels:
        sheet.paste(r, (x, 20), r)
        d.text((x, 4), lab, fill=(255, 255, 255), font=font)
        x += r.width + 10
    x = 10
    for c, lab in crops:
        sheet.paste(c, (x, row1h + 20), c)
        d.text((x, row1h + 4), lab, fill=(255, 255, 255), font=font)
        x += c.width + 10
    sheet.save(a.out)
    jprint({"out": a.out, "size": sheet.size})


# ----------------------------------------------------------------------------- self test
def _fg_to_rgba(m):
    arr = np.zeros(m.shape + (4,), np.uint8)
    arr[m] = (200, 200, 200, 255)
    return arr


def self_test():
    tmp = tempfile.mkdtemp(prefix="prop_overlay_st_")
    results = []

    def case(name, fn):
        try:
            ok = bool(fn())
        except Exception as e:  # noqa
            ok = False
            name += f" ({type(e).__name__}: {e})"
        results.append((name, ok))
        print(("PASS " if ok else "FAIL ") + name, file=sys.stderr)

    def canvas_poly(polys, size=(600, 768), lines=None):
        mi = Image.new("L", size, 0)
        d = ImageDraw.Draw(mi)
        for p in polys:
            d.polygon(p, fill=255)
        for (p0, p1, wd) in (lines or []):
            d.line([p0, p1], fill=255, width=wd)
        return np.array(mi)

    # 1 vajra passes
    vj = {}

    def t1():
        img = draw_vajra(330, 2)
        m = vajra_metrics(np.array(img)[:, :, 3], 330)
        vj["m"] = m
        print("vajra metrics: " + json.dumps(m), file=sys.stderr)
        return m["pass"] and 3.5 <= m["aspect"] <= 4.6 and m["tip_ratio_l"] <= 0.60
    case("vajra passes metrics", t1)

    # 2 cross fails center_ratio
    def t2():
        a = np.zeros((300, 400), np.uint8)
        a[140:160, 50:350] = 255
        a[50:250, 190:210] = 255
        m = vajra_metrics(a, 300)
        return "center_ratio" in m["fails"]
    case("cross fails center_ratio", t2)

    # 3 trident fails mirror/tip
    def t3():
        a = canvas_poly([], (400, 200), lines=[((20, 100), (260, 100), 12), ((260, 100), (380, 40), 10),
                                                ((260, 100), (380, 100), 10), ((260, 100), (380, 160), 10)])
        m = vajra_metrics(a, 360)
        return "mirror_iou_lr" in m["fails"] or "tip_ratio_r" in m["fails"] or "tip_ratio_l" in m["fails"]
    case("one-ended trident fails", t3)

    # 4 peaks trident = 3
    def t4():
        lines = [((100, 190), (100, 40), 18), ((150, 190), (150, 40), 18), ((200, 190), (200, 40), 18), ((100, 190), (200, 190), 18)]
        a = canvas_poly([], (300, 250), lines=lines) > 127
        n, _, _ = count_peaks(a, (0, 0, 300, 250))
        return n == 3
    case("peaks trident == 3", t4)

    # 5 peaks horn finial == 1
    horn = {}

    def t5():
        img, m = build_horns(400, 400, 200, 150, 100, 1.0, 1.0, True, DEF_BONE, 1.2, 3)
        horn["m"] = m
        base = Image.new("RGBA", (400, 400), (118, 118, 118, 255))
        base = Image.alpha_composite(base, img).convert("RGB")
        fgm = np.array(img)[:, :, 3] > 128
        n, _, _ = count_peaks(fgm, (0, 0, 400, 400))
        print("horn peaks=%d" % n, file=sys.stderr)
        return n == 1
    case("peaks horn finial == 1", t5)

    # 6 horns metrics symmetric + asymmetric
    def t6():
        _, m1 = build_horns(400, 400, 200, 150, 100, 1.0, 1.0, True, DEF_BONE, 1.2, 3)
        _, m2 = build_horns(400, 400, 200, 150, 100, 1.0, 0.8, True, DEF_BONE, 1.2, 3)
        print("horns sym: %s asym: %s" % (m1, m2), file=sys.stderr)
        return m1["pass"] and m2["pass"] and "mirror_iou_info" in m2
    case("horns metrics sym+asym", t6)

    # 7 composite front-mask + footprint
    def t7():
        rng = np.random.RandomState(1)
        base = rng.randint(0, 255, (200, 200, 4), np.uint8)
        base[:, :, 3] = 255
        layer = np.zeros((200, 200, 4), np.uint8)
        layer[60:120, 40:160] = (250, 200, 40, 255)
        front = np.zeros((200, 200), bool)
        front[80:100, 90:130] = True
        out, fp = composite_images(Image.fromarray(base, "RGBA"), Image.fromarray(layer, "RGBA"), front, 0.35, (3, 4), 3)
        o = np.array(out)
        same_front = np.array_equal(o[front], base[front])
        changed = np.any(o != base, axis=2)
        return same_front and bool(changed.any()) and not bool((changed & ~fp).any())
    case("composite front-mask + footprint", t7)

    # 8 recolor
    def t8():
        rng = np.random.RandomState(2)
        rgb = rng.randint(0, 255, (80, 80, 3), np.uint8)
        res, sel = recolor_arr(rgb, [(10, 10, 40, 40)], 5, 32, 0.35, 0.2, 42, 0.8, 1.2)
        outside = np.ones((80, 80), bool)
        outside[10:40, 10:40] = False
        same_out = np.array_equal(res[outside], rgb[outside])
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
        H = hsv[:, :, 0] * 2
        win = (H >= 5) & (H <= 32) & (hsv[:, :, 1] / 255 >= 0.35) & (hsv[:, :, 2] / 255 >= 0.2)
        inside_unsel = (~win) & ~outside
        same_in = np.array_equal(res[inside_unsel], rgb[inside_unsel])
        return same_out and same_in and sel.sum() > 0
    case("recolor only in boxes+window", t8)

    # 9 mask keep-skin
    def t9():
        arr = np.full((100, 100, 3), (30, 60, 140), np.uint8)
        arr[30:60, 30:60] = (205, 140, 100)
        im = Image.fromarray(arr)
        m = build_mask(im, [[(10, 10), (90, 10), (90, 90), (10, 90)]], [], [(30, 30, 60, 60)], False, "auto", 40, 3)
        return (not m[30:60, 30:60].any()) and bool(m[15, 15])
    case("mask keep-skin", t9)

    # 10 diffcheck
    def t10():
        A = np.zeros((50, 50, 4), np.uint8)
        B = A.copy()
        n0 = diff_outside(A, B, [], 8)
        B[40, 40] = (1, 2, 3, 255)
        allow = np.zeros((50, 50), bool)
        allow[0:5, 0:5] = True
        n1 = diff_outside(A, B, [allow], 8)
        return n0 == 0 and n1 > 0
    case("diffcheck", t10)

    # 11 open fan fails tip metric
    def t11():
        lines = [((50, 100), (350, 100), 12)]
        for sgn, (xs, xt) in ((1, (350, 450)), (-1, (50, -50))):
            pass
        L = []
        L.append(((50, 100), (350, 100), 12))
        for ty in (30, 100, 170):
            L.append(((350, 100), (450, ty), 10))
            L.append(((50, 100), (-50 + 100, ty), 10))
        a = np.zeros((200, 600), np.uint8)
        d = ImageDraw.Draw(Image.fromarray(a))
        mi = Image.new("L", (600, 200), 0)
        d = ImageDraw.Draw(mi)
        for (p0, p1, wd) in [((100, 100), (500, 100), 12)] + \
                [((500, 100), (590 - 10, ty), 10) for ty in (30, 100, 170)] + \
                [((100, 100), (10 + 10, ty), 10) for ty in (30, 100, 170)]:
            d.line([p0, p1], fill=255, width=wd)
        a = np.array(mi)
        m = vajra_metrics(a, 480)
        print("fan metrics: " + json.dumps(m), file=sys.stderr)
        return ("tip_ratio_l" in m["fails"]) and ("tip_ratio_r" in m["fails"])
    case("open fan fails tip_ratio", t11)

    npass = sum(1 for _, ok in results if ok)
    print("prop_overlay self-test: %d/%d PASS" % (npass, 11))
    return 0 if npass == 11 else 1


# ----------------------------------------------------------------------------- cli
def build_parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--self-test", action="store_true")
    sp = p.add_subparsers(dest="cmd")

    s = sp.add_parser("grid")
    s.add_argument("--in", dest="inp", required=True)
    s.add_argument("--box", required=True)
    s.add_argument("--step", type=int, default=20)
    s.add_argument("--scale", type=int, default=2)
    s.add_argument("--out", required=True)
    s.set_defaults(fn=cmd_grid)

    s = sp.add_parser("mask")
    s.add_argument("--in", dest="inp", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--poly", action="append")
    s.add_argument("--rect", action="append")
    s.add_argument("--keep-skin", action="append")
    s.add_argument("--fg-only", action="store_true")
    s.add_argument("--bg", default="auto")
    s.add_argument("--tol", type=float, default=40)
    s.add_argument("--dilate", type=int, default=3)
    s.add_argument("--preview")
    s.set_defaults(fn=cmd_mask)

    s = sp.add_parser("fill")
    s.add_argument("--in", dest="inp", required=True)
    s.add_argument("--mask", required=True)
    s.add_argument("--mode", choices=["bg", "telea"], required=True)
    s.add_argument("--bg", default="auto")
    s.add_argument("--radius", type=int, default=9)
    s.add_argument("--out", required=True)
    s.set_defaults(fn=cmd_fill)

    s = sp.add_parser("fgmask")
    s.add_argument("--in", dest="inp", required=True)
    s.add_argument("--box", required=True)
    s.add_argument("--bg", default="auto")
    s.add_argument("--tol", type=float, default=40)
    s.add_argument("--out", required=True)
    s.add_argument("--preview")
    s.set_defaults(fn=cmd_fgmask)

    s = sp.add_parser("handmask")
    s.add_argument("--in", dest="inp", required=True)
    s.add_argument("--box", required=True)
    s.add_argument("--poly")
    s.add_argument("--out", required=True)
    s.add_argument("--preview")
    s.set_defaults(fn=cmd_handmask)

    s = sp.add_parser("realpha")
    s.add_argument("--orig", required=True)
    s.add_argument("--rgb", required=True)
    s.add_argument("--mask", required=True)
    s.add_argument("--grow", type=int, default=6)
    s.add_argument("--feather", type=float, default=3)
    s.add_argument("--matte", default="birefnet-general")
    s.add_argument("--bottom-feather", type=float, default=0.12)
    s.add_argument("--out", required=True)
    s.set_defaults(fn=cmd_realpha)

    s = sp.add_parser("vajra")
    s.add_argument("--size", required=True)
    s.add_argument("--center", required=True)
    s.add_argument("--length", type=float, required=True)
    s.add_argument("--angle", type=float, default=0)
    s.add_argument("--palette-from")
    s.add_argument("--palette-mask")
    s.add_argument("--palette-gold", type=int, default=1)
    s.add_argument("--outline", type=int, default=2)
    s.add_argument("--glow", type=float, default=0)
    s.add_argument("--out", required=True)
    s.add_argument("--standalone")
    s.add_argument("--metrics")
    s.set_defaults(fn=cmd_vajra)

    s = sp.add_parser("horns")
    s.add_argument("--size", required=True)
    s.add_argument("--poll", required=True)
    s.add_argument("--head-w", type=float, required=True)
    s.add_argument("--reach-scale", type=float, default=1.0)
    s.add_argument("--reach-l", type=float)
    s.add_argument("--reach-r", type=float)
    s.add_argument("--dome", type=int, default=1)
    s.add_argument("--palette-from")
    s.add_argument("--palette-mask")
    s.add_argument("--palette-gold", type=int, default=0)
    s.add_argument("--lift", type=float, default=1.2)
    s.add_argument("--outline", type=int, default=3)
    s.add_argument("--avoid-mask")
    s.add_argument("--out", required=True)
    s.add_argument("--metrics")
    s.set_defaults(fn=cmd_horns)

    s = sp.add_parser("composite")
    s.add_argument("--base", required=True)
    s.add_argument("--layer", required=True)
    s.add_argument("--front-mask")
    s.add_argument("--shadow", type=float, default=0.35)
    s.add_argument("--shadow-offset", default="3,4")
    s.add_argument("--shadow-blur", type=float, default=3)
    s.add_argument("--footprint-out")
    s.add_argument("--out", required=True)
    s.set_defaults(fn=cmd_composite)

    s = sp.add_parser("recolor")
    s.add_argument("--in", dest="inp", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--box", action="append", required=True)
    s.add_argument("--hue-lo", type=float, default=5)
    s.add_argument("--hue-hi", type=float, default=32)
    s.add_argument("--sat-min", type=float, default=0.35)
    s.add_argument("--val-min", type=float, default=0.2)
    s.add_argument("--to-hue", type=float, default=42)
    s.add_argument("--sat-scale", type=float, default=0.8)
    s.add_argument("--val-scale", type=float, default=1.2)
    s.add_argument("--preview")
    s.set_defaults(fn=cmd_recolor)

    s = sp.add_parser("peaks")
    s.add_argument("--in", dest="inp", required=True)
    s.add_argument("--box", required=True)
    s.add_argument("--bg", default="auto")
    s.add_argument("--tol", type=float, default=40)
    s.add_argument("--min-prom-frac", type=float, default=0.08)
    s.set_defaults(fn=cmd_peaks)

    s = sp.add_parser("diffcheck")
    s.add_argument("--a", required=True)
    s.add_argument("--b", required=True)
    s.add_argument("--allow", action="append")
    s.add_argument("--grow", type=int, default=8)
    s.set_defaults(fn=cmd_diffcheck)

    s = sp.add_parser("preview")
    s.add_argument("--in", dest="inp", action="append", required=True)
    s.add_argument("--heights", default="768,256,64")
    s.add_argument("--bg", default="#2a2030")
    s.add_argument("--crop")
    s.add_argument("--zoom", type=float, default=2)
    s.add_argument("--out", required=True)
    s.set_defaults(fn=cmd_preview)
    return p


def main():
    p = build_parser()
    a = p.parse_args()
    if a.self_test:
        return self_test()
    if not a.cmd:
        p.print_help()
        return 2
    rc = a.fn(a)
    return rc or 0


if __name__ == "__main__":
    sys.exit(main())
