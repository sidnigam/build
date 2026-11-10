#!/usr/bin/env python3
"""
guided_inpaint.py -- FLUX.1-schnell masked img2img repair (05.7-03).

  python tools/art/guided_inpaint.py --in IMG --mask MASK --prompt TEXT --seed N --denoise D --out OUT.png
        [--bg "#767676"] [--prefill telea|none] [--grow 6] [--feather 3] [--timeout 900]
        [--dry-run] [--prefill-only] [--self-test]

Pipeline: flatten RGBA over --bg; soft mask M = grow(mask) -> Gaussian sigma=feather (same as
prop_overlay.soft_mask / realpha); Telea prefill inside the grown mask; pad to a multiple of 16;
FLUX img2img (LoadImage + LoadImageMask(red) + VAEEncode + SetLatentNoiseMask + KSampler denoise D);
crop the pad; recomposite out = orig*(1-M) + gen*M, so every pixel with M == 0 is byte-identical.

--prefill-only skips ComfyUI entirely (deterministic cv2 Telea fallback).
--dry-run validates the graph against /object_info without queueing (exit 1 invalid, 2 unreachable).
One JSON line on stdout.
"""
import argparse
import json
import os
import re
import sys
import time

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comfy_client as cc  # noqa: E402

LINT_NEGATION_RE = re.compile(r"\bno\b|\bnot\b|without|never", re.IGNORECASE)
LINT_MAX_WORDS = 180
COMFY_INPUT = os.path.expanduser("~/ComfyUI/input")


def jprint(o):
    print(json.dumps(o, default=str))


def lint(prompt):
    if LINT_NEGATION_RE.search(prompt):
        return "prompt contains a negation word (no/not/without/never); Flux ignores negatives"
    if len(prompt.split()) > LINT_MAX_WORDS:
        return "prompt exceeds %d words" % LINT_MAX_WORDS
    return None


def kern(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def grown(mask, grow):
    return cv2.dilate(mask.astype(np.uint8), kern(grow)) > 0 if grow > 0 else mask.copy()


def soft_mask(mask, grow, feather):
    g = grown(mask, grow).astype(np.float32)
    m = cv2.GaussianBlur(g, (0, 0), feather) if feather > 0 else g
    hard = grown(mask, int(grow + 3 * feather))
    return np.clip(np.where(hard, m, 0.0), 0, 1)


def pad16(arr):
    h, w = arr.shape[:2]
    ph, pw = (-h) % 16, (-w) % 16
    if ph or pw:
        arr = np.pad(arr, ((0, ph), (0, pw)) + ((0, 0),) * (arr.ndim - 2), mode="edge")
    return arr, (ph, pw)


def unpad(arr, pad):
    ph, pw = pad
    h, w = arr.shape[:2]
    return arr[:h - ph, :w - pw]


def recomposite(orig_rgb, gen_rgb, M):
    out = orig_rgb.astype(np.float32) * (1 - M[..., None]) + gen_rgb.astype(np.float32) * M[..., None]
    res = np.clip(np.round(out), 0, 255).astype(np.uint8)
    res[M <= 0] = orig_rgb[M <= 0]
    return res


def prefill_telea(rgb, G):
    return cv2.inpaint(rgb, (G.astype(np.uint8) * 255), 9, cv2.INPAINT_TELEA)


def build_graph(prompt, seed, denoise, image_name, mask_name, prefix="gsd057x"):
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": cc.FLUX_DEFAULT_UNET}},
        "2": {"class_type": "DualCLIPLoaderGGUF", "inputs": {
            "clip_name1": cc.FLUX_DEFAULT_T5, "clip_name2": cc.FLUX_DEFAULT_CLIP_L, "type": "flux"}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "4": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["3", 0]}},
        "7": {"class_type": "VAELoader", "inputs": {"vae_name": cc.FLUX_DEFAULT_VAE}},
        "10": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "11": {"class_type": "LoadImageMask", "inputs": {"image": mask_name, "channel": "red"}},
        "12": {"class_type": "VAEEncode", "inputs": {"pixels": ["10", 0], "vae": ["7", 0]}},
        "13": {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["12", 0], "mask": ["11", 0]}},
        "6": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple",
            "denoise": denoise, "model": ["1", 0], "positive": ["3", 0], "negative": ["4", 0],
            "latent_image": ["13", 0]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["7", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}},
    }


def prepare(a):
    im = Image.open(a.inp)
    if im.mode == "RGBA":
        bgc = tuple(int(a.bg.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
        base = Image.new("RGBA", im.size, bgc + (255,))
        rgb = np.array(Image.alpha_composite(base, im).convert("RGB"))
    else:
        rgb = np.array(im.convert("RGB"))
    mask = np.array(Image.open(a.mask).convert("L")) > 127
    G = grown(mask, a.grow)
    M = soft_mask(mask, a.grow, a.feather)
    pre = prefill_telea(rgb, G) if a.prefill == "telea" else rgb.copy()
    return rgb, mask, G, M, pre


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="inp")
    ap.add_argument("--mask")
    ap.add_argument("--prompt")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--denoise", type=float, default=0.65)
    ap.add_argument("--out")
    ap.add_argument("--bg", default="#767676")
    ap.add_argument("--prefill", choices=["telea", "none"], default="telea")
    ap.add_argument("--grow", type=int, default=6)
    ap.add_argument("--feather", type=float, default=3)
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--prefill-only", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if not (a.inp and a.mask and a.out):
        ap.error("--in, --mask and --out are required")
    if not a.prefill_only:
        if a.prompt is None or a.seed is None:
            ap.error("--prompt and --seed are required (unless --prefill-only)")
        err = lint(a.prompt)
        if err:
            print("LINT: " + err, file=sys.stderr)
            return 1
    rgb, mask, G, M, pre = prepare(a)
    if a.prefill_only:
        out = recomposite(rgb, pre, M)
        Image.fromarray(out).save(a.out)
        jprint({"out": a.out, "mode": "prefill-only", "mask_frac": float((M > 0).mean())})
        return 0

    stem = os.path.splitext(os.path.basename(a.out))[0]
    padded, pad = pad16(pre)
    mpad, _ = pad16((M * 255).round().astype(np.uint8))
    img_name = "gsd057x_%s.png" % stem
    msk_name = "gsd057x_%s_mask.png" % stem
    graph = build_graph(a.prompt, a.seed, a.denoise, img_name, msk_name)
    if a.dry_run:
        try:
            oi = cc._http_json(cc.COMFY_HOST + "/object_info", timeout=60)
        except Exception as e:  # noqa
            print("ComfyUI unreachable: %s" % e, file=sys.stderr)
            return 2
        errs = cc.validate_graph(graph, oi)
        if errs:
            for e in errs:
                print("GRAPH ERROR: " + e, file=sys.stderr)
            return 1
        jprint({"graph_ok": True, "graph": graph})
        return 0

    os.makedirs(COMFY_INPUT, exist_ok=True)
    Image.fromarray(padded).save(os.path.join(COMFY_INPUT, img_name))
    Image.fromarray(np.stack([mpad] * 3, -1)).save(os.path.join(COMFY_INPUT, msk_name))
    t0 = time.time()
    pid = cc.queue_prompt(graph)
    hist = cc.wait_for(pid, a.timeout)
    tmp = a.out.rsplit(".png", 1)[0] + ".raw.png"
    cc.download_first_image(hist, tmp)
    gen = unpad(np.array(Image.open(tmp).convert("RGB")), pad)
    os.remove(tmp)
    out = recomposite(rgb, gen, M)
    Image.fromarray(out).save(a.out)
    label = "flux1-schnell-Q4_K_S.gguf"
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompts.json")) as f:
            label = json.load(f)["checkpoints"]["flux1_schnell_q4ks"]["label"]
    except Exception:  # noqa
        pass
    params = {"prompt": a.prompt, "seed": a.seed, "denoise": a.denoise, "steps": 4, "cfg": 1.0,
              "sampler": "euler", "scheduler": "simple", "checkpoint_label": label,
              "method": "flux-masked-img2img (SetLatentNoiseMask)", "grow": a.grow,
              "feather": a.feather, "mask_frac": float((M > 0).mean())}
    try:
        ver = cc.system_stats()["system"]["comfyui_version"]
    except Exception:  # noqa
        ver = None
    side = cc.write_sidecar(a.out, graph, params, pid, ver)
    jprint({"out": a.out, "sidecar": side, "mask_frac": params["mask_frac"], "seconds": round(time.time() - t0, 1)})
    return 0


def self_test():
    ok = []

    def case(name, fn):
        try:
            r = bool(fn())
        except Exception as e:  # noqa
            r = False
            name += " (%s: %s)" % (type(e).__name__, e)
        ok.append(r)
        print(("PASS " if r else "FAIL ") + name, file=sys.stderr)

    def t1():
        g = build_graph("a painted garment", 5, 0.62, "i.png", "m.png")
        classes = {k: v["class_type"] for k, v in g.items()}
        exp = {"1": "UnetLoaderGGUF", "2": "DualCLIPLoaderGGUF", "3": "CLIPTextEncode", "4": "ConditioningZeroOut",
               "7": "VAELoader", "10": "LoadImage", "11": "LoadImageMask", "12": "VAEEncode",
               "13": "SetLatentNoiseMask", "6": "KSampler", "8": "VAEDecode", "9": "SaveImage"}
        return (classes == exp and g["6"]["inputs"]["denoise"] == 0.62 and g["11"]["inputs"]["channel"] == "red"
                and g["6"]["inputs"]["latent_image"] == ["13", 0] and g["13"]["inputs"]["samples"] == ["12", 0]
                and g["13"]["inputs"]["mask"] == ["11", 0] and g["12"]["inputs"]["pixels"] == ["10", 0]
                and g["2"]["inputs"]["type"] == "flux")
    case("graph classes/links/denoise/channel", t1)

    def t2():
        rng = np.random.RandomState(0)
        a = rng.randint(0, 255, (768, 600, 3), np.uint8)
        p, pad = pad16(a)
        return p.shape[:2] == (768, 608) and np.array_equal(unpad(p, pad), a)
    case("pad round-trip", t2)

    def t3():
        rng = np.random.RandomState(1)
        orig = rng.randint(0, 255, (120, 120, 3), np.uint8)
        gen = rng.randint(0, 255, (120, 120, 3), np.uint8)
        m = np.zeros((120, 120), bool)
        m[50:70, 50:70] = True
        M = soft_mask(m, 6, 3)
        out = recomposite(orig, gen, M)
        z = M <= 0
        return np.array_equal(out[z], orig[z]) and (out[~z] != orig[~z]).any()
    case("recomposite keeps M==0 pixels", t3)

    def t4():
        rng = np.random.RandomState(2)
        rgb = rng.randint(0, 255, (100, 100, 3), np.uint8)
        m = np.zeros((100, 100), bool)
        m[40:60, 40:60] = True
        G = grown(m, 6)
        pre = prefill_telea(rgb, G)
        changed = np.any(pre != rgb, axis=2)
        return changed.any() and not (changed & ~G).any()
    case("telea prefill inside grown mask only", t4)

    def t5():
        return lint("a painted king with no crown") is not None and lint(" ".join(["word"] * 181)) is not None \
            and lint("a painted regal king in indigo silk") is None
    case("lint", t5)
    print("guided_inpaint self-test: %d/5 PASS" % sum(ok))
    return 0 if all(ok) else 1


if __name__ == "__main__":
    sys.exit(main())
