(() => {
  'use strict';

  const aio = window.aio;
  const noop = new Proxy({}, { get: () => () => {} });
  const Sound = window.Sound || noop;
  const Cinematic = window.Cinematic || { intro: () => Promise.resolve(), reveal() {}, outro: () => Promise.resolve(), skip() {}, active: false };
  const OSK = window.OSK;
  const Platforms = window.Platforms;

  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const dom = {
    hero: $('#hero'), title: $('#title'), plat: $('#plat'), played: $('#played'), fav: $('#favMark'),
    ghost: $('#ghost'), idx: $('#idx'), of: $('#of'), filters: $('#filters'), deck: $('#deck'),
    railFill: $('#railFill'), clock: $('#clock'), padIcon: $('#padIcon'), sndIcon: $('#sndIcon'),
    hints: $('#hints'), toast: $('#toast'), play: $('#play'), playLabel: $('#playLabel'),
    kPrev: $('#kPrev'), kNext: $('#kNext'), crumb: $('#crumb'),
    menu: $('#menu'), menuList: $('#menuList'), menuTitle: $('#menuTitle'),
    form: $('#form'), formEl: $('#form form'), formEyebrow: $('#formEyebrow'), formErr: $('#formErr'), formHints: $('#formHints'),
    fTitle: $('#fTitle'), fExe: $('#fExe'), fArgs: $('#fArgs'), fCover: $('#fCover'),
    fPlat: $('#fPlat'), fPlatGlyph: $('#fPlatGlyph'), fPlatName: $('#fPlatName'), lblExe: $('#lblExe'), lblArgs: $('#lblArgs'),
    picker: $('#picker'), pickList: $('#pickList'), pickHints: $('#pickHints'),
    osk: $('#osk'),
    confirm: $('#confirm'), cfEyebrow: $('#cfEyebrow'), cfTitle: $('#cfTitle'), cfText: $('#cfText'),
    cfNo: $('#cfNo'), cfYes: $('#cfYes'), cfHints: $('#cfHints'),
    emptyTitle: $('#emptyTitle'), emptySub: $('#emptySub'),
    bgA: $('#bgA'), bgB: $('#bgB'), launch: $('#launch'), launchTitle: $('#launchTitle'), splash: $('#splash'),
  };

  const FILTERS = [
    { id: 'all', label: 'Todos' },
    { id: 'fav', label: 'Favoritos' },
    { id: 'steam', label: 'Steam' },
    { id: 'epic', label: 'Epic' },
    { id: 'gog', label: 'GOG' },
    { id: 'manual', label: 'Local' },
  ];
  const STORE = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', manual: 'Local' };
  const STORE_COLOR = { steam: '#5fb7ee', epic: '#f2f4f8', gog: '#b87bff', manual: '#b8ff3d' };

  const HINTS = {
    platforms: {
      kb: [['← →', 'Navegar'], ['Enter', 'Abrir'], ['N', 'Adicionar'], ['Tab', 'Menu'], ['M', 'Música']],
      pad: [['◀ ▶', 'Navegar'], ['A', 'Abrir', 'a'], ['Y', 'Adicionar', 'y'], ['MENU', 'Opções', 's']],
    },
    games: {
      kb: [['← →', 'Navegar'], ['Enter', 'Jogar'], ['Esc', 'Plataformas'], ['F', 'Favorito'], ['Tab', 'Menu'], ['N', 'Adicionar']],
      pad: [['◀ ▶', 'Navegar'], ['A', 'Jogar', 'a'], ['B', 'Plataformas', 'b'], ['X', 'Favorito', 'x'], ['Y', 'Adicionar', 'y'], ['MENU', 'Opções', 's']],
    },
    form: {
      kb: [['Tab', 'Próximo'], ['Enter', 'Salvar'], ['Esc', 'Cancelar']],
      pad: [['A', 'Selecionar', 'a'], ['B', 'Voltar', 'b'], ['MENU', 'Salvar', 's']],
    },
    picker: {
      kb: [['← → ↑ ↓', 'Mover'], ['Enter', 'Escolher'], ['Esc', 'Voltar']],
      pad: [['◀ ▶ ▲ ▼', 'Mover', 'w'], ['A', 'Escolher', 'a'], ['B', 'Voltar', 'b']],
    },
    confirm: {
      kb: [['← →', 'Escolher'], ['Enter', 'Confirmar'], ['Esc', 'Voltar']],
      pad: [['◀ ▶', 'Escolher', 'w'], ['A', 'Confirmar', 'a'], ['B', 'Voltar', 'b']],
    },
  };

  // preferências de interface (guardadas neste computador)
  const UI = { showEmpty: false, intro: true, last: 'windows' };
  try { Object.assign(UI, JSON.parse(localStorage.getItem('aio.ui') || '{}')); } catch { /* sem storage */ }
  const saveUI = () => { try { localStorage.setItem('aio.ui', JSON.stringify(UI)); } catch { /* ok */ } };

  const S = {
    all: [], view: [], items: [], sel: 0,
    mode: 'platforms',           // 'platforms' | 'games'
    system: 'windows',           // plataforma aberta no modo 'games'
    filter: 'all',               // filtro de jogos (loja / favoritos)
    group: 'all',                // filtro de plataformas (fabricante)
    hidden: 0, icons: {}, stack: [], scanning: true,
    input: 'kb', busy: false, cw: 300, quitting: false,
  };
  let switching = false;

  // ------------------------------------------------------------ cor e pôsteres
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }

  // Paleta vibrante por item: parte da cor da capa (ou de um hash do id). Plataformas já trazem a sua.
  function paletteOf(g) {
    if (g._pal) return g._pal;
    const { hslToHex } = Platforms;
    let h = hash(g.id) % 360;
    if (g.tone) {
      const [th, ts] = hexToHsl(g.tone);
      if (ts > 10) h = th;
    }
    const h2 = (h + 52) % 360;
    g._pal = {
      ac: hslToHex(h, 92, 60), ac2: hslToHex(h2, 88, 62),
      c1: hslToHex(h, 92, 58), c2: hslToHex(h, 55, 13), c3: hslToHex(h2, 90, 64),
    };
    return g._pal;
  }

  function fontSizeFor(title) {
    const n = title.length;
    if (n <= 8) return 17;
    if (n <= 14) return 12.5;
    if (n <= 22) return 9.5;
    if (n <= 34) return 7.6;
    return 6.2;
  }
  function tileFont(label) {
    const n = label.length;
    if (n <= 3) return 21;
    if (n <= 5) return 17;
    if (n <= 7) return 13.5;
    if (n <= 9) return 10.5;
    return 8.6;
  }

  const groupLabel = (id) => (Platforms.groups.find((g) => g.id === id) || { label: '' }).label;
  const sysOf = (g) => g.system || 'windows';

  // etiqueta (chip) do jogo: loja no Windows, nome curto do console nos demais
  function chipOf(g) {
    const sys = sysOf(g);
    if (sys !== 'windows' && Platforms.byId[sys]) {
      const p = Platforms.byId[sys];
      return { label: p.short, color: p._pal.ac };
    }
    return { label: STORE[g.platform] || '', color: STORE_COLOR[g.platform] };
  }

  function setPalette(p, node) {
    const pal = paletteOf(p);
    node.style.setProperty('--c1', pal.c1);
    node.style.setProperty('--c2', pal.c2);
    node.style.setProperty('--c3', pal.c3);
  }

  function fillGenerated(p, g) {
    p.classList.add('gen', 'v' + (hash(g.id) % 3));
    setPalette(g, p);
    p.style.setProperty('--fs', fontSizeFor(g.title));
    p.append(el('div', 'art'), el('span', 'plat', chipOf(g).label), el('span', 'name', g.title));
  }

  function makePoster(g) {
    const p = el('div', 'poster');
    if (g.coverUrl) {
      const img = new Image();
      img.alt = ''; img.draggable = false; img.decoding = 'async'; img.loading = 'lazy';
      img.onerror = () => { p.replaceChildren(); fillGenerated(p, g); };
      img.src = g.coverUrl;
      p.append(img);
    } else {
      fillGenerated(p, g);
    }
    return p;
  }

  // tile de plataforma: identidade própria + (se existir) a logo que você colocou na pasta de ícones
  function makeTile(p) {
    const t = el('div', 'poster gen ptile v' + (hash(p.id) % 3) + (p.count ? '' : ' empty'));
    setPalette(p, t);
    t.style.setProperty('--fs', tileFont(p.short));
    t.append(el('div', 'art'));
    const addGlyph = () => {
      const g = el('div', 'glyph');
      g.innerHTML = Platforms.glyphSvg(p.kind);
      t.append(g);
    };
    if (S.icons[p.id]) {
      const img = new Image();
      img.className = 'logo'; img.alt = ''; img.draggable = false;
      img.onerror = () => { img.remove(); addGlyph(); };
      img.src = S.icons[p.id];
      t.append(img);
    } else {
      addGlyph();
    }
    t.append(
      el('span', 'plat', groupLabel(p.group)),
      el('span', 'cnt', p.count === 0 ? 'vazio' : `${p.count} ${p.count === 1 ? 'jogo' : 'jogos'}`),
      el('span', 'name', p.short)
    );
    return t;
  }

  // ------------------------------------------------------------ dados
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
  function sortGames(list) {
    return [...list].sort((a, b) => {
      if (!!a.lastPlayed !== !!b.lastPlayed) return a.lastPlayed ? -1 : 1;
      if (a.lastPlayed !== b.lastPlayed) return b.lastPlayed - a.lastPlayed;
      return collator.compare(a.title, b.title);
    });
  }
  const gamesOf = (sys) => S.all.filter((g) => sysOf(g) === sys);
  const inFilter = (g, f) => f === 'all' || (f === 'fav' ? g.favorite : g.platform === f);
  const countFor = (f) => gamesOf(S.system).filter((g) => inFilter(g, f)).length;
  const cur = () => S.view[S.sel] || null;
  const signature = (list) => list.map((g) => g.id + (g.coverUrl ? '1' : '0') + sysOf(g)).join('|');

  function platformList() {
    const counts = {};
    for (const g of S.all) counts[sysOf(g)] = (counts[sysOf(g)] || 0) + 1;
    return Platforms.list
      .filter((p) => p.id === 'windows' || counts[p.id] || UI.showEmpty)
      .map((p) => ({ ...p, count: counts[p.id] || 0 }));
  }

  function playedText(ts) {
    if (!ts) return 'Nunca jogado';
    const d = Math.floor((Date.now() - ts) / 864e5);
    if (d <= 0) return 'Jogado hoje';
    if (d === 1) return 'Jogado ontem';
    if (d < 30) return `Jogado há ${d} dias`;
    const m = Math.floor(d / 30);
    return m === 1 ? 'Jogado há 1 mês' : `Jogado há ${m} meses`;
  }

  // ------------------------------------------------------------ fundo e destaque
  let bgFlip = false, bgTimer = null, bgFirst = true;
  function setBackdrop(g) {
    const pal = paletteOf(g);
    const root = document.documentElement.style;
    root.setProperty('--ac', pal.ac);
    root.setProperty('--ac2', pal.ac2);
    const layer = bgFlip ? dom.bgB : dom.bgA;
    const other = bgFlip ? dom.bgA : dom.bgB;
    bgFlip = !bgFlip;
    if (g.coverUrl) {
      layer.className = 'bgl img';
      layer.style.backgroundImage = `url("${g.coverUrl}")`;
    } else {
      layer.className = 'bgl';
      layer.style.backgroundImage =
        `radial-gradient(55vw 55vh at 72% 26%, color-mix(in srgb, ${pal.ac} 40%, transparent), transparent 70%),` +
        `radial-gradient(50vw 50vh at 6% 96%, color-mix(in srgb, ${pal.ac2} 32%, transparent), transparent 70%)`;
    }
    layer.classList.add('on');
    other.classList.remove('on');
  }
  function queueBackdrop(g) {
    clearTimeout(bgTimer);
    if (bgFirst) { bgFirst = false; setBackdrop(g); return; }
    bgTimer = setTimeout(() => setBackdrop(g), 90);
  }

  // ------------------------------------------------------------ modo (plataformas / jogos)
  function metrics() {
    const vh = window.innerHeight;
    const ch = Math.round(vh * 0.41);
    S.cw = ch * (S.mode === 'platforms' ? 1.2 : 2 / 3);
    const root = document.documentElement.style;
    root.setProperty('--ch', ch + 'px');
    root.setProperty('--cw', S.cw + 'px');
  }

  function applyMode() {
    document.body.dataset.mode = S.mode;
    const games = S.mode === 'games';
    dom.playLabel.textContent = games ? 'Jogar' : 'Abrir';
    dom.crumb.hidden = !games;
    if (games) {
      const p = Platforms.byId[S.system];
      dom.crumb.replaceChildren(document.createTextNode('Plataformas / '));
      const b = el('b', null, p ? p.short : S.system);
      b.style.setProperty('--pc', p ? p._pal.ac : 'var(--ac)');
      dom.crumb.append(b);
      dom.crumb.style.setProperty('--pc', p ? p._pal.ac : 'var(--ac)');
    }
    metrics();
    renderHints();
  }

  // fade rápido entre as telas, sem "pular"
  function transition(fn) {
    switching = true;
    dom.deck.classList.add('out');
    dom.hero.classList.add('out');
    setTimeout(() => {
      fn();
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        dom.deck.classList.remove('out');
        dom.hero.classList.remove('out');
        setTimeout(() => { switching = false; }, 140);
      })));
    }, 170);
  }

  function enterSystem(p) {
    if (!p) return;
    Sound.menu(true);
    transition(() => {
      S.mode = 'games'; S.system = p.id; S.filter = 'all';
      UI.last = p.id; saveUI();
      applyMode();
      buildView(null);
    });
  }
  function leaveSystem() {
    Sound.back();
    transition(() => {
      S.mode = 'platforms';
      applyMode();
      buildView(S.system);
    });
  }

  // ------------------------------------------------------------ renderização
  function renderFilters() {
    dom.filters.replaceChildren();
    if (S.mode === 'platforms') {
      const all = platformList();
      const present = Platforms.groups.filter((g) => all.some((p) => p.group === g.id));
      if (present.length < 2) return;
      const mkTab = (id, label, n) => {
        const b = el('button', 'tab' + (id === S.group ? ' on' : ''), label);
        b.append(el('b', null, pad2(n)));
        b.onclick = () => setGroup(id);
        dom.filters.append(b);
      };
      mkTab('all', 'Todas', all.length);
      for (const g of present) mkTab(g.id, g.label, all.filter((p) => p.group === g.id).length);
      return;
    }
    for (const f of FILTERS) {
      if (f.id === 'manual' && S.system !== 'windows') continue;
      const n = countFor(f.id);
      if (f.id !== 'all' && f.id !== S.filter && n === 0) continue;
      const b = el('button', 'tab' + (f.id === S.filter ? ' on' : ''), f.label);
      b.append(el('b', null, pad2(n)));
      b.onclick = () => setFilter(f.id);
      dom.filters.append(b);
    }
  }

  function makeItem(x, i) {
    const it = el('div', 'item');
    it.dataset.i = i;
    const tilt = el('div', 'tilt');
    const card = el('div', 'card');
    card.append(S.mode === 'platforms' ? makeTile(x) : makePoster(x));
    tilt.append(card, el('i', 'brk tl'), el('i', 'brk tr'), el('i', 'brk bl'), el('i', 'brk br'));
    it.append(tilt);
    return it;
  }

  function renderDeck() {
    dom.deck.replaceChildren();
    S.items = S.view.map(makeItem);
    S.items.forEach((it) => dom.deck.append(it));
  }

  // Coverflow: cada card é posicionado em função da distância ao selecionado.
  function placeAll() {
    const W = S.cw;
    S.items.forEach((it, i) => {
      const d = i - S.sel, a = Math.abs(d);
      if (a > 7) {
        if (!it._far) { it.classList.add('far'); it._far = true; }
        return;
      }
      if (it._far) { it.classList.remove('far'); it._far = false; }
      const s = Math.sign(d);
      let x = 0, z = 0, ry = 0, op = 1;
      if (a > 0) {
        x = s * (W * 0.86 + (a - 1) * W * 0.4);
        z = -170 - (a - 1) * 60;
        ry = -s * 50;
        op = Math.max(0, 0.95 - (a - 1) * 0.17);
      }
      it.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${ry}deg)`;
      it.style.opacity = op;
      it.style.zIndex = 100 - a;
      it.classList.toggle('sel', a === 0);
    });
  }

  function renderHero(animate = true) {
    const g = cur();
    if (!g) return;
    if (S.mode === 'platforms') {
      dom.title.textContent = g.name;
      dom.plat.textContent = groupLabel(g.group);
      dom.plat.style.setProperty('--pc', g._pal.ac);
      dom.played.textContent = g.count === 0 ? 'Nenhum jogo ainda' : `${g.count} ${g.count === 1 ? 'jogo' : 'jogos'}`;
      dom.fav.hidden = true;
    } else {
      const chip = chipOf(g);
      dom.title.textContent = g.title;
      dom.plat.textContent = chip.label;
      dom.plat.style.setProperty('--pc', chip.color || 'var(--ac)');
      dom.played.textContent = playedText(g.lastPlayed);
      dom.fav.hidden = !g.favorite;
    }
    const len = dom.title.textContent.length;
    dom.title.classList.toggle('long', len > 22 && len <= 40);
    dom.title.classList.toggle('xl', len > 40);
    dom.ghost.textContent = pad2(S.sel + 1);
    dom.idx.textContent = pad2(S.sel + 1);
    dom.of.textContent = '/ ' + pad2(S.view.length);
    dom.railFill.style.width = ((S.sel + 1) / S.view.length) * 100 + '%';
    if (animate) {
      dom.hero.classList.remove('swap');
      void dom.hero.offsetWidth;
      dom.hero.classList.add('swap');
    }
  }

  function renderEmpty() {
    const sys = Platforms.byId[S.system];
    if (S.mode === 'platforms') return;
    if (S.scanning && !S.all.length) {
      dom.emptyTitle.textContent = 'Procurando jogos…';
      dom.emptySub.textContent = 'Steam · Epic · GOG';
    } else if (S.filter !== 'all') {
      dom.emptyTitle.textContent = 'Nada por aqui';
      dom.emptySub.textContent = S.input === 'pad' ? 'LB / RB para trocar de filtro' : 'Q / E para trocar de filtro';
    } else if (sys && sys.id !== 'windows') {
      dom.emptyTitle.textContent = `Nenhum jogo de ${sys.short}`;
      dom.emptySub.textContent = S.input === 'pad' ? 'Aperte Y para adicionar um jogo' : 'Aperte N para adicionar um jogo';
    } else {
      dom.emptyTitle.textContent = 'Nenhum jogo';
      dom.emptySub.textContent = S.input === 'pad' ? 'Aperte Y para adicionar um jogo' : 'Aperte N para adicionar um jogo';
    }
  }

  function applySel(instant) {
    const n = S.view.length;
    document.body.classList.toggle('empty', n === 0);
    renderEmpty();
    if (!n) {
      dom.idx.textContent = '00'; dom.of.textContent = '/ 00'; dom.ghost.textContent = '00';
      if (S.mode === 'games' && Platforms.byId[S.system]) queueBackdrop(Platforms.byId[S.system]);
      return;
    }
    if (instant) document.body.classList.add('noanim');
    S.sel = clamp(S.sel, 0, n - 1);
    placeAll();
    renderHero(!instant);
    queueBackdrop(cur());
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('noanim')));
    reportPresence();
  }

  // ------------------------------------------------------------ Discord Rich Presence
  const PR = { available: false, mode: 'full', connected: false, error: '' };
  let prTimer = 0;
  function reportPresence() {
    if (!aio.presence || !PR.available) return;
    clearTimeout(prTimer);
    prTimer = setTimeout(() => {
      const g = cur(), n = S.view.length;
      if (S.mode === 'platforms') aio.presence({ kind: 'platforms', index: S.sel + 1, total: n });
      else aio.presence({ kind: 'games', sysId: S.system, index: S.sel + 1, total: n, title: g && g.title });
    }, 700);
  }
  const PR_LABEL = { full: 'completo', discreet: 'discreto', off: 'desligado' };
  async function cyclePresence() {
    if (!aio.presenceMode) return;
    if (!PR.available) { toast('Falta o Application ID do Discord (veja o README)', 6000, true); return; }
    const next = { full: 'discreet', discreet: 'off', off: 'full' }[PR.mode] || 'full';
    const r = await aio.presenceMode(next);
    if (r && r.ok) {
      PR.mode = next; Sound.tick(3);
      if (topOv() === 'menu') renderMenu();
      if (next !== 'off') reportPresence();
    }
  }

  // keepId: tenta manter esse item selecionado SE ele estiver na lista atual.
  // reveal: abre a plataforma do jogo e volta para "Todos" se preciso (usado ao adicionar/editar).
  function buildView(keepId, reveal = false) {
    if (reveal && keepId) {
      const g = S.all.find((x) => x.id === keepId);
      if (g) {
        if (S.mode !== 'games' || S.system !== sysOf(g)) {
          S.mode = 'games'; S.system = sysOf(g);
          UI.last = S.system; saveUI();
          applyMode();
        }
        if (!inFilter(g, S.filter)) S.filter = 'all';
      }
    }
    let list;
    if (S.mode === 'platforms') {
      list = platformList();
      if (S.group !== 'all' && !list.some((p) => p.group === S.group)) S.group = 'all';
      if (S.group !== 'all') list = list.filter((p) => p.group === S.group);
    } else {
      list = gamesOf(S.system).filter((g) => inFilter(g, S.filter));
      if (!list.length && S.filter !== 'all' && !S.scanning) {
        S.filter = 'all';
        list = gamesOf(S.system);
      }
    }
    S.view = list;
    const i = keepId ? list.findIndex((x) => x.id === keepId) : -1;
    S.sel = i >= 0 ? i : 0;
    renderFilters();
    renderDeck();
    applySel(true);
  }

  // ------------------------------------------------------------ dicas na tela
  // Centraliza a letra dentro do círculo medindo a tinta real do glifo (não depende da métrica da fonte
  // nem do sistema: o que importa é o centro visual da letra coincidir com o centro do botão).
  let measureCtx = null;
  function fitGlyph(k) {
    const ch = k.textContent;
    if (!ch || ch.length !== 1) return;
    try {
      measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
      const cs = getComputedStyle(k);
      const px = 200;                                   // mede grande e converte para em
      measureCtx.font = `${cs.fontWeight} ${px}px ${cs.fontFamily}`;
      measureCtx.textBaseline = 'alphabetic';
      measureCtx.textAlign = 'left';
      const m = measureCtx.measureText(ch);
      if (!m.fontBoundingBoxAscent && !m.actualBoundingBoxAscent) return;
      const inkCx = (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
      const dx = m.width / 2 - inkCx;                                   // quanto empurrar p/ a direita
      const inkAbove = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
      const lineAbove = (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
      const dy = inkAbove - lineAbove;                                  // quanto empurrar p/ baixo
      k.style.setProperty('--dx', (dx / px).toFixed(4) + 'em');
      k.style.setProperty('--dy', (dy / px).toFixed(4) + 'em');
      if (!k.firstElementChild) { k.textContent = ''; k.append(el('i', null, ch)); }
      k.classList.add('fit');
    } catch { /* mantém o ajuste padrão do CSS */ }
  }
  function fitGlyphs() { document.querySelectorAll('kbd.pb:not(.s):not(.w)').forEach(fitGlyph); }

  function fillHints(box, list) {
    box.replaceChildren();
    for (const [k, label, cls] of list) {
      const s = el('span');
      s.append(el('kbd', cls ? 'pb ' + cls : null, k), document.createTextNode(label));
      box.append(s);
    }
    box.querySelectorAll('kbd.pb:not(.s):not(.w)').forEach(fitGlyph);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitGlyphs());
  function renderHints() {
    fillHints(dom.hints, HINTS[S.mode][S.input]);
    fillHints(dom.formHints, HINTS.form[S.input]);
    fillHints(dom.pickHints, HINTS.picker[S.input]);
    fillHints(dom.cfHints, HINTS.confirm[S.input]);
    dom.kPrev.textContent = S.input === 'pad' ? 'LB' : 'Q';
    dom.kNext.textContent = S.input === 'pad' ? 'RB' : 'E';
  }
  function setInput(mode) {
    if (S.input === mode) return;
    S.input = mode;
    renderHints();
    if (document.body.classList.contains('empty')) renderEmpty();
  }
  function renderSoundIcon() {
    dom.sndIcon.classList.toggle('off', !(Sound.music || Sound.sfx));
  }

  let toastT;
  function toast(msg, ms = 2600, bad = false) {
    dom.toast.textContent = msg;
    dom.toast.classList.toggle('bad', bad);
    dom.toast.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => dom.toast.classList.remove('on'), ms);
  }

  // ------------------------------------------------------------ pilha de telas sobrepostas
  const OV = { menu: dom.menu, form: dom.form, picker: dom.picker, osk: dom.osk, confirm: dom.confirm };
  const topOv = () => S.stack[S.stack.length - 1] || null;
  function openOv(name) {
    S.stack.push(name);
    OV[name].classList.add('on');
  }
  function closeOv(name, silent) {
    const i = S.stack.lastIndexOf(name);
    if (i < 0) return;
    S.stack.splice(i, 1);
    OV[name].classList.remove('on');
    if (!silent) Sound.back();
    if (document.activeElement && document.activeElement.blur && name !== 'osk' && name !== 'picker') document.activeElement.blur();
  }
  function closeOverlay(silent) {
    const t = topOv();
    if (t) closeOv(t, silent);
  }

  // ------------------------------------------------------------ ações
  function setSel(i, forceDir) {
    if (!S.view.length) return;
    const n = clamp(i, 0, S.view.length - 1);
    if (n === S.sel) return;
    const dir = forceDir || (n > S.sel ? 1 : -1);
    S.sel = n;
    applySel(false);
    Sound.move(hash(S.view[n].id), dir);
  }
  // segurar a tecla/direcional (held) para nos extremos; um toque novo dá a volta na lista
  let held = false;
  function move(d) {
    const n = S.view.length;
    if (n > 1 && Math.abs(d) === 1 && !held) {
      const t = S.sel + d;
      if (t < 0) return setSel(n - 1, -1);
      if (t >= n) return setSel(0, 1);
    }
    setSel(S.sel + d);
  }

  function setFilter(id) {
    if (id === S.filter) return;
    const keep = cur() && cur().id;
    S.filter = id;
    // só mantém a seleção se o jogo atual também pertence ao novo filtro
    const stays = keep && S.all.some((g) => g.id === keep && inFilter(g, id));
    buildView(stays ? keep : null);
    Sound.filter();
  }
  function cycleFilter(d) {
    const ids = FILTERS
      .filter((f) => !(f.id === 'manual' && S.system !== 'windows'))
      .filter((f) => f.id === 'all' || f.id === S.filter || countFor(f.id) > 0)
      .map((f) => f.id);
    setFilter(ids[(ids.indexOf(S.filter) + d + ids.length) % ids.length]);
  }

  function setGroup(id) {
    if (id === S.group) return;
    const keep = cur() && cur().id;
    S.group = id;
    const stays = keep && platformList().some((p) => p.id === keep && (id === 'all' || p.group === id));
    buildView(stays ? keep : null);
    Sound.filter();
  }
  function cycleGroup(d) {
    const all = platformList();
    const ids = ['all', ...Platforms.groups.filter((g) => all.some((p) => p.group === g.id)).map((g) => g.id)];
    if (ids.length < 3) return;
    setGroup(ids[(ids.indexOf(S.group) + d + ids.length) % ids.length]);
  }

  async function launch(g) {
    if (!g || S.busy) return;
    S.busy = true;
    Sound.launch();
    dom.launchTitle.textContent = g.title;
    dom.launch.classList.remove('on');
    void dom.launch.offsetWidth;
    dom.launch.classList.add('on');
    const t0 = performance.now();
    const r = await aio.launch(g.id);
    if (r.ok) {
      g.lastPlayed = Date.now();
      renderHero(false);
      const wait = Math.max(0, 2800 - (performance.now() - t0));
      setTimeout(() => dom.launch.classList.remove('on'), wait);
      // se o hub continuar em foco (o jogo demorou a abrir), a música volta depois de um tempo
      setTimeout(() => { if (document.hasFocus()) Sound.back_to_hub(); }, wait + 4000);
      setTimeout(() => { S.busy = false; }, wait);
    } else {
      dom.launch.classList.remove('on');
      Sound.error();
      Sound.back_to_hub();
      toast(r.error || 'Não foi possível abrir o jogo.', 6000, true);
      S.busy = false;
    }
  }

  async function toggleFav(g) {
    if (!g || S.mode !== 'games') return;
    g.favorite = await aio.favorite(g.id);
    renderHero(false);
    renderFilters();
    Sound.fav(g.favorite);
    toast(g.favorite ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
  }

  async function removeGame(g) {
    const next = S.view[S.sel + 1] || S.view[S.sel - 1];
    const wasLast = S.mode === 'games' && gamesOf(S.system).filter((x) => x.id !== g.id).length === 0;
    await aio.removeGame(g.id);
    toast(g.editable ? 'Jogo removido' : 'Jogo ocultado');
    if (wasLast) {            // acabaram os jogos desta plataforma: volta ao carrossel de plataformas
      const r = await aio.getLibrary();
      S.all = sortGames(r.games);
      S.hidden = r.hidden;
      leaveSystem();
      return;
    }
    await reload(next && next.id);
  }

  async function reload(selectId, reveal = false) {
    const r = await aio.getLibrary();
    S.all = sortGames(r.games);
    S.hidden = r.hidden;
    buildView(selectId || (cur() && cur().id), reveal);
  }

  async function rescan(manual) {
    S.scanning = true;
    if (manual) toast('Procurando jogos…', 8000);
    let r;
    try { r = await aio.scan(); } catch { r = null; }
    S.scanning = false;
    if (!r) { if (manual) toast('Falha ao procurar jogos', 4000, true); return; }
    const keep = cur() && cur().id;
    const before = signature(S.all);
    S.all = sortGames(r.games);
    S.hidden = r.hidden;
    if (signature(S.all) !== before) buildView(keep);
    else { renderFilters(); renderEmpty(); }
    if (manual) toast(`${S.all.length} jogos na biblioteca`);
  }

  async function reloadIcons() {
    let icons;
    try { icons = await aio.platformIcons(); } catch { return; }
    if (JSON.stringify(icons || {}) === JSON.stringify(S.icons)) return;
    S.icons = icons || {};
    if (S.mode === 'platforms' && !topOv()) buildView(cur() && cur().id);
  }

  // ------------------------------------------------------------ menu
  let menuItems = [];
  let menuIdx = 0;

  function openMenu() {
    const g = cur();
    menuItems = [];
    if (S.mode === 'platforms') {
      if (g) menuItems.push({ label: 'Abrir', run: () => enterSystem(g) });
      menuItems.push({ label: 'Adicionar jogo', run: () => openForm() });
      menuItems.push({
        label: 'Consoles sem jogos', keep: true, value: () => (UI.showEmpty ? 'visíveis' : 'ocultos'),
        run: () => { UI.showEmpty = !UI.showEmpty; saveUI(); buildView(cur() && cur().id); },
      });
      menuItems.push({
        label: 'Ícones das plataformas',
        run: async () => { await aio.openIconsFolder(); toast('Coloque aqui logos com o nome da plataforma: switch.svg, ps2.png…', 7000); },
      });
    } else {
      if (g) {
        menuItems.push({ label: 'Jogar', run: () => launch(g) });
        menuItems.push({ label: g.favorite ? 'Tirar dos favoritos' : 'Favoritar', run: () => toggleFav(g) });
        if (g.editable) menuItems.push({ label: 'Editar', run: () => openForm(g) });
        menuItems.push({ label: g.coverUrl ? 'Trocar capa' : 'Adicionar capa', run: () => changeCover(g) });
        if (g.customCover) menuItems.push({ label: 'Remover capa personalizada', run: () => resetCover(g) });
        menuItems.push({
          label: g.editable ? 'Remover da lista' : 'Ocultar da lista',
          armedLabel: g.editable ? 'Confirmar remoção' : 'Confirmar',
          confirm: true, warn: true, run: () => removeGame(g),
        });
      }
      menuItems.push({ label: 'Adicionar jogo', run: () => openForm() });
      menuItems.push({ label: 'Voltar às plataformas', run: () => leaveSystem() });
    }
    menuItems.push({ label: 'Atualizar biblioteca', run: () => rescan(true) });
    if (S.hidden > 0) {
      menuItems.push({
        label: 'Mostrar ocultos', value: () => String(S.hidden),
        run: async () => { await aio.unhideAll(); await reload(); },
      });
    }
    menuItems.push({
      label: 'Música', keep: true, value: () => (Sound.music ? 'ligada' : 'desligada'),
      run: () => { Sound.toggleMusic(); renderSoundIcon(); },
    });
    menuItems.push({
      label: 'Efeitos sonoros', keep: true, value: () => (Sound.sfx ? 'ligados' : 'desligados'),
      run: () => { Sound.toggleSfx(); renderSoundIcon(); Sound.confirm(); },
    });
    menuItems.push({
      label: 'Animação de abertura', keep: true, value: () => (UI.intro ? 'ligada' : 'desligada'),
      run: () => { UI.intro = !UI.intro; saveUI(); },
    });
    if (aio.presenceMode) {
      menuItems.push({
        label: 'Discord Rich Presence', keep: true,
        value: () => {
          if (!PR.available) return 'sem ID';
          if (PR.mode === 'off') return 'desligado';
          return `${PR_LABEL[PR.mode]} · ${PR.connected ? 'conectado' : 'Discord não encontrado'}`;
        },
        run: () => cyclePresence(),
      });
    }
    menuItems.push({ label: 'Tela cheia', run: () => aio.toggleFullscreen() });
    menuItems.push({ label: 'Sair', warn: true, run: () => requestQuit() });
    menuIdx = 0;
    if (aio.presenceGet) aio.presenceGet().then((r) => { Object.assign(PR, r); if (topOv() === 'menu') renderMenu(); }).catch(() => {});
    dom.menuTitle.textContent = g ? (S.mode === 'platforms' ? g.name : g.title) : 'All in One';
    renderMenu();
    openOv('menu');
    Sound.menu(true);
  }

  function renderMenu() {
    dom.menuList.replaceChildren();
    menuItems.forEach((it, i) => {
      const li = el('li', (i === menuIdx ? 'on' : '') + (it.warn ? ' warn' : ''));
      li.append(el('span', null, it.armed ? it.armedLabel : it.label));
      if (it.value) li.append(el('span', 'val', it.value()));
      li.onclick = () => { menuIdx = i; runMenuItem(); };
      dom.menuList.append(li);
    });
  }

  function runMenuItem() {
    const it = menuItems[menuIdx];
    if (!it) return;
    if (it.confirm && !it.armed) { it.armed = true; Sound.move(7, 1); renderMenu(); return; }
    if (it.keep) { it.run(); renderMenu(); return; }
    Sound.confirm();
    closeOv('menu', true);
    it.run();
  }

  function menuAct(a) {
    const n = menuItems.length;
    if (a === 'up') menuIdx = (menuIdx - 1 + n) % n;
    else if (a === 'down') menuIdx = (menuIdx + 1) % n;
    else if (a === 'confirm') return runMenuItem();
    else if (a === 'back' || a === 'menu') return closeOv('menu');
    else return;
    Sound.move(menuIdx * 3 + 1, a === 'down' ? 1 : -1);
    menuItems.forEach((it) => { it.armed = false; });
    renderMenu();
  }

  // ------------------------------------------------------------ confirmação (sair, etc.)
  let cfCtx = null;
  function ask({ eyebrow, title, text, yes, no, danger = false }) {
    return new Promise((resolve) => {
      dom.cfEyebrow.textContent = eyebrow || '';
      dom.cfTitle.textContent = title || '';
      dom.cfText.textContent = text || '';
      dom.cfNo.textContent = no;
      dom.cfYes.textContent = yes;
      dom.cfYes.classList.toggle('danger', danger);
      dom.cfYes.classList.toggle('primary', !danger);
      cfCtx = { idx: 0, resolve };       // foco começa em "continuar": é o mais seguro
      cfFocus(0);
      openOv('confirm');
      Sound.menu(true);
    });
  }
  function cfFocus(i) {
    cfCtx.idx = i;
    dom.cfNo.classList.toggle('pf', i === 0);
    dom.cfYes.classList.toggle('pf', i === 1);
  }
  function cfDone(v) {
    if (!cfCtx) return;
    const c = cfCtx;
    cfCtx = null;
    closeOv('confirm', true);
    if (v) Sound.confirm(); else Sound.back();
    c.resolve(v);
  }
  function confirmAct(a) {
    if (!cfCtx) return;
    if (a === 'left' || a === 'up') { if (cfCtx.idx !== 0) { cfFocus(0); Sound.tick(2); } }
    else if (a === 'right' || a === 'down') { if (cfCtx.idx !== 1) { cfFocus(1); Sound.tick(5); } }
    else if (a === 'confirm') cfDone(cfCtx.idx === 1);
    else if (a === 'back') cfDone(false);
  }
  dom.cfNo.addEventListener('click', () => cfDone(false));
  dom.cfYes.addEventListener('click', () => cfDone(true));

  // ------------------------------------------------------------ encerrar
  async function requestQuit() {
    if (S.quitting) return;
    if (document.body.classList.contains('boot')) { aio.quit(); return; }   // ainda abrindo: sai direto
    if (S.stack.includes('confirm')) return;
    const ok = await ask({
      eyebrow: 'Encerrar',
      title: 'Sair do All in One?',
      text: 'Os jogos que estiverem abertos continuam rodando.',
      no: 'Continuar', yes: 'Encerrar', danger: true,
    });
    if (!ok) return;
    S.quitting = true;
    await Cinematic.outro();
    aio.quit();
  }

  // ------------------------------------------------------------ teclado virtual
  const OSK_MAX = { fTitle: 80, fExe: 260, fArgs: 400 };
  function openOsk(input) {
    openOv('osk');
    OSK.open({
      label: input.dataset.osk || '',
      value: input.value,
      max: OSK_MAX[input.id] || 0,
      autoCap: input.id === 'fTitle',
      pad: S.input === 'pad',
      onDone: (v) => {
        closeOv('osk', true);
        input.value = v;
        dom.formErr.textContent = '';
        Sound.confirm();
      },
      onCancel: () => closeOv('osk'),
    });
    Sound.menu(true);
  }

  // ------------------------------------------------------------ seletor de plataforma
  let pickEls = [], pickIdx = 0;

  function openPicker() {
    dom.pickList.replaceChildren();
    pickEls = [];
    for (const grp of Platforms.groups) {
      const items = Platforms.list.filter((p) => p.group === grp.id);
      if (!items.length) continue;
      dom.pickList.append(el('div', 'pg-h', grp.label));
      const grid = el('div', 'pgrid');
      for (const p of items) {
        const b = el('button', 'pchip' + (p.id === formCtx.system ? ' cur' : ''));
        b.type = 'button';
        b.dataset.id = p.id;
        b.style.setProperty('--pc', p._pal.ac);
        b.innerHTML = Platforms.glyphSvg(p.kind);
        b.append(el('span', null, p.id === 'windows' ? 'Windows' : p.short));
        grid.append(b);
        pickEls.push(b);
      }
      dom.pickList.append(grid);
    }
    pickIdx = Math.max(0, pickEls.findIndex((b) => b.dataset.id === formCtx.system));
    pickEls[pickIdx].classList.add('pf');
    openOv('picker');
    Sound.menu(true);
    requestAnimationFrame(() => pickEls[pickIdx].scrollIntoView({ block: 'nearest' }));
  }
  function pickFocus(n) {
    pickEls[pickIdx].classList.remove('pf');
    pickIdx = n;
    pickEls[n].classList.add('pf');
    pickEls[n].scrollIntoView({ block: 'nearest' });
    Sound.tick(n);
  }
  function pickChoose(id) {
    formCtx.system = id;
    refreshPlatBtn();
    applyFormLabels();
    closeOv('picker', true);
    Sound.confirm();
    formFocus(0, 0);
  }
  function pickerAct(a) {
    if (a === 'back') return closeOv('picker');
    if (a === 'confirm') return pickChoose(pickEls[pickIdx].dataset.id);
    if (a === 'left' || a === 'right' || a === 'up' || a === 'down') {
      const n = OSK.nav(pickEls, pickIdx, a);
      if (n !== pickIdx) pickFocus(n);
    }
  }
  dom.pickList.addEventListener('click', (e) => {
    const b = e.target.closest('.pchip');
    if (b) pickChoose(b.dataset.id);
  });

  // ------------------------------------------------------------ formulário
  let formCtx = null;
  let fr = 0, fc = 0;     // linha e coluna em foco (navegação por controle)

  const formRows = () => [...dom.formEl.querySelectorAll('[data-row]')].map((r) => [...r.querySelectorAll('[data-f]')]);

  function formFocus(r, c) {
    const rows = formRows();
    r = clamp(r, 0, rows.length - 1);
    c = clamp(c, 0, rows[r].length - 1);
    fr = r; fc = c;
    dom.formEl.querySelectorAll('.pf').forEach((x) => x.classList.remove('pf'));
    const e = rows[r][c];
    e.classList.add('pf');
    e.focus({ preventScroll: true });
  }

  dom.formEl.addEventListener('focusin', (e) => {
    const rows = formRows();
    for (let r = 0; r < rows.length; r++) {
      const c = rows[r].indexOf(e.target);
      if (c >= 0) {
        fr = r; fc = c;
        dom.formEl.querySelectorAll('.pf').forEach((x) => x.classList.remove('pf'));
        e.target.classList.add('pf');
        return;
      }
    }
  });

  function refreshPlatBtn() {
    const p = Platforms.byId[formCtx.system] || Platforms.byId.windows;
    dom.fPlatGlyph.innerHTML = Platforms.glyphSvg(p.kind);
    dom.fPlatName.textContent = p.name;
    dom.fPlat.style.setProperty('--pc', p._pal.ac);
  }

  function applyFormLabels() {
    const win = formCtx.system === 'windows';
    dom.lblExe.textContent = win ? 'Executável' : 'Emulador ou atalho';
    dom.fExe.placeholder = win ? 'Escolha o arquivo do jogo' : 'Escolha o emulador (ou um atalho que abra o jogo)';
    dom.lblArgs.replaceChildren(document.createTextNode('Argumentos '));
    dom.lblArgs.append(el('i', null, win ? 'opcional' : 'ex.: caminho da ROM'));
  }

  function openForm(game, preset) {
    const sys = game ? sysOf(game)
      : preset || (S.mode === 'games' ? S.system : (cur() && cur().id) || 'windows');
    formCtx = { game: game || null, cover: undefined, system: Platforms.byId[sys] ? sys : 'windows' };
    dom.formEyebrow.textContent = game ? 'Editar jogo' : 'Novo jogo';
    dom.fTitle.value = game ? game.title : '';
    dom.fExe.value = game && game.launch ? game.launch.exe : '';
    dom.fArgs.value = game && game.launch ? game.launch.args : '';
    dom.fCover.value = game && game.coverUrl ? '(capa atual)' : '';
    dom.formErr.textContent = '';
    refreshPlatBtn();
    applyFormLabels();
    openOv('form');
    Sound.menu(true);
    setTimeout(() => formFocus(1, 0), 60);
  }

  async function submitForm() {
    const win = formCtx.system === 'windows';
    const exe = dom.fExe.value.trim().replace(/^"(.*)"$/, '$1');
    const title = dom.fTitle.value.trim();
    if (!title) { dom.formErr.textContent = 'Dê um nome ao jogo.'; Sound.error(); formFocus(1, 0); return; }
    if (!exe) {
      dom.formErr.textContent = win ? 'Escolha o executável do jogo.' : 'Escolha o emulador (ou um atalho que abra o jogo).';
      Sound.error(); formFocus(2, 0); return;
    }
    const data = { title, exe, args: dom.fArgs.value.trim(), system: formCtx.system };
    if (formCtx.cover !== undefined) data.cover = formCtx.cover;
    const editing = formCtx.game;
    const r = editing ? await aio.updateGame(editing.id, data) : await aio.addGame(data);
    if (!r.ok) { dom.formErr.textContent = r.error || 'Não foi possível salvar.'; Sound.error(); return; }
    Sound.confirm();
    closeOv('form', true);
    await reload(r.id, true);
    toast(editing ? 'Jogo atualizado' : 'Jogo adicionado');
  }

  dom.formEl.addEventListener('submit', (e) => { e.preventDefault(); submitForm(); });
  dom.formEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'cancel') closeOv('form');
    else if (act === 'plat') openPicker();
    else if (act === 'exe') {
      const r = await aio.pickExe();
      if (r) {
        dom.fExe.value = r.path;
        if (!dom.fTitle.value.trim()) dom.fTitle.value = r.name;
        dom.formErr.textContent = '';
      }
    } else if (act === 'cover') {
      const p = await aio.pickImage();
      if (p) { formCtx.cover = p; dom.fCover.value = p; }
    } else if (act === 'nocover') {
      formCtx.cover = null;
      dom.fCover.value = '';
    }
  });

  function formAct(a) {
    const rows = formRows();
    if (a === 'back') return closeOv('form');
    if (a === 'menu') return submitForm();
    if (a === 'up' || a === 'down') {
      const r = clamp(fr + (a === 'down' ? 1 : -1), 0, rows.length - 1);
      if (r !== fr) { formFocus(r, Math.min(fc, rows[r].length - 1)); Sound.move(r * 5 + 2, a === 'down' ? 1 : -1); }
      return;
    }
    if (a === 'left' || a === 'right') {
      const c = clamp(fc + (a === 'right' ? 1 : -1), 0, rows[fr].length - 1);
      if (c !== fc) { formFocus(fr, c); Sound.tick(c + 4); }
      return;
    }
    if (a === 'confirm') {
      const e = rows[fr][fc];
      if (e.tagName === 'INPUT') openOsk(e); else e.click();
    }
  }

  // ------------------------------------------------------------ entrada unificada
  function act(a) {
    Sound.resume();
    if (Cinematic.active) { Cinematic.skip(); return; }
    if (S.quitting || switching) return;
    const top = topOv();
    if (top === 'osk') return OSK.act(a);
    if (top === 'confirm') return confirmAct(a);
    if (top === 'picker') return pickerAct(a);
    if (top === 'form') return formAct(a);
    if (top === 'menu') return menuAct(a);
    const plat = S.mode === 'platforms';
    switch (a) {
      case 'left': return move(-1);
      case 'right': return move(1);
      case 'pageLeft': return move(-5);
      case 'pageRight': return move(5);
      case 'home': return setSel(0);
      case 'end': return setSel(S.view.length - 1);
      case 'confirm':
        if (!cur()) return;
        Sound.confirm();
        return plat ? enterSystem(cur()) : launch(cur());
      case 'fav': return plat ? undefined : toggleFav(cur());
      case 'back': return plat ? undefined : leaveSystem();
      case 'menu': return openMenu();
      case 'add': return openForm();
      case 'prevFilter': return plat ? cycleGroup(-1) : cycleFilter(-1);
      case 'nextFilter': return plat ? cycleGroup(1) : cycleFilter(1);
      case 'refresh': return rescan(true);
      case 'mute': Sound.toggleMusic(); renderSoundIcon(); return toast(Sound.music ? 'Música ligada' : 'Música desligada');
      default:
    }
  }

  const KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    Enter: 'confirm', ' ': 'confirm', Escape: 'back',
    f: 'fav', Tab: 'menu', i: 'menu', ContextMenu: 'menu', n: 'add',
    q: 'prevFilter', e: 'nextFilter', r: 'refresh', m: 'mute',
    PageUp: 'pageLeft', PageDown: 'pageRight', Home: 'home', End: 'end',
  };
  const REPEATABLE = new Set(['left', 'right', 'up', 'down', 'pageLeft', 'pageRight']);

  document.addEventListener('keydown', (e) => {
    Sound.resume();
    if (Cinematic.active) { e.preventDefault(); Cinematic.skip(); return; }
    if (e.key === 'F11') { e.preventDefault(); aio.toggleFullscreen(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') { e.preventDefault(); requestQuit(); return; }
    if (S.quitting) { e.preventDefault(); return; }
    const top = topOv();
    if (top === 'osk') { e.preventDefault(); setInput('kb'); OSK.onKey(e); return; }
    if (top === 'form') {
      if (e.key === 'Escape') { e.preventDefault(); closeOv('form'); }
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const a = KEYS[e.key] || KEYS[e.key.toLowerCase()];
    if (!a) return;
    e.preventDefault();
    if (e.repeat && !REPEATABLE.has(a)) return;
    setInput('kb');
    held = e.repeat; act(a); held = false;
  });

  window.addEventListener('pointerdown', () => { if (Cinematic.active) Cinematic.skip(); });

  let wheelT = 0;
  window.addEventListener('wheel', (e) => {
    if (S.stack.length || Cinematic.active) return;
    const now = performance.now();
    if (now - wheelT < 110) return;
    wheelT = now;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (d > 0) act('right'); else if (d < 0) act('left');
  }, { passive: true });

  function activate() {
    if (!cur() || switching) return;
    Sound.confirm();
    if (S.mode === 'platforms') enterSystem(cur()); else launch(cur());
  }
  dom.deck.addEventListener('click', (e) => {
    const it = e.target.closest('.item');
    if (!it || S.stack.length) return;
    const i = +it.dataset.i;
    if (i === S.sel) activate(); else setSel(i);
  });
  dom.play.addEventListener('click', () => { if (!S.stack.length) activate(); });
  dom.sndIcon.addEventListener('click', () => act('mute'));
  dom.sndIcon.style.cursor = 'pointer';
  dom.crumb.addEventListener('click', () => { if (!S.stack.length && !switching) leaveSystem(); });
  dom.crumb.style.cursor = 'pointer';

  // inclinação sutil do card selecionado seguindo o mouse
  dom.deck.addEventListener('mousemove', (e) => {
    const it = S.items[S.sel];
    if (!it) return;
    const r = dom.deck.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    it.style.setProperty('--ry', (x * 14).toFixed(2) + 'deg');
    it.style.setProperty('--rx', (-y * 9).toFixed(2) + 'deg');
  });
  dom.deck.addEventListener('mouseleave', () => {
    const it = S.items[S.sel];
    if (it) { it.style.setProperty('--ry', '0deg'); it.style.setProperty('--rx', '0deg'); }
  });

  // cursor some quando parado, como em console
  let idleT;
  const wake = () => {
    document.body.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => document.body.classList.add('idle'), 2500);
  };
  window.addEventListener('mousemove', wake);
  wake();

  // o hub cala quando um jogo abre (perde o foco) e volta quando você retorna
  window.addEventListener('blur', () => Sound.away());
  window.addEventListener('focus', () => { if (!S.quitting) Sound.back_to_hub(); reloadIcons(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) Sound.away(); else if (!S.quitting) Sound.back_to_hub(); });

  // ------------------------------------------------------------ controle
  const P = { dir: null, next: 0, prev: [] };
  function poll(t) {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of list) { if (g && g.connected) { gp = g; break; } }
    dom.padIcon.classList.toggle('on', !!gp);
    if (gp) {
      const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const x = gp.axes[0] || 0, y = gp.axes[1] || 0;
      const dir =
        btn(14) || x < -0.55 ? 'left' :
        btn(15) || x > 0.55 ? 'right' :
        btn(12) || y < -0.55 ? 'up' :
        btn(13) || y > 0.55 ? 'down' : null;
      if (dir !== P.dir) {
        P.dir = dir;
        if (dir) { setInput('pad'); act(dir); P.next = t + 380; }
      } else if (dir && t >= P.next) {
        held = true; act(dir); held = false;
        P.next = t + (S.stack.length ? 150 : 105);
      }
      const edge = (i, a) => {
        const now = btn(i);
        if (now && !P.prev[i]) { setInput('pad'); act(a); }
        P.prev[i] = now;
      };
      edge(0, 'confirm'); edge(1, 'back'); edge(2, 'fav'); edge(3, 'add');
      edge(4, 'prevFilter'); edge(5, 'nextFilter'); edge(6, 'pageLeft'); edge(7, 'pageRight');
      edge(9, 'menu'); edge(8, 'refresh');
    }
    requestAnimationFrame(poll);
  }

  // ------------------------------------------------------------ início
  function tickClock() {
    dom.clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function applyCoverUpdate(id, coverUrl, tone, custom) {
    const g = S.all.find((x) => x.id === id);
    if (g) { g.coverUrl = coverUrl; g.tone = tone; g._pal = null; if (custom !== undefined) g.customCover = custom; }
    if (S.mode !== 'games') return;
    const i = S.view.findIndex((x) => x.id === id);
    if (i < 0 || !S.items[i]) return;
    const v = S.view[i];
    v.coverUrl = coverUrl; v.tone = tone; v._pal = null;
    S.items[i].querySelector('.card').replaceChildren(makePoster(v));
    if (cur() === v) { queueBackdrop(v); renderHero(false); }
  }
  aio.onCover(({ id, coverUrl, tone }) => applyCoverUpdate(id, coverUrl, tone));
  if (aio.onPresenceState) aio.onPresenceState((st) => { Object.assign(PR, st); if (topOv() === 'menu') renderMenu(); });

  // Troca a capa de qualquer jogo (Steam, Epic, GOG ou manual). path = arquivo; sem path abre o seletor.
  async function changeCover(g, path) {
    if (!g) return;
    const p = path || await aio.pickImage();
    if (!p) return;
    let r = null;
    try { r = await aio.setCover(g.id, p); } catch { /* cai no aviso abaixo */ }
    if (!r || !r.ok) { Sound.error(); toast((r && r.error) || 'Não consegui usar essa imagem', 4500, true); return; }
    applyCoverUpdate(g.id, r.coverUrl, r.tone, true);
    Sound.confirm && Sound.confirm();
    toast('Capa atualizada');
  }
  async function resetCover(g) {
    if (!g) return;
    let r = null;
    try { r = await aio.setCover(g.id, null); } catch { /* ignora */ }
    if (!r || !r.ok) { Sound.error(); toast('Não consegui remover a capa', 4000, true); return; }
    applyCoverUpdate(g.id, null, null, false);
    toast(g.platform === 'steam' ? 'Capa personalizada removida. Buscando a oficial…' : 'Capa personalizada removida');
  }

  // arrastar uma imagem para a janela troca a capa do jogo selecionado
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || !aio.pathForFile) return;
    if (S.mode !== 'games' || S.stack.length || !cur()) { toast('Abra uma plataforma e selecione o jogo para trocar a capa', 4500, true); return; }
    if (!/^image\//.test(f.type) && !/\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name)) { toast('Solte uma imagem (PNG, JPG ou WEBP)', 4000, true); return; }
    changeCover(cur(), aio.pathForFile(f));
  });

  if (aio.onQuitRequest) aio.onQuitRequest(() => requestQuit());

  window.addEventListener('resize', () => {
    metrics();
    applySel(true);
  });

  async function init() {
    S.system = Platforms.byId[UI.last] ? UI.last : 'windows';
    applyMode();
    renderSoundIcon();
    tickClock();
    setInterval(tickClock, 20000);
    requestAnimationFrame(poll);
    try { Sound.init({ deferMusic: true }); } catch { /* sem áudio */ }

    const introOn = UI.intro !== false;
    if (!introOn) dom.splash.classList.add('done');
    const introDone = introOn ? Cinematic.intro() : Promise.resolve();

    const [lib, icons] = await Promise.all([
      aio.getLibrary(),
      aio.platformIcons ? aio.platformIcons().catch(() => ({})) : Promise.resolve({}),
    ]);
    S.all = sortGames(lib.games);
    S.hidden = lib.hidden;
    S.icons = icons || {};
    if (aio.presenceGet) { try { Object.assign(PR, await aio.presenceGet()); } catch { /* sem Rich Presence */ } }
    buildView(S.system);               // monta o hub por trás da abertura

    await introDone;
    if (!introOn) Sound.boot();
    document.body.classList.remove('boot');
    document.body.classList.add('entering');
    if (introOn) Cinematic.reveal();
    Sound.startMusic();
    setTimeout(() => document.body.classList.remove('entering'), 2000);
    if (aio.ready) aio.ready();
    rescan(false);
  }

  init();
})();
