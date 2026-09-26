#!/usr/bin/env python3
"""
comfy_client.py — stdlib-only ComfyUI API client (queue / poll / download / sidecar).

Usage:
  python tools/art/comfy_client.py --positive "..." --negative "..." --seed 123 \
      --width 1024 --height 1024 --out assets/sprites/_gen/foo/foo_s123.png
  python tools/art/comfy_client.py --wait-only <PROMPT_ID> --out assets/sprites/_gen/foo/foo_s123.png

Also importable as a module:
  from comfy_client import build_txt2img_graph, queue_prompt, wait_for, download_first_image, system_stats
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

COMFY_HOST = "http://127.0.0.1:8188"


def build_txt2img_graph(pos, neg, seed, width, height, steps=32, cfg=7.0,
                         sampler="dpmpp_2m", scheduler="karras",
                         ckpt="sd_xl_base_1.0.safetensors", prefix="chakravyuha"):
    """Build the locked txt2img API graph (matches assets/sprites/comfyui-workflow.json params)."""
    return {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": ["4", 1]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": steps, "cfg": cfg,
            "sampler_name": sampler, "scheduler": scheduler, "denoise": 1.0,
            "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0],
        }},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}},
    }


def _http_json(url, data=None, timeout=30):
    req = urllib.request.Request(url, data=data,
                                  headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def system_stats():
    return _http_json(f"{COMFY_HOST}/system_stats", timeout=10)


def queue_prompt(graph, client_id=None):
    client_id = client_id or str(uuid.uuid4())
    body = json.dumps({"prompt": graph, "client_id": client_id}).encode("utf-8")
    result = _http_json(f"{COMFY_HOST}/prompt", data=body, timeout=30)
    if "prompt_id" not in result:
        raise RuntimeError(f"queue_prompt failed: {result}")
    return result["prompt_id"]


def wait_for(prompt_id, timeout_s=540, poll_s=3):
    """Poll /history/{prompt_id} until it has outputs, or raise TimeoutError / RuntimeError."""
    start = time.time()
    while True:
        elapsed = time.time() - start
        if elapsed > timeout_s:
            raise TimeoutError(f"Timed out waiting for prompt_id={prompt_id} after {timeout_s}s")
        try:
            history = _http_json(f"{COMFY_HOST}/history/{prompt_id}", timeout=15)
        except urllib.error.URLError as e:
            time.sleep(poll_s)
            continue
        entry = history.get(prompt_id)
        if entry:
            status = entry.get("status", {})
            status_str = status.get("status_str")
            if status_str == "error":
                raise RuntimeError(f"ComfyUI reported error for prompt_id={prompt_id}: {status}")
            if entry.get("outputs"):
                return entry
        time.sleep(poll_s)


def download_first_image(history_entry, out_path):
    """Find the first SaveImage output image in history_entry and download it to out_path."""
    outputs = history_entry.get("outputs", {})
    image_info = None
    for node_id, node_out in outputs.items():
        images = node_out.get("images")
        if images:
            image_info = images[0]
            break
    if image_info is None:
        raise RuntimeError(f"No images found in history outputs: {outputs}")

    params = urllib.parse_qs = None  # noqa (avoid shadow import confusion)
    import urllib.parse as _urlparse
    query = _urlparse.urlencode({
        "filename": image_info["filename"],
        "subfolder": image_info.get("subfolder", ""),
        "type": image_info.get("type", "output"),
    })
    url = f"{COMFY_HOST}/view?{query}"
    with urllib.request.urlopen(url, timeout=60) as resp:
        data = resp.read()
    with open(out_path, "wb") as f:
        f.write(data)
    return out_path


def write_sidecar(out_path, graph, params, prompt_id, comfyui_version=None):
    sidecar_path = out_path.rsplit(".png", 1)[0] + ".gen.json"
    payload = {
        "graph": graph,
        "params": params,
        "prompt_id": prompt_id,
        "comfyui_version": comfyui_version,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    with open(sidecar_path, "w") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")
    return sidecar_path


def main():
    ap = argparse.ArgumentParser(description="ComfyUI stdlib API client (queue/poll/download/sidecar).")
    ap.add_argument("--positive")
    ap.add_argument("--negative")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--width", type=int)
    ap.add_argument("--height", type=int)
    ap.add_argument("--steps", type=int, default=32)
    ap.add_argument("--cfg", type=float, default=7.0)
    ap.add_argument("--sampler", default="dpmpp_2m")
    ap.add_argument("--scheduler", default="karras")
    ap.add_argument("--ckpt", default="sd_xl_base_1.0.safetensors")
    ap.add_argument("--prefix", default="chakravyuha")
    ap.add_argument("--out", required=True)
    ap.add_argument("--wait-only", dest="wait_only", default=None,
                     help="Resume waiting on an already-queued prompt_id instead of queuing a new one.")
    ap.add_argument("--timeout", type=int, default=540)
    args = ap.parse_args()

    try:
        stats = system_stats()
        comfyui_version = stats.get("system", {}).get("comfyui_version")
    except Exception as e:
        print(f"ERROR: ComfyUI not reachable at {COMFY_HOST}: {e}", file=sys.stderr)
        sys.exit(1)

    if args.wait_only:
        prompt_id = args.wait_only
        # If the original params are re-supplied, rebuild the graph so the sidecar can
        # still be written correctly on resume. Otherwise sidecar writing is skipped.
        if args.positive and args.negative and args.seed is not None and args.width and args.height:
            graph = build_txt2img_graph(args.positive, args.negative, args.seed, args.width, args.height,
                                         steps=args.steps, cfg=args.cfg, sampler=args.sampler,
                                         scheduler=args.scheduler, ckpt=args.ckpt, prefix=args.prefix)
            params = {
                "positive": args.positive, "negative": args.negative, "seed": args.seed,
                "width": args.width, "height": args.height, "steps": args.steps, "cfg": args.cfg,
                "sampler": args.sampler, "scheduler": args.scheduler, "checkpoint": args.ckpt,
            }
        else:
            graph = None
            params = None
        print(f"Resuming wait on prompt_id={prompt_id}")
    else:
        if not (args.positive and args.negative and args.seed is not None and args.width and args.height):
            print("ERROR: --positive/--negative/--seed/--width/--height are required unless --wait-only is used",
                  file=sys.stderr)
            sys.exit(1)
        graph = build_txt2img_graph(args.positive, args.negative, args.seed, args.width, args.height,
                                     steps=args.steps, cfg=args.cfg, sampler=args.sampler,
                                     scheduler=args.scheduler, ckpt=args.ckpt, prefix=args.prefix)
        try:
            prompt_id = queue_prompt(graph)
        except Exception as e:
            print(f"ERROR: queue_prompt failed: {e}", file=sys.stderr)
            sys.exit(1)
        params = {
            "positive": args.positive, "negative": args.negative, "seed": args.seed,
            "width": args.width, "height": args.height, "steps": args.steps, "cfg": args.cfg,
            "sampler": args.sampler, "scheduler": args.scheduler, "checkpoint": args.ckpt,
        }
        print(f"Queued prompt_id={prompt_id}")

    try:
        entry = wait_for(prompt_id, timeout_s=args.timeout)
    except TimeoutError as e:
        print(f"TIMEOUT: {e} — resume with: --wait-only {prompt_id} --out {args.out}", file=sys.stderr)
        sys.exit(2)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        download_first_image(entry, args.out)
    except Exception as e:
        print(f"ERROR: download failed: {e}", file=sys.stderr)
        sys.exit(1)

    if graph is not None:
        write_sidecar(args.out, graph, params, prompt_id, comfyui_version=comfyui_version)

    print(args.out)


if __name__ == "__main__":
    main()
