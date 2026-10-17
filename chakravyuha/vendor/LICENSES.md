# Vendored library licenses

Both libraries vendored in this directory are MIT-licensed. The full MIT text
is reproduced once below (both licenses are the standard MIT text; only the
copyright line differs per project) and applies to each entry.

## pixi.js

- **Version:** 8.19.0
- **License:** MIT
- **Source:** https://github.com/pixijs/pixijs
- **Vendored file:** `vendor/pixi.min.js`
- **Copyright:** Copyright (c) 2013-2024 Mathew Groves, Chad Engler

## pixi-filters

- **Version:** 6.1.5
- **License:** MIT
- **Copyright:** Copyright 2025, PixiJS Team, All Rights Reserved
- **Source:** https://github.com/pixijs/filters
- **npm tarball:** https://registry.npmjs.org/pixi-filters/-/pixi-filters-6.1.5.tgz
- **Vendored file:** `vendor/pixi-filters.js`, copied unmodified from the
  tarball's `package/dist/pixi-filters.js` (the browser IIFE build that
  attaches to the global `PIXI.filters`; peer dependency `pixi.js >=8.0.0-0`),
  with only the trailing `//# sourceMappingURL=pixi-filters.js.map` line
  stripped (no corresponding `.map` file is vendored, so the line would
  otherwise 404 in the browser).
- **Original file sha256:** `3bb1830fe730687c9aa24b331b51f8f2263023ac7c91885e50cf9f339cff36ef`
  (sha256 of `package/dist/pixi-filters.js` as extracted from the npm
  tarball, before the sourceMappingURL line was stripped)

## MIT License text

```
The MIT License

Copyright (c) 2013-2024 Mathew Groves, Chad Engler (pixi.js)
Copyright 2025, PixiJS Team, All Rights Reserved (pixi-filters)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
