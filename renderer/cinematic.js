// Abertura e encerramento do All in One, com tempo e som sincronizados.
//
// ABERTURA (≈3,9 s)
//   0,00  vazio azul-marinho, partículas de poeira de luz subindo devagar (câmera em "push-in")
//   0,55  três barras de luz entram em alta velocidade (rastro esticado) e se encaixam na marca
//   1,33  IMPACTO: clarão, onda de choque, faíscas, divisão cromática e tremor curto da cena
//   1,55  o nome surge letra por letra, com varredura de brilho; linha de luz se abre embaixo
//   2,35  frase de apoio; segura; dissolve para o hub
//
// ENCERRAMENTO (≈2,7 s)
//   a interface desfoca e escurece → a marca aparece → barras saem → anel implode →
//   o ponto vira uma linha de luz e some (tela desligando)
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const T = { impact: 1.33, end: 3.9, skipAfter: 0.9, outro: 2.75 };

  const S = { active: false, skipFn: null };

  // ---------------------------------------------------------------- partículas
  function makeSprite(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, color);
    r.addColorStop(0.25, color.replace(/[\d.]+\)$/, '0.35)'));
    r.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return c;
  }

  function makeFx(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = canvas.width = Math.floor(window.innerWidth * dpr);
      H = canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    const sprites = [
      makeSprite('rgba(41,230,255,1)'),
      makeSprite('rgba(123,108,255,1)'),
      makeSprite('rgba(255,255,255,1)'),
    ];
    const motes = Array.from({ length: 120 }, () => ({
      x: Math.random(), y: Math.random(), z: 0.15 + Math.random() * 0.85,
      ph: Math.random() * 6.283, s: Math.floor(Math.random() * 3),
    }));
    let sparks = [];
    let burst = false;

    function doBurst() {
      burst = true;
      const mw = document.querySelector('.markwrap').getBoundingClientRect();
      const cx = (mw.left + mw.width / 2) * dpr, cy = (mw.top + mw.height / 2) * dpr;
      for (let i = 0; i < 170; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (260 + Math.random() * 1500) * dpr;
        sparks.push({
          x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.78,
          life: 0.8 + Math.random() * 1.1, age: 0, s: Math.floor(Math.random() * 3),
          w: (0.8 + Math.random() * 1.8) * dpr,
        });
      }
    }

    let last = 0;
    function frame(t) {
      const dt = Math.min(0.05, Math.max(0, t - last));
      last = t;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      // poeira de luz: aparece aos poucos e acelera um pouco no impacto
      const fadeIn = Math.min(1, t / 0.9);
      const boost = t > T.impact ? 1 + Math.max(0, 1 - (t - T.impact) / 1.2) * 1.4 : 1;
      for (const m of motes) {
        m.y -= dt * 0.012 * m.z * boost;
        if (m.y < -0.05) m.y = 1.05;
        const x = m.x * W + Math.sin(t * 0.45 + m.ph) * 26 * m.z * dpr;
        const y = m.y * H;
        const r = (5 + 15 * m.z) * dpr;
        ctx.globalAlpha = (0.12 + 0.42 * m.z) * fadeIn * (0.65 + 0.35 * Math.sin(t * 1.3 + m.ph));
        ctx.drawImage(sprites[m.s], x - r, y - r, r * 2, r * 2);
      }

      if (!burst && t >= T.impact) doBurst();

      // faíscas: riscos de luz na direção do movimento, com atrito
      ctx.lineCap = 'round';
      const colors = ['rgba(41,230,255,', 'rgba(150,140,255,', 'rgba(255,255,255,'];
      sparks = sparks.filter((p) => (p.age += dt) < p.life);
      for (const p of sparks) {
        const k = Math.exp(-2.4 * dt);
        p.vx *= k; p.vy *= k;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const a = 1 - p.age / p.life;
        ctx.globalAlpha = Math.min(1, a * 1.3);
        ctx.strokeStyle = colors[p.s] + '1)';
        ctx.lineWidth = p.w * (0.4 + a);
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    return { frame, resize, clear: () => ctx.clearRect(0, 0, W, H) };
  }

  // ---------------------------------------------------------------- ABERTURA
  function buildWord() {
    const w = $('#word');
    if (w.childElementCount) return;
    [...'ALL IN ONE'].forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch === ' ' ? ' ' : ch;
      s.style.setProperty('--i', i);
      w.append(s);
    });
  }

  function intro() {
    return new Promise((resolve) => {
      const sp = $('#splash');
      buildWord();
      const fx = makeFx($('#fx'));
      const t0 = performance.now();
      let raf = 0, finished = false;

      sp.classList.remove('out', 'done');
      void sp.offsetWidth;
      sp.classList.add('go');
      S.active = true;
      if (window.Sound) Sound.intro();

      const loop = () => {
        fx.frame((performance.now() - t0) / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const finish = () => {
        if (finished) return;
        finished = true;
        S.active = false; S.skipFn = null;
        cancelAnimationFrame(raf);
        resolve();
      };
      const timer = setTimeout(finish, T.end * 1000);

      S.skipFn = () => {
        if (performance.now() - t0 < T.skipAfter * 1000) return;
        clearTimeout(timer);
        if (window.Sound) Sound.cut();
        finish();
      };
      window.addEventListener('resize', fx.resize);
    });
  }

  // dissolve a abertura e deixa o hub aparecer
  function reveal() {
    const sp = $('#splash');
    sp.classList.add('out');
    setTimeout(() => {
      sp.classList.remove('go');
      sp.classList.add('done');
      const c = $('#fx');
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
    }, 950);
  }

  // ---------------------------------------------------------------- ENCERRAMENTO
  function outro() {
    return new Promise((resolve) => {
      const o = $('#outro');
      document.body.classList.add('leaving');
      o.classList.add('go');
      if (window.Sound) Sound.outro();
      setTimeout(resolve, T.outro * 1000);
    });
  }

  window.Cinematic = {
    intro, reveal, outro,
    skip() { if (S.skipFn) S.skipFn(); },
    get active() { return S.active; },
  };
})();
