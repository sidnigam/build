#!/usr/bin/env python3
"""
recover_sources.py — recover the original full-resolution SDXL outputs for the 13 character
atlases (player + 8 enemies + 4 bosses) from ComfyUI's output folder, by matching the
PNG-embedded ComfyUI `prompt` metadata (seed + exact positive-prompt text + size) against
`assets/sprites/PROVENANCE.json`. No new generation happens here.

Usage:
  python tools/art/recover_sources.py [--output-dir ~/ComfyUI/output]
                                       [--provenance assets/sprites/PROVENANCE.json]
                                       [--gen-dir assets/sprites/_gen]
                                       [--allow-regen]

For every boss/enemy PROVENANCE entry, scans every *.png in --output-dir, reads its
ComfyUI-embedded `prompt` graph, finds the KSampler node, resolves the seed and the exact
text of the CLIPTextEncode node wired to KSampler's `positive` input, and matches on
(seed, prompt text, width, height). When several files match, the latest-mtime one wins.

The player's four img2img idle frames are matched by filename prefix `player_idle_frame_`
plus KSampler denoise == 0.35 and seed in {40011..40014}, ordered ascending by seed into
player_idle_0..3.

Matches are copied to assets/sprites/_gen/<enemies|bosses|player>/<actor>/<actor>_s<seed>.png
(gitignored — a `*` .gitignore lives in _gen/). assets/sprites/_gen/recovered.json records,
per actor: src, dst, seed, denoise, sha256, match_method.

Exits non-zero and lists unmatched actors. Pixel verification of the match happens later,
in rebuild_atlases.py --legacy-check.

Fallback for unmatched actors (--allow-regen only; OFF by default — this plan does not use
ComfyUI/GPU generation): would call gen_subject.py <key> --attempt N with N chosen so the
seed equals the recorded seed. Requires ComfyUI to be up at :8188. Left disabled by default
so an unmatched actor is always reported, never silently regenerated.
"""
import argparse
import hashlib
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from PIL import Image

DEFAULT_OUTPUT_DIR = os.path.expanduser("~/ComfyUI/output")
DEFAULT_PROVENANCE = "assets/sprites/PROVENANCE.json"
DEFAULT_GEN_DIR = "assets/sprites/_gen"

PLAYER_ACTOR = "player"
PLAYER_FILE_PREFIX = "player_idle_frame_"
PLAYER_SEEDS = [40011, 40012, 40013, 40014]  # ordered -> player_idle_0..3
PLAYER_DENOISE = 0.35

KIND_DIR = {"boss": "bosses", "enemy": "enemies", PLAYER_ACTOR: "player"}


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_ksampler(graph):
    """Return (node_id, inputs) for the first KSampler node in a ComfyUI API graph dict."""
    for node_id, node in graph.items():
        if node.get("class_type") == "KSampler":
            return node_id, node["inputs"]
    return None, None


def resolve_positive_text(graph, inputs):
    """Follow KSampler.inputs.positive (a [node_id, slot] link) to its CLIPTextEncode text."""
    positive = inputs.get("positive")
    if not isinstance(positive, list) or not positive:
        return None
    src_id = str(positive[0])
    src_node = graph.get(src_id)
    if not src_node:
        return None
    return src_node.get("inputs", {}).get("text")


def scan_output_dir(output_dir):
    """Scan every *.png in output_dir and return a list of candidate dicts (one per file that
    carries ComfyUI prompt metadata with a KSampler node). Non-ComfyUI / non-KSampler PNGs are
    silently skipped."""
    candidates = []
    out_path = Path(output_dir)
    if not out_path.is_dir():
        print(f"ERROR: ComfyUI output dir not found: {output_dir}", file=sys.stderr)
        return candidates

    for f in sorted(out_path.glob("*.png")):
        try:
            with Image.open(f) as im:
                raw_prompt = im.info.get("prompt")
                size = im.size
        except Exception:
            continue
        if not raw_prompt:
            continue
        try:
            graph = json.loads(raw_prompt)
        except Exception:
            continue
        node_id, inputs = find_ksampler(graph)
        if inputs is None:
            continue
        text = resolve_positive_text(graph, inputs)
        candidates.append({
            "path": str(f),
            "name": f.name,
            "seed": inputs.get("seed"),
            "denoise": inputs.get("denoise", 1.0),
            "text": text,
            "width": size[0],
            "height": size[1],
            "mtime": f.stat().st_mtime,
        })
    return candidates


def match_actor(entry, candidates):
    """Match one PROVENANCE boss/enemy entry against the scanned candidates on
    (seed, exact prompt text, width, height). Returns the best candidate dict or None."""
    seed = entry.get("seed")
    prompt = entry.get("prompt")
    width = entry.get("width")
    height = entry.get("height")
    matches = [
        c for c in candidates
        if c["seed"] == seed and c["text"] == prompt and c["width"] == width and c["height"] == height
    ]
    if not matches:
        return None, []
    matches.sort(key=lambda c: c["mtime"])
    return matches[-1], matches


def match_player(candidates):
    """Match the player's four img2img idle frames by filename prefix, denoise==0.35 and
    seed in PLAYER_SEEDS. Returns an ordered list of 4 candidate dicts (idle_0..3), or a list
    with fewer entries for seeds that are missing."""
    pool = [
        c for c in candidates
        if c["name"].startswith(PLAYER_FILE_PREFIX)
        and abs(c["denoise"] - PLAYER_DENOISE) < 1e-6
        and c["seed"] in PLAYER_SEEDS
    ]
    by_seed = {}
    for c in pool:
        # Latest mtime wins per seed.
        if c["seed"] not in by_seed or c["mtime"] > by_seed[c["seed"]]["mtime"]:
            by_seed[c["seed"]] = c
    return [by_seed.get(s) for s in PLAYER_SEEDS]


def copy_match(match, actor, kind_dir, gen_dir, idx=None):
    actor_dir = Path(gen_dir) / kind_dir / actor
    actor_dir.mkdir(parents=True, exist_ok=True)
    seed = match["seed"]
    if idx is not None:
        dst = actor_dir / f"{actor}_idle_{idx}_s{seed}.png"
    else:
        dst = actor_dir / f"{actor}_s{seed}.png"
    with open(match["path"], "rb") as src_f, open(dst, "wb") as dst_f:
        dst_f.write(src_f.read())
    return dst


def ensure_gen_gitignore(gen_dir):
    """Confirm _gen/.gitignore ignores everything under it. Does not overwrite an existing
    file (the committed one additionally un-ignores itself with `!.gitignore` so the
    gitignore stays tracked — only create a fresh one if missing)."""
    gi = Path(gen_dir) / ".gitignore"
    gi.parent.mkdir(parents=True, exist_ok=True)
    if not gi.exists():
        gi.write_text("*\n!.gitignore\n")
        return
    lines = [l.strip() for l in gi.read_text().splitlines() if l.strip()]
    if "*" not in lines:
        print(f"WARNING: {gi} does not contain a bare '*' ignore rule — check it manually", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    ap.add_argument("--provenance", default=DEFAULT_PROVENANCE)
    ap.add_argument("--gen-dir", default=DEFAULT_GEN_DIR)
    ap.add_argument("--allow-regen", action="store_true",
                     help="Disabled by default. This plan does not use ComfyUI/GPU generation.")
    args = ap.parse_args()

    ensure_gen_gitignore(args.gen_dir)

    with open(args.provenance) as f:
        provenance = json.load(f)

    candidates = scan_output_dir(args.output_dir)
    print(f"Scanned {len(candidates)} ComfyUI-metadata PNGs in {args.output_dir}")

    recovered = {}
    unmatched = []

    # Bosses + enemies.
    for entry in provenance["assets"]:
        kind = entry.get("kind")
        if kind not in ("boss", "enemy"):
            continue
        actor = entry["actor"]
        best, all_matches = match_actor(entry, candidates)
        if best is None:
            unmatched.append(actor)
            continue
        dst = copy_match(best, actor, KIND_DIR[kind], args.gen_dir)
        recovered[actor] = {
            "kind": kind,
            "src": best["path"],
            "dst": str(dst),
            "seed": best["seed"],
            "denoise": best["denoise"],
            "sha256": sha256_of(dst),
            "match_method": "seed+exact_prompt+size",
            "ambiguous_candidates": len(all_matches),
        }
        if len(all_matches) > 1:
            print(f"  note: {actor} had {len(all_matches)} equally-matching candidates; picked latest mtime")

    # Player (img2img, no kind field, matched by filename + denoise + seed).
    player_matches = match_player(candidates)
    if all(player_matches):
        player_entries = []
        for idx, m in enumerate(player_matches):
            dst = copy_match(m, PLAYER_ACTOR, KIND_DIR[PLAYER_ACTOR], args.gen_dir, idx=idx)
            player_entries.append({
                "idx": idx,
                "src": m["path"],
                "dst": str(dst),
                "seed": m["seed"],
                "denoise": m["denoise"],
                "sha256": sha256_of(dst),
            })
        recovered[PLAYER_ACTOR] = {
            "kind": "player",
            "frames": player_entries,
            "match_method": "filename_prefix+denoise+seed_order",
        }
    else:
        unmatched.append(PLAYER_ACTOR)

    gen_path = Path(args.gen_dir)
    gen_path.mkdir(parents=True, exist_ok=True)
    out_json = gen_path / "recovered.json"
    with open(out_json, "w") as f:
        json.dump({
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "output_dir": args.output_dir,
            "recovered": recovered,
            "unmatched": unmatched,
        }, f, indent=2)
        f.write("\n")

    print(f"Recovered {len(recovered)} actors ({'player + ' if PLAYER_ACTOR in recovered else ''}"
          f"{sum(1 for k in recovered if k != PLAYER_ACTOR)} boss/enemy actors).")
    print(f"Wrote {out_json}")

    if unmatched:
        print(f"UNMATCHED: {unmatched}", file=sys.stderr)
        if args.allow_regen:
            print("ERROR: --allow-regen requested but this script's regeneration fallback is "
                  "intentionally not wired to a live ComfyUI call in this environment. "
                  "Start ComfyUI and use gen_subject.py --attempt N by hand instead.", file=sys.stderr)
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
