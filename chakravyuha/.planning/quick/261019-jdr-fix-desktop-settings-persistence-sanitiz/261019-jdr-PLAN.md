---
quick_id: 261019-jdr
type: quick
autonomous: true
files_modified: [electron/main.js]
---
# Quick 261019-jdr: Fix desktop settings persistence

Bug (found while planning Phase 6, 06-CONTEXT D-11): `electron/main.js` `sanitizeName` only allowed `[a-zA-Z0-9_-]`, so `SETTINGS.KEY = 'chakravyuha.settings'` was silently rejected and desktop settings never persisted.

Task: allow `.` in save names but reject a leading `.`, any `..`, path separators, and names longer than 64 chars. Verify all real keys pass and traversal-style names fail; `node --check electron/main.js`; full smoke green.
