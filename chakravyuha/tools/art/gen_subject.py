#!/usr/bin/env python3
"""
gen_subject.py — drive comfy_client using the locked prompts.json for a single subject.

Usage:
  python tools/art/gen_subject.py <key> [--attempt N] [--wait-only PROMPT_ID]
  python tools/art/gen_subject.py <biome>:<env_key> [--attempt N] [--ckpt-profile NAME] [--dry-run]

<key> is one of the keys under prompts.json "subjects" (biome id, boss id, enemy id, or god
id) — legacy behaviour, unchanged.

<biome>:<env_key> resolves an env-art subject (Phase 05.4) from
prompts.json "env_subjects".{biome}.{env_key}. Checkpoint is
prompts.json checkpoints[env_checkpoint] unless --ckpt-profile overrides it (used for the
ENV-01 A/B). Writes assets/sprites/_gen/env/{biome}/{env_key}/{env_key}_s{seed}[_{profile}].png
— the profile suffix is added only when --ckpt-profile is given, so A/B pairs don't collide.

Legacy subjects write assets/sprites/_gen/{kind}s/{key}/{key}_s{seed}.png plus a .gen.json
sidecar, and print the output path on the last line of stdout.

If a Bash 10-minute timeout interrupts generation, the queued prompt_id is printed to
stderr as "PROMPT_ID=<id>"; resume with:
  python tools/art/gen_subject.py <key> --attempt N --wait-only <id>
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comfy_client as cc

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROMPTS_PATH = os.path.join(ROOT, "tools", "art", "prompts.json")

KIND_DIR = {"biome": "biomes", "boss": "bosses", "enemy": "enemies", "god": "gods"}


def load_prompts():
    with open(PROMPTS_PATH) as f:
        return json.load(f)


def is_env_key(key):
    return ":" in key


def build_prompt(prompts, key):
    """Resolve (kind, pos, neg, width, height) for a subject key.

    Legacy keys (biome/boss/enemy/god ids) are resolved from prompts["subjects"] exactly as
    before (byte-identical to pre-05.4 behaviour). Env keys "{biome}:{env_key}" (Phase 05.4)
    are resolved from prompts["env_subjects"][biome][env_key] using
    env_templates/env_negative/env_negative_ground/env_sizes; kind is returned as "env".
    """
    if is_env_key(key):
        biome, env_key = key.split(":", 1)
        env_subjects = prompts.get("env_subjects", {})
        if biome not in env_subjects or env_key not in env_subjects[biome]:
            raise KeyError(f"Unknown env subject key: {key!r}")
        entry = env_subjects[biome][env_key]
        template = entry["template"]
        size_key = entry.get("size") or template
        width, height = prompts["env_sizes"][size_key]
        subject = entry["subject"]
        palette = entry.get("palette", "")
        pos = prompts["env_templates"][template].format(subject=subject, palette=palette)
        neg = prompts["env_negative"]
        if template in ("tile", "wallcap", "decal"):
            neg = neg + ", " + prompts["env_negative_ground"]
        extra = entry.get("negative_extra")
        if extra:
            neg = neg + ", " + extra
        return "env", pos, neg, width, height

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
    elif kind == "god":
        subject = entry["subject"]
        palette = entry.get("palette", "")
        pos = f"{subject}, {palette}, {prompts['god_style_positive']}" if palette else \
            f"{subject}, {prompts['god_style_positive']}"
        neg = prompts["god_style_negative"] + ", " + prompts["god_negative_extra"]
        extra = entry.get("negative_extra")
        if extra:
            neg = neg + ", " + extra
        width, height = prompts["god_size"]
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


def resolve_entry(prompts, key):
    """Return the raw subject entry dict for a legacy or env key."""
    if is_env_key(key):
        biome, env_key = key.split(":", 1)
        return prompts["env_subjects"][biome][env_key]
    return prompts["subjects"][key]


def resolve_checkpoint(prompts, key, entry, kind, ckpt_profile_override):
    """Resolve (ckpt_file, ckpt_label, sampler, scheduler, steps, cfg, profile_name).

    Env keys use the checkpoints[env_checkpoint] catalog profile (or --ckpt-profile to
    override, for the A/B). Legacy keys keep the exact pre-05.4 lookup, byte-identical,
    UNLESS --ckpt-profile is explicitly given (used to A/B an existing god/boss/enemy subject
    against a catalog checkpoint without touching its normal checkpoint config).
    """
    if kind == "env" or ckpt_profile_override:
        profile_name = ckpt_profile_override or prompts["env_checkpoint"]
        profile = prompts["checkpoints"][profile_name]
        return (profile["file"], profile["label"], profile.get("sampler", "dpmpp_2m"),
                profile.get("scheduler", "karras"), profile.get("steps", 32),
                profile.get("cfg", 7.0), profile_name)

    ckpt = entry.get("checkpoint") or prompts.get("checkpoint", "sd_xl_base_1.0.safetensors")
    ckpt_label = entry.get("checkpoint_label") or prompts.get("checkpoint_label", ckpt)
    steps = prompts.get("steps", 32)
    cfg = prompts.get("cfg", 7.0)
    return (ckpt, ckpt_label, "dpmpp_2m", "karras", steps, cfg, "legacy")


def output_path_for(prompts, key, attempt=0, ckpt_profile=None):
    """Return (kind, seed, out_path) for a legacy or env key + attempt, without contacting
    ComfyUI. Used by gen_batch.py to check whether an attempt's output already exists."""
    kind, _pos, _neg, _w, _h = build_prompt(prompts, key)
    entry = resolve_entry(prompts, key)
    seed = entry["base_seed"] + attempt
    if is_env_key(key):
        biome, env_key = key.split(":", 1)
        out_dir = os.path.join(ROOT, "assets", "sprites", "_gen", "env", biome, env_key)
        suffix = f"_{ckpt_profile}" if ckpt_profile else ""
        return kind, seed, os.path.join(out_dir, f"{env_key}_s{seed}{suffix}.png")
    kind_dir = KIND_DIR[kind]
    out_dir = os.path.join(ROOT, "assets", "sprites", "_gen", kind_dir, key)
    suffix = f"_{ckpt_profile}" if ckpt_profile else ""
    return kind, seed, os.path.join(out_dir, f"{key}_s{seed}{suffix}.png")


def run_one(prompts, key, attempt=0, ckpt_profile=None, timeout=540, busy_wait=600, wait_only=None):
    """Resolve + queue + wait + download + sidecar for one subject/attempt.

    Returns the output path on success. Raises KeyError (unknown key), TimeoutError (resume
    needed — the message includes the resume command), or RuntimeError (ComfyUI error / still
    busy after busy_wait seconds).
    """
    kind, pos, neg, width, height = build_prompt(prompts, key)
    entry = resolve_entry(prompts, key)
    base_seed = entry["base_seed"]
    seed = base_seed + attempt

    ckpt, ckpt_label, sampler, scheduler, steps, cfg, profile_name = resolve_checkpoint(
        prompts, key, entry, kind, ckpt_profile)

    if is_env_key(key):
        biome, env_key = key.split(":", 1)
        out_dir = os.path.join(ROOT, "assets", "sprites", "_gen", "env", biome, env_key)
        os.makedirs(out_dir, exist_ok=True)
        suffix = f"_{ckpt_profile}" if ckpt_profile else ""
        out_path = os.path.join(out_dir, f"{env_key}_s{seed}{suffix}.png")
    else:
        kind_dir = KIND_DIR[kind]
        out_dir = os.path.join(ROOT, "assets", "sprites", "_gen", kind_dir, key)
        os.makedirs(out_dir, exist_ok=True)
        suffix = f"_{ckpt_profile}" if ckpt_profile else ""
        out_path = os.path.join(out_dir, f"{key}_s{seed}{suffix}.png")

    stats = cc.system_stats()
    comfyui_version = stats.get("system", {}).get("comfyui_version")

    graph = cc.build_txt2img_graph(pos, neg, seed, width, height, steps=steps, cfg=cfg,
                                    sampler=sampler, scheduler=scheduler, ckpt=ckpt)
    params = {
        "positive": pos, "negative": neg, "seed": seed, "width": width, "height": height,
        "steps": steps, "cfg": cfg, "sampler": sampler, "scheduler": scheduler,
        "checkpoint": ckpt, "checkpoint_label": ckpt_label, "checkpoint_profile": profile_name,
    }

    if wait_only:
        prompt_id = wait_only
        print(f"Resuming wait on prompt_id={prompt_id}", file=sys.stderr)
    else:
        # Serialization safety: ComfyUI is single-tenant (05.5 may also be generating).
        waited = 0
        poll_s = 15
        while True:
            try:
                queue = cc._http_json(f"{cc.COMFY_HOST}/queue", timeout=10)
            except Exception:
                break
            busy = bool(queue.get("queue_running")) or bool(queue.get("queue_pending"))
            if not busy:
                break
            if waited >= busy_wait:
                raise RuntimeError(f"ComfyUI still busy after {busy_wait}s")
            print(f"WAITING {key} attempt={attempt} — ComfyUI busy (another job running)", file=sys.stderr)
            time.sleep(poll_s)
            waited += poll_s

        prompt_id = cc.queue_prompt(graph)
        print(f"Queued {key} attempt={attempt} seed={seed} prompt_id={prompt_id}", file=sys.stderr)
        print(f"PROMPT_ID={prompt_id}", file=sys.stderr)

    try:
        history_entry = cc.wait_for(prompt_id, timeout_s=timeout)
    except TimeoutError as e:
        print(f"TIMEOUT: {e}", file=sys.stderr)
        print(f"Resume with: python tools/art/gen_subject.py {key} --attempt {attempt} "
              f"--wait-only {prompt_id}", file=sys.stderr)
        raise

    cc.download_first_image(history_entry, out_path)
    cc.write_sidecar(out_path, graph, params, prompt_id, comfyui_version=comfyui_version)
    return out_path


def main():
    ap = argparse.ArgumentParser(description="Generate one subject via ComfyUI using locked prompts.json data.")
    ap.add_argument("key")
    ap.add_argument("--attempt", type=int, default=0)
    ap.add_argument("--wait-only", dest="wait_only", default=None)
    ap.add_argument("--timeout", type=int, default=540)
    ap.add_argument("--busy-wait", dest="busy_wait", type=int, default=600,
                     help="Max seconds to wait for /queue to drain before queueing (serialization safety).")
    ap.add_argument("--ckpt-profile", dest="ckpt_profile", default=None,
                     help="Override the checkpoint profile (env subjects only; for the ENV-01 A/B).")
    ap.add_argument("--dry-run", dest="dry_run", action="store_true",
                     help="Print the resolved prompt/size/profile as JSON without contacting ComfyUI.")
    args = ap.parse_args()

    prompts = load_prompts()

    try:
        kind, pos, neg, width, height = build_prompt(prompts, args.key)
        entry = resolve_entry(prompts, args.key)
    except KeyError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        base_seed = entry["base_seed"]
        seed = base_seed + args.attempt
        ckpt, ckpt_label, sampler, scheduler, steps, cfg, profile_name = resolve_checkpoint(
            prompts, args.key, entry, kind, args.ckpt_profile)
        print(json.dumps({
            "key": args.key, "kind": kind, "seed": seed, "width": width, "height": height,
            "checkpoint": ckpt, "checkpoint_label": ckpt_label, "checkpoint_profile": profile_name,
            "sampler": sampler, "scheduler": scheduler, "steps": steps, "cfg": cfg,
            "positive": pos, "negative": neg,
        }, indent=2))
        return

    try:
        out_path = run_one(prompts, args.key, attempt=args.attempt, ckpt_profile=args.ckpt_profile,
                           timeout=args.timeout, busy_wait=args.busy_wait, wait_only=args.wait_only)
    except KeyError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    except TimeoutError:
        sys.exit(2)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    print(out_path)


if __name__ == "__main__":
    main()
