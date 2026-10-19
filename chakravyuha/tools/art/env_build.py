#!/usr/bin/env python3
"""
env_build.py — per-biome env-art build (Phase 05.4 D-10a): finish accepted generations into
tiles + graded cutout frames, pack an atlas, write/merge the manifest, upsert provenance.

Usage:
  python tools/art/env_build.py BIOME [--check] [--only key,key]

For each subject in prompts.json env_subjects[BIOME] with an `accepted_attempt`:
  - locate the raw generation assets/sprites/_gen/env/{biome}/{key}/{key}_s{seed}.png and its
    .gen.json sidecar (seed = base_seed + accepted_attempt; no --ckpt-profile suffix, since an
    accepted biome build is never an A/B pair).
  - finish it by role via finish_env.py (tile/strip/prop/decal), write the tile or frame,
    copy the sidecar under _raw/env/{biome}/.
  - pack assets/sprites/_raw/env/{biome}/frames into {biome}-env-atlas via tools/pack-atlas.js.
  - write_manifest(): build assets/sprites/env/{biome}/{biome}-env.json, tuning-preserving
    merged with any existing manifest (finish_env.merge_manifest).
  - upsert PROVENANCE.json: one env-tile entry per tile, one env-prop entry per frame, one
    env-atlas entry with `components` = the atlas JSON's frame names.

--check prints a table (subject, accepted?, attempts present on disk, missing review fields)
without building anything — used to confirm subjects are/aren't ready before a real build.

--only key,key restricts the build to specific subject keys (still requires accepted_attempt).
"""
import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_subject as gs
import finish_env as fe
from record_provenance import upsert_entry, entry_from_sidecar

ROOT = gs.ROOT
PROMPTS_PATH = gs.PROMPTS_PATH
PROVENANCE_PATH = os.path.join(ROOT, "assets", "sprites", "PROVENANCE.json")
MAX_ATTEMPTS_ENV = 5

ROLE_DEFAULTS = {
    "column": {"worldH": 150, "anchor": [0.5, 0.96]},
    "gate": {"worldH": 210, "anchor": [0.5, 1.0]},
    "prop": {"worldH": 64, "zones": ["north", "west", "east", "corner"], "weight": 1, "low": False},
    "decal": {"worldW": 180, "alpha": 0.45},
    "hazard-skin": {},
}

DEFAULT_TOP_BLOCKS = {
    "floor": {"tileScale": 0.6, "macroScale": 1.7, "macroAlpha": 0.35},
    "walls": {"faceH": 170, "capT": 48, "lipT": 36, "columnSpacing": [260, 380]},
    "lights": {"pools": {"color": "#ff5533", "count": [2, 4], "r": [160, 260], "alpha": 0.08},
               "shafts": None, "mist": None},
    "grade": {"floorTint": 0.55, "floorDarken": 0.25, "outerDim": 0.6, "vignette": 0.4, "propTint": "#d8d0cc"},
}


def _load_prompts():
    return gs.load_prompts()


def _raw_paths(biome, key, accepted_attempt):
    subjects = gs.load_prompts().get("env_subjects", {}).get(biome, {})
    entry = subjects[key]
    seed = entry["base_seed"] + accepted_attempt
    raw_dir = os.path.join(ROOT, "assets", "sprites", "_gen", "env", biome, key)
    raw_png = os.path.join(raw_dir, f"{key}_s{seed}.png")
    raw_sidecar = raw_png.rsplit(".png", 1)[0] + ".gen.json"
    return raw_png, raw_sidecar, seed


def check_biome(prompts, biome):
    subjects = prompts.get("env_subjects", {}).get(biome, {})
    if not subjects:
        print(f"No env_subjects for biome {biome!r}")
        return
    rows = []
    for key, entry in subjects.items():
        accepted = entry.get("accepted_attempt")
        attempts_present = []
        for attempt in range(MAX_ATTEMPTS_ENV):
            _kind, seed, out_path = gs.output_path_for(prompts, f"{biome}:{key}", attempt=attempt)
            if os.path.exists(out_path):
                attempts_present.append(attempt)
        missing = []
        for f in ("role", "ground_safe"):
            if f not in entry:
                missing.append(f)
        if accepted is not None:
            if not entry.get("cultural_check"):
                missing.append("cultural_check")
            if not entry.get("self_review"):
                missing.append("self_review")
        rows.append((key, "yes" if accepted is not None else "no", attempts_present, missing))

    width = max((len(k) for k, *_ in rows), default=7)
    print(f"{'subject':<{width}}  accepted  attempts_present         missing")
    for key, acc, attempts, missing in rows:
        print(f"{key:<{width}}  {acc:<8}  {str(attempts):<24}  {', '.join(missing) or '-'}")


def _frame_defaults(role, size):
    defaults = dict(ROLE_DEFAULTS.get(role, {}))
    if role == "column" and "footW" not in defaults:
        defaults["footW"] = round(size[0] * 0.8)
    return defaults


def build_biome(prompts, biome, only=None):
    subjects = prompts.get("env_subjects", {}).get(biome, {})
    keys = [k for k in subjects if (only is None or k in only) and subjects[k].get("accepted_attempt") is not None]
    if not keys:
        print(f"No accepted subjects to build for biome {biome!r} (only={only})", file=sys.stderr)
        return

    env_dir = os.path.join(ROOT, "assets", "sprites", "env", biome)
    raw_frames_dir = os.path.join(ROOT, "assets", "sprites", "_raw", "env", biome, "frames")
    raw_sidecar_dir = os.path.join(ROOT, "assets", "sprites", "_raw", "env", biome)
    os.makedirs(env_dir, exist_ok=True)
    os.makedirs(raw_frames_dir, exist_ok=True)

    env_grade = prompts.get("env_grade", {})
    manifest_tiles = {}
    manifest_frames = {}
    skins_by_template = {}
    hazards = {}
    prov_entries = []  # (kind, filename, path, entry_kwargs)

    for key in sorted(keys):
        entry = subjects[key]
        role = entry["role"]
        template = entry["template"]
        accepted_attempt = entry["accepted_attempt"]
        raw_png, raw_sidecar, seed = _raw_paths(biome, key, accepted_attempt)
        if not os.path.exists(raw_png):
            print(f"ERROR: accepted raw generation missing for {biome}:{key}: {raw_png}", file=sys.stderr)
            sys.exit(1)

        sidecar = {}
        if os.path.exists(raw_sidecar):
            with open(raw_sidecar) as f:
                sidecar = json.load(f)

        grade_profile = "architecture" if role in ("wallface", "wallcap", "column", "gate") else role
        grade = env_grade.get(grade_profile)

        is_tile_role = role in ("floor", "water", "wallcap")
        is_strip_role = role == "wallface"
        is_frame_role = role in ("column", "gate", "prop", "decal", "hazard-skin")

        rejected = entry.get("rejected", {}) or {}
        rejected_seeds = [entry["base_seed"] + int(a) for a in rejected.keys()] if rejected else []
        rejected_reasons = {str(entry["base_seed"] + int(a)): r for a, r in rejected.items()} if rejected else {}

        if is_tile_role:
            tile_name = "floor-a" if key == "floor_a" else ("floor-b" if key == "floor_b" else key)
            out_name = f"{biome}-{tile_name}-tile.png"
            out_path = os.path.join(env_dir, out_name)
            size = fe._load_prompts().get("env_sizes", {}).get(template, [1024, 1024])[0] if template else 1024
            img = fe.Image.open(raw_png).convert("RGB")
            w, h = img.size
            side = min(w, h)
            cropped = img.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side))
            resized = cropped.resize((size, size), fe.Image.LANCZOS)
            seamless = fe.make_seamless(resized, axis="xy")
            grading_info = None
            if "tile_limits" in env_grade:
                seamless, grading_info = fe.grade_tile(seamless, env_grade["tile_limits"])
            seamless.save(out_path, "PNG")
            manifest_tiles[key] = {
                "path": os.path.relpath(out_path, ROOT), "size": [size, size],
                "role": role, "ground_safe": bool(entry.get("ground_safe")),
            }
            prov_entries.append(("env-tile", out_name, os.path.relpath(out_path, ROOT), {
                "role": role, "biome": biome, "cultural_check": entry.get("cultural_check", ""),
                "ground_safe": bool(entry.get("ground_safe")), "grading": grading_info,
                "finish": {"mode": "tile", "crop": None}, "rejected_seeds": rejected_seeds,
                "rejected_reasons": rejected_reasons,
            }))

        elif is_strip_role:
            out_name = f"{biome}-wallface-tile.png"
            out_path = os.path.join(env_dir, out_name)
            crop = tuple(entry.get("crop") or (0, 0, *fe.Image.open(raw_png).size))
            strip = fe.strip_finish(raw_png, crop, 1024)
            strip.save(out_path, "PNG")
            manifest_tiles[key] = {
                "path": os.path.relpath(out_path, ROOT), "size": list(strip.size),
                "role": role, "ground_safe": False,
            }
            prov_entries.append(("env-tile", out_name, os.path.relpath(out_path, ROOT), {
                "role": role, "biome": biome, "cultural_check": entry.get("cultural_check", ""),
                "ground_safe": False, "grading": None,
                "finish": {"mode": "strip", "crop": list(crop)}, "rejected_seeds": rejected_seeds,
                "rejected_reasons": rejected_reasons,
            }))

        elif is_frame_role:
            frame_name = f"{biome}_{key}_0.png"
            frame_path = os.path.join(raw_frames_dir, frame_name)
            max_side = {"tall": 448}.get(entry.get("size"), 512 if role in ("column", "gate") else 384)
            matte = entry.get("matte", "u2net")  # 05.4-03: per-subject rembg model override (default unchanged)
            if role == "decal":
                out_img, _bbox = fe.decal_finish(raw_png, max_side, max_alpha=entry.get("alpha", 0.55), grade=grade)
            elif role == "hazard-skin" and entry.get("finish") == "prop":
                out_img, _bbox = fe.prop_finish(raw_png, max_side, grade=grade, matte=matte)
            elif role == "hazard-skin":
                out_img, _bbox = fe.decal_finish(raw_png, max_side, max_alpha=entry.get("alpha", 0.55), grade=grade)
            else:
                out_img, _bbox = fe.prop_finish(raw_png, max_side, grade=grade, matte=matte)
            out_img.save(frame_path, "PNG")

            ground_safe = bool(entry.get("ground_safe")) or role in ("decal", "hazard-skin")
            defaults = _frame_defaults(role, out_img.size)
            frame_entry = {"frame": frame_name, "size": list(out_img.size), "role": role, "ground_safe": ground_safe}
            frame_entry.update({k: v for k, v in defaults.items() if k not in frame_entry})
            for extra in ("worldH", "worldW", "zones", "weight", "low", "light", "anchor", "footW", "alpha"):
                if extra in entry:
                    frame_entry[extra] = entry[extra]
            manifest_frames[key] = frame_entry

            if entry.get("skinFor"):
                for ref in entry["skinFor"]:
                    tpl_id, kind_ = ref.split(":", 1)
                    skins_by_template.setdefault(tpl_id, {})[kind_] = key
            if entry.get("hazard"):
                hazards[entry["hazard"]] = key

            prov_entries.append(("env-prop", frame_name, os.path.relpath(frame_path, ROOT), {
                "role": role, "biome": biome, "cultural_check": entry.get("cultural_check", ""),
                "ground_safe": ground_safe, "grading": grade,
                "finish": {"mode": role, "crop": None}, "rejected_seeds": rejected_seeds,
                "rejected_reasons": rejected_reasons,
            }))
        else:
            print(f"ERROR: unknown role {role!r} for {biome}:{key}", file=sys.stderr)
            sys.exit(1)

        if os.path.exists(raw_sidecar):
            os.makedirs(raw_sidecar_dir, exist_ok=True)
            with open(os.path.join(raw_sidecar_dir, f"{key}.gen.json"), "w") as f:
                json.dump(sidecar, f, indent=2)
                f.write("\n")

    # ---- pack atlas ----
    atlas_name = f"{biome}-env-atlas"
    pack_result = subprocess.run(
        ["node", "tools/pack-atlas.js", os.path.relpath(raw_frames_dir, ROOT), atlas_name,
         os.path.relpath(env_dir, ROOT)],
        cwd=ROOT, capture_output=True, text=True,
    )
    print(pack_result.stdout)
    if pack_result.returncode != 0:
        print(pack_result.stderr, file=sys.stderr)
        sys.exit(1)

    atlas_json_path = os.path.join(env_dir, f"{atlas_name}.json")
    atlas_png_path = os.path.join(env_dir, f"{atlas_name}.png")
    with open(atlas_json_path) as f:
        atlas_json = json.load(f)
    components = sorted(atlas_json.get("frames", {}).keys())
    size = atlas_json.get("meta", {}).get("size", {})
    if size and (size.get("w", 0) > 2048 or size.get("h", 0) > 2048):
        print(f"ERROR: {atlas_name} exceeds 2048x2048 ({size})", file=sys.stderr)
        sys.exit(1)

    # ---- write manifest (tuning-preserving merge) ----
    manifest_path = os.path.join(env_dir, f"{biome}-env.json")
    existing_manifest = None
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            existing_manifest = json.load(f)

    default_skins = {"pillar": "column", "wall": "@cap", "pit": "@water" if biome == "vaitarani" else "@abyss"}
    default_hazards = dict(hazards)
    default_hazards.setdefault("venomPool", "@pool")
    if biome == "vaitarani":
        default_hazards.setdefault("riverCurrent", "@water")

    new_manifest = {
        "schema": 1, "biome": biome,
        "atlas": os.path.relpath(atlas_json_path, ROOT),
        "tiles": manifest_tiles,
        "frames": manifest_frames,
        "floor": DEFAULT_TOP_BLOCKS["floor"],
        "walls": DEFAULT_TOP_BLOCKS["walls"],
        "skins": {**default_skins, "byTemplate": skins_by_template},
        "hazards": default_hazards,
        "lights": DEFAULT_TOP_BLOCKS["lights"],
        "grade": DEFAULT_TOP_BLOCKS["grade"],
    }
    merged_manifest = fe.merge_manifest(existing_manifest, new_manifest)
    with open(manifest_path, "w") as f:
        json.dump(merged_manifest, f, indent=2)
        f.write("\n")

    # ---- provenance ----
    for kind, filename, path_, kwargs in prov_entries:
        # match sidecar by subject key (frame filenames are {biome}_{key}_0.png; tile filenames vary)
        entry_key = None
        for k in keys:
            if filename == f"{biome}_{k}_0.png" or filename.startswith(f"{biome}-{k.replace('_', '-')}-"):
                entry_key = k
                break
        sub_entry = subjects.get(entry_key, {}) if entry_key else {}
        raw_sidecar = os.path.join(raw_sidecar_dir, f"{entry_key}.gen.json") if entry_key else None
        sidecar = {}
        if raw_sidecar and os.path.exists(raw_sidecar):
            with open(raw_sidecar) as f:
                sidecar = json.load(f)
        prov_entry = entry_from_sidecar(
            sidecar, filename=filename, path=path_, actor=f"{biome}_{entry_key or filename}", kind=kind,
            rejected_seeds=kwargs.get("rejected_seeds", []), post_processing=[kwargs.get("finish", {}).get("mode", "")],
            self_review=sub_entry.get("self_review", ""), raw_image=None,
            gen_sidecar=raw_sidecar, role=kwargs.get("role"), biome=biome,
            cultural_check=kwargs.get("cultural_check"), ground_safe=kwargs.get("ground_safe"),
            grading=kwargs.get("grading"), finish=kwargs.get("finish"),
            rejected_reasons=kwargs.get("rejected_reasons"),
        )
        upsert_entry(PROVENANCE_PATH, prov_entry)

    atlas_entry = entry_from_sidecar(
        {}, filename=f"{atlas_name}.png", path=os.path.relpath(atlas_png_path, ROOT),
        actor=biome, kind="env-atlas", biome=biome, components=components,
    )
    upsert_entry(PROVENANCE_PATH, atlas_entry)

    print(f"Built {biome}: {len(keys)} subjects -> {manifest_path}, {atlas_name} ({len(components)} components)")


def main():
    ap = argparse.ArgumentParser(description="Per-biome env-art build (Phase 05.4 D-10a).")
    ap.add_argument("biome")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--only", default=None)
    args = ap.parse_args()

    prompts = _load_prompts()

    if args.check:
        check_biome(prompts, args.biome)
        return

    only = set(k.strip() for k in args.only.split(",")) if args.only else None
    build_biome(prompts, args.biome, only=only)


if __name__ == "__main__":
    main()
