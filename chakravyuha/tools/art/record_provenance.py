#!/usr/bin/env python3
"""
record_provenance.py — idempotent upsert of one PROVENANCE.json entry from a .gen.json sidecar.

Usage:
  python tools/art/record_provenance.py --filename NAME --path PATH --actor ACTOR \
      --kind biome|boss|enemy|god|env-tile|env-prop|env-atlas --sidecar GEN.json \
      [--rejected-seeds 1,2,3] [--post "step one|step two"] [--self-review "text"] \
      [--animations '{"idle":1,"phase2":1}'] [--raw PATH] [--provenance-path assets/sprites/PROVENANCE.json]
      [--role floor|water|wallface|wallcap|column|gate|prop|decal|hazard-skin] [--biome naraka]
      [--cultural-check "text"] [--ground-safe] [--grading '{"sat":0.85,...}'] \
      [--finish '{"mode":"tile","crop":null}'] [--components a.png,b.png] \
      [--rejected-reasons '{"41001":"radial focal point"}']

Upserts assets/sprites/PROVENANCE.json (or --provenance-path) by `filename`: replaces an
existing entry with the same filename, otherwise appends. Running twice with the same
filename yields exactly one entry (idempotent).

Also importable as a library (used by env_build.py):
  from record_provenance import upsert_entry, entry_from_sidecar
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

CHECKPOINT_LABEL = "sd_xl_base_1.0.safetensors (SDXL 1.0 base, CreativeML OpenRAIL++-M)"

ENV_ASSET_KINDS = ("env-tile", "env-prop")


def upsert_entry(provenance_path, entry):
    """Idempotent upsert into provenance_path's assets[] by entry['filename'].
    Returns 'replaced' or 'appended'."""
    prov_path = Path(provenance_path)
    if prov_path.exists():
        with open(prov_path) as f:
            provenance = json.load(f)
    else:
        provenance = {"schema_version": 1, "assets": []}

    provenance.setdefault("assets", [])
    replaced = False
    for i, existing in enumerate(provenance["assets"]):
        if existing.get("filename") == entry["filename"]:
            provenance["assets"][i] = entry
            replaced = True
            break
    if not replaced:
        provenance["assets"].append(entry)

    with open(prov_path, "w") as f:
        json.dump(provenance, f, indent=2)
        f.write("\n")

    return "replaced" if replaced else "appended"


def entry_from_sidecar(sidecar, filename, path, actor, kind, rejected_seeds=None,
                        post_processing=None, self_review="", animations=None,
                        raw_image=None, gen_sidecar=None, iconography=None,
                        role=None, biome=None, cultural_check=None, ground_safe=None,
                        grading=None, finish=None, rejected_reasons=None, components=None,
                        superseded=None):
    """Build one PROVENANCE.json entry dict from a .gen.json sidecar dict plus fields.

    kind in {biome, boss, enemy, god, env-tile, env-prop, env-atlas}. env-atlas entries
    carry no prompt/seed (atlas-pack step, not a generation) — `sidecar` may be {} for that
    kind. env-tile/env-prop entries additionally carry role/biome/cultural_check/ground_safe/
    grading/finish/rejected_reasons (Phase 05.4 D-10).
    """
    rejected_seeds = rejected_seeds or []
    post_processing = post_processing or []

    entry = {"filename": filename, "path": path, "actor": actor, "kind": kind}
    if animations is not None:
        entry["animations"] = animations

    if kind == "env-atlas":
        entry.update({
            "tool": "free-tex-packer-core 0.3.8 via tools/pack-atlas.js",
            "method": "atlas-pack",
            "components": components or [],
            "biome": biome,
            "recorded_date": date.today().isoformat(),
            "review_status": "provisional",
            "review_note": "provisional — awaiting human art review",
        })
        return entry

    params = sidecar.get("params", {})
    generated_at = sidecar.get("generated_at")
    generated_date = generated_at[:10] if generated_at else None

    entry.update({
        "tool": "ComfyUI (local)",
        "checkpoint": params.get("checkpoint_label") or CHECKPOINT_LABEL,
        "method": "txt2img",
        "sampler": params.get("sampler"),
        "scheduler": params.get("scheduler"),
        "steps": params.get("steps"),
        "cfg": params.get("cfg"),
        "width": params.get("width"),
        "height": params.get("height"),
        "seed": params.get("seed"),
        "prompt": params.get("positive"),
        "negative_prompt": params.get("negative"),
        "rejected_seeds": rejected_seeds,
        "rejected_count": len(rejected_seeds),
        "post_processing": post_processing,
        "raw_image": raw_image,
        "gen_sidecar": gen_sidecar,
        "generated_date": generated_date,
        "recorded_date": date.today().isoformat(),
        "review_status": "provisional",
        "review_note": "provisional — awaiting human art review",
        "self_review": self_review,
    })

    if kind == "god":
        entry["cultural_review"] = "pending — human cultural reviewer (QA-03)"
        entry["iconography_notes"] = iconography or ""
    elif kind in ("boss", "enemy") + ENV_ASSET_KINDS and iconography:
        # 05.7-02: iconography-corrected boss / env assets also await human cultural review.
        # 05.7.1-12: new enemy sprites too.
        entry["cultural_review"] = "pending — human cultural reviewer (QA-03)"
        entry["iconography_notes"] = iconography
    if cultural_check and kind in ("boss", "enemy"):
        # 05.7.1-12: record the per-asset cultural check (QA-03 flags) for character atlases.
        entry["cultural_check"] = cultural_check
    if superseded:
        entry["superseded"] = superseded
    if rejected_reasons and kind not in ENV_ASSET_KINDS:
        entry["rejected_reasons"] = rejected_reasons

    if kind in ENV_ASSET_KINDS:
        entry["role"] = role
        entry["biome"] = biome
        entry["cultural_check"] = cultural_check or ""
        entry["ground_safe"] = bool(ground_safe)
        entry["grading"] = grading
        entry["finish"] = finish
        if rejected_reasons:
            entry["rejected_reasons"] = rejected_reasons

    return entry


def main():
    ap = argparse.ArgumentParser(description="Idempotent upsert into PROVENANCE.json from a .gen.json sidecar.")
    ap.add_argument("--filename", required=True)
    ap.add_argument("--path", required=True)
    ap.add_argument("--actor", required=True)
    ap.add_argument("--kind", required=True,
                     choices=["biome", "boss", "enemy", "god", "env-tile", "env-prop", "env-atlas"])
    ap.add_argument("--sidecar", default=None,
                     help="Required unless --kind env-atlas (atlas entries carry no generation params).")
    ap.add_argument("--rejected-seeds", dest="rejected_seeds", default="")
    ap.add_argument("--post", dest="post_processing", default="")
    ap.add_argument("--self-review", dest="self_review", default="")
    ap.add_argument("--animations", default=None)
    ap.add_argument("--raw", dest="raw_image", default=None)
    ap.add_argument("--iconography", dest="iconography", default=None,
                     help="(kind=god/boss/env-*) one-line note of attributes verified present.")
    ap.add_argument("--role", default=None,
                     help="(kind=env-tile/env-prop) floor|water|wallface|wallcap|column|gate|prop|decal|hazard-skin")
    ap.add_argument("--biome", default=None, help="(kind=env-* only)")
    ap.add_argument("--cultural-check", dest="cultural_check", default=None)
    ap.add_argument("--ground-safe", dest="ground_safe", action="store_true")
    ap.add_argument("--grading", default=None, help="JSON string of grading params actually applied")
    ap.add_argument("--finish", default=None, help='JSON string {"mode":..., "crop":...}')
    ap.add_argument("--components", default=None,
                     help="(kind=env-atlas) comma-separated atlas frame filenames")
    ap.add_argument("--rejected-reasons", dest="rejected_reasons", default=None,
                     help='JSON object {"seed": "reason", ...}')
    ap.add_argument("--superseded", default=None,
                     help="JSON object describing the superseded (replaced) generation record.")
    ap.add_argument("--provenance-path", dest="provenance_path", default="assets/sprites/PROVENANCE.json")
    args = ap.parse_args()

    sidecar = {}
    if args.sidecar:
        try:
            with open(args.sidecar) as f:
                sidecar = json.load(f)
        except Exception as e:
            print(f"ERROR: failed to read sidecar {args.sidecar}: {e}", file=sys.stderr)
            sys.exit(1)
    elif args.kind != "env-atlas":
        print("ERROR: --sidecar is required unless --kind env-atlas", file=sys.stderr)
        sys.exit(1)

    rejected_seeds = [int(s) for s in args.rejected_seeds.split(",") if s.strip() != ""] if args.rejected_seeds else []
    post_processing = [s.strip() for s in args.post_processing.split("|") if s.strip()] if args.post_processing else []
    animations = json.loads(args.animations) if args.animations else None
    grading = json.loads(args.grading) if args.grading else None
    finish = json.loads(args.finish) if args.finish else None
    rejected_reasons = json.loads(args.rejected_reasons) if args.rejected_reasons else None
    superseded = json.loads(args.superseded) if args.superseded else None
    components = [c.strip() for c in args.components.split(",") if c.strip()] if args.components else None

    entry = entry_from_sidecar(
        sidecar, filename=args.filename, path=args.path, actor=args.actor, kind=args.kind,
        rejected_seeds=rejected_seeds, post_processing=post_processing, self_review=args.self_review,
        animations=animations, raw_image=args.raw_image, gen_sidecar=args.sidecar,
        iconography=args.iconography, role=args.role, biome=args.biome,
        cultural_check=args.cultural_check, ground_safe=args.ground_safe, grading=grading,
        finish=finish, rejected_reasons=rejected_reasons, components=components,
        superseded=superseded,
    )

    action = upsert_entry(args.provenance_path, entry)
    print(f"{action} entry for {args.filename} in {args.provenance_path}")


if __name__ == "__main__":
    main()
