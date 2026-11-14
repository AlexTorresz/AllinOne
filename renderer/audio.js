// Áudio 100% sintetizado (Web Audio): nenhum arquivo de som, nada para baixar.
//   - música ambiente generativa (pads + baixo + arpejo com eco)
//   - cada jogo tem uma "nota assinatura" que toca ao passar por ele
//   - sons de confirmar/jogar, voltar, filtro, menu, favorito, erro e abertura
(() => {
  'use strict';

  const KEY = 'aio.audio';
  const cfg = { music: true, sfx: true };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* sem storage */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* ok */ } };

  const MUSIC_LEVEL = 0.5;
  const SFX_LEVEL = 0.8;
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const PENTA = [0, 3, 5, 7, 10]; // pentatônica menor
  const PROG = [[57, 60, 64], [53, 57, 60], [48, 55, 60], [55, 59, 62]]; // Am F C G
  const BASS = [33, 29, 36, 31];
  const BPM = 84;
  const BEAT = 60 / BPM;
  const BAR = BEAT * 4;

  let ctx = null, master, sfxBus, musicBus, verbIn, arpIn;
  let timer = null, nextT = 0, barIdx = 0, ducked = false, started = false;

  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(comp); comp.connect(ctx.destination);

    sfxBus = ctx.createGain(); sfxBus.gain.value = cfg.sfx ? SFX_LEVEL : 0; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);

    const conv = ctx.createConvolver(); conv.buffer = impulse(2.8, 2.6);
    const vout = ctx.createGain(); vout.gain.value = 0.55;
    verbIn = ctx.createGain();
    verbIn.connect(conv); conv.connect(vout); vout.connect(master);

    // eco do arpejo
    arpIn = ctx.createGain();
    const dly = ctx.createDelay(1); dly.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    arpIn.connect(musicBus);
    arpIn.connect(dly); dly.connect(lp); lp.connect(fb); fb.connect(dly); lp.connect(musicBus);
    const send = ctx.createGain(); send.gain.value = 0.5; arpIn.connect(send); send.connect(verbIn);
    return ctx;
  }

  // ---------------------------------------------------------------- blocos de som
  function tone({ f, t = 0, dur = 0.14, type = 'sine', gain = 0.2, a = 0.004, to = null, send = 0.2, detune = 0, pan = 0, bus = null }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    let out = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p;
    }
    out.connect(bus || sfxBus);
    if (send) { const s = ctx.createGain(); s.gain.value = send; out.connect(s); s.connect(verbIn); }
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise({ t = 0, dur = 0.3, from = 400, to = 4000, gain = 0.1, q = 1.2, send = 0.3 }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + t;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(from, t0);
    bp.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(sfxBus);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(verbIn); }
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // sino FM (timbre de "chime" de abertura de console)
  function bell({ f, t = 0, dur = 1.8, gain = 0.08, ratio = 3.5, index = 2.4, send = 0.65, pan = 0 }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + t;
    const car = ctx.createOscillator(), mod = ctx.createOscillator();
    car.type = 'sine'; mod.type = 'sine';
    car.frequency.value = f; mod.frequency.value = f * ratio;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * index, t0);
    mg.gain.exponentialRampToValueAtTime(f * 0.04, t0 + dur * 0.55);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.007);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    car.connect(g);
    let out = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(sfxBus);
    if (send) { const s = ctx.createGain(); s.gain.value = send; out.connect(s); s.connect(verbIn); }
    car.start(t0); mod.start(t0); car.stop(t0 + dur + 0.05); mod.stop(t0 + dur + 0.05);
  }

  // ---------------------------------------------------------------- música
  function pad(t, notes, dur) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(420, t);
    f.frequency.linearRampToValueAtTime(1500, t + dur * 0.6);
    f.frequency.linearRampToValueAtTime(520, t + dur + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.075, t + 1.8);
    g.gain.setValueAtTime(0.075, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 2.4);
    f.connect(g); g.connect(musicBus);
    const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(verbIn);
    for (const n of notes) {
      for (const dt of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = dt;
        o.connect(f); o.start(t); o.stop(t + dur + 2.6);
      }
    }
  }

  function bass(t, n, len) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + len + 0.05);
  }

  function pluck(t, n) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g); g.connect(arpIn); o.start(t); o.stop(t + 0.46);
  }

  function playBar(t, i) {
    const chordIdx = (i >> 1) % PROG.length;
    const chord = PROG[chordIdx];
    if (i % 2 === 0) pad(t, chord, BAR * 2);
    bass(t, BASS[chordIdx], BEAT * 1.6);
    if (i % 2 === 1) bass(t + BEAT * 2.5, BASS[chordIdx] + 12, BEAT * 0.9);
    // arpejo em colcheias, com lacunas para respirar
    const pool = [...chord.map((n) => n + 12), ...chord.map((n) => n + 24)];
    for (let s = 0; s < 8; s++) {
      if (Math.random() < (s % 2 === 0 ? 0.72 : 0.4)) {
        pluck(t + s * BEAT * 0.5, pool[Math.floor(Math.random() * pool.length)]);
      }
    }
  }

  function scheduler() {
    if (!ctx) return;
    while (nextT < ctx.currentTime + 1.5) {
      playBar(nextT, barIdx++);
      nextT += BAR;
    }
  }

  function fadeMusic(level, sec) {
    if (!ctx) return;
    const g = musicBus.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(level, ctx.currentTime + sec);
  }

  function startMusic() {
    if (!ensure() || started) return;
    started = true;
    nextT = ctx.currentTime + 0.2;
    scheduler();
    timer = setInterval(scheduler, 300);
    if (cfg.music && !ducked) fadeMusic(MUSIC_LEVEL, 4);
  }

  // ---------------------------------------------------------------- efeitos
  const api = {
    // Ligar tudo; precisa ser chamado uma vez (a Electron libera o autoplay).
    init(opts = {}) {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!opts.deferMusic) startMusic();
    },
    startMusic() { startMusic(); },
    resume() {
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },

    // Cada jogo tem sua nota: o mesmo jogo soa igual sempre.
    move(seed, dir = 1) {
      if (!cfg.sfx) return;
      const h = seed >>> 0;
      const n = 57 + PENTA[h % 5] + 12 * ((h >> 3) % 3);
      const f = midi(n);
      tone({ f, dur: 0.16, type: 'triangle', gain: 0.22, pan: dir * 0.18 });
      tone({ f: f * 2, dur: 0.09, type: 'sine', gain: 0.07, send: 0.35 });
      noise({ dur: 0.04, from: 3000, to: 6000, gain: 0.03, send: 0 });
    },
    filter() {
      if (!cfg.sfx) return;
      tone({ f: 523, to: 784, dur: 0.12, type: 'square', gain: 0.05, send: 0.3 });
      tone({ f: 784, t: 0.06, dur: 0.16, type: 'triangle', gain: 0.16 });
    },
    confirm() {
      if (!cfg.sfx) return;
      tone({ f: 660, dur: 0.1, type: 'square', gain: 0.06 });
      tone({ f: 990, t: 0.06, dur: 0.2, type: 'triangle', gain: 0.2 });
    },
    back() {
      if (!cfg.sfx) return;
      tone({ f: 523, dur: 0.09, type: 'triangle', gain: 0.17 });
      tone({ f: 392, t: 0.07, dur: 0.16, type: 'triangle', gain: 0.17 });
    },
    menu(open = true) {
      if (!cfg.sfx) return;
      noise({ dur: 0.28, from: open ? 300 : 3000, to: open ? 3200 : 300, gain: 0.07 });
      tone({ f: open ? 440 : 330, to: open ? 660 : 220, dur: 0.18, type: 'sine', gain: 0.14 });
    },
    fav(on) {
      if (!cfg.sfx) return;
      const notes = on ? [784, 988, 1319] : [988, 740, 587];
      notes.forEach((f, i) => tone({ f, t: i * 0.07, dur: 0.22, type: 'triangle', gain: 0.15, send: 0.4 }));
    },
    error() {
      if (!cfg.sfx) return;
      tone({ f: 150, to: 90, dur: 0.28, type: 'sawtooth', gain: 0.12, send: 0.1 });
      tone({ f: 120, t: 0.12, to: 70, dur: 0.28, type: 'sawtooth', gain: 0.1, send: 0.1 });
    },
    // Abrir o jogo: varredura + acorde subindo + pancada grave. A música abaixa.
    launch() {
      if (cfg.sfx) {
        noise({ dur: 0.9, from: 200, to: 7000, gain: 0.12, q: 0.9, send: 0.5 });
        [57, 64, 69, 72, 76, 81].forEach((n, i) =>
          tone({ f: midi(n), t: i * 0.06, dur: 0.9, type: 'triangle', gain: 0.13, send: 0.5 }));
        tone({ f: 110, to: 38, dur: 0.5, type: 'sine', gain: 0.4, send: 0.1 });
      }
      ducked = true;
      fadeMusic(0, 1.4);
    },
    boot() {
      if (!cfg.sfx) return;
      [45, 52, 57, 64, 69].forEach((n, i) =>
        tone({ f: midi(n), t: i * 0.11, dur: 2.2, type: 'sawtooth', gain: 0.045, send: 0.6, detune: i % 2 ? 7 : -7 }));
      noise({ dur: 1.4, from: 150, to: 5000, gain: 0.06, q: 0.7, send: 0.6 });
      tone({ f: midi(81), t: 0.5, dur: 1.6, type: 'sine', gain: 0.1, send: 0.7 });
    },

    // teclado virtual e navegação fina
    tick(i = 0) {
      if (!cfg.sfx) return;
      tone({ f: 880 + (i % 10) * 38, dur: 0.035, type: 'sine', gain: 0.06, send: 0.05 });
    },
    key() {
      if (!cfg.sfx) return;
      tone({ f: 1320, dur: 0.05, type: 'triangle', gain: 0.1, send: 0.1 });
      noise({ dur: 0.02, from: 4000, to: 7000, gain: 0.025, send: 0 });
    },
    keyDel() {
      if (!cfg.sfx) return;
      tone({ f: 700, to: 420, dur: 0.07, type: 'triangle', gain: 0.1, send: 0.05 });
    },

    // ABERTURA (≈3,9 s): subida de ar → impacto (1,33 s) → acorde de sinos → cintilar → cauda.
    intro() {
      if (!cfg.sfx || !ensure()) return;
      api.resume();
      noise({ t: 0.25, dur: 1.1, from: 180, to: 9000, gain: 0.11, q: 0.8, send: 0.5 });
      tone({ f: midi(45), t: 0.3, to: midi(69), dur: 1.05, type: 'sawtooth', gain: 0.03, a: 0.5, send: 0.4 });
      tone({ f: midi(57), t: 0.5, to: midi(81), dur: 0.85, type: 'triangle', gain: 0.05, a: 0.4, send: 0.5 });
      // impacto
      tone({ f: 74, t: 1.32, to: 30, dur: 1.0, type: 'sine', gain: 0.6, send: 0.1 });
      noise({ t: 1.32, dur: 0.55, from: 7000, to: 700, gain: 0.13, q: 0.6, send: 0.6 });
      [57, 64, 69, 72, 76].forEach((n, i) =>
        bell({ f: midi(n), t: 1.33 + i * 0.014, dur: 3.4, gain: 0.07, pan: (i - 2) * 0.12 }));
      [45, 52, 57, 64].forEach((n, i) =>
        tone({ f: midi(n), t: 1.34, dur: 3.2, type: 'sawtooth', gain: 0.028, a: 0.5, send: 0.7, detune: i % 2 ? 6 : -6 }));
      // cintilar enquanto o nome aparece
      [81, 84, 88, 93, 88, 84, 91, 96].forEach((n, i) =>
        bell({ f: midi(n), t: 1.62 + i * 0.105, dur: 1.5, gain: 0.04, ratio: 4.1, index: 1.6, send: 0.8, pan: (i % 2 ? 0.35 : -0.35) }));
      bell({ f: midi(105), t: 2.55, dur: 1.4, gain: 0.03, ratio: 5, send: 0.9 });
    },
    // pula a abertura: corta o som rápido
    cut() {
      if (!ctx || !sfxBus) return;
      const g = sfxBus.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.22);
      g.linearRampToValueAtTime(cfg.sfx ? SFX_LEVEL : 0, now + 0.6);
    },
    // ENCERRAMENTO (≈2,6 s): sinos descendo + varredura grave + "clique" de tela desligando
    outro() {
      fadeMusic(0, 0.7);
      if (!cfg.sfx || !ensure()) return;
      api.resume();
      [81, 76, 72, 69].forEach((n, i) =>
        bell({ f: midi(n), t: 0.45 + i * 0.27, dur: 1.9, gain: 0.07, pan: (i % 2 ? 0.2 : -0.2) }));
      [45, 52, 57].forEach((n) =>
        tone({ f: midi(n), t: 0.4, dur: 2.0, type: 'sawtooth', gain: 0.022, a: 0.4, send: 0.7 }));
      noise({ t: 1.1, dur: 0.85, from: 6500, to: 160, gain: 0.09, q: 0.7, send: 0.5 });
      tone({ f: 200, t: 1.15, to: 34, dur: 1.2, type: 'sine', gain: 0.32, send: 0.1 });
      tone({ f: 2200, t: 1.72, to: 120, dur: 0.3, type: 'square', gain: 0.04, send: 0.2 });
    },

    // Quando o hub perde o foco (um jogo abriu), cala; quando volta, retoma.
    away() {
      fadeMusic(0, 0.8);
    },
    back_to_hub() {
      ducked = false;
      api.resume();
      if (cfg.music) fadeMusic(MUSIC_LEVEL, 3);
    },

    toggleMusic() {
      cfg.music = !cfg.music; save();
      if (!ensure()) return cfg.music;
      api.resume();
      startMusic();
      fadeMusic(cfg.music && !ducked ? MUSIC_LEVEL : 0, 1.2);
      return cfg.music;
    },
    toggleSfx() {
      cfg.sfx = !cfg.sfx; save();
      if (ensure()) sfxBus.gain.value = cfg.sfx ? SFX_LEVEL : 0;
      return cfg.sfx;
    },
    get music() { return cfg.music; },
    get sfx() { return cfg.sfx; },
  };

  window.Sound = api;
})();
