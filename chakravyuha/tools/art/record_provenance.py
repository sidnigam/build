#!/usr/bin/env python3
"""
record_provenance.py — idempotent upsert of one PROVENANCE.json entry from a .gen.json sidecar.

Usage:
  python tools/art/record_provenance.py --filename NAME --path PATH --actor ACTOR --kind biome|boss|enemy \
      --sidecar GEN.json [--rejected-seeds 1,2,3] [--post "step one|step two"] [--self-review "text"] \
      [--animations '{"idle":1,"phase2":1}'] [--raw PATH] [--provenance-path assets/sprites/PROVENANCE.json]

Upserts assets/sprites/PROVENANCE.json (or --provenance-path) by `filename`: replaces an
existing entry with the same filename, otherwise appends. Running twice with the same
filename yields exactly one entry (idempotent).
"""
import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

CHECKPOINT_LABEL = "sd_xl_base_1.0.safetensors (SDXL 1.0 base, CreativeML OpenRAIL++-M)"


def main():
    ap = argparse.ArgumentParser(description="Idempotent upsert into PROVENANCE.json from a .gen.json sidecar.")
    ap.add_argument("--filename", required=True)
    ap.add_argument("--path", required=True)
    ap.add_argument("--actor", required=True)
    ap.add_argument("--kind", required=True, choices=["biome", "boss", "enemy", "god"])
    ap.add_argument("--sidecar", required=True)
    ap.add_argument("--rejected-seeds", dest="rejected_seeds", default="")
    ap.add_argument("--post", dest="post_processing", default="")
    ap.add_argument("--self-review", dest="self_review", default="")
    ap.add_argument("--animations", default=None)
    ap.add_argument("--raw", dest="raw_image", default=None)
    ap.add_argument("--iconography", dest="iconography", default=None,
                     help="(kind=god only) one-line note of attributes verified present.")
    ap.add_argument("--provenance-path", dest="provenance_path", default="assets/sprites/PROVENANCE.json")
    args = ap.parse_args()

    try:
        with open(args.sidecar) as f:
            sidecar = json.load(f)
    except Exception as e:
        print(f"ERROR: failed to read sidecar {args.sidecar}: {e}", file=sys.stderr)
        sys.exit(1)

    params = sidecar.get("params", {})
    generated_at = sidecar.get("generated_at")
    generated_date = generated_at[:10] if generated_at else None

    rejected_seeds = [int(s) for s in args.rejected_seeds.split(",") if s.strip() != ""] if args.rejected_seeds else []
    post_processing = [s.strip() for s in args.post_processing.split("|") if s.strip()] if args.post_processing else []
    animations = json.loads(args.animations) if args.animations else None

    entry = {
        "filename": args.filename,
        "path": args.path,
        "actor": args.actor,
        "kind": args.kind,
    }
    if animations is not None:
        entry["animations"] = animations
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
        "raw_image": args.raw_image,
        "gen_sidecar": args.sidecar,
        "generated_date": generated_date,
        "recorded_date": date.today().isoformat(),
        "review_status": "provisional",
        "review_note": "provisional — awaiting human art review",
        "self_review": args.self_review,
    })
    if args.kind == "god":
        entry["cultural_review"] = "pending — human cultural reviewer (QA-03)"
        entry["iconography_notes"] = args.iconography or ""

    prov_path = Path(args.provenance_path)
    if prov_path.exists():
        with open(prov_path) as f:
            provenance = json.load(f)
    else:
        provenance = {"schema_version": 1, "assets": []}

    provenance.setdefault("assets", [])
    replaced = False
    for i, existing in enumerate(provenance["assets"]):
        if existing.get("filename") == args.filename:
            provenance["assets"][i] = entry
            replaced = True
            break
    if not replaced:
        provenance["assets"].append(entry)

    with open(prov_path, "w") as f:
        json.dump(provenance, f, indent=2)
        f.write("\n")

    action = "replaced" if replaced else "appended"
    print(f"{action} entry for {args.filename} in {prov_path}")


if __name__ == "__main__":
    main()
