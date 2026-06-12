// ============================================================
// CHAKRAVYUHA — audio.js : WebAudio synthesized SFX + music
// All sound is generated in code (no assets, fully open source).
// Music = tanpura-style drone (sa–pa) with slow shimmer per biome.
// ============================================================
'use strict';

const AUDIO = {
  ctx: null,
  master: null,
  musicGain: null,
  musicNodes: [],
  muted: false,
  currentDrone: null,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    } catch (e) { this.ctx = null; }
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },

  // --- low-level blip builder ---
  tone({ freq = 440, end = freq, dur = 0.12, type = 'sine', vol = 0.3, attack = 0.005, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  },

  noise({ dur = 0.15, vol = 0.2, freq = 1000, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = freq; filt.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t0);
  },

  // --- game SFX vocabulary ---
  sfx(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'swing':    this.noise({ dur: 0.08, vol: 0.12, freq: 2400 }); break;
      case 'hit':      this.tone({ freq: 220, end: 90, dur: 0.08, type: 'square', vol: 0.12 });
                       this.noise({ dur: 0.05, vol: 0.1, freq: 900 }); break;
      case 'crit':     this.tone({ freq: 660, end: 130, dur: 0.14, type: 'square', vol: 0.16 });
                       this.noise({ dur: 0.1, vol: 0.14, freq: 1400 }); break;
      case 'hurt':     this.tone({ freq: 160, end: 60, dur: 0.22, type: 'sawtooth', vol: 0.2 }); break;
      case 'dash':     this.noise({ dur: 0.12, vol: 0.1, freq: 3200 });
                       this.tone({ freq: 500, end: 900, dur: 0.1, type: 'sine', vol: 0.08 }); break;
      case 'bow':      this.tone({ freq: 900, end: 1500, dur: 0.1, type: 'triangle', vol: 0.1 }); break;
      case 'cast':     this.tone({ freq: 700, end: 1400, dur: 0.2, type: 'sine', vol: 0.16 });
                       this.tone({ freq: 1050, end: 2100, dur: 0.2, type: 'sine', vol: 0.08, delay: 0.02 }); break;
      case 'special':  this.tone({ freq: 300, end: 80, dur: 0.3, type: 'sawtooth', vol: 0.18 });
                       this.noise({ dur: 0.2, vol: 0.12, freq: 600 }); break;
      case 'kill':     this.tone({ freq: 300, end: 50, dur: 0.25, type: 'square', vol: 0.14 });
                       this.noise({ dur: 0.18, vol: 0.12, freq: 500 }); break;
      case 'coin':     this.tone({ freq: 1318, end: 1318, dur: 0.06, type: 'sine', vol: 0.1 });
                       this.tone({ freq: 1760, end: 1760, dur: 0.1, type: 'sine', vol: 0.1, delay: 0.05 }); break;
      case 'punya':    this.tone({ freq: 880, dur: 0.1, type: 'sine', vol: 0.12 });
                       this.tone({ freq: 1108, dur: 0.12, type: 'sine', vol: 0.12, delay: 0.07 });
                       this.tone({ freq: 1318, dur: 0.2, type: 'sine', vol: 0.12, delay: 0.14 }); break;
      case 'boon':     [523, 659, 784, 1046].forEach((f, i) =>
                         this.tone({ freq: f, dur: 0.3, type: 'sine', vol: 0.12, delay: i * 0.08 })); break;
      case 'heal':     this.tone({ freq: 523, end: 1046, dur: 0.35, type: 'sine', vol: 0.14 }); break;
      case 'door':     this.tone({ freq: 392, end: 196, dur: 0.4, type: 'triangle', vol: 0.14 }); break;
      case 'roomclear':this.tone({ freq: 659, dur: 0.12, vol: 0.1 });
                       this.tone({ freq: 880, dur: 0.18, vol: 0.1, delay: 0.1 }); break;
      case 'bosshurt': this.tone({ freq: 110, end: 45, dur: 0.3, type: 'sawtooth', vol: 0.2 }); break;
      case 'bossdie':  [200, 150, 100, 60].forEach((f, i) =>
                         this.tone({ freq: f, end: f * 0.4, dur: 0.4, type: 'square', vol: 0.15, delay: i * 0.15 }));
                       this.noise({ dur: 0.8, vol: 0.2, freq: 300 }); break;
      case 'death':    [392, 330, 262, 196].forEach((f, i) =>
                         this.tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.14, delay: i * 0.25 })); break;
      case 'victory':  [523, 659, 784, 1046, 1318].forEach((f, i) =>
                         this.tone({ freq: f, dur: 0.5, type: 'sine', vol: 0.13, delay: i * 0.13 })); break;
      case 'buy':      this.tone({ freq: 988, dur: 0.08, vol: 0.12 });
                       this.tone({ freq: 1318, dur: 0.14, vol: 0.12, delay: 0.06 }); break;
      case 'deny':     this.tone({ freq: 180, end: 140, dur: 0.15, type: 'square', vol: 0.12 }); break;
      case 'defiance': [262, 392, 523, 784].forEach((f, i) =>
                         this.tone({ freq: f, dur: 0.4, type: 'sine', vol: 0.16, delay: i * 0.1 })); break;
      case 'shield':   this.tone({ freq: 1200, end: 600, dur: 0.15, type: 'triangle', vol: 0.14 }); break;
      case 'burn':     this.noise({ dur: 0.12, vol: 0.07, freq: 1800 }); break;
      case 'shock':    this.tone({ freq: 2400, end: 400, dur: 0.07, type: 'sawtooth', vol: 0.09 }); break;
      case 'click':    this.tone({ freq: 800, dur: 0.04, type: 'sine', vol: 0.08 }); break;
    }
  },

  // --- tanpura-style drone, root note per biome ---
  startDrone(rootHz) {
    this.stopDrone();
    if (!this.ctx) return;
    const make = (freq, vol, detune = 0) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = freq * 4; filt.Q.value = 2;
      // slow amplitude shimmer like a plucked tanpura string ringing
      const lfo = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      lfo.frequency.value = U.rand(0.08, 0.2);
      lfoG.gain.value = vol * 0.4;
      g.gain.value = vol * 0.6;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      osc.connect(filt); filt.connect(g); g.connect(this.musicGain);
      osc.start(); lfo.start();
      this.musicNodes.push(osc, lfo);
    };
    // sa, sa (octave), pa — the classic tanpura tuning
    make(rootHz, 0.5);
    make(rootHz, 0.25, 6);
    make(rootHz * 2, 0.2, -4);
    make(rootHz * 1.5, 0.3, 3);
    this.currentDrone = rootHz;
  },

  stopDrone() {
    for (const n of this.musicNodes) { try { n.stop(); } catch (e) {} }
    this.musicNodes = [];
    this.currentDrone = null;
  },
};
