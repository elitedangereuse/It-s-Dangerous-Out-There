// Interface : relie la logique de jeu, le rendu canvas et les panneaux HTML.
import * as G from './game.js';
import { STAR_CLASSES, BODY_TYPES, MATERIALS, MODULES, RECIPES, REGION_TYPES } from './data.js';
import { createRenderer, W, H, LANDING_DURATION, TAKEOFF_DURATION, JUMP_DURATION } from './render.js';
import { dist } from './galaxy.js';

const $ = (sel) => document.querySelector(sel);
const canvas = $('#screen');
const renderer = createRenderer(canvas);

let state;
let view;

function newGame(seed) {
  const params = new URLSearchParams(location.search);
  const s = seed ?? (params.has('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 1e9));
  state = G.createGame(s);
  view = { scene: 'system', sceneStart: performance.now(), state, selectedBodyId: null, overlay: null, scanWaveStart: null };
  update();
}

function setScene(scene, extra = {}) {
  Object.assign(view, extra, { scene, sceneStart: performance.now() });
  update();
}

const isCinematic = () => ['jump', 'landing', 'takeoff'].includes(view.scene);

function finishCinematic() {
  if (view.scene === 'jump') {
    if (state.phase === 'victory' || state.phase === 'gameover') setScene('end');
    else setScene('system', { selectedBodyId: null, scanWaveStart: null });
  } else if (view.scene === 'landing') {
    setScene(state.phase === 'gameover' ? 'end' : 'surface', { astroX: null });
  } else if (view.scene === 'takeoff') {
    setScene(state.phase === 'gameover' ? 'end' : 'system');
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
  if (view.scene === 'surface' || view.scene === 'landing' || view.scene === 'takeoff') view.body = G.currentBody(state) || view.body;
  renderer.render(view, t);
  const dur = { jump: JUMP_DURATION, landing: LANDING_DURATION, takeoff: TAKEOFF_DURATION }[view.scene];
  if (dur && view.sceneTime >= dur) finishCinematic();
  requestAnimationFrame(frame);
}

canvas.addEventListener('click', (e) => {
  if (isCinematic()) return finishCinematic();
  if (view.scene !== 'system' || state.phase !== 'system') return;
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W;
  const y = ((e.clientY - r.top) / r.height) * H;
  const body = renderer.pick(view, x, y);
  if (body) {
    view.selectedBodyId = body.id;
    update();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && isCinematic()) {
    e.preventDefault();
    finishCinematic();
  }
  if (e.key === 'Escape' && view.overlay) {
    view.overlay = null;
    update();
  }
});

// ---------- Rendu HTML ----------

const pct = (v, max) => Math.max(0, Math.min(100, (v / max) * 100));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function bar(label, v, max, unit = '') {
  const low = v / max < 0.25;
  return `<div class="bar ${low ? 'low' : ''}"><div class="lbl"><span>${label}</span><span>${Math.round(v * 10) / 10}${unit} / ${max}${unit}</span></div><div class="track"><i style="width:${pct(v, max)}%"></i></div></div>`;
}

function renderRoute() {
  const d = G.distanceToDestination(state);
  const total = state.galaxy.destination.dist;
  $('#route').innerHTML = `
    <span>Destination <b>${esc(state.galaxy.destination.name)}</b></span>
    <span class="progress" title="Progression"><i style="width:${pct(total - d, total)}%"></i></span>
    <span><b>${Math.round(d)}</b> al restants</span>
    <span>Sauts <b>${state.jumps}</b></span>
    <span>Données <b>${state.data}</b></span>
    <span>Graine <b>${state.seed}</b></span>`;
}

function renderHud() {
  const s = state.ship;
  const mods = Object.entries(s.modules)
    .map(([k, v]) => `<span>${MODULES[k].name}</span><span class="${v < 30 ? 'low' : v < 60 ? 'mid' : ''}">${Math.round(v)} %</span>`)
    .join('');
  const mats = Object.entries(MATERIALS)
    .map(([k, m]) => `<div class="${s.materials[k] ? '' : 'zero'}" title="${m.name}"><span>${m.short}</span><span>${s.materials[k] || 0}</span></div>`)
    .join('');
  $('#hud').innerHTML = `
    <h2>${esc(s.name)}</h2>
    ${bar('⛽ Carburant', s.fuel, s.fuelMax, ' t')}
    ${bar('🔧 Coque', s.hull, s.hullMax)}
    ${bar('⚡ Énergie', s.energy, s.energyMax)}
    <div class="row"><span>Portée de saut</span><span class="tag">${state.effectiveRange.toFixed(1)} al</span></div>
    ${s.boost > 1 ? `<div class="boost">FSD suralimenté ×${s.boost}</div>` : ''}
    <h3>Modules</h3>
    <div class="modules">${mods}</div>
    <h3>Matériaux</h3>
    <div class="mats">${mats}</div>`;
}

function renderLog() {
  $('#log').innerHTML = state.log
    .slice(-60)
    .reverse()
    .map((l) => `<li class="${l.kind}">${esc(l.text)}</li>`)
    .join('');
}

function bodyLine(b) {
  const def = BODY_TYPES[b.type];
  if (b.revealed === 0) return `<span class="t">${b.index}. Signal inconnu</span><br><span class="muted">Non identifié</span>`;
  const bits = [];
  if (b.landable) bits.push('atterrissable');
  if (b.revealed >= 2) {
    if (b.terraformable) bits.push('<span class="sig">terraformable</span>');
    if (b.bio) bits.push(`<span class="sig">${b.bio} bio</span>`);
    if (b.geo) bits.push(`<span class="sig">${b.geo} géo</span>`);
    if (b.feature) bits.push(`<span class="sig">${esc(G.featureLabel(b.feature))}</span>`);
  } else if (b.hint) bits.push('<span class="sig">signal détecté</span>');
  return `<span class="t">${b.index}. ${def.name}</span>${b.landed ? ' <span class="tag">✓</span>' : ''}<br><span class="muted">${b.ls} sl${bits.length ? ' · ' : ''}</span>${bits.join(' · ')}`;
}

function bodyDetail(b) {
  if (!b) return '<p class="muted">Sélectionnez un corps (dans la liste ou sur l\'écran) pour l\'analyser ou vous y poser.</p>';
  const def = BODY_TYPES[b.type];
  const parts = [];
  if (b.revealed === 0) parts.push('<p>Signal non identifié. Un scan est nécessaire.</p>');
  else {
    parts.push(`<p><b>${esc(b.name)}</b> — ${def.name}, à ${b.ls} secondes-lumière. ${b.landable ? 'Surface accessible.' : 'Pas de surface accessible.'}</p>`);
    if (b.revealed >= 2) {
      const mats = b.mats.length ? b.mats.map((m) => MATERIALS[m].name).join(', ') : '—';
      parts.push(`<p class="muted">Matériaux : ${mats}${b.rings ? ' · anneaux' : ''}</p>`);
    } else parts.push('<p class="muted">Scan manuel requis pour les détails (matériaux, signaux, anomalies).</p>');
  }
  const scanCost = G.manualScanCost(state);
  const canManual = b.revealed < 2 && state.ship.modules.scanner >= 25 && state.ship.energy >= scanCost;
  const landCheck = G.canLand(state, b);
  return `<div class="detail">${parts.join('')}
    <div class="actions">
      <button data-act="manual" ${canManual ? '' : 'disabled'}>🔬 Scan manuel<span class="cost">${scanCost} ⚡</span></button>
      ${b.landable && b.revealed > 0 ? `<button class="primary" data-act="land" ${landCheck.ok ? '' : 'disabled'} title="${esc(landCheck.reason || '')}">🪐 Mise en orbite et atterrissage<span class="cost">${G.COSTS.land} ⚡</span></button>` : ''}
      ${b.landable && b.revealed > 0 && !landCheck.ok ? `<span class="bad">${esc(landCheck.reason)}</span>` : ''}
    </div></div>`;
}

function systemPanel() {
  const sys = state.system;
  const star = STAR_CLASSES[sys.star];
  const regions = sys.regions?.length ? sys.regions.map((r) => REGION_TYPES[r].name).join(', ') : '';
  const sel = sys.bodies.find((b) => b.id === view.selectedBodyId);
  const scanning = view.scanWaveStart != null;
  return `
    <h2>${esc(sys.name)}</h2>
    <div class="row">
      <span class="tag">${star.name}</span>
      <span>${star.scoopable ? (sys.scooped ? 'Écopage effectué' : 'Écopable') : '<span class="bad">Non écopable</span>'}</span>
      ${regions ? `<span class="bad">${regions}</span>` : ''}
    </div>
    <div class="actions">
      <button data-act="auto" ${sys.autoScanned || state.ship.energy < G.COSTS.autoScan ? 'disabled' : ''}>🤖 Scan automatique<span class="cost">${G.COSTS.autoScan} ⚡</span></button>
      ${star.scoopable ? `<button data-act="scoop" ${G.canScoop(state) ? '' : 'disabled'}>⛽ Écoper l'étoile${star.heat > 0.1 ? '<span class="cost">risque de surchauffe</span>' : ''}</button>` : ''}
      ${star.boost ? `<button data-act="boost" ${G.canBoost(state) ? '' : 'disabled'}>⚡ Traverser le jet (portée ×${star.boost})<span class="cost">dégâts</span></button>` : ''}
      <button data-act="synth">🧪 Synthèse</button>
      <button class="primary" data-act="nav">🚀 Carte de navigation</button>
    </div>
    <h3>Corps du système ${sys.autoScanned ? `(${sys.bodies.length})` : ''}</h3>
    ${scanning ? '<p class="tag">Scan en cours…</p>' : ''}
    ${sys.bodies.every((b) => b.revealed === 0) && !scanning ? '<p class="muted">Le système est encore inconnu. Lancez un scan automatique, ou ciblez un signal pour un scan manuel.</p>' : ''}
    <div class="bodies">${sys.bodies
      .map((b) => `<button class="body-card ${b.id === view.selectedBodyId ? 'sel' : ''}" data-body="${b.id}">${bodyLine(scanning && b.revealed === 1 ? { ...b, revealed: 0 } : b)}</button>`)
      .join('')}</div>
    ${bodyDetail(sel)}`;
}

function surfacePanel() {
  const b = G.currentBody(state);
  const acts = G.surfaceActions(state);
  return `
    <h2>Surface — ${esc(b.name)}</h2>
    <p class="muted">${BODY_TYPES[b.type].name}. Le commandant descend la rampe. Le silence est total.</p>
    <div class="actions">${acts
      .map((a) => `<button data-surf="${a.id}" class="${a.id === 'takeoff' ? 'primary' : ''}" ${a.done || (a.cost && state.ship.energy < a.cost && a.id !== 'takeoff') ? 'disabled' : ''}>${a.done ? '✓ ' : ''}${a.label}${a.cost ? `<span class="cost">${a.cost} ⚡</span>` : ''}</button>`)
      .join('')}</div>
    <button data-act="synth">🧪 Synthèse</button>`;
}

function navPanel() {
  const cands = state.candidates.map((c) => ({ c, check: G.canJump(state, c), fuel: G.jumpFuelCost(state, c) }));
  const dNow = G.distanceToDestination(state);
  const list = cands
    .map(({ c, check, fuel }) => {
      const star = STAR_CLASSES[c.star];
      const gain = dNow - dist(c, state.galaxy.destination);
      return `<button class="cand ${c.isDestination ? 'dest' : ''}" data-jump="${c.id}" ${check.ok ? '' : 'disabled'}>
        <span>${c.isDestination ? '🎯 ' : ''}${esc(c.name)}</span><span>${dist(state.pos, c).toFixed(1)} al</span>
        <span class="star">${star.name}${star.scoopable ? ' ⛽' : ''}${star.boost ? ' ⚡' : ''}${c.regions.length ? ` · <span class="bad">${c.regions.map((r) => REGION_TYPES[r].name).join(', ')}</span>` : ''}</span>
        <span>${fuel} t · <span class="${gain >= 0 ? 'good' : 'bad'}">${gain >= 0 ? '−' : '+'}${Math.abs(Math.round(gain))} al</span></span>
        ${check.ok ? '' : `<span class="bad">${check.reason}</span>`}
      </button>`;
    })
    .join('');
  return `
    <h2>Carte de navigation</h2>
    <div class="navgrid">
      <div><canvas class="navmap" id="navmap" width="520" height="325"></canvas>
      <p class="muted">⛽ étoile écopable · ⚡ jet de suralimentation · la variation indique le rapprochement de la destination.</p></div>
      <div class="cands">${list}</div>
    </div>
    <div class="actions"><button data-act="back">← Retour au système</button></div>`;
}

function drawNavmap() {
  const c = document.getElementById('navmap');
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const range = state.effectiveRange;
  const scale = (Math.min(w, h) / 2 - 16) / (range * 1.15);
  const cx = w / 2, cy = h / 2;
  const P = (p) => [cx + (p.x - state.pos.x) * scale, cy + (p.y - state.pos.y) * scale];
  ctx.fillStyle = '#03040a';
  ctx.fillRect(0, 0, w, h);
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
  ctx.strokeStyle = '#a85a12';
  ctx.beginPath();
  state.path.forEach((p, i) => {
    const [x, y] = P(p);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  // Portée
  ctx.strokeStyle = 'rgba(111, 211, 255, 0.5)';
  ctx.beginPath();
  ctx.arc(cx, cy, range * scale, 0, Math.PI * 2);
  ctx.stroke();
  // Direction de la destination
  const dest = state.galaxy.destination;
  const a = Math.atan2(dest.y - state.pos.y, dest.x - state.pos.x);
  const [dx, dy] = P(dest);
  const inside = dx > 0 && dx < w && dy > 0 && dy < h;
  ctx.fillStyle = '#7ee08a';
  ctx.font = '16px VT323, monospace';
  if (inside) {
    ctx.fillRect(dx - 3, dy - 3, 7, 7);
    ctx.fillText(dest.name, dx + 8, dy + 4);
  } else {
    const ex = cx + Math.cos(a) * (w / 2 - 20), ey = cy + Math.sin(a) * (h / 2 - 20);
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(a) * 10, ey + Math.sin(a) * 10);
    ctx.lineTo(ex + Math.cos(a + 2.5) * 10, ey + Math.sin(a + 2.5) * 10);
    ctx.lineTo(ex + Math.cos(a - 2.5) * 10, ey + Math.sin(a - 2.5) * 10);
    ctx.fill();
    ctx.fillText(`${Math.round(G.distanceToDestination(state))} al`, Math.min(w - 70, ex - 30), ey + (ey > cy ? -14 : 24));
  }
  for (const cand of state.candidates) {
    const [x, y] = P(cand);
    const ok = G.canJump(state, cand).ok;
    const star = STAR_CLASSES[cand.star];
    ctx.globalAlpha = ok ? 1 : 0.35;
    ctx.fillStyle = cand.isDestination ? '#7ee08a' : star.color === '#000000' ? '#ff9a3a' : star.color;
    ctx.beginPath();
    ctx.arc(x, y, cand.id === view.hoverCand ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
    if (cand.id === view.hoverCand) {
      ctx.strokeStyle = '#ff8c1a';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#ff8c1a';
  ctx.fillRect(cx - 3, cy - 3, 6, 6);
}

function synthPanel() {
  const groups = ['Réparer', 'Fabriquer', 'Améliorer'];
  return `
    <h2>Synthèse</h2>
    ${groups
      .map((g) => `<h3>${g}</h3><div class="recipes">${RECIPES.filter((r) => r.kind === g)
        .map((r) => {
          const owned = r.once && state.upgrades[r.id];
          const locked = r.needs && !state.flags[r.needs];
          const cost = Object.entries(r.cost).map(([m, n]) => `${n} ${MATERIALS[m].short}`).join(' + ');
          return `<button class="recipe" data-synth="${r.id}" ${G.canSynthesize(state, r) ? '' : 'disabled'}>
            <span>${r.name}${owned ? ' ✓' : ''}</span><span class="k">${cost}</span>
            <span class="c">${locked ? 'Plan requis (ruines gardiennes)' : r.desc}</span></button>`;
        })
        .join('')}</div>`)
      .join('')}
    <div class="actions"><button data-act="back">← Retour</button></div>`;
}

function eventCard() {
  const ev = state.event;
  if (!ev) return '';
  const choices = ev.outcome
    ? `<p class="outcome">${esc(ev.outcome)}</p><div class="choices"><button class="primary" data-act="close">Continuer</button></div>`
    : `<div class="choices">${ev.def.choices
        .map((c, i) => {
          const cost = c.cost ? Object.entries(c.cost).map(([k, v]) => `${v} ${k === 'energy' ? '⚡' : 't ⛽'}`).join(', ') : '';
          return `<button data-choice="${i}" ${G.choiceAvailable(state, c) ? '' : 'disabled'}>${esc(c.label)}${cost ? `<span class="cost">${cost}</span>` : ''}</button>`;
        })
        .join('')}</div>`;
  return `<div class="card" role="dialog" aria-labelledby="evt"><h2 id="evt">${esc(ev.def.title)}</h2><p>${esc(ev.def.text)}</p>${choices}</div>`;
}

function endPanel() {
  const v = state.phase === 'victory';
  const st = state.stats;
  const top = [...state.discoveries].sort((a, b) => b.pts - a.pts).slice(0, 5);
  return `<div class="end">
    <h2>${v ? '🎯 Destination atteinte' : '☠ Fin du voyage'}</h2>
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
    ${top.length ? `<h3>Découvertes marquantes</h3><p class="muted">${top.map((d) => esc(d.label)).join('<br>')}</p>` : ''}
    <div class="actions" style="justify-content:center">
      <button class="primary" data-act="new">Nouvelle partie</button>
      <button data-act="retry">Rejouer cette graine</button>
    </div></div>`;
}

function update() {
  renderRoute();
  renderHud();
  renderLog();
  const panel = $('#panel');
  const overlay = $('#overlay');
  overlay.hidden = true;
  overlay.innerHTML = '';

  if (isCinematic()) {
    const label = { jump: 'Saut hyperspatial en cours…', landing: 'Mise en orbite… descente… atterrissage.', takeoff: 'Décollage…' }[view.scene];
    panel.innerHTML = `<h2>${label}</h2><p class="muted">Cliquez sur l'écran ou appuyez sur Espace pour passer.</p><button data-act="skip">Passer ⏭</button>`;
    return;
  }
  if (view.scene === 'end' || state.phase === 'victory' || state.phase === 'gameover') {
    if (view.scene !== 'end') view.scene = 'end';
    panel.innerHTML = endPanel();
    return;
  }
  if (state.phase === 'event') {
    overlay.hidden = false;
    overlay.innerHTML = eventCard();
    panel.innerHTML = '<h2>Décision requise</h2><p class="muted">Faites votre choix.</p>';
    return;
  }
  if (state.phase === 'surface' && view.scene !== 'surface') view.scene = 'surface';
  if (state.phase === 'system' && view.scene === 'surface') view.scene = 'system';

  if (view.overlay === 'synth') panel.innerHTML = synthPanel();
  else if (view.overlay === 'nav' && state.phase === 'system') {
    panel.innerHTML = navPanel();
    drawNavmap();
  } else {
    view.overlay = null;
    panel.innerHTML = state.phase === 'surface' ? surfacePanel() : systemPanel();
  }
}

// ---------- Actions ----------

document.addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.body) {
    view.selectedBodyId = d.body;
    return update();
  }
  if (d.jump) {
    const cand = state.candidates.find((c) => c.id === d.jump);
    const res = G.jump(state, d.jump);
    view.overlay = null;
    if (res.ok) setScene('jump', { jumpStar: cand.star });
    else update();
    return;
  }
  if (d.choice != null) {
    G.resolveChoice(state, Number(d.choice));
    return update();
  }
  if (d.synth) {
    G.synthesize(state, d.synth);
    return update();
  }
  if (d.surf) {
    const body = G.currentBody(state);
    G.surfaceAction(state, d.surf);
    if (d.surf === 'takeoff') return setScene('takeoff', { body });
    if (state.phase === 'gameover') return setScene('end');
    return update();
  }
  switch (d.act) {
    case 'auto':
      if (G.autoScan(state)) view.scanWaveStart = performance.now();
      break;
    case 'manual': {
      const id = view.selectedBodyId;
      if (G.manualScan(state, id)) view.beam = { bodyId: id, until: performance.now() / 1000 + 0.8 };
      break;
    }
    case 'scoop':
      if (G.scoop(state)) view.scoopUntil = performance.now() / 1000 + 1.5;
      if (state.phase === 'gameover') return setScene('end');
      break;
    case 'boost':
      G.boost(state);
      if (state.phase === 'gameover') return setScene('end');
      break;
    case 'land': {
      const body = state.system.bodies.find((b) => b.id === view.selectedBodyId);
      if (G.land(state, view.selectedBodyId)) return setScene('landing', { body });
      break;
    }
    case 'nav': view.overlay = 'nav'; break;
    case 'synth': view.overlay = 'synth'; break;
    case 'back': view.overlay = null; break;
    case 'close':
      G.closeEvent(state);
      if (state.phase === 'gameover') return setScene('end');
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
  }
  update();
});

document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-jump]');
  const id = el ? el.dataset.jump : null;
  if (id !== view.hoverCand) {
    view.hoverCand = id;
    drawNavmap();
  }
});

newGame();
requestAnimationFrame(frame);
