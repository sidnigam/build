# Quick 261019-jdr Summary — desktop settings persistence

- Commit 45a4fa9: `electron/main.js` `sanitizeName` now accepts `^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$` and rejects `..` and names > 64 chars.
- Verified with a 10-case table: the four real save keys (`chakravyuha.settings`, `chakravyuha_save_v1`, `chakravyuha_bindings_v1`, `chakravyuha_padbindings_v1`) pass; `.hidden`, `a..b`, `../x`, `a/b`, `a\b`, empty, 65-char names are rejected. `node --check` ok.
- Full `node test/smoke.js`: first run had 2 failures in unrelated wall-clock music-DSP budget asserts (57-63ms vs 50ms; 875ms vs 800ms) while ComfyUI was generating; rerun green. Logged as a flaky-perf-assert backlog item.
- Phase 6 note: 06-CONTEXT D-11 is pre-resolved; 06-01 may still move the helper into `electron/util.js` (behavior must stay identical).
- Manual check pending (playtest): change a setting in `npm run start:desktop`, quit, relaunch — it persists.
