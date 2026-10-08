import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, jump, canJump, autoScan, manualScan, scoop, canScoop, boost, canBoost,
  land, surfaceActions, surfaceAction, resolveChoice, closeEvent, choiceAvailable,
  synthesize, canSynthesize, distanceToDestination, scoopPreview, hasMetalSource, eventChoices, LEAK_PER_JUMP,
} from '../src/game.js';
import { RECIPES, STAR_CLASSES } from '../src/data.js';
import { EVENTS } from '../src/events.js';
import { loadProfile, saveProfile, absorbRun, gameOptions, unlockedShips } from '../src/profile.js';
import { Rng } from '../src/rng.js';

test('une même graine produit la même partie', () => {
  const a = createGame(1234);
  const b = createGame(1234);
  assert.equal(a.galaxy.destination.name, b.galaxy.destination.name);
  assert.deepEqual(a.candidates.map((c) => c.name), b.candidates.map((c) => c.name));
});

test('un saut consomme du carburant et rapproche de la destination', () => {
  const g = createGame(42);
  const before = distanceToDestination(g);
  const cand = g.candidates
    .filter((c) => canJump(g, c).ok)
    .sort((x, y) => Math.hypot(g.galaxy.destination.x - x.x, g.galaxy.destination.y - x.y) - Math.hypot(g.galaxy.destination.x - y.x, g.galaxy.destination.y - y.y))[0];
  const fuel = g.ship.fuel;
  jump(g, cand.id);
  assert.ok(g.ship.fuel < fuel);
  assert.ok(distanceToDestination(g) < before);
  assert.equal(g.jumps, 1);
});

test('le scan manuel coûte de l\'énergie et révèle le corps', () => {
  const g = createGame(7);
  const body = g.system.bodies[0];
  const e = g.ship.energy;
  assert.ok(manualScan(g, body.id));
  assert.equal(body.revealed, 2);
  assert.ok(g.ship.energy < e);
});

test('tomber à 0 d\'énergie met fin à la partie', () => {
  const g = createGame(7);
  g.ship.energy = 5;
  assert.ok(autoScan(g));
  assert.equal(g.ship.energy, 0);
  assert.equal(g.phase, 'gameover');
  assert.equal(g.end.victory, false);
});

test('la synthèse consomme les matériaux', () => {
  const g = createGame(9);
  g.ship.hull = 50;
  const iron = g.ship.materials.iron;
  assert.ok(synthesize(g, 'hull'));
  assert.equal(g.ship.hull, 70);
  assert.equal(g.ship.materials.iron, iron - 2);
});

// Un pilote automatique un peu gourmand : explore, écope, va vers la destination.
function autopilot(seed, maxSteps = 600) {
  const g = createGame(seed);
  const rng = new Rng(seed);
  for (let step = 0; step < maxSteps; step++) {
    if (g.phase === 'victory' || g.phase === 'gameover') break;
    if (g.phase === 'event') {
      if (g.event.outcome) closeEvent(g);
      else {
        const i = g.event.def.choices.findIndex((c) => choiceAvailable(g, c));
        resolveChoice(g, Math.max(0, i));
      }
      continue;
    }
    if (g.phase === 'surface') {
      const acts = surfaceActions(g).filter((a) => !a.done);
      const a = acts.find((x) => x.id !== 'takeoff') || acts.find((x) => x.id === 'takeoff');
      surfaceAction(g, a.id);
      continue;
    }
    if (canScoop(g)) scoop(g);
    if (canBoost(g)) boost(g);
    if (!g.system.autoScanned) autoScan(g);
    for (const r of RECIPES) if (r.kind !== 'Fabriquer' && canSynthesize(g, r) && (r.id !== 'hull' || g.ship.hull < 70)) synthesize(g, r.id);
    if (g.phase !== 'system') continue;
    const target = g.system.bodies.find((b) => b.landable && !b.landed && b.revealed >= 1);
    if (target && g.ship.energy > 40 && rng.chance(0.5)) {
      land(g, target.id);
      continue;
    }
    const dest = g.galaxy.destination;
    const options = g.candidates.filter((c) => canJump(g, c).ok);
    if (!options.length) break;
    options.sort((a, b) => Math.hypot(dest.x - a.x, dest.y - a.y) - Math.hypot(dest.x - b.x, dest.y - b.y));
    const scoopable = options.find((c) => ['K', 'G', 'M', 'F', 'A'].includes(c.star));
    const pick = g.ship.fuel < 12 && scoopable ? scoopable : options[0];
    jump(g, pick.id);
  }
  return g;
}

test('des parties complètes se terminent sans erreur', () => {
  let victories = 0;
  const jumps = [];
  for (let seed = 1; seed <= 60; seed++) {
    const g = autopilot(seed);
    assert.ok(['victory', 'gameover'].includes(g.phase), `graine ${seed} bloquée en phase ${g.phase}`);
    if (g.phase === 'victory') {
      victories++;
      jumps.push(g.jumps);
    }
    for (const v of Object.values(g.ship.materials)) assert.ok(v >= 0);
  }
  const avg = jumps.reduce((a, b) => a + b, 0) / Math.max(1, jumps.length);
  console.log(`  victoires : ${victories}/60, sauts moyens : ${avg.toFixed(1)}`);
  assert.ok(victories > 10, 'le jeu doit rester gagnable');
});

// ---------- Écopage à risque (proposition 2) ----------

test("l'approche d'écopage règle le carburant et le risque de surchauffe", () => {
  const g = createGame(5);
  g.system.star = 'G';
  g.system.scooped = false;
  const far = scoopPreview(g, 'far');
  const normal = scoopPreview(g, 'normal');
  const close = scoopPreview(g, 'close');
  assert.ok(far.max < normal.max && normal.max < close.max);
  assert.ok(far.risk < normal.risk && normal.risk < close.risk);
  g.ship.fuel = 2;
  assert.ok(scoop(g, 'close'));
  assert.ok(g.ship.fuel > 2);
  assert.ok(!canScoop(g), 'un seul écopage par système');
});

// ---------- Sources garanties (proposition 5) ----------

test('jamais plus de 3 systèmes de suite sans monde métallique ni 3 sans étoile écopable sur le saut le plus court', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = createGame(seed);
    let streak = 0;
    for (let i = 0; i < 40 && g.phase !== 'victory'; i++) {
      if (g.phase === 'event') { g.phase = 'system'; g.event = null; g.eventQueue = []; }
      g.ship.fuel = g.ship.fuelMax;
      g.ship.hull = g.ship.hullMax;
      for (const k of Object.keys(g.ship.modules)) g.ship.modules[k] = 100;
      const c = g.candidates.find((x) => !x.isDestination && canJump(g, x).ok);
      if (!c) break;
      jump(g, c.id);
      streak = hasMetalSource(g.system) ? 0 : streak + 1;
      assert.ok(streak <= 3, `graine ${seed} : ${streak} systèmes sans métaux`);
      if (g.since.fuel >= 2) {
        const nearest = g.candidates.reduce((a, x) => (Math.hypot(x.x - g.pos.x, x.y - g.pos.y) < Math.hypot(a.x - g.pos.x, a.y - g.pos.y) ? x : a));
        assert.ok(STAR_CLASSES[nearest.star].scoopable || nearest.isDestination);
      }
    }
  }
});

// ---------- Méta-progression (proposition 6) ----------

test('le profil garde savoir, codex et vaisseaux, sans compter deux fois une partie', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const p = loadProfile(storage);
  assert.deepEqual(unlockedShips(p), ['mandalay']);
  const g = createGame(11, gameOptions(p, 'krait'));
  assert.equal(g.ship.model, 'mandalay', 'un vaisseau verrouillé retombe sur le Mandalay');
  g.knowledge.glyphs = 3;
  g.codex['star:N'] = true;
  g.shipsFlown.push('krait');
  g.stats.landings = 4;
  g.end = { victory: true };
  const fresh = absorbRun(p, g);
  absorbRun(p, g);
  assert.deepEqual(fresh.sort(), ['dbx', 'krait']);
  assert.equal(p.runs, 1);
  assert.equal(p.landings, 4);
  saveProfile(p, storage);
  const back = loadProfile(storage);
  assert.equal(back.knowledge.glyphs, 3);
  const g2 = createGame(12, gameOptions(back, 'krait'));
  assert.equal(g2.ship.name, 'Krait Phantom');
  assert.equal(g2.knowledge.glyphs, 3);
});

test('le savoir débloque des réponses, pas de la puissance', () => {
  const g = createGame(3, { knowledge: { glyphs: 3, signals: 0 } });
  g.eventQueue = ['guardian'];
  closeEventQueue(g);
  const labels = eventChoices(g).map((c) => c.label);
  assert.ok(labels.some((l) => l.includes('Lire les glyphes')));
  const g2 = createGame(3);
  g2.eventQueue = ['guardian'];
  closeEventQueue(g2);
  assert.ok(!eventChoices(g2).some((c) => c.label.includes('Lire les glyphes')));
  const read = eventChoices(g).find((c) => c.label.includes('Lire les glyphes'));
  const hull = g.ship.hull;
  resolveChoice(g, read.index);
  assert.ok(g.flags.guardianBlueprint);
  assert.equal(g.ship.hull, hull);
  assert.equal(g.knowledge.glyphs, 4);
});

// ---------- Événements de milieu de partie (proposition 7) ----------

test('changer de vaisseau sur une épave garde la soute et perd les améliorations', () => {
  const g = createGame(8);
  g.upgrades.armor = true;
  g.ship.materials.iron = 9;
  g.derelict = 'krait';
  g.eventQueue = ['derelict'];
  closeEventQueue(g);
  resolveChoice(g, 0);
  assert.equal(g.ship.name, 'Krait Phantom');
  assert.equal(g.ship.materials.iron, 9);
  assert.deepEqual(g.upgrades, {});
  assert.ok(g.shipsFlown.includes('krait'));
});

test('la fuite du réservoir coûte du carburant à chaque saut jusqu\'au colmatage', () => {
  const g = createGame(21);
  g.flags.tankLeak = true;
  const c = g.candidates.find((x) => canJump(g, x).ok);
  const cost = canJump(g, c).fuel;
  const fuel = g.ship.fuel;
  jump(g, c.id);
  assert.equal(Math.round((fuel - cost - LEAK_PER_JUMP) * 10) / 10, g.ship.fuel);
  g.phase = 'system';
  g.ship.materials.iron = 1;
  g.ship.materials.carbon = 1;
  assert.ok(synthesize(g, 'patch'));
  assert.ok(!g.flags.tankLeak);
});

test('chaque partie gagnée croise au moins un événement de milieu de partie', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const g = autopilot(seed);
    if (g.phase === 'victory') assert.ok(g.midEvents.length >= 1, `graine ${seed}`);
  }
});

function closeEventQueue(g) {
  g.phase = 'system';
  // nextEvent n'est pas exporté : un événement vide en file se ferme sur le suivant.
  g.event = { id: 'x', def: { choices: [] }, outcome: 'ok', returnTo: 'system' };
  closeEvent(g);
}

test('l\'issue d\'un événement liste les matériaux et ressources gagnés ou perdus', () => {
  const g = createGame(5);
  const mats = { ...g.ship.materials };
  const fuel = g.ship.fuel;
  g.eventQueue = [];
  g.event = { id: 'distress', def: EVENTS.distress, outcome: null, returnTo: 'system' };
  g.phase = 'event';
  resolveChoice(g, 0);
  const fx = g.event.effects;
  assert.deepEqual(fx.filter((e) => e.kind === 'mat').map((e) => [e.key, e.delta]), [['germanium', 2], ['polonium', 1]]);
  assert.equal(g.ship.materials.polonium, (mats.polonium || 0) + 1);
  assert.deepEqual(fx.find((e) => e.kind === 'fuel'), { kind: 'fuel', delta: -4 });
  assert.ok(fx.some((e) => e.kind === 'data' && e.delta === 10));
  assert.ok(g.ship.fuel < fuel);
});

test('les matériaux aléatoires d\'un événement apparaissent dans le bilan', () => {
  for (let seed = 1; seed < 40; seed++) {
    const g = createGame(seed);
    const before = { ...g.ship.materials };
    g.eventQueue = [];
    g.event = { id: 'crash', def: EVENTS.crash, outcome: null, returnTo: 'system' };
    g.phase = 'event';
    resolveChoice(g, 0);
    const total = g.event.effects.filter((e) => e.kind === 'mat').reduce((n, e) => n + e.delta, 0);
    assert.equal(total, 5);
    for (const e of g.event.effects.filter((x) => x.kind === 'mat')) assert.equal(g.ship.materials[e.key], (before[e.key] || 0) + e.delta);
  }
});
