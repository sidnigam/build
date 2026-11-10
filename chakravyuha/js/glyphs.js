// ============================================================
// CHAKRAVYUHA — glyphs.js : GLYPHS, device/family control glyph
// tokens (PlayStation / Xbox / keyboard) for in-game hint text
// and canvas HUD badges. Phase 05.2 Plan 02 (D-08).
// Pure token helpers + a DOM refresh() that live-updates every
// `[data-glyph-hint]` element and toggles `body.pad-mode`.
// ============================================================
'use strict';

const GLYPHS = {
  FACE_COLORS: { cross: '#7ea6ff', circle: '#ff6b6b', square: '#ff8fd0', triangle: '#3fd6a0' },

  PAD_LABELS: {
    ps: {
      A: { label: '✕', shape: 'cross', kind: 'face' },
      B: { label: '○', shape: 'circle', kind: 'face' },
      X: { label: '□', shape: 'square', kind: 'face' },
      Y: { label: '△', shape: 'triangle', kind: 'face' },
      LB: { label: 'L1', shape: null, kind: 'shoulder' },
      RB: { label: 'R1', shape: null, kind: 'shoulder' },
      LT: { label: 'L2', shape: null, kind: 'shoulder' },
      RT: { label: 'R2', shape: null, kind: 'shoulder' },
      Back: { label: 'Create', shape: null, kind: 'system' },
      Start: { label: 'Options', shape: null, kind: 'system' },
      LS: { label: 'L3', shape: null, kind: 'stick' },
      RS: { label: 'R3', shape: null, kind: 'stick' },
      DUp: { label: '↑', shape: null, kind: 'dpad' },
      DDown: { label: '↓', shape: null, kind: 'dpad' },
      DLeft: { label: '←', shape: null, kind: 'dpad' },
      DRight: { label: '→', shape: null, kind: 'dpad' },
      Home: { label: 'PS', shape: null, kind: 'system' },
      Touchpad: { label: 'Touchpad', shape: null, kind: 'system' },
    },
    xbox: {
      A: { label: 'A', shape: null, kind: 'face' },
      B: { label: 'B', shape: null, kind: 'face' },
      X: { label: 'X', shape: null, kind: 'face' },
      Y: { label: 'Y', shape: null, kind: 'face' },
      LB: { label: 'LB', shape: null, kind: 'shoulder' },
      RB: { label: 'RB', shape: null, kind: 'shoulder' },
      LT: { label: 'LT', shape: null, kind: 'shoulder' },
      RT: { label: 'RT', shape: null, kind: 'shoulder' },
      Back: { label: 'View', shape: null, kind: 'system' },
      Start: { label: 'Menu', shape: null, kind: 'system' },
      LS: { label: 'LS', shape: null, kind: 'stick' },
      RS: { label: 'RS', shape: null, kind: 'stick' },
      DUp: { label: '↑', shape: null, kind: 'dpad' },
      DDown: { label: '↓', shape: null, kind: 'dpad' },
      DLeft: { label: '←', shape: null, kind: 'dpad' },
      DRight: { label: '→', shape: null, kind: 'dpad' },
      Home: { label: 'Xbox', shape: null, kind: 'system' },
      Touchpad: { label: 'Touchpad', shape: null, kind: 'system' },
    },
  },

  _lastSig: undefined,

  padToken(btn, family) {
    const fam = family === 'ps' ? 'ps' : 'xbox'; // generic mirrors xbox
    const table = this.PAD_LABELS[fam] || this.PAD_LABELS.xbox;
    const t = table[btn] || { label: btn, shape: null, kind: 'system' };
    return { label: t.label, shape: t.shape || null, kind: t.kind };
  },

  keyLabel(k) {
    if (k === ' ') return 'Space';
    const s = typeof k === 'string' ? k.toLowerCase() : String(k);
    const map = {
      escape: 'Esc', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
      shift: 'Shift', control: 'Ctrl', enter: 'Enter', tab: 'Tab',
    };
    if (map[s]) return map[s];
    if (s.length === 1) return s.toUpperCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  _device(device) {
    if (device) return device;
    return (typeof INPUT !== 'undefined') ? INPUT.device : 'kbm';
  },

  _family(f) {
    if (f) return f;
    return (typeof PAD !== 'undefined') ? PAD.family : 'generic';
  },

  tokensFor(action, device, family) {
    const dev = this._device(device);
    const fam = this._family(family);
    const key = (k) => ({ label: this.keyLabel(k), shape: null, kind: 'key' });

    if (dev === 'pad') {
      if (action === 'move') return [{ label: 'L-stick', shape: null, kind: 'stick' }];
      if (action === 'aim') return [{ label: 'R-stick', shape: null, kind: 'stick' }];
      if (action === 'scroll') return [{ label: 'R-stick', shape: null, kind: 'stick' }];
      if (action === 'navigate') return [{ label: 'D-pad', shape: null, kind: 'dpad' }];
      if (action === 'adjust') {
        return [{ label: '←', shape: null, kind: 'dpad' }, { label: '→', shape: null, kind: 'dpad' }];
      }
      if (action === 'confirm') return [this.padToken('A', fam)];
      if (action === 'back') return [this.padToken('B', fam)];
      const bindings = (typeof PAD !== 'undefined' && (PAD.bindings || PAD.DEFAULT_BINDINGS)) || {};
      const list = bindings[action] || [];
      return list.map(b => this.padToken(b, fam));
    }

    // ---- kbm ----
    const bindings = (typeof INPUT !== 'undefined' && INPUT.bindings) || {};
    if (action === 'move') {
      const first = (arr, d) => (arr && arr.length ? arr[0] : d);
      const u = first(bindings.moveUp, 'w'), l = first(bindings.moveLeft, 'a');
      const d = first(bindings.moveDown, 's'), r = first(bindings.moveRight, 'd');
      const all = [u, l, d, r];
      if (all.every(k => typeof k === 'string' && k.length === 1)) {
        return [{ label: all.join('').toUpperCase(), shape: null, kind: 'key' }];
      }
      return all.map(k => key(k));
    }
    if (action === 'aim') return [{ label: 'Mouse', shape: null, kind: 'key' }];
    if (action === 'attack') return [{ label: 'LMB', shape: null, kind: 'key' }];
    if (action === 'special') {
      const first = (bindings.special && bindings.special[0]) || 'e';
      return [key(first), { label: 'RMB', shape: null, kind: 'key' }];
    }
    if (action === 'dash' || action === 'cast' || action === 'pause') {
      const list = bindings[action] || [];
      return list.map(k => key(k));
    }
    if (action === 'confirm') return [{ label: 'Click', shape: null, kind: 'key' }];
    if (action === 'back') return [{ label: 'Esc', shape: null, kind: 'key' }];
    if (action === 'navigate' || action === 'scroll') return [{ label: 'Mouse', shape: null, kind: 'key' }];
    return [];
  },

  tokenHtml(t) {
    const cls = 'glyph g-' + t.kind + (t.shape ? ' g-' + t.shape : '');
    return `<span class="${cls}">${t.label}</span>`;
  },

  html(action, device, family) {
    const tokens = this.tokensFor(action, device, family);
    return tokens.map(t => this.tokenHtml(t)).join('<span class="glyph-sep">/</span>');
  },

  hint(key) {
    const h = (a) => this.html(a);
    switch (key) {
      case 'hub': {
        let s = [
          `${h('move')} move`, `${h('aim')} aim`, `${h('attack')} attack`,
          `${h('special')} special`, `${h('cast')} astra`, `${h('dash')} dash`, `${h('pause')} pause`,
        ].join(' · ') + ' · M mute';
        if (this._device() === 'pad') s += ` · navigate menus: ${h('navigate')} · ${h('confirm')} select`;
        return s;
      }
      case 'menu':
        return `${h('navigate')} navigate · ${h('confirm')} select · ${h('back')} back`;
      case 'boon':
        return `${h('navigate')} navigate · ${h('confirm')} choose`;
      case 'shop':
        return `${h('navigate')} navigate · ${h('confirm')} buy · ${h('back')} leave`;
      case 'pause':
        return `${h('navigate')} navigate · ${h('confirm')} select · ${h('back')} resume`;
      case 'settings':
        return `${h('navigate')} navigate · ${h('confirm')} toggle · ${h('adjust')} adjust · ${h('back')} back`;
      case 'codex':
        return `${h('scroll')} scroll · ${h('back')} return`;
      case 'continue':
        return `${h('confirm')} continue`;
      case 'ctest': {
        const fam = this._family();
        const backTok = this.tokenHtml(this.padToken('B', fam));
        const yTok = this.tokenHtml(this.padToken('Y', fam));
        return `Hold ${backTok} exit · Hold ${yTok} test rumble`;
      }
      default:
        return '';
    }
  },

  signature() {
    const device = (typeof INPUT !== 'undefined') ? INPUT.device : 'kbm';
    const family = (typeof PAD !== 'undefined') ? PAD.family : 'generic';
    const padBindings = (typeof PAD !== 'undefined') ? PAD.bindings : null;
    const kbmBindings = (typeof INPUT !== 'undefined') ? INPUT.bindings : null;
    return device + '|' + family + '|' + JSON.stringify(padBindings || null) + '|' + JSON.stringify(kbmBindings || null);
  },

  refresh(force) {
    const sig = this.signature();
    if (!force && sig === this._lastSig) return false;
    this._lastSig = sig;
    if (typeof document !== 'undefined') {
      if (document.body && document.body.classList && typeof document.body.classList.toggle === 'function') {
        document.body.classList.toggle('pad-mode', (typeof INPUT !== 'undefined') && INPUT.device === 'pad');
      }
      const nodes = (typeof document.querySelectorAll === 'function' ? document.querySelectorAll('[data-glyph-hint]') : null) || [];
      nodes.forEach(el => {
        const k = el.getAttribute ? el.getAttribute('data-glyph-hint') : (el.dataset && el.dataset.glyphHint);
        if (k) el.innerHTML = this.hint(k);
      });
    }
    return true;
  },

  drawTokens(ctx, x, y, tokens, size = 14) {
    ctx.save();
    const gap = 4;
    let cx = x;
    for (const t of (tokens || [])) {
      let w;
      if (t.shape) {
        const r = size / 2;
        const midX = cx + r, midY = y + r;
        ctx.beginPath();
        ctx.arc(midX, midY, r + 1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10,6,16,0.85)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,211,77,0.6)';
        ctx.stroke();
        const rr = r * 0.55;
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.FACE_COLORS[t.shape] || '#fff';
        ctx.beginPath();
        if (t.shape === 'cross') {
          ctx.moveTo(midX - rr, midY - rr); ctx.lineTo(midX + rr, midY + rr);
          ctx.moveTo(midX + rr, midY - rr); ctx.lineTo(midX - rr, midY + rr);
        } else if (t.shape === 'circle') {
          ctx.arc(midX, midY, rr, 0, Math.PI * 2);
        } else if (t.shape === 'square') {
          ctx.rect(midX - rr, midY - rr, rr * 2, rr * 2);
        } else if (t.shape === 'triangle') {
          ctx.moveTo(midX, midY - rr);
          ctx.lineTo(midX + rr, midY + rr);
          ctx.lineTo(midX - rr, midY + rr);
          ctx.closePath();
        }
        ctx.stroke();
        w = size;
      } else {
        const label = t.label || '';
        const measured = ctx.measureText ? (ctx.measureText(label).width || 0) : 0;
        w = measured + 8;
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(cx, y, w, size, 4);
          ctx.fillStyle = 'rgba(10,6,16,0.85)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,211,77,0.6)';
          ctx.stroke();
        } else if (ctx.fillRect) {
          ctx.fillStyle = 'rgba(10,6,16,0.85)';
          ctx.fillRect(cx, y, w, size);
        }
        ctx.fillStyle = '#cfcfcf';
        ctx.font = `bold ${size - 3}px Georgia`;
        if (ctx.fillText) ctx.fillText(label, cx + 4, y + size - 4);
      }
      cx += w + gap;
    }
    ctx.restore();
    const total = cx - x - gap;
    return total > 0 ? total : 0;
  },
};
