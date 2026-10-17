#!/usr/bin/env python3
"""
rebuild_atlases.py — 05.6-03: rebuild the 13 character atlases (player + 8 enemies + 4
bosses) at 2x from the recovered original SDXL/img2img sources, with LANCZOS resizing, an
unsharp mask and a baked dark painted outline. No new generation — every pixel comes from
`assets/sprites/_gen/<kind>/<actor>/...` (written by recover_sources.py).

Modes:
  --legacy-check
      Re-finishes every actor's recovered source at the OLD size with the OLD CLI semantics
      (matte=u2net, no sharpen/outline, margin=4), in both mirror orientations (computed from
      a single cutout — mirror is just a final flip), and diffs each against the committed
      `assets/sprites/_raw/...` frame (via `git show HEAD:...`). Picks the orientation with
      the smaller mean-abs-RGBA diff, requires it under 3.0 (0-255 scale). Writes
      assets/sprites/_gen/legacy_check.json. Writes nothing else; touches nothing in assets/.

  --matte-preview [--only a,b]
      For review only (Task 3's matte comparison, orchestrator amendment): for each actor,
      finishes the recovered source at size_new with u2net AND birefnet-general (no sharpen/
      outline), downscales both to on-screen height (r*4 / r*8), and writes a side-by-side
      comparison PNG to $SCRATCH/matte-preview/<actor>.png. Writes nothing under assets/.

  --build [--only a,b]
      Builds the final 2x `_raw` frames (sharpen + outline, matte per ACTOR_TABLE), the boss
      phase-2 variants at --scale 2, repacks every actor's atlas with --padding 8, runs the
      sanity checks, prints the old-vs-new memory report, and upserts PROVENANCE.json.
      Backs up the pre-rebuild atlases/_raw once to $SCRATCH/old-atlases/ (never overwrites
      that backup on a second run, so the Task 3 tuning loop always diffs against the true
      pre-05.6-03 originals).

  --report
      Prints the old (from $SCRATCH/old-atlases/ if present) vs current atlas dimensions/
      KB/GPU-MB, with totals. No rebuilding.

ACTOR_TABLE's `outline` (px) and `outline_color` are the Claude's-Discretion tuning knobs
for Task 3's review loop (D-19/D-22/D-23). `matte` is set per actor after the
u2net-vs-birefnet-general review (orchestrator amendment).
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import finish_sprite as fsprite  # noqa: E402
import phase2_variant as p2v  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
GEN_DIR = REPO_ROOT / "assets/sprites/_gen"
RAW_DIR = REPO_ROOT / "assets/sprites/_raw"
PROVENANCE_PATH = REPO_ROOT / "assets/sprites/PROVENANCE.json"
SCRATCH = Path(os.environ.get(
    "GSD_SCRATCH",
    "/private/tmp/claude-501/-Users-sidnigam-Documents-coding-build-chakravyuha/"
    "1d54dd11-935d-453d-b5f2-51d5ff78390e/scratchpad",
))
OLD_BACKUP_DIR = SCRATCH / "old-atlases"
LEGACY_CHECK_PATH = GEN_DIR / "legacy_check.json"
LEGACY_DIFF_THRESHOLD = 3.0  # mean abs RGBA diff, 0-255 scale

KIND_DIR = {"player": "player", "enemy": "enemies", "boss": "bosses"}
DEFAULT_OUTLINE_COLOR = "#140b08"
DEFAULT_OUTLINE_ALPHA = 235
DEFAULT_OUTLINE_FEATHER = 0.6
MAX_TOTAL_GPU_MB = 24.0
MIN_HEIGHT_GROWTH = 1.9

# key, kind, r (on-screen HEIGHT_PER_R=4 unit), size_old, size_new, outline px, phase2 mode.
# outline_color/matte default below; override per-actor after the review loop (D-19/D-22,
# orchestrator amendment matte comparison).
ACTOR_TABLE = [
    {"key": "player", "kind": "player", "r": 13, "size_old": 128, "size_new": 256, "outline": 6, "phase2": None},
    {"key": "preta", "kind": "enemy", "r": 11, "size_old": 128, "size_new": 256, "outline": 7, "phase2": None},
    {"key": "rakshasa", "kind": "enemy", "r": 15, "size_old": 128, "size_new": 256, "outline": 5, "phase2": None},
    {"key": "archer", "kind": "enemy", "r": 13, "size_old": 128, "size_new": 256, "outline": 6, "phase2": None},
    {"key": "naga", "kind": "enemy", "r": 14, "size_old": 128, "size_new": 256, "outline": 5, "phase2": None},
    {"key": "vetala", "kind": "enemy", "r": 13, "size_old": 128, "size_new": 256, "outline": 6, "phase2": None},
    {"key": "bhuta", "kind": "enemy", "r": 21, "size_old": 128, "size_new": 256, "outline": 4, "phase2": None},
    {"key": "daitya", "kind": "enemy", "r": 19, "size_old": 128, "size_new": 256, "outline": 4, "phase2": None},
    {"key": "yatudhana", "kind": "enemy", "r": 14, "size_old": 128, "size_new": 256, "outline": 5, "phase2": None},
    {"key": "tataka", "kind": "boss", "r": 34, "size_old": 256, "size_new": 512, "outline": 5, "phase2": "ember"},
    {"key": "ahiravana", "kind": "boss", "r": 30, "size_old": 256, "size_new": 512, "outline": 5, "phase2": "ember"},
    {"key": "kumbhakarna", "kind": "boss", "r": 46, "size_old": 256, "size_new": 512, "outline": 4, "phase2": "ember"},
    {"key": "yama", "kind": "boss", "r": 36, "size_old": 256, "size_new": 512, "outline": 5, "phase2": "divine"},
]
ACTOR_BY_KEY = {a["key"]: a for a in ACTOR_TABLE}

# Per-actor matte choice, set after the u2net-vs-birefnet-general review (orchestrator
# amendment to 05.6-03, per the 05.5-04 god-portrait bake-off finding that birefnet-general
# preserves thin held props/limbs far better than u2net with no new artifacts).
#
# Reviewed all 13 actors side-by-side at game scale (scratchpad/matte-preview/<actor>.png):
# birefnet-general was equal or better for every single one. Clear wins (u2net dropped real
# detail that birefnet kept): archer's bow+arrows, naga's full tail/hood, yatudhana's glowing
# staff-orb, ahiravana's swirling energy ring, yama's danda staff + standing platform.
# Equal-and-cleaner wins (birefnet removed a leftover background smudge/blob that u2net kept,
# with no loss of real detail): vetala, tataka. Visually identical (no difference either way):
# rakshasa, bhuta, daitya, kumbhakarna, player, preta.
MATTE_CHOICE = {a["key"]: "birefnet-general" for a in ACTOR_TABLE}

# Per-actor outline color override (hex), if the default reads wrong on a ghost/glow actor.
OUTLINE_COLOR_OVERRIDE = {}


def actor_matte(key):
    return MATTE_CHOICE.get(key, "u2net")


def actor_outline_color(key):
    return OUTLINE_COLOR_OVERRIDE.get(key, DEFAULT_OUTLINE_COLOR)


# ---- recovered.json access ----

def load_recovered():
    with open(GEN_DIR / "recovered.json") as f:
        return json.load(f)["recovered"]


def actor_frames(actor_key, kind, recovered):
    """Returns a list of (frame_index, src_path) for an actor's idle frame(s)."""
    entry = recovered[actor_key]
    if kind == "player":
        return [(f["idx"], f["src"]) for f in entry["frames"]]
    return [(0, entry["src"])]


def raw_frame_path(actor_key, kind, frame_idx, size_tag=""):
    if kind == "player":
        return RAW_DIR / "player" / f"player_idle_{frame_idx}.png"
    return RAW_DIR / KIND_DIR[kind] / actor_key / f"{actor_key}_idle_{frame_idx}.png"


def phase2_frame_path(actor_key, kind):
    return RAW_DIR / KIND_DIR[kind] / actor_key / f"{actor_key}_phase2_0.png"


_GIT_TOPLEVEL = None


def git_toplevel():
    global _GIT_TOPLEVEL
    if _GIT_TOPLEVEL is None:
        out = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=REPO_ROOT,
                              capture_output=True, check=True, text=True)
        _GIT_TOPLEVEL = Path(out.stdout.strip())
    return _GIT_TOPLEVEL


def git_show_bytes(rel_path):
    """rel_path is relative to REPO_ROOT (the project dir). The git worktree's toplevel may be
    a parent of REPO_ROOT (this project lives in a `chakravyuha/` subdir of the worktree), so
    resolve the path actually relative to the git toplevel before calling `git show`."""
    try:
        abs_path = (REPO_ROOT / rel_path).resolve()
        git_rel = abs_path.relative_to(git_toplevel())
        out = subprocess.run(["git", "show", f"HEAD:{git_rel.as_posix()}"], cwd=REPO_ROOT,
                              capture_output=True, check=True)
        return out.stdout
    except subprocess.CalledProcessError:
        return None


def mean_abs_diff(img_a, img_b):
    a = np.array(img_a.convert("RGBA")).astype(np.float64)
    b = np.array(img_b.convert("RGBA")).astype(np.float64)
    if a.shape != b.shape:
        return float("inf")
    return float(np.abs(a - b).mean())


def rel(path):
    return str(Path(path).resolve().relative_to(REPO_ROOT))


# ---- core pipeline (in-process, so rembg sessions are cached across many calls) ----

def finish_once(src_path, matte, size, margin, sharpen=False, outline_px=0,
                 outline_color=DEFAULT_OUTLINE_COLOR, outline_alpha=DEFAULT_OUTLINE_ALPHA,
                 outline_feather=DEFAULT_OUTLINE_FEATHER):
    """cutout -> clean -> despeckle -> fit -> [sharpen] -> [outline]. No mirror (apply with
    .transpose(Image.FLIP_LEFT_RIGHT) on the result if needed — mirror is always the last
    step, so it commutes with being applied after this call)."""
    cut = fsprite.load_and_cutout(src_path, matte=matte)
    cut = fsprite.clean_alpha(cut)
    cut = fsprite.despeckle(cut)
    fitted, bbox = fsprite.fit_bottom_aligned(cut, size, margin=margin)
    if sharpen:
        fitted = fsprite.sharpen_rgba(fitted)
    if outline_px > 0:
        color = fsprite.parse_hex_color(outline_color)
        fitted = fsprite.add_outline(fitted, outline_px, color=color, alpha=outline_alpha, feather=outline_feather)
    return fitted, bbox


def trimmed_content_height(img):
    alpha = np.array(img)[:, :, 3]
    ys, _ = np.where(alpha > 0)
    if len(ys) == 0:
        return 0
    return int(ys.max()) - int(ys.min()) + 1


# ---- --legacy-check ----

def legacy_check():
    recovered = load_recovered()
    results = {}
    bad = []

    for actor in ACTOR_TABLE:
        key, kind = actor["key"], actor["kind"]
        frames = actor_frames(key, kind, recovered)
        per_frame = []
        normal_diffs, mirror_diffs = [], []

        for frame_idx, src in frames:
            fitted, _ = finish_once(src, matte="u2net", size=actor["size_old"], margin=4)
            mirrored = fitted.transpose(Image.FLIP_LEFT_RIGHT)

            committed_path = raw_frame_path(key, kind, frame_idx)
            committed_bytes = git_show_bytes(rel(committed_path))
            if committed_bytes is None:
                per_frame.append({"frame": frame_idx, "error": "no committed HEAD frame found"})
                continue
            committed_img = Image.open(__import__("io").BytesIO(committed_bytes))

            d_normal = mean_abs_diff(fitted, committed_img)
            d_mirror = mean_abs_diff(mirrored, committed_img)
            normal_diffs.append(d_normal)
            mirror_diffs.append(d_mirror)
            per_frame.append({"frame": frame_idx, "diff_normal": d_normal, "diff_mirror": d_mirror})

        if not normal_diffs:
            results[key] = {"ok": False, "error": "no frames compared", "frames": per_frame}
            bad.append(key)
            continue

        mean_normal = float(np.mean(normal_diffs))
        mean_mirror = float(np.mean(mirror_diffs))
        chosen_mirror = mean_mirror < mean_normal
        chosen_diff = mean_mirror if chosen_mirror else mean_normal
        ok = chosen_diff < LEGACY_DIFF_THRESHOLD

        results[key] = {
            "ok": ok,
            "diff_normal": mean_normal,
            "diff_mirror": mean_mirror,
            "chosen_mirror": chosen_mirror,
            "chosen_diff": chosen_diff,
            "frames": per_frame,
        }
        if not ok:
            bad.append(key)

    GEN_DIR.mkdir(parents=True, exist_ok=True)
    with open(LEGACY_CHECK_PATH, "w") as f:
        json.dump(results, f, indent=2)
        f.write("\n")

    print(f"Wrote {LEGACY_CHECK_PATH}")
    for key, r in results.items():
        if "error" in r:
            print(f"  {key}: ERROR {r['error']}")
        else:
            print(f"  {key}: diff_normal={r['diff_normal']:.3f} diff_mirror={r['diff_mirror']:.3f} "
                  f"chosen_mirror={r['chosen_mirror']} ok={r['ok']}")
    if bad:
        print(f"legacy-check FAILED for: {bad}", file=sys.stderr)
        return 1
    print("legacy-check: ALL ACTORS OK")
    return 0


# ---- --matte-preview ----

def matte_preview(only=None):
    recovered = load_recovered()
    out_dir = SCRATCH / "matte-preview"
    out_dir.mkdir(parents=True, exist_ok=True)

    actors = ACTOR_TABLE if not only else [a for a in ACTOR_TABLE if a["key"] in only]
    for actor in actors:
        key, kind, r = actor["key"], actor["kind"], actor["r"]
        frames = actor_frames(key, kind, recovered)
        _, src = frames[0]  # idle frame 0 is representative
        size_new = actor["size_new"]

        u2 = finish_once(src, matte="u2net", size=size_new, margin=4)[0]
        bf = finish_once(src, matte="birefnet-general", size=size_new, margin=4)[0]

        on_screen_h = max(8, r * 4)  # res-1 on-screen height
        scale = on_screen_h / size_new
        w = max(1, round(size_new * scale))
        u2_small = u2.resize((w, on_screen_h), Image.LANCZOS)
        bf_small = bf.resize((w, on_screen_h), Image.LANCZOS)

        pad = 8
        zoom = 4
        canvas = Image.new("RGBA", (w * 2 * zoom + pad * 3, on_screen_h * zoom + pad * 2), (90, 90, 90, 255))
        canvas.paste(u2_small.resize((w * zoom, on_screen_h * zoom), Image.NEAREST), (pad, pad), u2_small.resize((w * zoom, on_screen_h * zoom), Image.NEAREST))
        canvas.paste(bf_small.resize((w * zoom, on_screen_h * zoom), Image.NEAREST), (pad * 2 + w * zoom, pad), bf_small.resize((w * zoom, on_screen_h * zoom), Image.NEAREST))
        out_path = out_dir / f"{key}.png"
        canvas.convert("RGB").save(out_path, "PNG")
        print(f"{key}: u2net (left) vs birefnet-general (right) -> {out_path}")

    print(f"matte-preview written to {out_dir}")
    return 0


# ---- --build ----

def backup_old_once():
    if OLD_BACKUP_DIR.exists():
        return
    OLD_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    for sub in ("player", "enemies", "bosses"):
        src_atlas = REPO_ROOT / "assets/sprites" / sub
        if src_atlas.exists():
            dst = OLD_BACKUP_DIR / "assets" / sub
            dst.mkdir(parents=True, exist_ok=True)
            for f in src_atlas.glob("*"):
                if f.is_file():
                    (dst / f.name).write_bytes(f.read_bytes())
    for sub in ("player", "enemies", "bosses"):
        src_raw = RAW_DIR / sub
        if src_raw.exists():
            dst = OLD_BACKUP_DIR / "_raw" / sub
            for root, _, files in os.walk(src_raw):
                rel_root = Path(root).relative_to(src_raw)
                for fname in files:
                    out_f = dst / rel_root / fname
                    out_f.parent.mkdir(parents=True, exist_ok=True)
                    out_f.write_bytes((Path(root) / fname).read_bytes())
    print(f"Backed up pre-rebuild atlases + _raw to {OLD_BACKUP_DIR}")


def load_legacy_check():
    with open(LEGACY_CHECK_PATH) as f:
        return json.load(f)


def atlas_png_path(kind, actor_key):
    return REPO_ROOT / "assets/sprites" / KIND_DIR[kind] / f"{actor_key}-atlas.png"


def atlas_json_path(kind, actor_key):
    return REPO_ROOT / "assets/sprites" / KIND_DIR[kind] / f"{actor_key}-atlas.json"


def old_atlas_json_path(kind, actor_key):
    return OLD_BACKUP_DIR / "assets" / KIND_DIR[kind] / f"{actor_key}-atlas.json"


def build_one(actor, legacy, raw_input_cache):
    key, kind = actor["key"], actor["kind"]
    size_new, outline_px = actor["size_new"], actor["outline"]
    matte = actor_matte(key)
    outline_color = actor_outline_color(key)
    margin = 4 + outline_px

    recovered = raw_input_cache["recovered"]
    frames = actor_frames(key, kind, recovered)
    mirror = legacy.get(key, {}).get("chosen_mirror", False)

    raw_dir = RAW_DIR / "player" if kind == "player" else RAW_DIR / KIND_DIR[kind] / key
    raw_dir.mkdir(parents=True, exist_ok=True)

    old_height = None
    old_frame_path = raw_frame_path(key, kind, frames[0][0])
    old_bytes = None
    if OLD_BACKUP_DIR.exists():
        if kind == "player":
            old_candidate = OLD_BACKUP_DIR / "_raw" / "player" / old_frame_path.name
        else:
            old_candidate = OLD_BACKUP_DIR / "_raw" / KIND_DIR[kind] / key / old_frame_path.name
        if old_candidate.exists():
            old_bytes = old_candidate.read_bytes()
    if old_bytes is None:
        old_bytes = git_show_bytes(rel(old_frame_path))
    if old_bytes:
        old_img = Image.open(__import__("io").BytesIO(old_bytes))
        old_height = trimmed_content_height(old_img)

    idle_path_for_phase2 = None
    for frame_idx, src in frames:
        fitted, bbox = finish_once(
            src, matte=matte, size=size_new, margin=margin,
            sharpen=True, outline_px=outline_px, outline_color=outline_color,
        )
        if mirror:
            fitted = fitted.transpose(Image.FLIP_LEFT_RIGHT)

        # Sanity: no alpha on the border rows/cols (outline must not clip the frame edge).
        arr = np.array(fitted)
        border_alpha = np.concatenate([
            arr[0, :, 3], arr[-1, :, 3], arr[:, 0, 3], arr[:, -1, 3],
        ])
        if border_alpha.max() > 0:
            print(f"WARNING: {key} idle_{frame_idx} has non-zero alpha on the frame border "
                  f"(max={int(border_alpha.max())}) — outline may clip; consider a larger margin.",
                  file=sys.stderr)

        out_path = raw_frame_path(key, kind, frame_idx)
        fitted.save(out_path, "PNG")
        if frame_idx == 0:
            idle_path_for_phase2 = out_path

        if old_height is not None:
            new_height = trimmed_content_height(fitted)
            growth = new_height / old_height if old_height > 0 else float("inf")
            if growth < MIN_HEIGHT_GROWTH:
                print(f"WARNING: {key} idle_{frame_idx} height growth {growth:.2f}x "
                      f"(< {MIN_HEIGHT_GROWTH}x minimum)", file=sys.stderr)

    phase2_path = None
    if actor["phase2"]:
        mode = actor["phase2"]
        src_idle = Image.open(idle_path_for_phase2).convert("RGBA")
        if mode == "ember":
            result = p2v.apply_ember(src_idle, scale=2.0)
        else:
            result = p2v.apply_divine(src_idle, scale=2.0)
        phase2_path = phase2_frame_path(key, kind)
        result.save(phase2_path, "PNG")

    # Pack.
    out_assets_dir = REPO_ROOT / "assets/sprites" / KIND_DIR[kind]
    subprocess.run([
        "node", str(REPO_ROOT / "tools/pack-atlas.js"),
        str(raw_dir), f"{key}-atlas", str(out_assets_dir), "--padding", "8",
    ], cwd=REPO_ROOT, check=True)

    # Assert animation keys unchanged vs the pre-rebuild backup.
    old_json_path = old_atlas_json_path(kind, key)
    new_json_path = atlas_json_path(kind, key)
    with open(new_json_path) as f:
        new_atlas = json.load(f)
    if old_json_path.exists():
        with open(old_json_path) as f:
            old_atlas = json.load(f)
        if set(old_atlas.get("animations", {}).keys()) != set(new_atlas.get("animations", {}).keys()):
            print(f"ERROR: {key} animation keys changed: "
                  f"{list(old_atlas.get('animations', {}).keys())} -> {list(new_atlas.get('animations', {}).keys())}",
                  file=sys.stderr)
            return None

    return {
        "key": key, "kind": kind, "matte": matte, "outline_px": outline_px,
        "outline_color": outline_color, "margin": margin, "mirror": mirror,
        "phase2_mode": actor["phase2"], "new_atlas": new_atlas,
    }


POST_PROCESSING_STEPS = lambda size_new, margin, matte, outline_px, outline_color, phase2_mode: [
    f"rembg {matte} background removal",
    "alpha despeckle + trim",
    f"bottom-aligned LANCZOS fit to {size_new}x{size_new} (margin {margin})",
    "color-bleed + UnsharpMask r=1.2 p=60 t=2 (RGB only)",
    f"baked outline: disk dilation {outline_px} px, {outline_color} a=235, 0.6px feather, under sprite",
] + ([f"phase2: tools/art/phase2_variant.py --mode {phase2_mode} --scale 2"] if phase2_mode else []) + [
    "free-tex-packer-core via tools/pack-atlas.js (trim, 8px padding)",
]


def update_provenance(build_results, recovered):
    with open(PROVENANCE_PATH) as f:
        provenance = json.load(f)

    by_actor = {}
    for entry in provenance["assets"]:
        actor = entry.get("actor")
        if actor:
            by_actor.setdefault(actor, entry)

    today = date.today().isoformat()
    for r in build_results:
        key = r["key"]
        entry = by_actor.get(key)
        if entry is None:
            print(f"WARNING: no PROVENANCE entry found for actor {key}", file=sys.stderr)
            continue

        size_new = ACTOR_BY_KEY[key]["size_new"]
        steps = POST_PROCESSING_STEPS(size_new, r["margin"], r["matte"], r["outline_px"],
                                       r["outline_color"], r["phase2_mode"])
        entry["post_processing"] = steps
        entry["repacked_phase"] = "05.6"
        entry["repacked_date"] = today

        rec = recovered.get(key, {})
        if key == "player":
            src_names = [Path(f["src"]).name for f in rec.get("frames", [])]
            entry["source_recovered_from"] = (
                f"{', '.join(src_names)} — PNG-embedded ComfyUI prompt metadata matched by "
                f"filename prefix + denoise + seed order; no regeneration"
            )
            entry["seeds"] = [f["seed"] for f in rec.get("frames", [])]
        else:
            src_name = Path(rec.get("src", "")).name
            entry["source_recovered_from"] = (
                f"{src_name} — PNG-embedded ComfyUI prompt metadata matched seed+prompt+size; "
                f"no regeneration"
            )

    with open(PROVENANCE_PATH, "w") as f:
        json.dump(provenance, f, indent=2)
        f.write("\n")
    print(f"Updated PROVENANCE.json for {len(build_results)} actors")


def gpu_mb(w, h, mipmaps=True):
    base = w * h * 4 / (1024 * 1024)
    return base * 1.33 if mipmaps else base


def memory_report(build_results=None):
    rows = []
    total_old = 0.0
    total_new = 0.0
    for actor in ACTOR_TABLE:
        key, kind = actor["key"], actor["kind"]
        new_png = atlas_png_path(kind, key)
        old_png = OLD_BACKUP_DIR / "assets" / KIND_DIR[kind] / f"{key}-atlas.png"

        new_w = new_h = old_w = old_h = None
        new_kb = old_kb = None
        if new_png.exists():
            with Image.open(new_png) as im:
                new_w, new_h = im.size
            new_kb = new_png.stat().st_size / 1024
        if old_png.exists():
            with Image.open(old_png) as im:
                old_w, old_h = im.size
            old_kb = old_png.stat().st_size / 1024

        new_mb = gpu_mb(new_w, new_h) if new_w else 0.0
        old_mb = gpu_mb(old_w, old_h) if old_w else 0.0
        total_new += new_mb
        total_old += old_mb
        rows.append((key, old_w, old_h, old_kb, old_mb, new_w, new_h, new_kb, new_mb))

    print(f"{'actor':<14}{'old dims':<12}{'old KB':<10}{'old MB':<10}{'new dims':<12}{'new KB':<10}{'new MB':<10}")
    for key, ow, oh, okb, omb, nw, nh, nkb, nmb in rows:
        old_dims = f"{ow}x{oh}" if ow else "-"
        new_dims = f"{nw}x{nh}" if nw else "-"
        okb_s = f"{okb:.0f}" if okb is not None else "-"
        nkb_s = f"{nkb:.0f}" if nkb is not None else "-"
        print(f"{key:<14}{old_dims:<12}{okb_s:<10}{omb:<10.2f}{new_dims:<12}{nkb_s:<10}{nmb:<10.2f}")
    print(f"{'TOTAL':<14}{'':<12}{'':<10}{total_old:<10.2f}{'':<12}{'':<10}{total_new:<10.2f}")
    if total_new > MAX_TOTAL_GPU_MB:
        print(f"ERROR: new total GPU MB {total_new:.2f} exceeds the {MAX_TOTAL_GPU_MB} MB cap", file=sys.stderr)
        return False, total_old, total_new
    return True, total_old, total_new


def build(only=None):
    GEN_DIR.mkdir(parents=True, exist_ok=True)
    backup_old_once()
    legacy = load_legacy_check()
    recovered = load_recovered()

    actors = ACTOR_TABLE if not only else [a for a in ACTOR_TABLE if a["key"] in only]
    results = []
    for actor in actors:
        r = build_one(actor, legacy, {"recovered": recovered})
        if r is None:
            print(f"BUILD FAILED for {actor['key']}", file=sys.stderr)
            return 1
        results.append(r)
        print(f"Built {actor['key']}: matte={r['matte']} outline={r['outline_px']}px "
              f"mirror={r['mirror']} animations={list(r['new_atlas'].get('animations', {}).keys())}")

    update_provenance(results, recovered)
    ok, total_old, total_new = memory_report(results)
    print(f"\nMemory report: old total {total_old:.2f} MB -> new total {total_new:.2f} MB")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--legacy-check", action="store_true")
    ap.add_argument("--matte-preview", action="store_true")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--only", default=None, help="Comma-separated actor keys.")
    args = ap.parse_args()

    only = set(args.only.split(",")) if args.only else None

    if args.legacy_check:
        sys.exit(legacy_check())
    if args.matte_preview:
        sys.exit(matte_preview(only))
    if args.build:
        sys.exit(build(only))
    if args.report:
        ok, _, _ = memory_report()
        sys.exit(0 if ok else 1)

    print("Specify one of --legacy-check / --matte-preview / --build / --report", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
