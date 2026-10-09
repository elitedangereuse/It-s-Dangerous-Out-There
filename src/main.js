// Interface : relie la logique de jeu, le rendu canvas et les panneaux HTML.
// Principe : la scène occupe le centre, toutes les actions sont dans la barre du bas
// (avec raccourcis clavier), le panneau de droite donne l'information du moment.
import * as G from './game.js';
import { STAR_CLASSES, BODY_TYPES, MATERIALS, MODULES, RECIPES, REGION_TYPES, SCOOP_APPROACHES, SHIPS, PASSENGERS, CODEX, KNOWLEDGE } from './data.js';
import { loadProfile, saveProfile, absorbRun, gameOptions, isUnlocked } from './profile.js';
import { createRenderer, bodyAtmosphere, W, H, LANDING_DURATION, TAKEOFF_DURATION, JUMP_DURATION } from './render.js';
import { shipThumb } from './sprites.js';
import { dist } from './galaxy.js';
import { EVENT_INTRO } from './eventscenes.js';

const $ = (sel) => document.querySelector(sel);
const canvas = $('#screen');
const navCanvas = $('#navmap');
const renderer = createRenderer(canvas);

let state;
let view;
// Profil entre parties (savoir, codex, vaisseaux) et vaisseau choisi à l'écran titre.
const profile = loadProfile();
let shipChoice = isUnlocked(profile, profile.lastShip) ? profile.lastShip : 'mandalay';
let profileSaved = '';

function newGame(seed, { intro = true } = {}) {
  state = G.createGame(seed, gameOptions(profile, shipChoice));
  for (const l of state.log) l.at = 0;
  view = {
    scene: 'system',
    sceneStart: performance.now(),
    state,
    mode: 'system', // system | nav | synth
    tab: 'ctx',
    selectedBodyId: null,
    navSel: null,
    hoverBody: null,
    hoverCand: null,
    scanWaveStart: null,
    prev: {},
    unlocked: [],
  };
  if (intro) setScene('jump', { jumpStar: state.system.star });
  else update();
}

function showTitle() {
  const params = new URLSearchParams(location.search);
  const seed = params.has('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9);
  state = G.createGame(seed, gameOptions(profile, shipChoice));
  view = { scene: 'title', sceneStart: performance.now(), state, mode: 'system', tab: 'ctx', prev: {} };
  update();
}

function setScene(scene, extra = {}) {
  Object.assign(view, extra, { scene, sceneStart: performance.now() });
  update();
}

// L'introduction d'un événement est une cinématique ; ensuite la scène reste en fond de la carte.
const isCinematic = () => ['jump', 'landing', 'takeoff'].includes(view.scene) || (view.scene === 'event' && !view.eventReady);

function finishCinematic() {
  if (view.scene === 'jump') {
    if (state.phase === 'victory' || state.phase === 'gameover') setScene('end');
    else setScene('system', { selectedBodyId: null, scanWaveStart: null, arriving: true });
  } else if (view.scene === 'landing') {
    setScene(state.phase === 'gameover' ? 'end' : 'surface', { astroX: null });
  } else if (view.scene === 'takeoff') {
    setScene(state.phase === 'gameover' ? 'end' : 'system', { arriving: false });
  } else if (view.scene === 'event') {
    Object.assign(view, { eventReady: true, eventReadyAt: view.sceneTime });
    update();
  }
}

// ---------- Boucle de rendu ----------

function frame(now) {
  const t = now / 1000;
  view.sceneTime = (now - view.sceneStart) / 1000;
  view.scanWave = view.scanWaveStart != null ? ((now - view.scanWaveStart) / 1000) * 170 : null;
  if (view.scanWave != null && view.scanWave > 420) {
    view.scanWaveStart = null;
    update();
  }
  view.t = t;
  view.dialogBottom = !phoneLandscape.matches;
  if (view.scene === 'surface' || view.scene === 'landing' || view.scene === 'takeoff' || (view.scene === 'event' && state.surface)) view.body = G.currentBody(state) || view.body;
  renderer.render(view, t);
  if (view.hoverBody || (touchUI.matches && view.selectedBodyId)) placeTip();
  const dur = { jump: JUMP_DURATION, landing: LANDING_DURATION, takeoff: TAKEOFF_DURATION, event: view.eventReady ? 0 : EVENT_INTRO }[view.scene];
  if (dur && view.sceneTime >= dur) finishCinematic();
  requestAnimationFrame(frame);
}

// ---------- Interaction avec la scène ----------

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}

const systemInteractive = () => view.scene === 'system' && state.phase === 'system' && view.mode === 'system';

canvas.addEventListener('click', (e) => {
  if (view.scene === 'title') return start();
  if (isCinematic()) return finishCinematic();
  if (!systemInteractive()) return;
  const body = renderer.pick(view, ...canvasPoint(e));
  selectBody(body ? body.id : null);
});

canvas.addEventListener('mousemove', (e) => {
  const body = systemInteractive() ? renderer.pick(view, ...canvasPoint(e)) : null;
  const id = body ? body.id : null;
  if (id !== view.hoverBody) {
    view.hoverBody = id;
    canvas.classList.toggle('hovering', !!id);
    placeTip();
  }
});
canvas.addEventListener('mouseleave', () => {
  view.hoverBody = null;
  canvas.classList.remove('hovering');
  placeTip();
});

// Écran tactile : pas de survol, la bulle suit donc le corps sélectionné.
const touchUI = matchMedia('(hover: none)');
// Téléphone en paysage : le dialogue d'événement occupe la colonne de droite, pas le bas de la scène.
const phoneLandscape = matchMedia('(orientation: landscape) and (max-height: 540px)');
// Téléphone en paysage (même requête que dans style.css) : les actions du corps choisi passent
// dans la barre d'actions, toujours visible, au lieu du bas du panneau.
const phoneUI = matchMedia('(orientation: landscape) and (max-height: 540px)');
phoneUI.addEventListener('change', () => { placeBars(); if (view) update(); });

// Téléphone en paysage : la barre du voyage passe au-dessus de la scène et les jauges en dessous,
// dans la colonne centrale. Ailleurs, elles restent dans la barre du haut.
function placeBars() {
  const top = $('.topbar');
  if (phoneUI.matches) {
    $('.stage-wrap').prepend(top);
    $('.stage-wrap').append($('#gauges'));
  } else {
    document.body.prepend(top);
    top.insertBefore($('#gauges'), $('#fs'));
  }
}
placeBars();
document.addEventListener('fullscreenchange', () => view && update());

// Hauteur réellement visible, recalculée à chaque changement (barre d'adresse, plein écran,
// rotation) : plus fiable que 100dvh sur certains navigateurs Android.
function fitAppHeight() {
  const vv = window.visualViewport;
  const h = vv ? vv.height * vv.scale : window.innerHeight;
  document.documentElement.style.setProperty('--app-h', `${Math.round(Math.min(h, window.innerHeight))}px`);
}
fitAppHeight();
window.addEventListener('resize', fitAppHeight);
window.visualViewport?.addEventListener('resize', fitAppHeight);
document.addEventListener('fullscreenchange', fitAppHeight);

function placeTip() {
  const tip = $('#tip');
  const id = view.hoverBody || (touchUI.matches ? view.selectedBodyId : null);
  const l = id && view.layout?.find((x) => x.body.id === id);
  if (!l || !systemInteractive()) {
    tip.hidden = true;
    return;
  }
  const b = l.body;
  const html = b.revealed === 0 ? `<b>${b.index}.</b> Signal inconnu` : `<b>${b.index}. ${BODY_TYPES[b.type].name}</b> · ${b.ls} sl${b.landable ? ' · atterrissable' : ''}`;
  if (tip.innerHTML !== html) tip.innerHTML = html;
  tip.style.left = `${(l.x / W) * 100}%`;
  tip.style.top = `${((l.y - Math.max(l.r, 4) - 2) / H) * 100}%`;
  tip.hidden = false;
  // Garde la bulle entière dans la scène (corps proches du bord, petit écran).
  const sw = tip.parentElement.clientWidth;
  const half = tip.offsetWidth / 2;
  const x = Math.min(Math.max((l.x / W) * sw, half + 4), sw - half - 4);
  tip.style.left = `${x}px`;
}

function selectBody(id) {
  view.selectedBodyId = id;
  view.tab = 'ctx';
  update();
}

function cycleBody(dir) {
  const bodies = state.system.bodies;
  const i = bodies.findIndex((b) => b.id === view.selectedBodyId);
  const next = bodies[(i + dir + bodies.length) % bodies.length] || bodies[0];
  selectBody(next.id);
}

// ---------- Rendu HTML ----------

const pct = (v, max) => Math.max(0, Math.min(100, (v / max) * 100));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const round1 = (v) => Math.round(v * 10) / 10;
const kbd = (k) => (k ? `<kbd>${k}</kbd>` : '');

// ---------- Icônes en pixels (8×8, couleur courante) ----------

const ICON_BITMAPS = {
  full: ['###..###', '#......#', '#......#', '........', '........', '#......#', '#......#', '###..###'],
  fuel: ['...##...', '...##...', '..####..', '.######.', '.####.#.', '.####.#.', '..####..', '........'],
  bolt: ['....###.', '...###..', '..###...', '.######.', '...###..', '..###...', '..##....', '.#......'],
  hull: ['.######.', '########', '###..###', '###..###', '.######.', '..####..', '...##...', '........'],
  radar: ['#####...', '.....#..', '###...#.', '...#...#', '##..#..#', '.#..#..#', '.#..#..#', '........'],
  scope: ['.####...', '#....#..', '#.#..#..', '#....#..', '.####...', '....##..', '.....##.', '......##'],
  flask: ['..####..', '...##...', '...##...', '..#..#..', '.#....#.', '.######.', '########', '.######.'],
  compass: ['...#....', '...#....', '..###...', '#######.', '..###...', '...#....', '...#....', '........'],
  jump: ['......##', '.....###', '....###.', '.#.###..', '..###...', '..##....', '.#..#...', '#.......'],
  land: ['...##...', '...##...', '...##...', '.######.', '..####..', '...##...', '........', '########'],
  takeoff: ['...##...', '..####..', '.######.', '...##...', '...##...', '...##...', '........', '########'],
  check: ['........', '.......#', '......##', '#....##.', '##..##..', '.####...', '..##....', '........'],
  leaf: ['....####', '..######', '.###.###', '.##.####', '.#.####.', '.#.###..', '#.......', '........'],
  geo: ['.#...#..', '..#.#...', '...#....', '..###...', '.#####..', '#######.', '########', '........'],
  gem: ['...##...', '..####..', '.##..##.', '##....##', '.##..##.', '..####..', '...##...', '........'],
  target: ['..####..', '.#....#.', '#..##..#', '#.####.#', '#.####.#', '#..##..#', '.#....#.', '..####..'],
  skull: ['.######.', '########', '#..##..#', '#..##..#', '########', '.##..##.', '.######.', '.#.##.#.'],
  ship: ['........', '##......', '.###....', '.######.', '.#######', '.######.', '.###....', '##......'],
  star: ['...#....', '...#....', '.#####..', '#######.', '.#####..', '...#....', '...#....', '........'],
  alert: ['...##...', '..####..', '..#..#..', '.##..##.', '.##..##.', '########', '###..###', '########'],
  back: ['........', '..#.....', '.##.....', '#######.', '.##.....', '..#.....', '........', '........'],
  // Matériaux : lingot, pièce percée, hexagone de graphène, cristaux, puce, trèfle radioactif.
  iron: ['........', '........', '..####..', '.######.', '########', '########', '........', '........'],
  nickel: ['..####..', '.######.', '###..###', '##....##', '##....##', '###..###', '.######.', '..####..'],
  carbon: ['...##...', '.##..##.', '#......#', '#..##..#', '#..##..#', '#......#', '.##..##.', '...##...'],
  vanadium: ['...#....', '..###...', '..###.#.', '#.###.#.', '#.###.##', '#.###.##', '##.#.###', '########'],
  germanium: ['..#..#..', '.######.', '##....##', '.#.##.#.', '##.##.##', '.#....#.', '.######.', '..#..#..'],
  polonium: ['.##..##.', '###..###', '###..###', '...##...', '...##...', '..####..', '..####..', '........'],
};
const ICON_PATHS = Object.fromEntries(
  Object.entries(ICON_BITMAPS).map(([k, rows]) => {
    let d = '';
    rows.forEach((row, y) => {
      for (const m of row.matchAll(/#+/g)) d += `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`;
    });
    return [k, d];
  }),
);
const icon = (name) => `<svg class="ico ${name}" viewBox="0 0 8 8" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;

const GAUGE_ICONS = { fuel: 'fuel', hull: 'hull', energy: 'bolt' };

// Carburant, coque et énergie : partout la même icône et la même couleur que leur jauge
// (classes .res.fuel / .res.hull / .res.energy dans style.css), pour qu'on les repère d'un coup d'œil.
const res = (kind, text) => `<span class="res ${kind}">${icon(GAUGE_ICONS[kind])}${text}</span>`;
const fuelT = (n) => res('fuel', `${n} t`);
const energyN = (n) => res('energy', `${n}`);
const hullN = (n) => res('hull', `${n}`);
// Dans un texte de jeu (journal, bilans, recettes…), ajoute l'icône et la couleur aux mots
// coque, énergie et carburant. Le texte doit déjà être échappé.
const RES_WORDS = /(^|[^\p{L}])(coque|énergie|carburant)(?![\p{L}])/giu;
const RES_KIND = { coque: 'hull', 'énergie': 'energy', carburant: 'fuel' };
const decorate = (html) => html.replace(RES_WORDS, (m, pre, w) => `${pre}${res(RES_KIND[w.toLowerCase()], w)}`);

// Matériau en ligne : icône et symbole dans sa couleur (n = quantité, facultative).
const mat = (k, n, cls = '') => `<span class="mat ${cls}" style="--mat:${MATERIALS[k].color}" title="${MATERIALS[k].name}">${n != null ? `${n} ` : ''}${icon(k)}${MATERIALS[k].short}</span>`;
const matNames = (list) => list.map((k) => `<span class="mat" style="--mat:${MATERIALS[k].color}">${icon(k)}${MATERIALS[k].name}</span>`).join(' ');

function gauge(cls, label, v, max, unit = '') {
  const low = v / max < 0.25;
  const prev = view.prev[cls];
  let delta = '';
  if (prev != null && Math.abs(prev - v) >= 0.1) {
    const d = round1(v - prev);
    delta = ` <span class="delta ${d < 0 ? 'neg' : ''}" style="animation: fade-out 0.6s ease-in 1.6s forwards">${d > 0 ? '+' : ''}${d}</span>`;
  }
  view.prev[cls] = v;
  return `<div class="gauge ${cls} ${low ? 'low' : ''}" title="${label} : ${round1(v)}${unit} / ${max}${unit}">
    ${icon(GAUGE_ICONS[cls])}<div class="lbl"><span>${label}</span><span>${round1(v)}${unit}${delta}</span></div>
    <div class="track"><i style="width:${pct(v, max)}%"></i></div></div>`;
}

function renderTop() {
  const d = G.distanceToDestination(state);
  const total = state.galaxy.destination.dist;
  const p = pct(total - d, total);
  $('#route').innerHTML = `
    <span class="end muted">${icon('star')}<span>${esc(state.galaxy.origin.name)}</span></span>
    <span class="track-wrap" title="${Math.round(p)} % du voyage"><span class="track"><i style="width:${p}%"></i></span><span class="ship" style="left:${p}%">${icon('ship')}</span></span>
    <span class="end goal" title="${esc(state.galaxy.destination.system)}">${icon('target')}<b>${esc(state.galaxy.destination.name)}</b></span>
    <span class="stats"><b>${Math.round(d)}</b> al · <b>${state.jumps}</b> sauts</span>`;
  const s = state.ship;
  $('#gauges').innerHTML =
    gauge('fuel', 'Carburant', s.fuel, s.fuelMax, ' t') + gauge('hull', 'Coque', s.hull, s.hullMax) + gauge('energy', 'Énergie', s.energy, s.energyMax);
  const fs = $('#fs');
  fs.hidden = !(phoneUI.matches && canFullscreen() && !document.fullscreenElement);
  if (!fs.innerHTML) fs.innerHTML = icon('full');
}

// Journal vivant : chaque nouvelle ligne s'illumine quelques secondes quand le journal l'affiche ;
// tant qu'il n'est pas à l'écran, l'onglet Journal compte les lignes non lues.
const LOG_GLOW_MS = 4000;

function stampLog() {
  const now = performance.now();
  for (const l of state.log) {
    if (l.at != null) continue;
    l.at = now;
    l.unread = true;
  }
}

function renderLogTab(journalShown) {
  if (journalShown) for (const l of state.log) l.unread = false;
  const unread = state.log.filter((l) => l.unread);
  const tab = $('.tabs [data-tab="log"]');
  if (!tab) return;
  const key = unread.length ? `${unread.length}|${unread.some((l) => l.kind === 'bad')}` : '';
  if (tab.dataset.unread === key && tab.innerHTML) return;
  tab.dataset.unread = key;
  const badge = unread.length
    ? `<span class="badge ${unread.some((l) => l.kind === 'bad') ? 'bad' : ''}" title="${unread.length} nouvelle(s) entrée(s)">${unread.length > 9 ? '9+' : unread.length}</span>`
    : '';
  tab.innerHTML = `Journal${badge}${kbd('J')}`;
}

// --- Panneau : système ---

function bodyIcons(b) {
  if (b.revealed === 0) return '';
  const ic = [];
  if (b.revealed >= 2) {
    if (b.bio) ic.push(`<span class="good" title="Signaux biologiques">${icon('leaf')}${b.bio}</span>`);
    if (b.geo) ic.push(`<span title="Signaux géologiques">${icon('geo')}${b.geo}</span>`);
    if (b.feature) ic.push(`<span class="tag" title="Anomalie">${icon('gem')}</span>`);
    if (b.terraformable) ic.push('<span title="Terraformable">T</span>');
  } else if (b.hint) ic.push(`<span title="Signal détecté">${icon('alert')}</span>`);
  if (b.landed) ic.push(`<span class="tag" title="Visité">${icon('check')}</span>`);
  return ic.join(' ');
}

function bodyRow(b, scanning) {
  const hidden = b.revealed === 0 || (scanning && b.revealed === 1);
  const def = BODY_TYPES[b.type];
  const meta = hidden ? 'Non identifié' : `${b.ls} sl${b.landable ? ' · atterrissable' : ''}`;
  return `<button class="body-row ${hidden ? 'unknown' : ''} ${b.id === view.selectedBodyId ? 'sel' : ''}" data-body="${b.id}">
    <span class="n">${b.index}</span><span class="name">${hidden ? 'Signal inconnu' : def.name}</span><span class="ic">${hidden ? '' : bodyIcons(b)}</span>
    <span class="meta">${meta}</span></button>`;
}

function bodyDetail(b) {
  if (!b) return '';
  const def = BODY_TYPES[b.type];
  const chips = [];
  let text;
  if (b.revealed === 0) text = phoneUI.matches ? `<p><span class="title">Signal ${b.index}</span><br><span class="muted">Non identifié : scannez-le.</span></p>` : '<p>Signal non identifié. Un scan est nécessaire pour savoir ce que c\'est.</p>';
  else {
    text = `<p><span class="title">${esc(b.name)}</span><br><span class="muted">${def.name} · ${b.ls} ${phoneUI.matches ? 'sl' : 'secondes-lumière'}</span></p>`;
    chips.push(b.landable ? '<span class="chip good">Atterrissable</span>' : '<span class="chip">Pas de surface accessible</span>');
    if (b.revealed >= 2) {
      if (b.terraformable) chips.push('<span class="chip event">Terraformable</span>');
      if (b.bio) chips.push(`<span class="chip event">${b.bio} signal(s) bio</span>`);
      if (b.geo) chips.push(`<span class="chip event">${b.geo} signal(s) géo</span>`);
      if (b.feature) chips.push(`<span class="chip event">${esc(G.featureLabel(b.feature))}</span>`);
      if (b.rings) chips.push('<span class="chip">Anneaux</span>');
      if (bodyAtmosphere(b)) chips.push('<span class="chip cyan">Atmosphère ténue</span>');
      const mats = b.mats.length ? matNames(b.mats) : '—';
      text += `<p class="muted mat-line">Matériaux : ${mats}</p>`;
    } else {
      if (b.hint) chips.push('<span class="chip event">Signal détecté</span>');
      if (!phoneUI.matches) text += '<p class="muted">Un scan détaillé révèle matériaux, signaux et anomalies.</p>';
    }
    if (b.landed) chips.push('<span class="chip cyan">Visité</span>');
  }
  const acts = phoneUI.matches ? '' : `<div class="actions">${bodyActions(b).map(actionButton).join('')}</div>`;
  return `<div class="detail">${text}<div class="chips">${chips.join('')}</div>${acts}</div>`;
}

function systemPanel() {
  const sys = state.system;
  const star = STAR_CLASSES[sys.star];
  const scanning = view.scanWaveStart != null;
  const chips = [`<span class="chip cyan">${star.name}</span>`];
  if (star.scoopable) chips.push(sys.scooped ? '<span class="chip">Écopage fait</span>' : '<span class="chip good">Écopable</span>');
  else chips.push('<span class="chip bad">Non écopable</span>');
  if (star.boost) chips.push(`<span class="chip event">Jet de neutrons ×${star.boost}</span>`);
  for (const r of sys.regions || []) chips.push(`<span class="chip bad">${REGION_TYPES[r].name}</span>`);
  const unknown = sys.bodies.every((b) => b.revealed === 0);
  const sel = sys.bodies.find((b) => b.id === view.selectedBodyId);
  // Téléphone : la scène sert de liste (corps numérotés). Le panneau montre le corps choisi,
  // et une rangée de numéros pour passer d'un corps à l'autre.
  if (phoneUI.matches) {
    const nums = sys.bodies.map((b) => `<button class="num ${b.id === view.selectedBodyId ? 'sel' : ''} ${b.revealed === 0 ? 'unknown' : ''}" data-body="${b.id}">${b.index}</button>`).join('');
    return `
    ${sel ? '' : `<div class="sys-head"><h2>${esc(sys.name)}</h2>${chips.join('')}</div>`}
    ${scanning ? '<p class="scanning">Scan en cours…</p>' : ''}
    ${sel ? bodyDetail(sel) : `<p class="muted hint">${unknown ? 'Système inconnu : lancez un scan, ou touchez un signal.' : 'Touchez un corps pour l\'examiner.'}</p>`}
    <div class="nums">${nums}</div>`;
  }
  return `
    <h2>${esc(sys.name)}</h2>
    <div class="chips">${chips.join('')}</div>
    ${unknown && !scanning ? `<div class="empty">Système inconnu. Lancez un <b>scan du système</b> ${kbd('A')} pour révéler les corps, ou ciblez un signal pour un scan détaillé.</div>` : ''}
    ${scanning ? '<p class="scanning">Scan en cours…</p>' : ''}
    ${sel ? bodyDetail(sel) : ''}
    <h3>Corps du système (${sys.bodies.length})</h3>
    <div class="bodies">${sys.bodies.map((b) => bodyRow(b, scanning)).join('')}</div>
    ${!sel && !unknown ? `<p class="muted">Cliquez sur un corps (ou ${kbd('←')}${kbd('→')}) pour l'examiner.</p>` : ''}`;
}

// --- Panneau : surface ---

function surfacePanel() {
  const b = G.currentBody(state);
  const sf = state.surface;
  const found = [];
  if (sf.analyzed) {
    if (b.bio) found.push(`<span class="chip event">${b.bio} forme(s) de vie</span>`);
    if (b.geo) found.push('<span class="chip event">Évents géologiques</span>');
    if (b.feature) found.push(`<span class="chip event">${esc(G.featureLabel(b.feature))}</span>`);
  }
  return `
    <h2>${esc(b.name)}</h2>
    <p class="sub">${BODY_TYPES[b.type].name} · ${bodyAtmosphere(b) ? 'atmosphère ténue' : 'sans atmosphère'}</p>
    ${phoneUI.matches ? '' : `<p>${bodyAtmosphere(b) ? 'Le commandant descend la rampe. Le vent siffle contre la visière.' : 'Le commandant descend la rampe. Le silence est total.'}</p>`}
    ${sf.analyzed ? `<h3>Relevés</h3><div class="chips">${found.join('') || '<span class="chip">Rien de notable</span>'}</div>` : (phoneUI.matches ? '' : '<div class="empty">Analysez la surface pour repérer la vie, les évents et les anomalies.</div>')}
    <h3>Matériaux possibles</h3>
    <p class="muted mat-line">${matNames(b.mats) || '—'}</p>`;
}

// --- Panneau : navigation ---

function navCands() {
  const dNow = G.distanceToDestination(state);
  return state.candidates
    .map((c) => ({ c, check: G.canJump(state, c), fuel: G.jumpFuelCost(state, c), gain: dNow - dist(c, state.galaxy.destination), d: dist(state.pos, c) }))
    .sort((a, b) => (b.check.ok - a.check.ok) || (b.c.isDestination - a.c.isDestination) || b.gain - a.gain);
}

function ensureNavSel() {
  const cands = navCands();
  if (!cands.find((x) => x.c.id === view.navSel)) view.navSel = (cands.find((x) => x.check.ok) || cands[0])?.c.id ?? null;
  const sel = cands.find((x) => x.c.id === view.navSel);
  if (sel && sel.c.id !== view.warmed) {
    view.warmed = sel.c.id;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
    idle(() => renderer.warm(sel.c));
  }
  return cands;
}

function navPanel() {
  const cands = ensureNavSel();
  const list = cands
    .map(({ c, check, fuel, gain, d }) => {
      const star = STAR_CLASSES[c.star];
      const regions = c.regions.length ? ` · <span class="bad">${c.regions.map((r) => REGION_TYPES[r].name).join(', ')}</span>` : '';
      return `<button class="cand ${c.isDestination ? 'dest' : ''} ${c.id === view.navSel ? 'sel' : ''} ${check.ok ? '' : 'out'}" data-cand="${c.id}">
        <span class="name">${c.isDestination ? icon('target') : ''}${esc(c.name)}</span>
        <span class="gain ${gain >= 0 ? 'good' : 'bad'}">${gain >= 0 ? '−' : '+'}${Math.abs(Math.round(gain))} al</span>
        <span class="star">${star.name}${star.scoopable ? icon('fuel') : ''}${star.boost ? icon('bolt') : ''}${regions}</span>
        <span class="star">${check.ok ? `${d.toFixed(1)} al · ${fuelT(fuel)}` : `<span class="bad">${check.reason}</span>`}</span>
      </button>`;
    })
    .join('');
  return `
    <h2>Navigation</h2>
    <p class="sub">Portée ${state.effectiveRange.toFixed(1)} al · ${fuelT(round1(state.ship.fuel))} de carburant</p>
    <div class="cands">${list}</div>
    ${phoneUI.matches ? '' : `<p class="legend">${icon('fuel')} étoile écopable · ${icon('bolt')} jet de suralimentation · en vert : distance gagnée vers la destination. ${touchUI.matches ? '' : 'Double-clic pour sauter directement.'}</p>`}`;
}

function jumpAction(sel) {
  return {
    act: 'jump',
    icon: icon('jump'),
    label: phoneUI.matches ? 'Sauter' : `Sauter vers ${sel.c.name}`,
    cost: sel.check.ok ? fuelT(sel.fuel) : '',
    why: sel.check.ok ? '' : sel.check.reason,
    disabled: !sel.check.ok,
    primary: true,
    key: 'Entrée',
  };
}

function navLayout() {
  const w = navCanvas.width, h = navCanvas.height;
  const range = state.effectiveRange;
  const scale = (Math.min(w, h) / 2 - 24) / (range * 1.1);
  const cx = w / 2, cy = h / 2;
  const P = (p) => [cx + (p.x - state.pos.x) * scale, cy + (p.y - state.pos.y) * scale];
  return { w, h, range, scale, cx, cy, P };
}

function drawNavmap() {
  if (navCanvas.hidden) return;
  const ctx = navCanvas.getContext('2d');
  const { w, h, range, scale, cx, cy, P } = navLayout();
  ctx.fillStyle = '#05061a';
  ctx.fillRect(0, 0, w, h);
  // Grille
  ctx.strokeStyle = 'rgba(125, 132, 240, 0.09)';
  ctx.lineWidth = 1;
  for (let x = (cx % 40) + 0.5; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = (cy % 40) + 0.5; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  for (const r of state.galaxy.regions) {
    const [x, y] = P(r);
    ctx.beginPath();
    ctx.arc(x, y, r.r * scale, 0, Math.PI * 2);
    ctx.fillStyle = REGION_TYPES[r.type].color;
    ctx.fill();
    ctx.strokeStyle = REGION_TYPES[r.type].stroke;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Trajet parcouru
  ctx.strokeStyle = '#a993ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  state.path.forEach((p, i) => {
    const [x, y] = P(p);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.lineWidth = 1;
  // Portée
  ctx.strokeStyle = 'rgba(111, 211, 255, 0.45)';
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, range * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '15px DotGothic16, "Pixelify Sans", VT323, monospace';
  ctx.fillStyle = 'rgba(111, 211, 255, 0.7)';
  ctx.fillText(`portée ${range.toFixed(1)} al`, cx + range * scale * 0.72, cy - range * scale * 0.72);
  // Destination
  const dest = state.galaxy.destination;
  const a = Math.atan2(dest.y - state.pos.y, dest.x - state.pos.x);
  const [dx, dy] = P(dest);
  const inside = dx > 10 && dx < w - 10 && dy > 10 && dy < h - 10;
  ctx.fillStyle = '#7df0b4';
  if (inside) {
    ctx.fillRect(dx - 4, dy - 4, 9, 9);
    ctx.fillText(dest.name, dx + 10, dy + 5);
  } else {
    const k = Math.min((w / 2 - 22) / Math.abs(Math.cos(a) || 1e-6), (h / 2 - 22) / Math.abs(Math.sin(a) || 1e-6));
    const ex = cx + Math.cos(a) * k, ey = cy + Math.sin(a) * k;
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(a) * 12, ey + Math.sin(a) * 12);
    ctx.lineTo(ex + Math.cos(a + 2.5) * 12, ey + Math.sin(a + 2.5) * 12);
    ctx.lineTo(ex + Math.cos(a - 2.5) * 12, ey + Math.sin(a - 2.5) * 12);
    ctx.fill();
    const label = `${dest.name} · ${Math.round(G.distanceToDestination(state))} al`;
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, Math.max(6, Math.min(w - tw - 6, ex - tw / 2)), ey + (ey > cy ? -18 : 28));
  }
  // Candidats
  view.navPoints = [];
  for (const cand of state.candidates) {
    const [x, y] = P(cand);
    const ok = G.canJump(state, cand).ok;
    const star = STAR_CLASSES[cand.star];
    const sel = cand.id === view.navSel, hover = cand.id === view.hoverCand;
    view.navPoints.push({ id: cand.id, x, y });
    if (sel) {
      ctx.strokeStyle = '#ffb054';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }
    ctx.globalAlpha = ok ? 1 : 0.3;
    ctx.fillStyle = cand.isDestination ? '#7df0b4' : star.color === '#000000' ? '#ff9a3a' : star.color;
    ctx.beginPath();
    ctx.arc(x, y, sel || hover ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
    if (sel || hover) {
      ctx.strokeStyle = sel ? '#ffd18a' : '#7d84f0';
      ctx.strokeRect(Math.round(x) - 10.5, Math.round(y) - 10.5, 21, 21);
      ctx.fillStyle = '#ecebff';
      ctx.fillText(cand.name, x + 14, y + 5);
    }
    ctx.globalAlpha = 1;
  }
  // Vaisseau
  ctx.fillStyle = '#ffb054';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-5, -5, 10, 10);
  ctx.restore();
}

function navPick(e) {
  const r = navCanvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * navCanvas.width;
  const y = ((e.clientY - r.top) / r.height) * navCanvas.height;
  let best = null, bd = 18;
  for (const p of view.navPoints || []) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { best = p.id; bd = d; }
  }
  return best;
}

navCanvas.addEventListener('mousemove', (e) => {
  const id = navPick(e);
  navCanvas.style.cursor = id ? 'pointer' : 'crosshair';
  if (id !== view.hoverCand) {
    view.hoverCand = id;
    drawNavmap();
  }
});
navCanvas.addEventListener('click', (e) => {
  const id = navPick(e);
  if (id) {
    view.navSel = id;
    update();
  }
});
navCanvas.addEventListener('dblclick', (e) => {
  const id = navPick(e);
  if (id) doJump(id);
});

// --- Panneau : synthèse ---

function synthPanel() {
  const groups = ['Réparer', 'Fabriquer', 'Améliorer'];
  const have = state.ship.materials;
  return `
    <h2>Synthèse</h2>
    ${matsGrid()}
    ${groups
      .map((g) => `<h3>${g}</h3><div class="recipes">${RECIPES.filter((r) => r.kind === g && (r.needs !== 'tankLeak' || state.flags.tankLeak))
        .map((r) => {
          const owned = r.once && state.upgrades[r.id];
          const locked = r.needs && !state.flags[r.needs];
          const cost = Object.entries(r.cost).map(([m, n]) => mat(m, n, (have[m] || 0) < n ? 'miss' : '')).join(' ');
          return `<button class="recipe" data-synth="${r.id}" ${G.canSynthesize(state, r) ? '' : 'disabled'}>
            <span>${r.name}${owned ? ` <span class="good">${icon('check')}</span>` : ''}</span><span class="k">${cost}</span>
            <span class="c">${locked ? 'Plan requis (ruines gardiennes)' : owned ? 'Déjà installé' : decorate(r.desc)}</span></button>`;
        })
        .join('')}</div>`)
      .join('')}`;
}

function matsGrid() {
  const s = state.ship;
  return `<div class="mats">${Object.entries(MATERIALS)
    .map(([k, m]) => `<div class="${s.materials[k] ? '' : 'zero'}" style="--mat:${m.color}" title="${m.name}"><span>${icon(k)}${m.short}</span><span>${s.materials[k] || 0}</span></div>`)
    .join('')}</div>`;
}

// --- Panneau : modules ---
// Les jauges carburant/coque/énergie restent dans la barre du haut : ici, l'état de chaque
// module et ce qu'il change concrètement en jeu.

function moduleEffect(k, v) {
  switch (k) {
    case 'fsd':
      return v <= 0 ? ['bad', 'Hors service : saut impossible'] : ['', `Portée ×${(0.6 + 0.4 * (v / 100)).toFixed(2)} · ${state.effectiveRange.toFixed(1)} al`];
    case 'scoop':
      return v <= 0 ? ['bad', 'Hors service : écopage impossible'] : ['', `Rendement d'écopage ${Math.round(v)} %`];
    case 'scanner':
      return v < 25 ? ['bad', 'Scan détaillé impossible sous 25 %'] : ['', `Scan détaillé : ${energyN(G.manualScanCost(state))}`];
    case 'thrusters':
      return v < 20 ? ['bad', 'Atterrissage impossible sous 20 %'] : v < 50 ? ['mid', 'Atterrissage brutal probable (40 %)'] : ['', 'Atterrissage en douceur'];
    case 'life':
      return [v < 30 ? 'bad' : '', state.passenger ? `Passager : −${G.PASSENGER_LIFE_DRAIN} % par saut · à 0 %, fin du voyage` : 'À 0 %, fin du voyage'];
  }
  return ['', ''];
}

function modulesPanel() {
  const s = state.ship;
  const mods = Object.entries(s.modules)
    .map(([k, v]) => {
      const lvl = v < 30 ? 'low' : v < 60 ? 'mid' : '';
      const [cls, fx] = moduleEffect(k, v);
      return `<div class="module"><span>${MODULES[k].name}</span><span class="v ${lvl}">${Math.round(v)} %</span><span class="mini"><i class="${lvl}" style="width:${pct(v, 100)}%"></i></span><span class="fx ${cls}">${decorate(fx)}</span></div>`;
    })
    .join('');
  const ups = RECIPES.filter((r) => r.once && state.upgrades[r.id]);
  const repair = RECIPES.find((r) => r.id === 'module');
  return `
    <h2>${esc(s.name)}</h2>
    ${phoneUI.matches ? '' : `<p class="sub">${esc(SHIPS[s.model].maker)} · ${esc(SHIPS[s.model].desc)}</p>`}
    <h3>Modules</h3>
    <div class="modules">${mods}</div>
    ${Object.values(s.modules).some((v) => v < 100) ? `<p class="muted mat-line">Réparation en <b>synthèse</b> ${kbd('Y')} : ${Object.entries(repair.cost).map(([m, n]) => mat(m, n, (s.materials[m] || 0) < n ? 'miss' : '')).join(' ')} pour +${state.passenger === 'engineer' ? 60 : 40} % au module le plus abîmé${G.canSynthesize(state, repair) ? '' : ' (matériaux insuffisants)'}.</p>` : ''}
    <h3>Améliorations</h3>
    ${ups.length ? `<div class="stats-list">${ups.map((r) => `<div class="row"><span>${r.name}</span><span class="tag">${decorate(r.desc)}</span></div>`).join('')}</div>` : '<p class="muted">Aucune pour l\'instant. Elles se fabriquent en synthèse.</p>'}
    ${s.boost > 1 || state.passenger || state.flags.tankLeak ? `<h3>En cours</h3><div class="stats-list">
    ${s.boost > 1 ? `<div class="row"><span>FSD suralimenté</span><span class="tag">×${s.boost} au prochain saut</span></div>` : ''}
    ${state.passenger ? `<div class="row"><span>Passager</span><span class="tag">${esc(PASSENGERS[state.passenger].name)}</span></div><p class="muted">${esc(PASSENGERS[state.passenger].perk)}</p>` : ''}
    ${state.flags.tankLeak ? `<div class="row"><span class="bad">Réservoir percé</span><span class="tag">−${G.LEAK_PER_JUMP} t/saut</span></div>` : ''}
    </div>` : ''}
    <h3>Matériaux</h3>
    ${matsGrid()}
    <div class="stats-list"><div class="row"><span>Données d'exploration</span><span class="tag">${state.data}</span></div></div>
    <p class="seed">Graine de la galaxie : ${state.seed}</p>`;
}

function logPanel(title = 'Journal de bord') {
  // Le journal est à l'écran : les lignes non lues s'illuminent maintenant, pas à leur arrivée.
  const now = performance.now();
  for (const l of state.log) if (l.unread) Object.assign(l, { unread: false, at: now });
  return `<h2>${title}</h2><ol class="log">${state.log
    .slice()
    .reverse()
    .map((l) => {
      // Délai négatif : l'illumination reprend où elle en était quand le panneau est redessiné.
      const age = performance.now() - l.at;
      const glow = l.at && age < LOG_GLOW_MS ? ` fresh" style="animation-delay:-${Math.round(age)}ms` : '';
      return `<li class="${l.kind}${glow}"><span class="j">S${l.jump}</span>${decorate(esc(l.text))}</li>`;
    })
    .join('')}</ol>`;
}

// --- Actions (barre du bas) ---

function actionButton(a) {
  if (a.sep) return '<span class="sep"></span>';
  if (a.hint) return `<span class="hint">${a.hint}</span>`;
  const attrs = Object.entries(a.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button class="${a.primary ? 'primary' : ''}" ${a.act ? `data-act="${a.act}"` : ''} ${a.key ? `data-key="${esc(a.key)}"` : ''} ${attrs} ${a.disabled ? 'disabled' : ''} title="${esc(a.why || '')}">${a.icon || ''}${esc(phoneUI.matches && a.short ? a.short : a.label)}${a.cost ? `<span class="cost">${a.cost}</span>` : ''}${kbd(a.key)}${a.why && a.inlineWhy !== false ? `<span class="why">${esc(a.why)}</span>` : ''}</button>`;
}

function bodyActions(b) {
  if (!b) return [];
  const acts = [];
  const scanCost = G.manualScanCost(state);
  if (b.revealed < 2) {
    let why = '';
    if (state.ship.modules.scanner < 25) why = 'Scanner trop endommagé';
    else if (state.ship.energy < scanCost) why = 'Énergie insuffisante';
    acts.push({ act: 'manual', icon: icon('scope'), label: 'Scan détaillé', short: 'Scan corps', cost: energyN(scanCost), disabled: !!why, why, key: 'M' });
  }
  if (b.landable && b.revealed > 0) {
    const check = G.canLand(state, b);
    acts.push({ act: 'land', icon: icon('land'), label: 'Atterrir', cost: energyN(G.COSTS.land), disabled: !check.ok, why: check.reason || '', primary: true, key: 'L' });
  }
  return acts;
}

// Téléphone en paysage : les actions sont réparties sous les deux pouces. À gauche, les actions
// d'appoint (synthèse, écopage, retour…) ; à droite, celles qui font avancer le voyage. Dans
// chaque colonne, l'action principale est en bas, au plus près du pouce.
const LEFT_ACTS = ['back', 'synth', 'scoop', 'boost', 'retry', 'menu'];
const LEFT_SURF = ['analyze', 'harvest'];

function renderDocks() {
  const acts = dockActions();
  const left = $('#dock-left');
  const journal = $('#journal');
  left.hidden = journal.hidden = !phoneUI.matches;
  if (!phoneUI.matches) {
    $('#dock').innerHTML = acts.map(actionButton).join('');
    return;
  }
  const isLeft = (a) => LEFT_ACTS.includes(a.act) || LEFT_SURF.includes(a.data?.surf);
  const column = (list) => [...list.filter((a) => !a.primary), ...list.filter((a) => a.primary)].map(actionButton).join('');
  const shown = acts.filter((a) => !a.sep);
  left.innerHTML = column(shown.filter(isLeft));
  $('#dock').innerHTML = column(shown.filter((a) => !isLeft(a)));
  journal.innerHTML = logPanel('Journal');
}

// Libellés courts des actions de surface pour la barre d'actions du téléphone.
const SURFACE_SHORT = { analyze: 'Analyser', harvest: 'Ressources', sample: 'Échantillons', feature: 'Explorer', geo: 'Évents', takeoff: 'Décoller' };

function dockActions() {
  if (view.scene === 'title') return [];
  if (isCinematic()) return [{ act: 'skip', label: 'Passer', key: 'Espace' }];
  if (view.scene === 'end') {
    return [
      { act: 'new', icon: icon('jump'), label: 'Nouvelle partie', primary: true, key: 'Entrée' },
      { act: 'retry', label: 'Rejouer cette graine', short: 'Rejouer', key: 'R' },
      { act: 'menu', label: 'Retour au menu principal', short: 'Menu', key: 'M' },
    ];
  }
  if (state.phase === 'event' || view.scoopPick) return [{ hint: phoneUI.matches ? 'Décision requise' : 'Décision requise : choisissez une option dans la fenêtre.' }];
  const back = { act: 'back', icon: icon('back'), label: 'Retour', key: 'Échap' };
  if (view.mode === 'synth') return [back];
  if (view.mode === 'nav') {
    const sel = navCands().find((x) => x.c.id === view.navSel);
    return [back, ...(sel ? [jumpAction(sel)] : [])];
  }
  const synth = { act: 'synth', icon: icon('flask'), label: 'Synthèse', key: 'Y' };
  if (state.phase === 'surface') {
    const acts = G.surfaceActions(state);
    let n = 0;
    return [
      ...acts.map((a) => {
        const takeoff = a.id === 'takeoff';
        const key = takeoff ? 'D' : String(++n);
        const low = a.cost && state.ship.energy < a.cost && !takeoff;
        return {
          data: { surf: a.id },
          icon: takeoff ? icon('takeoff') : a.done ? icon('check') : '',
          label: takeoff ? 'Décoller' : a.label,
          short: SURFACE_SHORT[a.id],
          cost: a.cost ? energyN(a.cost) : '',
          disabled: a.done || low,
          why: low ? 'Énergie insuffisante' : '',
          inlineWhy: false,
          primary: takeoff,
          key,
        };
      }),
      { sep: true },
      synth,
    ];
  }
  const sys = state.system;
  const star = STAR_CLASSES[sys.star];
  const acts = [];
  if (phoneUI.matches) {
    const b = sys.bodies.find((x) => x.id === view.selectedBodyId);
    acts.push(...bodyActions(b));
  }
  if (!(phoneUI.matches && sys.autoScanned)) acts.push(
    { act: 'auto', icon: icon('radar'), label: 'Scan du système', short: 'Scanner', cost: energyN(G.COSTS.autoScan), disabled: sys.autoScanned || state.ship.energy < G.COSTS.autoScan, why: sys.autoScanned ? 'Déjà fait' : '', inlineWhy: false, key: 'A', primary: !sys.autoScanned },
  );
  if (star.scoopable) acts.push({ act: 'scoop', icon: icon('fuel'), label: sys.scooped ? 'Écopage fait' : 'Écoper', short: sys.scooped ? 'Écopé' : 'Écoper', disabled: !G.canScoop(state), key: 'E' });
  if (star.boost) acts.push({ act: 'boost', icon: icon('bolt'), label: `Jet ×${star.boost}`, cost: 'dégâts', disabled: !G.canBoost(state), key: 'B' });
  acts.push({ sep: true }, synth, { act: 'nav', icon: icon('compass'), label: 'Navigation', key: 'N', primary: sys.autoScanned });
  return acts;
}

// --- Cartes en surimpression ---

function costLabel(cost = {}) {
  const parts = [];
  if (cost.energy) parts.push(energyN(cost.energy));
  if (cost.fuel) parts.push(fuelT(cost.fuel));
  if (cost.mats) parts.push(Object.entries(cost.mats).map(([m, n]) => mat(m, n)).join(' '));
  return parts.join(', ');
}

// Bilan d'un choix : matériaux gagnés ou perdus, coque, énergie, carburant, modules, données.
const EFFECT_ICONS = { hull: 'hull', energy: 'bolt', fuel: 'fuel', fuelMax: 'fuel', module: 'ship', data: 'scope' };
function effectsLine(effects = []) {
  if (!effects.length) return '';
  const signed = (n) => (n > 0 ? `+${n}` : `−${-n}`);
  const chips = effects.map((e) => {
    const cls = e.delta > 0 ? 'gain' : 'loss';
    if (e.kind === 'mat') return mat(e.key, signed(e.delta), cls);
    return `<span class="fx ${cls}">${icon(EFFECT_ICONS[e.kind])}${esc(G.effectLabel(e))}</span>`;
  });
  return `<div class="effects">${chips.join('')}</div>`;
}

function eventCard() {
  const ev = state.event;
  const choices = ev.outcome
    ? `<div class="outcome"><p>${decorate(esc(ev.outcome))}</p>${effectsLine(ev.effects)}</div><div class="choices"><button class="primary" data-act="close">Continuer${kbd('Entrée')}</button></div>`
    : `<div class="choices">${G.eventChoices(state)
        .map(({ choice, index, label, available }, n) => {
          const cost = costLabel(choice.cost);
          return `<button data-choice="${index}" data-n="${n + 1}" class="${choice.when ? 'lore' : ''}" ${available ? '' : 'disabled'}>${esc(label)}${cost ? `<span class="cost">${cost}</span>` : ''}${kbd(n + 1)}</button>`;
        })
        .join('')}</div>`;
  return `<div class="card event-card" role="dialog" aria-labelledby="evt"><div class="eyebrow">${icon('alert')}Événement</div><h2 id="evt">${esc(G.eventTitle(state, ev.def))}</h2><p class="lead">${esc(G.eventText(state, ev.def))}</p>${choices}</div>`;
}

// Écopage : le joueur choisit sa distance à l'étoile, donc son risque.
function scoopCard() {
  const star = STAR_CLASSES[state.system.star];
  const rows = Object.entries(SCOOP_APPROACHES)
    .map(([id, a], i) => {
      const p = G.scoopPreview(state, id);
      const risk = Math.round(p.risk * 100);
      return `<button data-scoop="${id}" data-n="${i + 1}">${esc(a.name)} <span class="muted">· ${esc(a.desc)}</span>
        <span class="cost">${res('fuel', `${p.min}–${p.max} t`)} · <span class="${risk >= 30 ? 'bad' : risk > 0 ? '' : 'good'}">surchauffe ${risk} %</span></span>${kbd(i + 1)}</button>`;
    })
    .join('');
  return `<div class="card event-card" role="dialog" aria-labelledby="scp"><div class="eyebrow">${icon('fuel')}Écopage</div>
    <h2 id="scp">Approche de l'étoile</h2>
    <p class="lead">${esc(star.name)}. Plus vous frôlez la couronne, plus le réservoir se remplit vite, et plus la chaleur menace la coque et les modules.</p>
    <div class="choices">${rows}<button data-act="scoopCancel">Renoncer${kbd('Échap')}</button></div></div>`;
}

function endCard() {
  const v = state.phase === 'victory';
  const st = state.stats;
  const top = [...state.discoveries].sort((a, b) => b.pts - a.pts).slice(0, 3);
  return `<div class="card end ${v ? 'won' : 'lost'}" role="dialog">
    <div class="eyebrow">${v ? `${icon('target')}Victoire` : `${icon('skull')}Fin de partie`}</div>
    <h2>${v ? 'Destination atteinte' : 'Fin du voyage'}</h2>
    <p>${esc(state.end.reason)}</p>
    <div class="stats">
      <span>Sauts</span><span>${state.jumps}</span>
      <span>Distance parcourue</span><span>${Math.round(state.distanceTravelled)} al</span>
      <span>Systèmes visités</span><span>${st.systems}</span>
      <span>Corps scannés en détail</span><span>${st.bodiesScanned}</span>
      <span>Atterrissages</span><span>${st.landings}</span>
      <span>Organismes catalogués</span><span>${st.bioSamples}</span>
      <span>Données d'exploration</span><span class="tag">${state.data}</span>
    </div>
    ${top.length ? `<p class="top">${top.map((d) => esc(d.label)).join('<br>')}</p>` : ''}
    ${careerNotes()}
    <div class="choices">
      <button class="primary" data-act="new">Nouvelle partie${kbd('Entrée')}</button>
      <button data-act="retry">Rejouer la graine${kbd('R')}</button>
      <button data-act="menu">Retour au menu principal${kbd('M')}</button>
    </div></div>`;
}

// Ce que la partie laisse au commandant : savoir, codex, vaisseaux.
function careerNotes() {
  const notes = [];
  const fresh = Object.keys(state.codex).length;
  if (fresh) notes.push(`${fresh} entrée(s) de codex documentée(s) · codex ${Object.keys(profile.codex).length}/${Object.keys(CODEX).length}`);
  for (const [k, def] of Object.entries(KNOWLEDGE)) if (state.knowledge[k]) notes.push(`${def.name} : ${state.knowledge[k]}/${def.max}`);
  for (const m of view.unlocked || []) notes.push(`<b class="good">Nouveau vaisseau de départ : ${esc(SHIPS[m].name)}</b>`);
  return notes.length ? `<p class="career">${notes.join('<br>')}</p>` : '';
}

// Miniatures des vaisseaux (pixel art pré-rendu), calculées une seule fois.
const thumbs = {};
function shipThumbUrl(id) {
  if (!(id in thumbs)) {
    try { thumbs[id] = shipThumb(id).toDataURL(); } catch { thumbs[id] = ''; }
  }
  return thumbs[id];
}

function shipPicker() {
  return `<div class="ships">${Object.entries(SHIPS)
    .map(([id, d]) => {
      const ok = isUnlocked(profile, id);
      return `<button data-ship="${id}" class="${id === shipChoice ? 'sel' : ''}" ${ok ? '' : 'disabled'} title="${esc(ok ? d.desc : d.unlock)}">
        ${shipThumbUrl(id) ? `<img class="ship-thumb" src="${shipThumbUrl(id)}" alt="">` : ''}<b>${esc(d.name)}</b><span class="muted">${ok ? `${d.range} al · ${fuelT(d.fuel)} · ${hullN(d.hull)}` : 'Verrouillé'}</span></button>`;
    })
    .join('')}</div>`;
}

function codexSummary() {
  const total = Object.keys(CODEX).length;
  const known = Object.keys(profile.codex).filter((k) => CODEX[k]);
  const cats = {};
  for (const [k, e] of Object.entries(CODEX)) (cats[e.cat] ||= []).push(profile.codex[k] ? esc(e.name) : '???');
  const lore = Object.entries(KNOWLEDGE).map(([k, d]) => `<li>${d.name} : ${profile.knowledge[k]}/${d.max}${Object.entries(d.tiers).filter(([t]) => profile.knowledge[k] >= t).map(([, txt]) => `<br><span class="muted">${esc(txt)}</span>`).join('')}</li>`).join('');
  return `<details><summary>Codex et savoir (${known.length}/${total})</summary><ul>${lore}
    ${Object.entries(cats).map(([c, l]) => `<li><b>${esc(c)}</b> : ${l.join(', ')}</li>`).join('')}
    <li class="muted">${profile.runs} partie(s), ${profile.victories} arrivée(s), ${profile.landings} atterrissage(s).</li></ul></details>`;
}

function titleCard() {
  return `<div class="card title-card"><div class="tc-intro">
    <div class="kicker">Roguelite d'exploration spatiale</div>
    <div class="logo-big">It's Dangerous<span>Out There</span></div>
    <p class="motto">« La destination est certaine. Le voyage ne l'est jamais. »</p>
    <p>Rejoignez <b>${esc(state.galaxy.destination.name)}</b>, à ${Math.round(state.galaxy.destination.dist)} années-lumière, à bord d'un ${esc(state.ship.name)}. ${res('fuel', 'Carburant')}, ${res('hull', 'coque')} et ${res('energy', 'énergie')} sont comptés.</p></div>
    <div class="tc-play">${shipPicker()}
    <div class="choices"><button class="primary" data-act="start">${icon('takeoff')}Décoller${kbd('Entrée')}</button></div>
    <details><summary>Comment jouer</summary><ul>
      <li>Scannez chaque système ${kbd('A')} et examinez les corps (clic ou ${kbd('←')}${kbd('→')}).</li>
      <li>Écopez les étoiles KGBFOAM ${kbd('E')} : plus vous approchez, plus vous écopez, plus vous chauffez.</li>
      <li>Posez-vous ${kbd('L')} pour récolter des matériaux, puis réparez et améliorez ${kbd('Y')}.</li>
      <li>Ouvrez la navigation ${kbd('N')}, choisissez une étoile, sautez ${kbd('Entrée')}.</li>
    </ul></details>
    ${codexSummary()}
    <p class="gallery"><a href="galerie.html">Galerie des 500 fonds</a></p></div></div>`;
}

// ---------- Mise à jour ----------

function ctxTabLabel() {
  if (view.scene === 'title') return 'Briefing';
  if (view.scene === 'event' && !view.eventReady) return 'Événement';
  if (isCinematic()) return 'En vol';
  if (view.mode === 'nav') return 'Navigation';
  if (view.mode === 'synth') return 'Synthèse';
  if (state.phase === 'surface') return 'Surface';
  return 'Système';
}

function update() {
  if (state.phase === 'surface' && view.scene === 'system') view.scene = 'surface';
  if (state.phase === 'system' && view.scene === 'surface') view.scene = 'system';
  // Chaque nouvel événement ouvre sur sa cinématique ; elle s'efface quand l'événement se ferme.
  if (state.phase === 'event' && state.event && view.eventObj !== state.event && !isCinematic() && view.scene !== 'title' && view.scene !== 'end') {
    view.eventObj = state.event;
    if (renderer.hasEventScene(state.event.id)) {
      if (state.surface) view.body = G.currentBody(state) || view.body;
      Object.assign(view, { scene: 'event', sceneStart: performance.now(), sceneTime: 0, eventId: state.event.id, eventReady: false, mode: 'system', scoopPick: false });
    }
  }
  if (view.scene === 'event' && state.phase !== 'event') view.scene = state.surface ? 'surface' : 'system';
  if ((state.phase === 'victory' || state.phase === 'gameover') && !isCinematic()) view.scene = 'end';
  if (view.mode === 'nav' && state.phase !== 'system') view.mode = 'system';
  if (view.scene !== 'title') {
    stampLog();
    view.unlocked.push(...absorbRun(profile, state));
    const json = JSON.stringify(profile);
    if (json !== profileSaved) {
      profileSaved = json;
      saveProfile(profile);
    }
  }
  if (view.scoopPick && !G.canScoop(state)) view.scoopPick = false;
  renderTop();

  const overlay = $('#overlay');
  overlay.hidden = true;
  overlay.className = 'overlay';
  overlay.innerHTML = '';
  if (view.scene === 'title') {
    overlay.hidden = false;
    overlay.innerHTML = titleCard();
  } else if (view.scene === 'end') {
    overlay.hidden = false;
    overlay.innerHTML = endCard();
  } else if (state.phase === 'event' && !isCinematic()) {
    overlay.hidden = false;
    overlay.className = 'overlay event';
    overlay.innerHTML = eventCard();
  } else if (view.scene === 'event') {
    // Pendant la cinématique : seul le titre, en bas, comme un sous-titre.
    overlay.hidden = false;
    overlay.className = 'overlay cine';
    overlay.innerHTML = `<p class="cine-title">${icon('alert')}${state.event ? esc(G.eventTitle(state, state.event.def)) : ''}</p>`;
  } else if (view.scoopPick) {
    overlay.hidden = false;
    overlay.innerHTML = scoopCard();
  }

  const showNav = view.mode === 'nav' && view.scene === 'system' && state.phase === 'system';
  navCanvas.hidden = !showNav;
  canvas.classList.toggle('pickable', systemInteractive());
  if (!systemInteractive()) view.hoverBody = null;
  placeTip();

  // Panneau latéral
  if (phoneUI.matches && view.tab === 'log') view.tab = 'ctx';
  $('#tab-ctx').innerHTML = `${ctxTabLabel()}`;
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === view.tab));
  const panel = $('#panel');
  const scroll = panel.scrollTop;
  if (view.tab === 'modules') panel.innerHTML = modulesPanel();
  else if (view.tab === 'log') panel.innerHTML = logPanel();
  else if (view.scene === 'title') panel.innerHTML = `<h2>Plan de vol</h2>
    <div class="flight">
      <div class="leg">${icon('star')}<div><span class="muted">Départ</span><b>${esc(state.galaxy.origin.name)}</b></div></div>
      <div class="leg goal">${icon('target')}<div><span class="muted">Destination</span><b>${esc(state.galaxy.destination.name)}</b><span class="muted">${esc(state.galaxy.destination.system)}</span></div></div>
    </div>
    <div class="row"><span>Distance</span><span class="tag">${Math.round(state.galaxy.destination.dist)} al</span></div>
    <h3>Soute</h3>${matsGrid()}`;
  else if (isCinematic()) panel.innerHTML = `<h2>${{ jump: 'Saut hyperspatial', landing: 'Approche planétaire', takeoff: 'Décollage', event: 'Événement' }[view.scene]}</h2><p class="muted">${{ jump: 'Le FSD charge… l\'hyperespace s\'ouvre.', landing: 'Mise en orbite, descente, atterrissage.', takeoff: 'Retour en orbite.', event: state.event ? esc(G.eventText(state, state.event.def)) : '' }[view.scene]}</p>`;
  else if (view.mode === 'synth') panel.innerHTML = synthPanel();
  else if (view.mode === 'nav') panel.innerHTML = navPanel();
  else if (state.phase === 'surface' || view.scene === 'surface') panel.innerHTML = surfacePanel();
  else if (view.scene === 'end') panel.innerHTML = logPanel();
  else panel.innerHTML = systemPanel();
  panel.scrollTop = scroll;
  // Animation d'entrée seulement quand le contenu change de nature (onglet, mode, corps).
  const key = `${view.tab}|${ctxTabLabel()}|${view.selectedBodyId || ''}`;
  if (panel.dataset.key !== key) {
    if (panel.dataset.key) panel.scrollTop = 0;
    panel.dataset.key = key;
    panel.classList.remove('enter');
    void panel.offsetWidth;
    panel.classList.add('enter');
  }

  renderDocks();
  renderLogTab(view.tab === 'log' || view.scene === 'end' || !$('#journal').hidden);
  if (showNav) drawNavmap();
}

// ---------- Actions ----------

// Sur téléphone et tablette, le départ passe en plein écran et verrouille le paysage
// quand le navigateur le permet (Android ; iPhone ignore, l'écran « Tournez » prend le relais).
const canFullscreen = () => matchMedia('(pointer: coarse)').matches && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;

function goFullscreenLandscape() {
  if (!canFullscreen() || document.fullscreenElement) return;
  const el = document.documentElement;
  if (!el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}

function start() {
  goFullscreenLandscape();
  newGame(state.seed);
}

function doJump(id) {
  const cand = state.candidates.find((c) => c.id === id);
  if (!cand || !G.canJump(state, cand).ok) return;
  const res = G.jump(state, id);
  view.mode = 'system';
  view.hoverCand = null;
  view.tab = 'ctx';
  if (res.ok) setScene('jump', { jumpStar: cand.star });
  else update();
}

function act(name) {
  switch (name) {
    case 'start': return start();
    case 'auto':
      if (G.autoScan(state)) view.scanWaveStart = performance.now();
      break;
    case 'manual': {
      const id = view.selectedBodyId;
      if (G.manualScan(state, id)) view.beam = { bodyId: id, until: performance.now() / 1000 + 0.8 };
      break;
    }
    case 'scoop':
      view.scoopPick = G.canScoop(state);
      break;
    case 'scoopCancel':
      view.scoopPick = false;
      break;
    case 'boost':
      G.boost(state);
      break;
    case 'land': {
      const body = state.system.bodies.find((b) => b.id === view.selectedBodyId);
      if (G.land(state, view.selectedBodyId)) {
        view.tab = 'ctx';
        return setScene('landing', { body });
      }
      break;
    }
    case 'jump': return doJump(view.navSel);
    case 'nav': view.mode = 'nav'; view.tab = 'ctx'; break;
    case 'synth': view.mode = 'synth'; view.tab = 'ctx'; break;
    case 'fullscreen': goFullscreenLandscape(); break;
    case 'back': view.mode = 'system'; break;
    case 'close':
      G.closeEvent(state);
      break;
    case 'skip': return finishCinematic();
    case 'new': {
      try {
        history.replaceState(null, '', location.pathname);
      } catch {
        // Cadre sandboxé : l'URL ne peut pas être modifiée, sans conséquence.
      }
      return newGame(Math.floor(Math.random() * 1e9));
    }
    case 'retry': return newGame(state.seed);
    case 'menu': return showTitle();
  }
  if (state.phase === 'gameover') return setScene('end');
  update();
}

function surface(id) {
  const body = G.currentBody(state);
  G.surfaceAction(state, id);
  if (id === 'takeoff' && state.phase !== 'surface') return setScene('takeoff', { body });
  if (state.phase === 'gameover') return setScene('end');
  update();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.tab) {
    view.tab = d.tab === view.tab && d.tab !== 'ctx' ? 'ctx' : d.tab;
    return update();
  }
  if (d.body) return selectBody(d.body === view.selectedBodyId ? null : d.body);
  if (d.cand) {
    if (view.navSel === d.cand && e.detail >= 2) return doJump(d.cand);
    view.navSel = d.cand;
    return update();
  }
  if (d.choice != null) {
    G.resolveChoice(state, Number(d.choice));
    return update();
  }
  if (d.scoop) {
    view.scoopPick = false;
    if (G.scoop(state, d.scoop)) view.scoopUntil = performance.now() / 1000 + 1.5;
    if (state.phase === 'gameover') return setScene('end');
    return update();
  }
  if (d.ship) {
    shipChoice = d.ship;
    profile.lastShip = d.ship;
    saveProfile(profile);
    state = G.createGame(state.seed, gameOptions(profile, shipChoice));
    view.state = state;
    return update();
  }
  if (d.synth) {
    G.synthesize(state, d.synth);
    return update();
  }
  if (d.surf) return surface(d.surf);
  if (d.act) act(d.act);
});

document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-cand]');
  const id = el ? el.dataset.cand : null;
  if (view.mode === 'nav' && id !== view.hoverCand && !(e.target.closest('#navmap'))) {
    view.hoverCand = id;
    drawNavmap();
  }
});

// Raccourcis clavier : chaque bouton affiche le sien.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, textarea, select')) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const press = (sel) => {
    const el = document.querySelector(sel);
    if (el && !el.disabled) {
      e.preventDefault();
      el.click();
      return true;
    }
    return false;
  };

  if (view.scene === 'title') {
    if (k === 'Enter' || k === ' ') { e.preventDefault(); start(); }
    return;
  }
  if (isCinematic()) {
    if (k === ' ' || k === 'Enter' || k === 'Escape') { e.preventDefault(); finishCinematic(); }
    return;
  }
  if (view.scene === 'end') {
    if (k === 'Enter') press('#overlay [data-act="new"]');
    if (k === 'r') press('#overlay [data-act="retry"]');
    if (k === 'm') press('#overlay [data-act="menu"]');
    return;
  }
  if (state.phase === 'event' || view.scoopPick) {
    if (k === 'Enter') press('#overlay [data-act="close"]');
    if (k === 'Escape') press('#overlay [data-act="scoopCancel"]');
    if (/^[1-9]$/.test(k)) press(`#overlay [data-n="${k}"]`);
    return;
  }
  if (k === 'm' || k === 'j') {
    const tab = k === 'm' ? 'modules' : 'log';
    view.tab = view.tab === tab ? 'ctx' : tab;
    return update();
  }
  if (k === 'Escape') {
    if (view.tab !== 'ctx') { view.tab = 'ctx'; return update(); }
    if (view.mode !== 'system') return act('back');
    if (view.selectedBodyId) return selectBody(null);
    return;
  }
  if (k === 'y') return press('.dock [data-act="synth"]');
  if (view.mode === 'nav') {
    if (k === 'Enter') return press('.dock [data-act="jump"]');
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'ArrowRight' || k === 'ArrowLeft') {
      e.preventDefault();
      const cands = navCands();
      const i = cands.findIndex((x) => x.c.id === view.navSel);
      const dir = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1;
      view.navSel = cands[(i + dir + cands.length) % cands.length].c.id;
      update();
      document.querySelector('.cand.sel')?.scrollIntoView({ block: 'nearest' });
    }
    if (k === 'n') act('back');
    return;
  }
  if (view.mode === 'synth') return;
  if (state.phase === 'surface') {
    if (/^[1-9]$/.test(k)) return press(`.dock [data-key="${k}"]`);
    if (k === 'd') return press('.dock [data-surf="takeoff"]');
    return;
  }
  const map = { a: 'auto', e: 'scoop', b: 'boost', n: 'nav', m: 'manual', l: 'land' };
  if (map[k]) return press(`[data-act="${map[k]}"]`);
  if (k === 'ArrowRight' || k === 'ArrowLeft') {
    e.preventDefault();
    return cycleBody(k === 'ArrowRight' ? 1 : -1);
  }
  if (/^[1-9]$/.test(k)) {
    const b = state.system.bodies.find((x) => x.index === Number(k));
    if (b) selectBody(b.id);
  }
});

showTitle();
requestAnimationFrame(frame);
