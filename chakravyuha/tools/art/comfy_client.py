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


# --- FLUX.1-schnell GGUF graph (05.5-04, D-26/D-28) ----------------------------------------
#
# schnell is not guidance-distilled the way dev is -- no FluxGuidance / ModelSamplingFlux node
# is added (per the plan). cfg stays 1.0 so the KSampler's "negative" conditioning is never
# actually used for guidance; ConditioningZeroOut only exists to satisfy the KSampler's
# required "negative" input signature. Flux uses a 16-channel SD3-style latent, so
# EmptySD3LatentImage is required instead of EmptyLatentImage.
FLUX_DEFAULT_UNET = "flux1-schnell-Q4_K_S.gguf"
FLUX_DEFAULT_T5 = "t5-v1_1-xxl-encoder-Q5_K_M.gguf"
FLUX_DEFAULT_CLIP_L = "clip_l.safetensors"
FLUX_DEFAULT_VAE = "ae.safetensors"


def build_flux_gguf_graph(pos, seed, width, height, steps=4, cfg=1.0,
                           sampler="euler", scheduler="simple",
                           unet=FLUX_DEFAULT_UNET, t5=FLUX_DEFAULT_T5, clip_l=FLUX_DEFAULT_CLIP_L,
                           vae=FLUX_DEFAULT_VAE, clip_type="flux", prefix="chakravyuha"):
    """Build the FLUX.1-schnell GGUF API graph (positive-only; no negative text prompt).

    Nodes: UnetLoaderGGUF, DualCLIPLoaderGGUF, CLIPTextEncode, ConditioningZeroOut,
    EmptySD3LatentImage, KSampler, VAELoader, VAEDecode, SaveImage.
    """
    if width % 16 != 0 or height % 16 != 0:
        raise ValueError(f"Flux width/height must be multiples of 16, got {width}x{height}")
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": unet}},
        "2": {"class_type": "DualCLIPLoaderGGUF", "inputs": {
            "clip_name1": t5, "clip_name2": clip_l, "type": clip_type,
        }},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": ["2", 0]}},
        "4": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["3", 0]}},
        "5": {"class_type": "EmptySD3LatentImage", "inputs": {
            "width": width, "height": height, "batch_size": 1,
        }},
        "6": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": steps, "cfg": cfg,
            "sampler_name": sampler, "scheduler": scheduler, "denoise": 1.0,
            "model": ["1", 0], "positive": ["3", 0], "negative": ["4", 0], "latent_image": ["5", 0],
        }},
        "7": {"class_type": "VAELoader", "inputs": {"vae_name": vae}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["7", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}},
    }


# Keys whose combo value should be checked against the core/combo allow-list in /object_info,
# per the plan ("sampler_name, scheduler, type, unet_name, clip_name*, vae_name").
_COMBO_CHECK_KEYS = {"sampler_name", "scheduler", "type", "unet_name", "clip_name1", "clip_name2", "vae_name"}


def _is_link(value, node_ids):
    """A link is [node_id, output_index] where node_id is a key present in the graph."""
    return (isinstance(value, list) and len(value) == 2
            and isinstance(value[0], str) and isinstance(value[1], int)
            and value[0] in node_ids)


def validate_graph(graph, object_info, skip_classes=()):
    """Return a list of human-readable error strings; [] means the graph is valid against
    object_info (as returned by GET /object_info).

    Checks: unknown class_type, unknown input name, a combo value (sampler_name/scheduler/
    type/unet_name/clip_name*/vae_name) not in its allowed list, and every link referencing
    an existing node id. Classes in skip_classes are not checked against object_info at all
    (used for GGUF node classes before ComfyUI has loaded them -- see gen_subject.py
    --validate's static fallback).
    """
    errors = []
    node_ids = set(graph.keys())
    for node_id, node in graph.items():
        class_type = node.get("class_type")
        inputs = node.get("inputs", {})

        # Links always need a valid target, even for classes we otherwise skip.
        for key, value in inputs.items():
            if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str) \
                    and isinstance(value[1], int) and value[0] not in node_ids:
                errors.append(f"node {node_id} ({class_type}): input {key!r} links to "
                              f"unknown node id {value[0]!r}")

        if class_type in skip_classes:
            continue

        info = object_info.get(class_type)
        if info is None:
            errors.append(f"node {node_id}: unknown class_type {class_type!r}")
            continue

        required = info.get("input", {}).get("required", {})
        optional = info.get("input", {}).get("optional", {})
        all_inputs = {}
        all_inputs.update(required)
        all_inputs.update(optional)

        for key, value in inputs.items():
            if key not in all_inputs:
                errors.append(f"node {node_id} ({class_type}): unknown input name {key!r}")
                continue
            if _is_link(value, node_ids):
                continue
            if key not in _COMBO_CHECK_KEYS:
                continue
            spec = all_inputs[key]
            combo = spec[0] if isinstance(spec, (list, tuple)) and len(spec) > 0 else None
            if isinstance(combo, list) and value not in combo:
                errors.append(f"node {node_id} ({class_type}): {key}={value!r} not in "
                              f"allowed combo values {combo!r}")
    return errors


def _self_test():
    """Synthetic, network-free assertions for build_flux_gguf_graph()/validate_graph()."""
    graph = build_flux_gguf_graph("a test prompt", seed=71599, width=896, height=1152)

    expected_classes = {
        "UnetLoaderGGUF", "DualCLIPLoaderGGUF", "VAELoader", "CLIPTextEncode",
        "ConditioningZeroOut", "EmptySD3LatentImage", "KSampler", "VAEDecode", "SaveImage",
    }
    actual_classes = {n["class_type"] for n in graph.values()}
    assert actual_classes == expected_classes, f"node set mismatch: {actual_classes}"
    assert len(graph) == 9, f"expected exactly 9 nodes, got {len(graph)}"

    ksampler = next(n for n in graph.values() if n["class_type"] == "KSampler")
    ki = ksampler["inputs"]
    assert ki["steps"] == 4 and ki["cfg"] == 1.0 and ki["sampler_name"] == "euler" \
        and ki["scheduler"] == "simple" and ki["denoise"] == 1.0, f"KSampler params wrong: {ki}"

    neg_node_id = ki["negative"][0]
    assert graph[neg_node_id]["class_type"] == "ConditioningZeroOut", \
        "KSampler negative must be a ConditioningZeroOut of the positive"
    zero_out_src = graph[neg_node_id]["inputs"]["conditioning"][0]
    pos_node_id = ki["positive"][0]
    assert zero_out_src == pos_node_id, "ConditioningZeroOut must wrap the positive conditioning"
    assert graph[pos_node_id]["class_type"] == "CLIPTextEncode"
    # Only one CLIPTextEncode node (positive-only; no negative text).
    text_encode_nodes = [n for n in graph.values() if n["class_type"] == "CLIPTextEncode"]
    assert len(text_encode_nodes) == 1, "Flux graph must have no negative text prompt"

    # width/height not multiples of 16 -> ValueError
    try:
        build_flux_gguf_graph("x", seed=1, width=900, height=1152)
        raise AssertionError("expected ValueError for non-multiple-of-16 width")
    except ValueError:
        pass
    try:
        build_flux_gguf_graph("x", seed=1, width=896, height=1150)
        raise AssertionError("expected ValueError for non-multiple-of-16 height")
    except ValueError:
        pass

    # Every link references an existing node id.
    node_ids = set(graph.keys())
    for nid, node in graph.items():
        for key, value in node["inputs"].items():
            if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str) \
                    and isinstance(value[1], int):
                assert value[0] in node_ids, f"node {nid} input {key} links to missing node {value[0]}"

    # validate_graph(): a valid graph against a synthetic object_info -> [].
    object_info = {
        "UnetLoaderGGUF": {"input": {"required": {
            "unet_name": [[FLUX_DEFAULT_UNET], {}],
        }}},
        "DualCLIPLoaderGGUF": {"input": {"required": {
            "clip_name1": [[FLUX_DEFAULT_T5], {}],
            "clip_name2": [[FLUX_DEFAULT_CLIP_L], {}],
            "type": [["sdxl", "sd3", "flux"], {}],
        }}},
        "VAELoader": {"input": {"required": {"vae_name": [[FLUX_DEFAULT_VAE], {}]}}},
        "CLIPTextEncode": {"input": {"required": {"text": ["STRING", {}], "clip": ["CLIP", {}]}}},
        "ConditioningZeroOut": {"input": {"required": {"conditioning": ["CONDITIONING", {}]}}},
        "EmptySD3LatentImage": {"input": {"required": {
            "width": ["INT", {}], "height": ["INT", {}], "batch_size": ["INT", {}],
        }}},
        "KSampler": {"input": {"required": {
            "model": ["MODEL", {}], "seed": ["INT", {}], "steps": ["INT", {}], "cfg": ["FLOAT", {}],
            "sampler_name": [["euler", "dpmpp_2m"], {}], "scheduler": [["simple", "karras"], {}],
            "positive": ["CONDITIONING", {}], "negative": ["CONDITIONING", {}],
            "latent_image": ["LATENT", {}], "denoise": ["FLOAT", {}],
        }}},
        "VAEDecode": {"input": {"required": {"samples": ["LATENT", {}], "vae": ["VAE", {}]}}},
        "SaveImage": {"input": {"required": {"images": ["IMAGE", {}], "filename_prefix": ["STRING", {}]}}},
    }
    errs = validate_graph(graph, object_info)
    assert errs == [], f"expected no errors on a valid graph, got: {errs}"

    # unknown class_type
    bad_graph = dict(graph)
    bad_graph["99"] = {"class_type": "TotallyMadeUpNode", "inputs": {}}
    errs = validate_graph(bad_graph, object_info)
    assert any("unknown class_type" in e for e in errs), errs

    # unknown input name
    bad_graph2 = json.loads(json.dumps(graph))
    bad_graph2["1"]["inputs"]["not_a_real_input"] = "x"
    errs = validate_graph(bad_graph2, object_info)
    assert any("unknown input name" in e for e in errs), errs

    # combo value not in allowed list
    bad_graph3 = json.loads(json.dumps(graph))
    bad_graph3["2"]["inputs"]["type"] = "not_a_real_clip_type"
    errs = validate_graph(bad_graph3, object_info)
    assert any("not in allowed combo values" in e for e in errs), errs

    # skip_classes: a class absent from object_info is not reported as unknown
    errs = validate_graph(graph, {}, skip_classes=("UnetLoaderGGUF", "DualCLIPLoaderGGUF"))
    assert not any("UnetLoaderGGUF" in e or "DualCLIPLoaderGGUF" in e for e in errs), errs

    print("comfy_client.py --self-test: ALL PASSED")


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
    ap.add_argument("--self-test", dest="self_test", action="store_true",
                     help="Run offline, network-free assertions for build_flux_gguf_graph/validate_graph.")
    ap.add_argument("--object-info-dump", dest="object_info_dump", default=None, metavar="PATH",
                     help="GET /object_info and save it to PATH (read-only).")
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
    ap.add_argument("--out", required=False)
    ap.add_argument("--wait-only", dest="wait_only", default=None,
                     help="Resume waiting on an already-queued prompt_id instead of queuing a new one.")
    ap.add_argument("--timeout", type=int, default=540)
    args = ap.parse_args()

    if args.self_test:
        _self_test()
        return

    if args.object_info_dump:
        info = _http_json(f"{COMFY_HOST}/object_info", timeout=30)
        with open(args.object_info_dump, "w") as f:
            json.dump(info, f, indent=2)
        print(f"Wrote {args.object_info_dump}")
        return

    if not args.out:
        print("ERROR: --out is required unless --self-test or --object-info-dump is used",
              file=sys.stderr)
        sys.exit(1)

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
