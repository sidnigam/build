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
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comfy_client as cc

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROMPTS_PATH = os.path.join(ROOT, "tools", "art", "prompts.json")

KIND_DIR = {"biome": "biomes", "boss": "bosses", "enemy": "enemies", "god": "gods"}

# --- Flux (05.5-04) ------------------------------------------------------------------------
LINT_NEGATION_RE = re.compile(r"\bno\b|\bnot\b|without|never", re.IGNORECASE)
LINT_MAX_WORDS = 180

FLUX_SMOKE_SEED = 71599
FLUX_SMOKE_PROMPT = (
    "A single ornate wooden chariot wheel with eight thin spokes and a bronze hub, bold "
    "hand-painted game-art style with dark ink outlines, standing upright alone in front of "
    "a flat, even, medium-grey backdrop that fills the whole image edge to edge."
)

GGUF_NODES_PATH = os.path.expanduser("~/ComfyUI/custom_nodes/ComfyUI-GGUF/nodes.py")
COMFY_CORE_NODES_PATH = os.path.expanduser("~/ComfyUI/nodes.py")


def load_prompts():
    with open(PROMPTS_PATH) as f:
        return json.load(f)


def is_env_key(key):
    return ":" in key


def build_prompt(prompts, key, ckpt_profile=None):
    """Resolve (kind, pos, neg, width, height) for a subject key.

    Legacy keys (biome/boss/enemy/god ids) are resolved from prompts["subjects"] exactly as
    before (byte-identical to pre-05.4 behaviour). Env keys "{biome}:{env_key}" (Phase 05.4)
    are resolved from prompts["env_subjects"][biome][env_key] using
    env_templates/env_negative/env_negative_ground/env_sizes; kind is returned as "env".

    god keys route to the FLUX.1-schnell positive-only template (05.5-04) when the resolved
    checkpoint profile (see resolve_profile) has graph == "flux_gguf"; `ckpt_profile` is the
    optional --ckpt-profile CLI override (A/B against a specific catalog profile). A god key
    with no matching flux profile (or ckpt_profile overridden to a non-flux profile, e.g.
    sdxl_base) falls through to the original SDXL god template unchanged.
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
        profile = resolve_profile(prompts, key, entry, kind, ckpt_profile)
        if profile and profile.get("graph") == "flux_gguf":
            flux_subject = entry.get("flux_subject") or entry["subject"]
            pos = f"{flux_subject} {prompts['god_style_positive_flux']}"
            neg = ""
            width, height = prompts.get("god_size_flux") or prompts["god_size"]
        else:
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


def _profile_name_for(prompts, entry, kind, override):
    """Shared precedence for resolve_profile()/resolve_checkpoint() (05.5-04):
    1. --ckpt-profile override
    2. env keys -> env_checkpoint
    3. god keys -> entry.checkpoint_profile or the top-level god_checkpoint
    4. None (legacy path, byte-identical to pre-05.4/05.5-04 behaviour)
    """
    if override:
        return override
    if kind == "env":
        return prompts["env_checkpoint"]
    if kind == "god":
        return entry.get("checkpoint_profile") or prompts.get("god_checkpoint")
    return None


def resolve_profile(prompts, key, entry, kind, override):
    """Return the prompts["checkpoints"][...] catalog dict selected for this key/override, or
    None when the legacy (byte-identical) checkpoint path applies. See _profile_name_for for
    the precedence order."""
    name = _profile_name_for(prompts, entry, kind, override)
    if name is None:
        return None
    return prompts["checkpoints"][name]


def seed_for(entry, attempt, profile):
    """Resolve the seed for a given attempt: flux_base_seed + attempt when the resolved
    profile is a flux_gguf graph, else the legacy base_seed + attempt. Shared by
    output_path_for and run_one so gen_batch.py's on-disk SKIP detection always agrees with
    the seed actually used to generate."""
    if profile and profile.get("graph") == "flux_gguf":
        return entry.get("flux_base_seed", entry["base_seed"]) + attempt
    return entry["base_seed"] + attempt


def resolve_checkpoint(prompts, key, entry, kind, ckpt_profile_override):
    """Resolve (ckpt_file, ckpt_label, sampler, scheduler, steps, cfg, profile_name).

    Env keys use the checkpoints[env_checkpoint] catalog profile (or --ckpt-profile to
    override, for the A/B). God keys use checkpoints[entry.checkpoint_profile or
    god_checkpoint] (05.5-04) unless --ckpt-profile overrides it. Other legacy keys keep the
    exact pre-05.4 lookup, byte-identical, UNLESS --ckpt-profile is explicitly given (used to
    A/B an existing subject against a catalog checkpoint without touching its normal config).
    """
    profile_name = _profile_name_for(prompts, entry, kind, ckpt_profile_override)
    if profile_name:
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
    kind, _pos, _neg, _w, _h = build_prompt(prompts, key, ckpt_profile=ckpt_profile)
    entry = resolve_entry(prompts, key)
    profile = resolve_profile(prompts, key, entry, kind, ckpt_profile)
    seed = seed_for(entry, attempt, profile)
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
    kind, pos, neg, width, height = build_prompt(prompts, key, ckpt_profile=ckpt_profile)
    entry = resolve_entry(prompts, key)
    profile = resolve_profile(prompts, key, entry, kind, ckpt_profile)
    seed = seed_for(entry, attempt, profile)
    is_flux = bool(profile and profile.get("graph") == "flux_gguf")

    ckpt, ckpt_label, sampler, scheduler, steps, cfg, profile_name = resolve_checkpoint(
        prompts, key, entry, kind, ckpt_profile)

    if is_flux and timeout == 540:
        timeout = 900  # Flux default timeout (05.5-04); 540 is the legacy SDXL default.

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

    if is_flux:
        graph = cc.build_flux_gguf_graph(
            pos, seed, width, height, steps=steps, cfg=cfg, sampler=sampler, scheduler=scheduler,
            unet=ckpt, t5=profile["t5"], clip_l=profile["clip_l"], vae=profile["vae"],
            clip_type=profile.get("clip_type", "flux"))
        params = {
            "positive": pos, "negative": "", "seed": seed, "width": width, "height": height,
            "steps": steps, "cfg": cfg, "sampler": sampler, "scheduler": scheduler,
            "checkpoint": ckpt, "checkpoint_label": ckpt_label, "checkpoint_profile": profile_name,
            "graph_type": "flux_gguf",
            "text_encoders": [profile["t5"], profile["clip_l"]],
            "vae": profile["vae"],
            "custom_nodes": profile.get("custom_node", {}),
        }
    else:
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


def lint_prompt(pos, max_words=LINT_MAX_WORDS):
    """Dry-run LINT for Flux positive-only prompts (05.5-04): schnell has no negative prompt,
    so a negation in the positive text ("no halo", "not X") does nothing useful, and schnell's
    effective context is short, so an over-long prompt loses the subject anchor. Returns a
    list of warning strings; [] means clean."""
    warnings = []
    if LINT_NEGATION_RE.search(pos):
        warnings.append("positive prompt contains a negation (no/not/without/never) -- Flux "
                         "schnell has no negative prompt; rephrase as a positive, concrete anchor")
    words = pos.split()
    if len(words) > max_words:
        warnings.append(f"positive prompt is {len(words)} words (> {max_words}) -- trim or move "
                         f"detail into composition; Flux's effective text context is short")
    return warnings


def static_check_gguf_classes(nodes_path=GGUF_NODES_PATH):
    """Grep-based static check for the UnetLoaderGGUF/DualCLIPLoaderGGUF class + input key
    names in the installed (but not-yet-loaded) ComfyUI-GGUF custom node source. Used by
    --validate before a ComfyUI restart, when /object_info does not list these classes yet.
    Returns a list of error strings; [] means OK."""
    errors = []
    try:
        with open(nodes_path) as f:
            src = f.read()
    except OSError as e:
        return [f"static check: cannot read {nodes_path}: {e}"]
    for cls in ("UnetLoaderGGUF", "DualCLIPLoaderGGUF"):
        if f"class {cls}" not in src:
            errors.append(f"static check: class {cls} not found in {nodes_path}")
    for key in ("unet_name", "clip_name1", "clip_name2", "type"):
        if f'"{key}"' not in src:
            errors.append(f"static check: input key {key!r} not found in {nodes_path}")
    return errors


def static_check_dual_clip_type(clip_type, nodes_path=COMFY_CORE_NODES_PATH):
    """Check clip_type against the core DualCLIPLoader `type` combo list in ComfyUI's own
    nodes.py (the same list DualCLIPLoaderGGUF reuses). Returns a list of error strings;
    [] means OK."""
    try:
        with open(nodes_path) as f:
            src = f.read()
    except OSError as e:
        return [f"static check: cannot read {nodes_path}: {e}"]
    m = re.search(r'class DualCLIPLoader:.*?"type":\s*\(\[([^\]]*)\]', src, re.DOTALL)
    if not m:
        return ["static check: could not locate the core DualCLIPLoader type combo list"]
    choices = [c.strip().strip("\"'") for c in m.group(1).split(",") if c.strip()]
    if clip_type not in choices:
        return [f"static check: clip_type {clip_type!r} not in core DualCLIPLoader type list {choices!r}"]
    return []


def validate_flux_graph(graph, clip_type):
    """Validate a Flux graph against the live /object_info; GGUF classes not yet loaded
    (before a ComfyUI restart) fall back to the grep-based static check instead of being
    reported as plain unknown-class_type errors. Returns (ok, lines)."""
    try:
        object_info = cc._http_json(f"{cc.COMFY_HOST}/object_info", timeout=30)
    except Exception as e:
        return False, [f"VALIDATE ERROR: cannot reach /object_info: {e}"]

    gguf_classes = ("UnetLoaderGGUF", "DualCLIPLoaderGGUF")
    skip = tuple(c for c in gguf_classes if c not in object_info)
    errors = cc.validate_graph(graph, object_info, skip_classes=skip)

    ok = True
    lines = []
    for e in errors:
        ok = False
        lines.append(f"VALIDATE ERROR: {e}")

    if skip:
        static_errors = static_check_gguf_classes()
        if "DualCLIPLoaderGGUF" in skip:
            static_errors = static_errors + static_check_dual_clip_type(clip_type)
        if static_errors:
            ok = False
            for e in static_errors:
                lines.append(f"VALIDATE SKIP-FAIL: {e}")
        else:
            for cls in skip:
                lines.append(f"VALIDATE SKIP {cls} (loads after restart) -- static check OK")

    if not errors and not skip:
        lines.append("VALIDATE OK (0 skips, 0 errors)")
    return ok, lines


def flux_smoke(prompts, timeout=1800, busy_wait=600):
    """Pipeline smoke: generate the fixed neutral chariot-wheel prompt via the god_checkpoint
    Flux profile at seed 71599, writing assets/sprites/_gen/gods/_smoke/smoke_s71599.png +
    sidecar. Waits for an idle /queue first, exactly like run_one. Prints "secs=" on success.
    """
    profile_name = prompts["god_checkpoint"]
    profile = prompts["checkpoints"][profile_name]
    width, height = prompts.get("god_size_flux") or prompts["god_size"]

    out_dir = os.path.join(ROOT, "assets", "sprites", "_gen", "gods", "_smoke")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"smoke_s{FLUX_SMOKE_SEED}.png")

    stats = cc.system_stats()
    comfyui_version = stats.get("system", {}).get("comfyui_version")

    graph = cc.build_flux_gguf_graph(
        FLUX_SMOKE_PROMPT, FLUX_SMOKE_SEED, width, height,
        steps=profile.get("steps", 4), cfg=profile.get("cfg", 1.0),
        sampler=profile.get("sampler", "euler"), scheduler=profile.get("scheduler", "simple"),
        unet=profile["file"], t5=profile["t5"], clip_l=profile["clip_l"], vae=profile["vae"],
        clip_type=profile.get("clip_type", "flux"))
    params = {
        "positive": FLUX_SMOKE_PROMPT, "negative": "", "seed": FLUX_SMOKE_SEED,
        "width": width, "height": height, "steps": profile.get("steps", 4), "cfg": profile.get("cfg", 1.0),
        "sampler": profile.get("sampler", "euler"), "scheduler": profile.get("scheduler", "simple"),
        "checkpoint": profile["file"], "checkpoint_label": profile["label"],
        "checkpoint_profile": profile_name, "graph_type": "flux_gguf",
        "text_encoders": [profile["t5"], profile["clip_l"]], "vae": profile["vae"],
        "custom_nodes": profile.get("custom_node", {}),
    }

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
        print("WAITING flux-smoke — ComfyUI busy (another job running)", file=sys.stderr)
        time.sleep(poll_s)
        waited += poll_s

    start = time.time()
    prompt_id = cc.queue_prompt(graph)
    print(f"Queued flux-smoke prompt_id={prompt_id}", file=sys.stderr)
    history_entry = cc.wait_for(prompt_id, timeout_s=timeout)
    cc.download_first_image(history_entry, out_path)
    cc.write_sidecar(out_path, graph, params, prompt_id, comfyui_version=comfyui_version)
    secs = time.time() - start
    print(f"secs={secs:.1f}")
    return out_path


def main():
    ap = argparse.ArgumentParser(description="Generate one subject via ComfyUI using locked prompts.json data.")
    ap.add_argument("key", nargs="?", default=None, help="Not required with --flux-smoke.")
    ap.add_argument("--attempt", type=int, default=0)
    ap.add_argument("--wait-only", dest="wait_only", default=None)
    ap.add_argument("--timeout", type=int, default=540)
    ap.add_argument("--busy-wait", dest="busy_wait", type=int, default=600,
                     help="Max seconds to wait for /queue to drain before queueing (serialization safety).")
    ap.add_argument("--ckpt-profile", dest="ckpt_profile", default=None,
                     help="Override the checkpoint profile (env/god subjects; for A/B or forcing legacy SDXL).")
    ap.add_argument("--dry-run", dest="dry_run", action="store_true",
                     help="Print the resolved prompt/size/profile as JSON without contacting ComfyUI.")
    ap.add_argument("--validate", dest="validate", action="store_true",
                     help="With --dry-run on a Flux god subject: validate the resolved graph against "
                          "/object_info (grep-based static fallback for GGUF classes pre-restart).")
    ap.add_argument("--flux-smoke", dest="flux_smoke", action="store_true",
                     help="Generate the fixed-prompt Flux pipeline smoke image (seed 71599); ignores key.")
    args = ap.parse_args()

    prompts = load_prompts()

    if args.flux_smoke:
        timeout = args.timeout if args.timeout != 540 else 1800
        try:
            out_path = flux_smoke(prompts, timeout=timeout, busy_wait=args.busy_wait)
        except RuntimeError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)
        except TimeoutError as e:
            print(f"TIMEOUT: {e}", file=sys.stderr)
            sys.exit(2)
        print(out_path)
        return

    if not args.key:
        print("ERROR: key is required unless --flux-smoke is used", file=sys.stderr)
        sys.exit(1)

    try:
        kind, pos, neg, width, height = build_prompt(prompts, args.key, ckpt_profile=args.ckpt_profile)
        entry = resolve_entry(prompts, args.key)
    except KeyError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        profile = resolve_profile(prompts, args.key, entry, kind, args.ckpt_profile)
        seed = seed_for(entry, args.attempt, profile)
        ckpt, ckpt_label, sampler, scheduler, steps, cfg, profile_name = resolve_checkpoint(
            prompts, args.key, entry, kind, args.ckpt_profile)

        is_flux = bool(profile and profile.get("graph") == "flux_gguf")
        if is_flux:
            words = len(pos.split())
            print(f"graph=flux_gguf seed={seed} negative={neg!r} words={words}")
            for warn in lint_prompt(pos):
                print(f"LINT: {warn}")
            if args.validate:
                graph = cc.build_flux_gguf_graph(
                    pos, seed, width, height, steps=steps, cfg=cfg, sampler=sampler, scheduler=scheduler,
                    unet=ckpt, t5=profile["t5"], clip_l=profile["clip_l"], vae=profile["vae"],
                    clip_type=profile.get("clip_type", "flux"))
                _ok, lines = validate_flux_graph(graph, profile.get("clip_type", "flux"))
                for line in lines:
                    print(line)

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
