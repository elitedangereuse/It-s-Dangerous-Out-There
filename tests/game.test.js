import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, jump, canJump, autoScan, manualScan, scoop, canScoop, boost, canBoost,
  land, surfaceActions, surfaceAction, resolveChoice, closeEvent, choiceAvailable,
  synthesize, canSynthesize, distanceToDestination,
} from '../src/game.js';
import { RECIPES } from '../src/data.js';
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
