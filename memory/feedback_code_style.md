---
name: Code style — no inline styles
description: Sid expects clean CSS — all styling in <style> blocks or external CSS, never inline style="" attributes
type: feedback
---

Never use inline `style=""` attributes in HTML. Move all styles to the `<style>` block (for single-file pages) or to `assets/css/style.css`.

**Why:** IDE diagnostics flag inline styles as warnings, and Sid notices them.

**How to apply:** When writing new HTML sections, define CSS classes upfront before writing the HTML. Use utility classes for small one-off values rather than inline styles.
