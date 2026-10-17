# Deferred Items — Phase 05.4 (logged by 05.4-02 executor)

## Flaky smoke assertion: "god presence on boon panel" (intermittent, not caused by 05.4-02)

`node test/smoke.js` was observed to intermittently fail one assertion unrelated to this
plan's env-art work:

```
FAIL  god presence on boon panel: all behavior assertions pass — 7: god-dialogue not hidden after offerAmrit
```

**Investigated**: reproduced once on a clean `git stash` back to this branch's base commit
(`985aaac`, before any 05.4-02 changes) and once more mid-session on 05.4-02's own changes.
However, 5 consecutive reruns afterward (3 with 05.4-02's changes present, plus earlier reruns)
all passed cleanly, including the full (non-`SMOKE_FAST`) suite before this plan's commits. This
is 05.5 god-dialogue territory (`js/` dialogue/boon-panel code), which is explicitly out of file
ownership for Phase 05.4 (`tools/art/**`, `assets/sprites/env/**`, `assets/sprites/_raw/env/**`,
`assets/sprites/PROVENANCE.json`, `js/environment.js` only — NOT dialogue files), so it was not
investigated further or fixed here per the SCOPE BOUNDARY rule. Likely a pre-existing
timing/ordering flake in the god-dialogue test harness, not a regression from this plan. Flagged
for whichever plan next touches `js/` god-dialogue/boon-panel code (05.5-02 or a dedicated test
hardening pass) to make deterministic.
