// Teclado virtual para usar com controle (também funciona com mouse e com o teclado físico).
//   A digita · X apaga · Y espaço · LB/RB move o cursor · SELECT maiúscula · START confirma · B cancela
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  const LAYERS = {
    abc: ['1234567890', 'qwertyuiop', 'asdfghjklç', 'zxcvbnm.-_'],
    sym: ['!@#$%^&*()', '-_=+[]{}|\\', ':;\'",.<>/?', '~`°ªº£§¿¡€'],
    acc: ['áàâãäéèêëí', 'ìîïóòôõöúù', 'ûüçñýÿœß-_', '.,!?:;/\\()'],
  };

  const PAD_HINTS = [
    ['A', 'Digitar', 'a'], ['X', 'Apagar', 'x'], ['Y', 'Espaço', 'y'],
    ['LB RB', 'Cursor', 'w'], ['VIEW', 'Maiúscula', 'w'], ['MENU', 'Concluir', 's'], ['B', 'Cancelar', 'b'],
  ];
  const KB_HINTS = [['Enter', 'Concluir'], ['Esc', 'Cancelar'], ['←→', 'Cursor']];

  let st = null; // estado do teclado aberto
  const root = () => $('#osk');

  function isUp() {
    if (!st) return false;
    if (st.shift > 0) return true;
    return st.autoCap && /(^|\s)$/.test(st.buf.slice(0, st.pos));
  }

  function renderText() {
    const MAXV = 46;
    let before = st.buf.slice(0, st.pos);
    let after = st.buf.slice(st.pos);
    if (before.length > MAXV) before = '…' + before.slice(-MAXV);
    if (after.length > 12) after = after.slice(0, 12) + '…';
    $('#oskBefore').textContent = before;
    $('#oskAfter').textContent = after;
    $('#oskLen').textContent = st.max ? `${st.buf.length}/${st.max}` : '';
  }

  function labelFor(k) {
    if (k.t === 'char') return isUp() ? k.ch.toLocaleUpperCase('pt-BR') : k.ch;
    if (k.t === 'layer') return st.layer === k.to ? 'abc' : k.label;
    return k.label;
  }

  function refreshKeys() {
    st.keys.forEach((k, i) => {
      const b = st.els[i];
      b.textContent = labelFor(k);
      if (k.t === 'shift') {
        b.classList.toggle('lock', st.shift === 2);
        b.classList.toggle('act', st.shift > 0 || (st.autoCap && isUp()));
      }
      if (k.t === 'layer') b.classList.toggle('act', st.layer === k.to);
    });
  }

  function buildKeys() {
    const box = $('#oskKeys');
    box.replaceChildren();
    st.keys = []; st.els = [];
    const add = (k, span = 1) => {
      const b = mk('button', 'k k-' + k.t);
      b.type = 'button';
      b.style.gridColumn = `span ${span}`;
      b.dataset.i = st.keys.length;
      st.keys.push(k); st.els.push(b);
      box.append(b);
    };
    for (const row of LAYERS[st.layer]) for (const ch of [...row]) add({ t: 'char', ch });
    add({ t: 'shift', label: '⇧' });
    add({ t: 'layer', to: 'sym', label: '#+=' });
    add({ t: 'layer', to: 'acc', label: 'áé' });
    add({ t: 'space', label: 'ESPAÇO' }, 4);
    add({ t: 'bksp', label: '⌫' });
    add({ t: 'ok', label: 'OK' }, 2);
    refreshKeys();
    markActive();
  }

  function markActive() {
    st.els.forEach((b, i) => b.classList.toggle('on', i === st.idx));
  }

  function setIdx(i) {
    st.idx = i;
    markActive();
    if (window.Sound) Sound.tick(i);
  }

  // navegação geométrica: funciona com qualquer largura de tecla
  function navigate(els, idx, dir) {
    const rects = els.map((b) => b.getBoundingClientRect());
    const r0 = rects[idx];
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    const rowH = r0.height;
    let best = -1, bestKey = null;
    rects.forEach((r, i) => {
      if (i === idx) return;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      const sameRow = Math.abs(dy) < rowH * 0.5;
      let key = null;
      if (dir === 'left' && sameRow && dx < -1) key = [0, -dx];
      else if (dir === 'right' && sameRow && dx > 1) key = [0, dx];
      else if (dir === 'up' && dy < -rowH * 0.5) key = [-dy, Math.abs(dx)];
      else if (dir === 'down' && dy > rowH * 0.5) key = [dy, Math.abs(dx)];
      if (!key) return;
      if (!bestKey || key[0] < bestKey[0] - 1 || (Math.abs(key[0] - bestKey[0]) <= 1 && key[1] < bestKey[1])) {
        best = i; bestKey = key;
      }
    });
    if (best >= 0) return best;
    // sem vizinho: dá a volta na mesma linha
    if (dir === 'left' || dir === 'right') {
      let wrap = idx, ext = dir === 'left' ? -Infinity : Infinity;
      rects.forEach((r, i) => {
        if (Math.abs(r.top - r0.top) > rowH * 0.5) return;
        const x = r.left + r.width / 2;
        if (dir === 'left' ? x > ext : x < ext) { ext = x; wrap = i; }
      });
      return wrap;
    }
    return idx;
  }

  const geo = (dir) => navigate(st.els, st.idx, dir);

  // ---------------------------------------------------------------- edição
  function insert(ch) {
    if (st.max && st.buf.length + ch.length > st.max) { if (window.Sound) Sound.error(); return; }
    st.buf = st.buf.slice(0, st.pos) + ch + st.buf.slice(st.pos);
    st.pos += ch.length;
    if (st.shift === 1) st.shift = 0;
    renderText(); refreshKeys();
    if (window.Sound) Sound.key();
  }
  function backspace() {
    if (st.pos > 0) {
      st.buf = st.buf.slice(0, st.pos - 1) + st.buf.slice(st.pos);
      st.pos--;
      renderText(); refreshKeys();
      if (window.Sound) Sound.keyDel();
    }
  }
  function del() {
    if (st.pos < st.buf.length) {
      st.buf = st.buf.slice(0, st.pos) + st.buf.slice(st.pos + 1);
      renderText();
      if (window.Sound) Sound.keyDel();
    }
  }
  function caret(d) {
    st.pos = Math.max(0, Math.min(st.buf.length, st.pos + d));
    renderText(); refreshKeys();
    if (window.Sound) Sound.tick(st.pos + 3);
  }

  function press(i) {
    const k = st.keys[i];
    if (!k) return;
    switch (k.t) {
      case 'char': insert(isUp() ? k.ch.toLocaleUpperCase('pt-BR') : k.ch); break;
      case 'space': insert(' '); break;
      case 'bksp': backspace(); break;
      case 'shift':
        st.shift = (st.shift + 1) % 3; refreshKeys();
        if (window.Sound) Sound.key();
        break;
      case 'layer': {
        st.layer = st.layer === k.to ? 'abc' : k.to;
        const keepIdx = st.idx;
        buildKeys();
        st.idx = Math.min(keepIdx, st.keys.length - 1); markActive();
        if (window.Sound) Sound.key();
        break;
      }
      case 'ok': done(); break;
      default:
    }
  }

  function done() {
    const cb = st.onDone, v = st.buf;
    close();
    if (cb) cb(v);
  }
  function cancel() {
    const cb = st.onCancel;
    close();
    if (cb) cb();
  }
  function close() {
    root().classList.remove('on');
    st = null;
  }

  // ---------------------------------------------------------------- API
  function renderHints(pad) {
    const box = $('#oskHints');
    box.replaceChildren();
    for (const [k, label, cls] of (pad ? PAD_HINTS : KB_HINTS)) {
      const s = mk('span');
      s.append(mk('kbd', cls ? 'pb ' + cls : null, k), document.createTextNode(label));
      box.append(s);
    }
  }

  function open({ label, value = '', max = 0, autoCap = false, pad = false, onDone, onCancel }) {
    st = {
      buf: String(value || ''), pos: String(value || '').length, max, autoCap,
      shift: 0, layer: 'abc', idx: 0, keys: [], els: [], onDone, onCancel,
    };
    $('#oskLabel').textContent = label || '';
    renderHints(pad);
    buildKeys();
    st.idx = 10; markActive(); // começa na letra Q
    renderText();
    root().classList.add('on');
  }

  // ação vinda do controle / navegação (mesmos nomes do act() do app)
  function act(a) {
    if (!st) return;
    switch (a) {
      case 'left': case 'right': case 'up': case 'down': setIdx(geo(a)); break;
      case 'confirm': press(st.idx); break;
      case 'fav': backspace(); break;            // X
      case 'add': insert(' '); break;            // Y
      case 'prevFilter': caret(-1); break;       // LB
      case 'nextFilter': caret(1); break;        // RB
      case 'refresh': st.shift = (st.shift + 1) % 3; refreshKeys(); if (window.Sound) Sound.key(); break; // VIEW
      case 'menu': done(); break;                // START
      case 'back': cancel(); break;              // B
      default:
    }
  }

  // teclado físico
  function onKey(e) {
    if (!st) return;
    const k = e.key;
    if (k === 'Escape') return cancel();
    if (k === 'Enter') return done();
    if (k === 'Backspace') return backspace();
    if (k === 'Delete') return del();
    if (k === 'ArrowLeft') return caret(-1);
    if (k === 'ArrowRight') return caret(1);
    if (k === 'Home') { st.pos = 0; return renderText(); }
    if (k === 'End') { st.pos = st.buf.length; return renderText(); }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) insert(k);
  }

  document.addEventListener('click', (e) => {
    if (!st) return;
    const b = e.target.closest && e.target.closest('#oskKeys .k');
    if (!b) return;
    st.idx = +b.dataset.i; markActive();
    press(st.idx);
  });

  window.OSK = { open, act, onKey, nav: navigate, get isOpen() { return !!st; } };
})();
