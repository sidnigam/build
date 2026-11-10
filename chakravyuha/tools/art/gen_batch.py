#!/usr/bin/env python3
"""
gen_batch.py — resumable background multi-subject generation, sequential in-process.

Usage:
  python tools/art/gen_batch.py KEY[,KEY...] [--attempt N] [--ckpt-profile PROFILE] [--log PATH]
  python tools/art/gen_batch.py --next-pending BIOME [--ckpt-profile PROFILE] [--log PATH]

Runs gen_subject.run_one() sequentially in-process against the single local ComfyUI
instance, with the per-call generation timeout raised to 900s (Bash's 10-min call limit no
longer applies once this is launched with run_in_background). Skips (attempt, key) pairs
whose output file already exists on disk.

Appends one line per result to --log (default assets/sprites/_gen/gen_batch.log):
  OK   key seed path secs
  SKIP key seed path (exists)
  FAIL key seed reason
and prints `BATCH DONE n_ok n_fail` on the last line once every job has run.

--next-pending BIOME generates, for every prompts.json env_subjects[BIOME] entry without an
`accepted_attempt`, the next attempt (lowest attempt 0..4 whose output file does not yet
exist). A subject that already has all 5 attempts (base_seed + 0..4) on disk is reported as
`EXHAUSTED biome:key` on stderr and skipped, per the D-15 generation budget.

Designed to be launched with Bash run_in_background and polled via --log.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_subject as gs

ROOT = gs.ROOT
DEFAULT_LOG = os.path.join(ROOT, "assets", "sprites", "_gen", "gen_batch.log")
MAX_ATTEMPTS_ENV = 5  # base_seed + 0..4 (D-15 generation budget)


def log_line(log_path, line):
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a") as f:
        f.write(line.rstrip("\n") + "\n")
    print(line)
    sys.stdout.flush()


def run_key_attempt(prompts, key, attempt, ckpt_profile, timeout, log_path):
    _kind, seed, out_path = gs.output_path_for(prompts, key, attempt=attempt, ckpt_profile=ckpt_profile)
    if os.path.exists(out_path):
        log_line(log_path, f"SKIP {key} {seed} {out_path} (exists)")
        return True
    start = time.time()
    try:
        result_path = gs.run_one(prompts, key, attempt=attempt, ckpt_profile=ckpt_profile,
                                  timeout=timeout, busy_wait=timeout)
    except Exception as e:
        log_line(log_path, f"FAIL {key} {seed} {e}")
        return False
    secs = time.time() - start
    log_line(log_path, f"OK {key} {seed} {result_path} {secs:.1f}")
    return True


def next_pending_keys(prompts, biome):
    """For every subject in env_subjects[biome] without accepted_attempt, find the lowest
    attempt (0..4) whose output does not exist. Returns [(key, attempt), ...]."""
    subjects = prompts.get("env_subjects", {}).get(biome, {})
    pending = []
    for subkey, entry in subjects.items():
        if entry.get("accepted_attempt") is not None:
            continue
        key = f"{biome}:{subkey}"
        found = None
        for attempt in range(MAX_ATTEMPTS_ENV):
            _kind, _seed, out_path = gs.output_path_for(prompts, key, attempt=attempt)
            if not os.path.exists(out_path):
                found = attempt
                break
        if found is None:
            print(f"EXHAUSTED {key}", file=sys.stderr)
            continue
        pending.append((key, found))
    return pending


def main():
    ap = argparse.ArgumentParser(description="Resumable background multi-subject generation (Phase 05.4 D-10a).")
    ap.add_argument("keys", nargs="?", default=None, help="comma-separated KEY[,KEY...]")
    ap.add_argument("--attempt", type=int, default=None)
    ap.add_argument("--next-pending", dest="next_pending", default=None, metavar="BIOME")
    ap.add_argument("--ckpt-profile", dest="ckpt_profile", default=None)
    ap.add_argument("--log", dest="log_path", default=DEFAULT_LOG)
    ap.add_argument("--timeout", type=int, default=900)
    args = ap.parse_args()

    prompts = gs.load_prompts()

    if args.next_pending:
        jobs = next_pending_keys(prompts, args.next_pending)
        if not jobs:
            print("BATCH DONE 0 0 (nothing pending)")
            return
    else:
        if not args.keys:
            print("ERROR: provide KEY[,KEY...] or --next-pending BIOME", file=sys.stderr)
            sys.exit(1)
        keys = [k.strip() for k in args.keys.split(",") if k.strip()]
        attempt = args.attempt if args.attempt is not None else 0
        jobs = [(k, attempt) for k in keys]

    n_ok = 0
    n_fail = 0
    for key, attempt in jobs:
        ok = run_key_attempt(prompts, key, attempt, args.ckpt_profile, args.timeout, args.log_path)
        if ok:
            n_ok += 1
        else:
            n_fail += 1

    print(f"BATCH DONE {n_ok} {n_fail}")


if __name__ == "__main__":
    main()
