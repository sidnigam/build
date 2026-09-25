#!/usr/bin/env python3
"""
gen_subject.py — drive comfy_client using the locked prompts.json for a single subject.

Usage:
  python tools/art/gen_subject.py <key> [--attempt N] [--wait-only PROMPT_ID]

<key> is one of the keys under prompts.json "subjects" (biome id, boss id, or enemy id).
Writes assets/sprites/_gen/{kind}s/{key}/{key}_s{seed}.png plus a .gen.json sidecar,
and prints the output path on the last line of stdout.

If a Bash 10-minute timeout interrupts generation, the queued prompt_id is printed to
stderr as "PROMPT_ID=<id>"; resume with:
  python tools/art/gen_subject.py <key> --attempt N --wait-only <id>
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comfy_client as cc

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROMPTS_PATH = os.path.join(ROOT, "tools", "art", "prompts.json")


def load_prompts():
    with open(PROMPTS_PATH) as f:
        return json.load(f)


def build_prompt(prompts, key):
    subjects = prompts["subjects"]
    if key not in subjects:
        raise KeyError(f"Unknown subject key: {key!r}. Known keys: {sorted(subjects)}")
    entry = subjects[key]
    kind = entry["kind"]

    if kind == "biome":
        ground = entry["ground"]
        palette = entry["palette"]
        pos = prompts["biome_positive_template"].format(ground=ground, palette=palette)
        neg = prompts["biome_negative"]
        width, height = prompts["biome_size"]
    else:
        subject = entry["subject"]
        palette = entry.get("palette", "")
        pos = f"{subject}, {palette}, {prompts['style_positive']}" if palette else \
            f"{subject}, {prompts['style_positive']}"
        neg = prompts["style_negative"]
        if key != "yama":
            neg = neg + ", " + prompts["enemy_negative_extra"]
        extra = entry.get("negative_extra")
        if extra:
            neg = neg + ", " + extra
        width, height = prompts["character_size"]

    return kind, pos, neg, width, height


def main():
    ap = argparse.ArgumentParser(description="Generate one subject via ComfyUI using locked prompts.json data.")
    ap.add_argument("key")
    ap.add_argument("--attempt", type=int, default=0)
    ap.add_argument("--wait-only", dest="wait_only", default=None)
    ap.add_argument("--timeout", type=int, default=540)
    args = ap.parse_args()

    prompts = load_prompts()
    subjects = prompts["subjects"]
    if args.key not in subjects:
        print(f"ERROR: unknown subject key {args.key!r}", file=sys.stderr)
        sys.exit(1)

    kind, pos, neg, width, height = build_prompt(prompts, args.key)
    base_seed = subjects[args.key]["base_seed"]
    seed = base_seed + args.attempt

    kind_dir = kind + "s"  # biome -> biomes, boss -> bosses, enemy -> enemies
    out_dir = os.path.join(ROOT, "assets", "sprites", "_gen", kind_dir, args.key)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{args.key}_s{seed}.png")

    steps = prompts.get("steps", 32)
    cfg = prompts.get("cfg", 7.0)

    try:
        stats = cc.system_stats()
    except Exception as e:
        print(f"ERROR: ComfyUI not reachable: {e}", file=sys.stderr)
        sys.exit(1)
    comfyui_version = stats.get("system", {}).get("comfyui_version")

    graph = cc.build_txt2img_graph(pos, neg, seed, width, height, steps=steps, cfg=cfg)
    params = {
        "positive": pos, "negative": neg, "seed": seed, "width": width, "height": height,
        "steps": steps, "cfg": cfg, "sampler": "dpmpp_2m", "scheduler": "karras",
        "checkpoint": "sd_xl_base_1.0.safetensors",
    }

    if args.wait_only:
        prompt_id = args.wait_only
        print(f"Resuming wait on prompt_id={prompt_id}", file=sys.stderr)
    else:
        try:
            prompt_id = cc.queue_prompt(graph)
        except Exception as e:
            print(f"ERROR: queue_prompt failed: {e}", file=sys.stderr)
            sys.exit(1)
        print(f"Queued {args.key} attempt={args.attempt} seed={seed} prompt_id={prompt_id}", file=sys.stderr)
        print(f"PROMPT_ID={prompt_id}", file=sys.stderr)

    try:
        entry = cc.wait_for(prompt_id, timeout_s=args.timeout)
    except TimeoutError as e:
        print(f"TIMEOUT: {e}", file=sys.stderr)
        print(f"Resume with: python tools/art/gen_subject.py {args.key} --attempt {args.attempt} "
              f"--wait-only {prompt_id}", file=sys.stderr)
        sys.exit(2)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        cc.download_first_image(entry, out_path)
    except Exception as e:
        print(f"ERROR: download failed: {e}", file=sys.stderr)
        sys.exit(1)

    cc.write_sidecar(out_path, graph, params, prompt_id, comfyui_version=comfyui_version)

    print(out_path)


if __name__ == "__main__":
    main()
