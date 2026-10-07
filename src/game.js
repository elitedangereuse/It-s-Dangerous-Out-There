// Logique de jeu pure (sans DOM) : état, saut, scan, écopage, atterrissage, synthèse, événements.
import { Rng, hashMix } from './rng.js';
import { STAR_CLASSES, BODY_TYPES, RECIPES, MODULES } from './data.js';
import { createGalaxy, generateCandidates, generateSystem, dist, regionsAt } from './galaxy.js';
import { EVENTS, JUMP_EVENTS, fmt } from './events.js';

export const COSTS = {
  autoScan: 5,
  manualScan: 6,
  land: 10,
  takeoff: 5,
  analyze: 4,
  harvest: 6,
  sample: 4,
  energyRegen: 10,
};

export function createGame(seed = Math.floor(Math.random() * 1e9)) {
  const galaxy = createGalaxy(seed);
  const state = {
    seed,
    galaxy,
    pos: { x: 0, y: 0 },
    path: [{ x: 0, y: 0 }],
    jumps: 0,
    distanceTravelled: 0,
    phase: 'system',
    ship: {
      name: 'Mandalay',
      fuel: 24,
      fuelMax: 24,
      hull: 100,
      hullMax: 100,
      energy: 100,
      energyMax: 100,
      baseRange: 48,
      boost: 1,
      modules: Object.fromEntries(Object.keys(MODULES).map((m) => [m, 100])),
      materials: { iron: 3, nickel: 2, carbon: 3, vanadium: 1, germanium: 1, polonium: 0 },
    },
    flags: {},
    upgrades: {},
    data: 0,
    discoveries: [],
    stats: { landings: 0, bioSamples: 0, bodiesScanned: 0, systems: 1 },
    log: [],
    eventQueue: [],
    event: null,
    surface: null,
    end: null,
    rngCounter: 0,
  };
  state.system = generateSystem(
    { id: 'origin', name: galaxy.origin.name, x: 0, y: 0, star: 'G', regions: [] },
    seed,
  );
  state.system.scooped = true;
  refreshCandidates(state);
  log(state, `Départ de ${galaxy.origin.name}. Destination : ${galaxy.destination.name} (${galaxy.destination.system}), à ${Math.round(galaxy.destination.dist)} al.`, 'event');
  log(state, 'La destination est certaine. Le voyage ne l\'est jamais. o7', 'info');
  return state;
}

// RNG pour les actions du joueur : déterministe à partir de la graine et du nombre d'actions.
function actionRng(state, tag) {
  state.rngCounter++;
  return new Rng(hashMix(state.seed, tag, state.rngCounter, state.jumps));
}

export function log(state, text, kind = 'info') {
  state.log.push({ text, kind, jump: state.jumps });
  if (state.log.length > 200) state.log.shift();
}

export function effectiveRange(state) {
  const { ship } = state;
  return ship.baseRange * (0.6 + 0.4 * (ship.modules.fsd / 100)) * ship.boost;
}

export function refreshCandidates(state) {
  state.effectiveRange = effectiveRange(state);
  state.candidates = generateCandidates(state);
}

export function distanceToDestination(state) {
  return dist(state.pos, state.galaxy.destination);
}

export function jumpFuelCost(state, cand) {
  const d = dist(state.pos, cand);
  const ratio = Math.min(1, d / state.effectiveRange);
  return Math.round((1 + 5 * ratio * ratio) * 10) / 10;
}

export function canJump(state, cand) {
  if (state.phase !== 'system') return { ok: false, reason: 'Impossible maintenant' };
  const d = dist(state.pos, cand);
  if (d > state.effectiveRange + 0.01) return { ok: false, reason: 'Hors de portée' };
  const fuel = jumpFuelCost(state, cand);
  if (state.ship.fuel < fuel) return { ok: false, reason: 'Carburant insuffisant', fuel };
  if (state.ship.modules.fsd <= 0) return { ok: false, reason: 'FSD hors service', fuel };
  return { ok: true, fuel, distance: d };
}

// ---------- Mutations utilitaires ----------

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function addData(state, pts, label) {
  state.data += pts;
  state.discoveries.push({ label, pts, jump: state.jumps });
}

function damageModule(state, rng, id, delta) {
  const mods = state.ship.modules;
  if (id === 'all') {
    for (const k of Object.keys(mods)) mods[k] = clamp(mods[k] + delta, 0, 100);
    return 'tous';
  }
  const target = id || rng.pick(Object.keys(mods));
  mods[target] = clamp(mods[target] + delta, 0, 100);
  return MODULES[target].name;
}

function makeCtx(state, rng) {
  const s = state.ship;
  return {
    s: state,
    rng,
    hull: (d) => { s.hull = clamp(s.hull + d, 0, s.hullMax); },
    module: (id, d) => damageModule(state, rng, id, d),
    mats: (obj) => {
      for (const [k, v] of Object.entries(obj)) s.materials[k] = (s.materials[k] || 0) + v;
    },
    data: (pts, label) => addData(state, pts, label),
    energy: (d) => { s.energy = clamp(s.energy + d, 0, s.energyMax); },
    fuel: (d) => { s.fuel = clamp(s.fuel + d, 0, s.fuelMax); },
    flag: (name) => { state.flags[name] = true; },
  };
}

function payCost(state, cost = {}) {
  const s = state.ship;
  if (cost.energy && s.energy < cost.energy) return false;
  if (cost.fuel && s.fuel < cost.fuel) return false;
  if (cost.energy) s.energy -= cost.energy;
  if (cost.fuel) s.fuel -= cost.fuel;
  return true;
}

function spendEnergy(state, n) {
  if (state.ship.energy < n) {
    log(state, `Énergie insuffisante (${n} requis).`, 'bad');
    return false;
  }
  state.ship.energy -= n;
  return true;
}

// ---------- Saut ----------

export function jump(state, candId) {
  const cand = state.candidates.find((c) => c.id === candId);
  if (!cand) return { ok: false };
  const check = canJump(state, cand);
  if (!check.ok) {
    log(state, check.reason, 'bad');
    return check;
  }
  const s = state.ship;
  s.fuel = Math.round((s.fuel - check.fuel) * 10) / 10;
  state.distanceTravelled += check.distance;
  state.pos = { x: cand.x, y: cand.y };
  state.path.push({ ...state.pos });
  state.jumps++;
  state.stats.systems++;
  s.boost = 1;
  s.energy = clamp(s.energy + COSTS.energyRegen, 0, s.energyMax);
  state.system = generateSystem(cand, state.seed);
  state.surface = null;
  const star = STAR_CLASSES[cand.star];
  log(state, `Saut FSD vers ${cand.name} (${check.distance.toFixed(1)} al, −${check.fuel} t). ${star.name}.`, 'info');

  if (cand.isDestination) {
    state.phase = 'victory';
    state.end = { victory: true, reason: `Vous êtes arrivé : ${state.galaxy.destination.name}.` };
    addData(state, 50, `Arrivée : ${state.galaxy.destination.name}`);
    log(state, state.end.reason, 'good');
    return { ok: true, victory: true };
  }

  if (star.rare) addData(state, star.value, `Étoile remarquable : ${star.name}`);

  const rng = actionRng(state, 'jumpEvent');
  // Usure : chaque saut fatigue un module au hasard.
  damageModule(state, rng, null, -rng.int(2, 5));
  const regions = regionsAt(state.galaxy, state.pos);
  const queue = [];
  const jumpChance = 0.08 + (regions.includes('thargoid') ? 0.3 : 0);
  if (rng.chance(jumpChance)) {
    const id = regions.includes('thargoid') && rng.chance(0.8) ? 'hyperdiction' : rng.pick(JUMP_EVENTS);
    queue.push(id);
  }
  if (state.system.event) queue.push(state.system.event);
  state.eventQueue = queue;
  refreshCandidates(state);
  state.phase = 'system';
  nextEvent(state);
  checkEnd(state);
  return { ok: true };
}

// ---------- Événements ----------

function nextEvent(state) {
  if (state.phase === 'gameover') return;
  const id = state.eventQueue.shift();
  if (!id) {
    state.event = null;
    if (state.phase === 'event') state.phase = state.surface ? 'surface' : 'system';
    return;
  }
  state.event = { id, def: EVENTS[id], outcome: null, returnTo: state.surface ? 'surface' : 'system' };
  state.phase = 'event';
  log(state, `⚠ ${EVENTS[id].title}`, 'event');
}

export function choiceAvailable(state, choice) {
  const c = choice.cost || {};
  if (c.energy && state.ship.energy < c.energy) return false;
  if (c.fuel && state.ship.fuel < c.fuel) return false;
  return true;
}

export function resolveChoice(state, index) {
  const ev = state.event;
  if (!ev || ev.outcome) return null;
  const choice = ev.def.choices[index];
  if (!choice || !choiceAvailable(state, choice)) return null;
  payCost(state, choice.cost);
  const rng = actionRng(state, `ev-${ev.id}`);
  const text = choice.run(makeCtx(state, rng));
  ev.outcome = text;
  log(state, text, 'event');
  if (ev.id === 'hyperdiction' || ev.id === 'fsdOverheat' || ev.id === 'fuelRats') refreshCandidates(state);
  checkEnd(state);
  return text;
}

export function closeEvent(state) {
  if (!state.event || !state.event.outcome) return;
  if (state.phase === 'gameover') return;
  state.phase = state.event.returnTo;
  state.event = null;
  nextEvent(state);
  checkEnd(state);
}

// ---------- Système ----------

export function autoScan(state) {
  const sys = state.system;
  if (sys.autoScanned) return false;
  if (!spendEnergy(state, COSTS.autoScan)) return false;
  sys.autoScanned = true;
  const rng = actionRng(state, 'auto');
  for (const b of sys.bodies) {
    if (b.revealed < 1) {
      b.revealed = 1;
      addData(state, 1, `Corps détecté : ${b.name}`);
    }
    if ((b.feature || b.bio || b.geo) && rng.chance(0.4)) b.hint = true;
  }
  log(state, `Scan automatique : ${sys.bodies.length} corps détecté(s).`, 'info');
  return true;
}

export function manualScanCost(state) {
  return state.upgrades.scanner ? Math.ceil(COSTS.manualScan / 2) : COSTS.manualScan;
}

export function manualScan(state, bodyId) {
  const b = state.system.bodies.find((x) => x.id === bodyId);
  if (!b || b.revealed >= 2) return false;
  if (state.ship.modules.scanner < 25) {
    log(state, 'Scanner trop endommagé pour un scan manuel.', 'bad');
    return false;
  }
  if (!spendEnergy(state, manualScanCost(state))) return false;
  b.revealed = 2;
  state.stats.bodiesScanned++;
  const def = BODY_TYPES[b.type];
  let pts = def.value + (b.terraformable ? 15 : 0) + b.bio * 3 + b.geo;
  addData(state, pts, `Scan détaillé : ${b.name} (${def.name})`);
  const notes = [];
  if (b.terraformable) notes.push('candidat à la terraformation');
  if (b.bio) notes.push(`${b.bio} signal(s) biologique(s)`);
  if (b.geo) notes.push(`${b.geo} signal(s) géologique(s)`);
  if (b.feature) notes.push(featureLabel(b.feature).toLowerCase());
  log(state, `${b.name} : ${def.name}${notes.length ? ' — ' + notes.join(', ') : ''}.`, notes.length ? 'good' : 'info');
  return true;
}

export function featureLabel(f) {
  return { guardian: 'Structure non humaine', thargoid: 'Signature thargoïde', crash: 'Signal artificiel (épave)' }[f] || f;
}

export function canScoop(state) {
  const sys = state.system;
  return STAR_CLASSES[sys.star].scoopable && !sys.scooped && state.ship.modules.scoop > 0 && state.phase === 'system';
}

export function scoop(state) {
  if (!canScoop(state)) return false;
  const sys = state.system;
  const star = STAR_CLASSES[sys.star];
  const rng = actionRng(state, 'scoop');
  const s = state.ship;
  const amount = Math.round(rng.range(6, 12) * (s.modules.scoop / 100) * (star.heat > 0.1 ? 1.3 : 1) * 10) / 10;
  s.fuel = clamp(Math.round((s.fuel + amount) * 10) / 10, 0, s.fuelMax);
  sys.scooped = true;
  let msg = `Écopage : +${amount} t de carburant.`;
  if (rng.chance(star.heat)) {
    const dmg = rng.int(4, 10);
    s.hull = clamp(s.hull - dmg, 0, s.hullMax);
    const m = damageModule(state, rng, null, -rng.int(5, 15));
    msg += ` Surchauffe ! Coque −${dmg}, ${m} endommagé.`;
    log(state, msg, 'bad');
  } else {
    log(state, msg, 'good');
  }
  checkEnd(state);
  return true;
}

export function canBoost(state) {
  const star = STAR_CLASSES[state.system.star];
  return !!star.boost && !state.system.boostUsed && state.phase === 'system';
}

export function boost(state) {
  if (!canBoost(state)) return false;
  const star = STAR_CLASSES[state.system.star];
  const rng = actionRng(state, 'boost');
  const s = state.ship;
  state.system.boostUsed = true;
  s.boost = Math.max(s.boost, star.boost);
  const hullDmg = star.boost >= 4 ? rng.int(4, 10) : rng.int(8, 15);
  const fsdDmg = rng.int(3, 8);
  s.hull = clamp(s.hull - hullDmg, 0, s.hullMax);
  s.modules.fsd = clamp(s.modules.fsd - fsdDmg, 0, 100);
  refreshCandidates(state);
  log(state, `Vous traversez le cône de jet : FSD suralimenté (portée ×${star.boost}). Coque −${hullDmg}, FSD −${fsdDmg} %.`, 'event');
  checkEnd(state);
  return true;
}

// ---------- Surface ----------

export function canLand(state, body) {
  if (!body || !body.landable) return { ok: false, reason: 'Non atterrissable' };
  if (body.revealed < 1) return { ok: false, reason: 'Corps non identifié' };
  if (state.ship.modules.thrusters < 20) return { ok: false, reason: 'Propulseurs trop endommagés' };
  if (state.ship.energy < COSTS.land) return { ok: false, reason: 'Énergie insuffisante' };
  if (state.ship.fuel < 0.5) return { ok: false, reason: 'Carburant insuffisant' };
  return { ok: true };
}

export function land(state, bodyId) {
  const body = state.system.bodies.find((b) => b.id === bodyId);
  const check = canLand(state, body);
  if (state.phase !== 'system' || !check.ok) {
    if (check.reason) log(state, check.reason, 'bad');
    return false;
  }
  const s = state.ship;
  s.energy -= COSTS.land;
  s.fuel = Math.round((s.fuel - 0.3) * 10) / 10;
  const rng = actionRng(state, 'land');
  const hardChance = (s.modules.thrusters < 50 ? 0.4 : 0.05) + (body.type === 'hmc' || body.type === 'metal' ? 0.1 : 0);
  let hard = false;
  if (rng.chance(hardChance)) {
    hard = true;
    const dmg = rng.int(5, 12);
    s.hull = clamp(s.hull - dmg, 0, s.hullMax);
    log(state, `Atterrissage brutal sur ${body.name} ! Coque −${dmg}.`, 'bad');
  } else {
    log(state, `Atterrissage sur ${body.name}.`, 'info');
  }
  state.stats.landings++;
  if (!body.landed) {
    body.landed = true;
    addData(state, 10, `Premier pas : ${body.name}`);
  }
  state.surface = { bodyId, analyzed: false, harvested: false, sampled: false, featureDone: false, geoDone: false, hard };
  state.phase = 'surface';
  checkEnd(state);
  return true;
}

export function currentBody(state) {
  if (!state.surface) return null;
  return state.system.bodies.find((b) => b.id === state.surface.bodyId);
}

export function surfaceActions(state) {
  const sf = state.surface;
  const b = currentBody(state);
  if (!sf || !b) return [];
  const acts = [];
  acts.push({ id: 'analyze', label: 'Analyser la surface', cost: COSTS.analyze, done: sf.analyzed });
  acts.push({ id: 'harvest', label: 'Rechercher des ressources', cost: COSTS.harvest, done: sf.harvested });
  if (sf.analyzed && b.bio) acts.push({ id: 'sample', label: `Échantillonner la vie (${b.bio})`, cost: COSTS.sample, done: sf.sampled });
  if (sf.analyzed && b.feature) acts.push({ id: 'feature', label: b.feature === 'crash' ? 'Inspecter l\'épave' : 'Suivre l\'anomalie', cost: 0, done: sf.featureDone });
  if (sf.analyzed && b.geo) acts.push({ id: 'geo', label: 'Approcher des évents', cost: 0, done: sf.geoDone });
  acts.push({ id: 'takeoff', label: 'Repartir', cost: COSTS.takeoff, done: false });
  return acts;
}

export function surfaceAction(state, id) {
  if (state.phase !== 'surface') return false;
  const sf = state.surface;
  const b = currentBody(state);
  const s = state.ship;
  const rng = actionRng(state, `surf-${id}`);
  switch (id) {
    case 'analyze': {
      if (sf.analyzed || !spendEnergy(state, COSTS.analyze)) return false;
      sf.analyzed = true;
      if (b.revealed < 2) b.revealed = 2;
      const found = [];
      if (b.bio) found.push(`${b.bio} forme(s) de vie`);
      if (b.geo) found.push('des évents géologiques');
      if (b.feature) found.push(featureLabel(b.feature).toLowerCase());
      if (found.length) log(state, `Analyse : ${found.join(', ')} à proximité.`, 'good');
      else log(state, rng.pick(['Analyse : une plaine silencieuse, rien que de la roche et des étoiles.', 'Analyse : rien de notable. La vue, elle, est à couper le souffle.', 'Analyse : quelques cratères anciens, aucun signal.']), 'info');
      addData(state, 3, `Analyse de surface : ${b.name}`);
      return true;
    }
    case 'harvest': {
      if (sf.harvested || !spendEnergy(state, COSTS.harvest)) return false;
      sf.harvested = true;
      const got = {};
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const m = rng.pick(b.mats);
        got[m] = (got[m] || 0) + 1;
      }
      makeCtx(state, rng).mats(got);
      let msg = `Récolte : ${fmt(got)}.`;
      if (rng.chance(0.15)) {
        const dmg = rng.int(3, 7);
        s.hull = clamp(s.hull - dmg, 0, s.hullMax);
        msg += ` Le sol s'effondre sous le vaisseau (coque −${dmg}).`;
      }
      log(state, msg, 'good');
      checkEnd(state);
      return true;
    }
    case 'sample': {
      if (sf.sampled || !b.bio || !spendEnergy(state, COSTS.sample)) return false;
      sf.sampled = true;
      state.stats.bioSamples += b.bio;
      const species = Array.from({ length: b.bio }, () => rng.pick(['Bacterium', 'Stratum', 'Tussock', 'Osseus', 'Fonticulua', 'Concha', 'Frutexa', 'Aleoida']));
      addData(state, b.bio * 8, `Exobiologie : ${species.join(', ')}`);
      log(state, `Échantillons prélevés : ${species.join(', ')}.`, 'good');
      return true;
    }
    case 'feature': {
      if (sf.featureDone || !b.feature) return false;
      sf.featureDone = true;
      state.eventQueue = [b.feature];
      nextEvent(state);
      return true;
    }
    case 'geo': {
      if (sf.geoDone || !b.geo) return false;
      sf.geoDone = true;
      state.eventQueue = ['geo'];
      nextEvent(state);
      return true;
    }
    case 'takeoff': {
      if (!spendEnergy(state, COSTS.takeoff)) {
        // Ne jamais bloquer le joueur au sol : décollage d'urgence sur la coque.
        s.hull = clamp(s.hull - 8, 0, s.hullMax);
        log(state, 'Décollage d\'urgence sans énergie (coque −8).', 'bad');
      }
      s.fuel = Math.max(0, Math.round((s.fuel - 0.2) * 10) / 10);
      state.surface = null;
      state.phase = 'system';
      log(state, `Décollage de ${b.name}.`, 'info');
      checkEnd(state);
      return true;
    }
  }
  return false;
}

// ---------- Synthèse ----------

export function canSynthesize(state, recipe) {
  if (state.phase !== 'system' && state.phase !== 'surface') return false;
  if (recipe.once && state.upgrades[recipe.id]) return false;
  if (recipe.needs && !state.flags[recipe.needs]) return false;
  return Object.entries(recipe.cost).every(([m, n]) => (state.ship.materials[m] || 0) >= n);
}

export function synthesize(state, recipeId) {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  if (!recipe || !canSynthesize(state, recipe)) return false;
  const s = state.ship;
  for (const [m, n] of Object.entries(recipe.cost)) s.materials[m] -= n;
  switch (recipe.id) {
    case 'hull': s.hull = clamp(s.hull + 20, 0, s.hullMax); break;
    case 'module': {
      const worst = Object.entries(s.modules).sort((a, b) => a[1] - b[1])[0][0];
      s.modules[worst] = clamp(s.modules[worst] + 40, 0, 100);
      log(state, `${MODULES[worst].name} réparé.`, 'good');
      break;
    }
    case 'cells': s.energy = clamp(s.energy + 35, 0, s.energyMax); break;
    case 'inj1': s.boost = Math.max(s.boost, 1.25); break;
    case 'inj2': s.boost = Math.max(s.boost, 2); break;
    case 'armor': s.hullMax += 20; s.hull += 20; break;
    case 'tank': s.fuelMax += 8; break;
    case 'scanner': break;
    case 'guardian': s.baseRange += 12; break;
  }
  if (recipe.once) state.upgrades[recipe.id] = true;
  log(state, `Synthèse : ${recipe.name}.`, 'good');
  refreshCandidates(state);
  return true;
}

// ---------- Fin de partie ----------

export function checkEnd(state) {
  if (state.phase === 'gameover' || state.phase === 'victory') return;
  const s = state.ship;
  if (s.hull <= 0) return gameOver(state, 'La coque cède. Votre vaisseau se disloque dans le silence du vide.');
  if (s.modules.life <= 0) return gameOver(state, 'Le support vital s\'éteint. Votre voyage s\'achève ici.');
  if (state.phase !== 'system') return;
  if (s.modules.fsd <= 0 && !canSynthesize(state, RECIPES.find((r) => r.id === 'module'))) {
    return gameOver(state, 'Le FSD est détruit et vous n\'avez plus de quoi le réparer. Vous dérivez à jamais.');
  }
  const affordable = state.candidates.some((c) => canJump(state, c).ok);
  // Un boost réduit le coût relatif d'un saut, mais jamais sous 1 t.
  const boostHelps = canBoost(state) && state.ship.fuel >= 1;
  if (!affordable && !canScoop(state) && !boostHelps) {
    if (!state.flags.ratsUsed) {
      state.eventQueue.unshift('fuelRats');
      nextEvent(state);
    } else {
      gameOver(state, 'Réservoir vide, aucune étoile écopable, et les Fuel Rats sont trop loin. Vous êtes bloqué pour toujours.');
    }
  }
}

function gameOver(state, reason) {
  state.phase = 'gameover';
  state.end = { victory: false, reason };
  log(state, reason, 'bad');
}
