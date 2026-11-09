// ============================================================
// CHAKRAVYUHA — focus.js : FOCUS, controller spatial menu
// navigation. Virtual focus only (`.pad-focus` class, never
// `el.focus()`) so pad input never activates a keyboard-bound
// button. Phase 05.2 Plan 02 (D-10).
// ============================================================
'use strict';

const FOCUS = {
  SELECTOR: 'button, .card, input[type=range], input[type=checkbox], select',
  EXCLUDE_IDS: ['btn-wipe'],
  PANEL_BACK: {
    settings: 'btn-settings-back', ctest: 'btn-ctest-back', shop: 'btn-shop-close',
    shrine: 'btn-shrine-back', vows: 'btn-vows-back', armory: 'btn-armory-back', codex: 'btn-codex-back', pause: 'btn-resume',
  },
  SCROLLERS: { codex: 'codex-list', settings: 'settings', ctest: 'ctest' },
  PASSTHROUGH: ['ctest'],
  REPEAT_DELAY: 0.35,
  REPEAT_EVERY: 0.12,

  panel: null,
  current: null,
  index: -1,
  armed: false,
  rep: { dir: null, t: 0, next: 0 },
  lastIndex: {},
  _items: [],

  isPassthrough(panelId) {
    return this.PASSTHROUGH.includes(panelId);
  },

  resolveBackId(panelId) {
    return this.PANEL_BACK[panelId] || null;
  },

  // ---------------- pure helpers ----------------
  pickNext(rects, cur, dir) {
    if (!rects || !rects.length) return cur;
    const c = rects[cur];
    if (!c) return cur;
    const ccx = c.x + c.w / 2, ccy = c.y + c.h / 2;
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < rects.length; i++) {
      if (i === cur) continue;
      const r = rects[i];
      const rcx = r.x + r.w / 2, rcy = r.y + r.h / 2;
      const dx = rcx - ccx, dy = rcy - ccy;
      let primary, ortho, inHalfPlane;
      if (dir === 'down') { primary = dy; ortho = dx; inHalfPlane = dy > 1; }
      else if (dir === 'up') { primary = -dy; ortho = dx; inHalfPlane = dy < -1; }
      else if (dir === 'right') { primary = dx; ortho = dy; inHalfPlane = dx > 1; }
      else if (dir === 'left') { primary = -dx; ortho = dy; inHalfPlane = dx < -1; }
      else return cur;
      if (!inHalfPlane) continue;
      const score = primary + 2 * Math.abs(ortho);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best >= 0 ? best : cur;
  },

  navRepeat(rep, dir, dt) {
    const r = rep || { dir: null, t: 0, next: 0 };
    if (!dir) return { rep: { dir: null, t: 0, next: 0 }, fire: false };
    if (dir !== r.dir) return { rep: { dir, t: 0, next: this.REPEAT_DELAY }, fire: true };
    const t = r.t + (dt || 0);
    if (t >= r.next) return { rep: { dir, t, next: t + this.REPEAT_EVERY }, fire: true };
    return { rep: { dir, t, next: r.next }, fire: false };
  },

  stepRange(v, min, max, step, sign) {
    const nv = (v || 0) + sign * step;
    return Math.max(min, Math.min(max, nv));
  },

  dirFromPad(state) {
    const b = (state && state.buttons) || {};
    if (b.DUp) return 'up';
    if (b.DDown) return 'down';
    if (b.DLeft) return 'left';
    if (b.DRight) return 'right';
    const left = (state && state.left) || { x: 0, y: 0 };
    const th = (typeof PAD !== 'undefined' && PAD.CFG && PAD.CFG.NAV_THRESHOLD) || 0.5;
    const ax = left.x || 0, ay = left.y || 0;
    if (Math.abs(ax) < th && Math.abs(ay) < th) return null;
    if (Math.abs(ax) >= Math.abs(ay)) return ax > 0 ? 'right' : 'left';
    return ay > 0 ? 'down' : 'up';
  },

  armStep(armed, panelChanged, anyFaceHeld) {
    if (panelChanged) return false;
    if (!armed) return anyFaceHeld ? false : true;
    return true;
  },

  // ---------------- DOM (guarded for headless) ----------------
  activePanel() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return null;
    const panels = document.querySelectorAll('.panel') || [];
    let last = null;
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      if (p && p.classList && !p.classList.contains('hidden')) last = p;
    }
    return last;
  },

  items(panel) {
    if (!panel || typeof panel.querySelectorAll !== 'function') return [];
    const all = panel.querySelectorAll(this.SELECTOR) || [];
    const out = [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (!el) continue;
      if (el.id && this.EXCLUDE_IDS.includes(el.id)) continue;
      if (el.disabled) continue;
      if (typeof el.getClientRects === 'function') {
        const rects = el.getClientRects();
        if (rects && rects.length === 0) continue;
      }
      out.push(el);
    }
    return out;
  },

  rectOf(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return { x: 0, y: 0, w: 0, h: 0 };
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  },

  ringTarget(el) {
    if (!el) return el;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' && typeof el.closest === 'function') {
      const anc = el.closest('label') || el.closest('.settings-row');
      if (anc) return anc;
    }
    return el;
  },

  setFocus(el) {
    if (this.current) {
      const prevRing = this.ringTarget(this.current);
      if (prevRing && prevRing.classList && typeof prevRing.classList.remove === 'function') {
        prevRing.classList.remove('pad-focus');
      }
    }
    const target = this.ringTarget(el);
    if (target && target.classList && typeof target.classList.add === 'function') {
      target.classList.add('pad-focus');
    }
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' });
    }
    this.current = el;
    if (this.panel && this.panel.id) {
      this.lastIndex[this.panel.id] = this.index;
    }
  },

  clear() {
    if (this.current) {
      const ring = this.ringTarget(this.current);
      if (ring && ring.classList && typeof ring.classList.remove === 'function') ring.classList.remove('pad-focus');
    }
    this.current = null;
    this.panel = null;
    this.index = -1;
    this._items = [];
  },

  defaultItem(panel, items) {
    if (!items || !items.length) return null;
    const li = panel && panel.id ? this.lastIndex[panel.id] : undefined;
    if (typeof li === 'number' && li >= 0 && li < items.length) return items[li];
    const has = (it, cls) => it && it.classList && typeof it.classList.contains === 'function' && it.classList.contains(cls);
    const primary = items.find(it => has(it, 'primary'));
    if (primary) return primary;
    const card = items.find(it => has(it, 'card'));
    if (card) return card;
    return items[0];
  },

  move(dir) {
    if (!this._items || !this._items.length || this.index < 0) return;
    const rects = this._items.map(el => this.rectOf(el));
    const next = this.pickNext(rects, this.index, dir);
    if (next !== this.index) {
      this.index = next;
      this.setFocus(this._items[next]);
    }
  },

  adjust(sign) {
    const el = this.current;
    if (!el) return;
    const tag = (el.tagName || '').toLowerCase();
    const type = (el.type || '').toLowerCase();
    const fire = (target, type2) => {
      if (typeof target.dispatchEvent === 'function' && typeof Event !== 'undefined') {
        target.dispatchEvent(new Event(type2, { bubbles: true }));
      }
    };
    if (tag === 'input' && type === 'range') {
      const min = (el.min !== undefined && el.min !== '') ? +el.min : 0;
      const max = (el.max !== undefined && el.max !== '') ? +el.max : 100;
      const cur = +el.value || 0;
      el.value = this.stepRange(cur, min, max, 5, sign);
      fire(el, 'input'); fire(el, 'change');
    } else if (tag === 'select') {
      const opts = el.options || [];
      const n = opts.length || 0;
      if (n > 0) {
        let idx = ((el.selectedIndex || 0) + sign) % n;
        if (idx < 0) idx += n;
        el.selectedIndex = idx;
        fire(el, 'change');
      }
    }
  },

  confirm() {
    const el = this.current;
    if (!el) return;
    const tag = (el.tagName || '').toLowerCase();
    const type = (el.type || '').toLowerCase();
    if (tag === 'input' && type === 'checkbox') {
      el.checked = !el.checked;
      if (typeof el.dispatchEvent === 'function' && typeof Event !== 'undefined') {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (tag === 'select') {
      this.adjust(1);
    } else if (tag === 'input' && type === 'range') {
      // no-op: range is adjusted with left/right, not confirmed
    } else if (typeof el.click === 'function') {
      el.click();
    }
  },

  back() {
    if (!this.panel) return;
    const id = this.resolveBackId(this.panel.id);
    if (!id) return;
    if (typeof UI !== 'undefined' && typeof UI.el === 'function') {
      const btn = UI.el(id);
      if (btn && typeof btn.click === 'function') btn.click();
    }
  },

  tickPad(state) {
    const panel = this.activePanel();
    if (!panel) {
      this.clear();
      this.rep = { dir: null, t: 0, next: 0 };
      return false;
    }
    const panelId = panel.id;
    if (this.isPassthrough(panelId)) {
      this.clear();
      this.panel = panel;
      return true;
    }

    const panelChanged = !this.panel || this.panel !== panel;
    if (panelChanged) {
      this.panel = panel;
      this._items = this.items(panel);
      const def = this.defaultItem(panel, this._items);
      this.index = def ? this._items.indexOf(def) : -1;
      this.current = null;
      if (def) this.setFocus(def);
    } else {
      this._items = this.items(panel);
      const stillValid = this.current && this._items.indexOf(this.current) >= 0
        && (typeof this.current.isConnected !== 'boolean' || this.current.isConnected);
      if (!stillValid && this._items.length) {
        const idx = Math.min(this.index >= 0 ? this.index : 0, this._items.length - 1);
        this.index = idx;
        this.setFocus(this._items[idx]);
      }
    }

    const buttons = (state && state.buttons) || {};
    const anyFaceHeld = !!(buttons.A || buttons.B || buttons.X || buttons.Y || buttons.Start || buttons.Touchpad);
    this.armed = this.armStep(this.armed, panelChanged, anyFaceHeld);

    const dir = this.dirFromPad(state);
    const dt = (state && state.dt) || 0;
    const rr = this.navRepeat(this.rep, dir, dt);
    this.rep = rr.rep;
    if (rr.fire) {
      const el = this.current;
      const tag = el && (el.tagName || '').toLowerCase();
      if ((dir === 'left' || dir === 'right') && (tag === 'input' && (el.type || '').toLowerCase() === 'range')) {
        this.adjust(dir === 'right' ? 1 : -1);
      } else if ((dir === 'left' || dir === 'right') && tag === 'select') {
        this.adjust(dir === 'right' ? 1 : -1);
      } else {
        this.move(dir);
      }
    }

    const right = (state && state.right) || { y: 0 };
    if (Math.abs(right.y || 0) > 0.3) {
      const scrollId = this.SCROLLERS[panelId];
      if (scrollId && typeof UI !== 'undefined') {
        const scroller = UI.el(scrollId);
        if (scroller && typeof scroller.scrollTop === 'number') {
          scroller.scrollTop += right.y * 900 * dt;
        }
      }
    }

    const edges = (state && state.edges) || {};
    const actionEdges = (state && state.actionEdges) || {};
    if (this.armed) {
      if (edges.A) {
        // Phase 05.5-03: while the boon-panel god dialogue is typing, ✕
        // advances/skips it instead of confirming a (still-dimmed) card.
        // Still gated by `this.armed`, so the held-✕ boon guard applies.
        if (panelId === 'boonpick' && typeof UI !== 'undefined' &&
            typeof UI.godDialogueBusy === 'function' && UI.godDialogueBusy()) {
          UI.skipGodDialogue();
        } else {
          this.confirm();
        }
      } else if (edges.B) this.back();
    }
    if (actionEdges.pause) {
      if (panelId === 'pause') { if (typeof UI !== 'undefined') UI.resume(); }
      else if (panelId === 'settings') { this.back(); }
    }

    return true;
  },
};
