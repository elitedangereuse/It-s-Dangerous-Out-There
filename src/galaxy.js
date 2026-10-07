// Génération procédurale : régions, systèmes candidats, corps célestes.
import { Rng, hashMix } from './rng.js';
import { STAR_CLASSES, BODY_TYPES, SECTORS, DESTINATIONS, ORIGINS } from './data.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createGalaxy(seed) {
  const rng = new Rng(hashMix(seed, 'galaxy'));
  const destination = rng.pick(DESTINATIONS);
  const origin = rng.pick(ORIGINS);
  const regions = [];
  const kinds = ['thargoid', 'nebula', 'neutron', rng.pick(['thargoid', 'nebula'])];
  for (let i = 0; i < kinds.length; i++) {
    regions.push({
      type: kinds[i],
      x: destination.dist * rng.range(0.15 + i * 0.18, 0.3 + i * 0.18),
      y: rng.range(-140, 140),
      r: rng.range(80, 150),
    });
  }
  return {
    origin: { name: origin, x: 0, y: 0 },
    destination: { ...destination, x: destination.dist, y: 0 },
    regions,
  };
}

export function regionsAt(galaxy, p) {
  return galaxy.regions.filter((r) => Math.hypot(r.x - p.x, r.y - p.y) <= r.r).map((r) => r.type);
}

export function systemName(rng) {
  const sector = rng.pick(SECTORS);
  const l = () => rng.pick(LETTERS);
  const mass = rng.pick(['a', 'b', 'c', 'd', 'e']);
  const n = mass === 'a' ? '' : rng.int(0, 30);
  return `${sector} ${l()}${l()}-${l()} ${mass}${n}${n === '' ? '' : '-'}${rng.int(0, 120)}`;
}

function pickStarClass(rng, regions) {
  const entries = Object.entries(STAR_CLASSES).map(([code, s]) => {
    let w = s.weight;
    if (regions.includes('neutron') && (code === 'N' || code === 'D')) w *= 6;
    if (regions.includes('nebula') && (code === 'TTS' || code === 'W' || code === 'B')) w *= 3;
    return [code, w];
  });
  return rng.weighted(entries);
}

// Systèmes atteignables depuis la position courante.
export function generateCandidates(state) {
  const { galaxy, pos, jumps, seed } = state;
  const range = state.effectiveRange;
  const rng = new Rng(hashMix(seed, 'cand', jumps, Math.round(pos.x), Math.round(pos.y)));
  const dest = galaxy.destination;
  const bearing = Math.atan2(dest.y - pos.y, dest.x - pos.x);
  const list = [];
  const count = rng.int(5, 7);
  for (let i = 0; i < count; i++) {
    const forward = i < 3 || rng.chance(0.5);
    const angle = forward ? bearing + rng.range(-1.1, 1.1) : rng.range(-Math.PI, Math.PI);
    const d = range * rng.range(i === 0 ? 0.75 : 0.3, 1.0);
    const p = { x: pos.x + Math.cos(angle) * d, y: pos.y + Math.sin(angle) * d };
    const regions = regionsAt(galaxy, p);
    list.push({
      id: `s${jumps}-${i}-${rng.int(0, 1e6)}`,
      name: systemName(rng),
      x: p.x,
      y: p.y,
      star: pickStarClass(rng, regions),
      regions,
    });
  }
  // Garantir au moins une étoile écopable vers l'avant pour éviter les impasses injustes.
  if (!list.slice(0, 3).some((c) => STAR_CLASSES[c.star].scoopable)) {
    list[1].star = rng.pick(['K', 'M', 'G']);
  }
  if (dist(pos, dest) <= range) {
    list.unshift({
      id: 'destination',
      name: dest.system,
      x: dest.x,
      y: dest.y,
      star: 'G',
      regions: [],
      isDestination: true,
    });
  }
  return list;
}

function pickBodyType(rng, star, regions) {
  const entries = Object.entries(BODY_TYPES).map(([id, b]) => {
    let w = b.weight;
    if (['L', 'T', 'Y', 'D', 'N', 'BH'].includes(star) && ['water', 'elw', 'ammonia'].includes(id)) w *= 0.3;
    if (regions.includes('nebula') && ['icy', 'water', 'gasw'].includes(id)) w *= 1.6;
    return [id, w];
  });
  return rng.weighted(entries);
}

function rollFeature(rng, type, regions) {
  if (!BODY_TYPES[type].landable) return null;
  const guardian = 0.03 * (regions.includes('nebula') ? 3 : 1);
  const thargoid = 0.03 * (regions.includes('thargoid') ? 6 : 1);
  const r = rng.next();
  if (r < guardian) return 'guardian';
  if (r < guardian + thargoid) return 'thargoid';
  if (r < guardian + thargoid + 0.07) return 'crash';
  return null;
}

export function generateSystem(stub, seed) {
  const rng = new Rng(hashMix(seed, 'sys', stub.id, stub.name));
  const star = STAR_CLASSES[stub.star];
  const bodies = [];
  const max = stub.star === 'BH' || stub.star === 'N' ? 4 : stub.isDestination ? 6 : 8;
  const count = stub.isDestination ? 6 : rng.int(1, max);
  let ls = rng.range(8, 40);
  for (let i = 0; i < count; i++) {
    const type = pickBodyType(rng, stub.star, stub.regions);
    const def = BODY_TYPES[type];
    const landable = def.landable;
    const bio = landable && type !== 'metal' && rng.chance(type === 'icy' || type === 'rocky' ? 0.3 : 0.2) ? rng.int(1, 4) : 0;
    const geo = landable && rng.chance(0.2) ? rng.int(1, 3) : 0;
    const terraformable = ['hmc', 'water', 'rocky'].includes(type) && rng.chance(0.15);
    const mats = (def.mats || []).map((m) => m);
    bodies.push({
      id: `${stub.id}-b${i}`,
      name: `${stub.name} ${i + 1}`,
      index: i + 1,
      type,
      landable,
      size: rng.int(def.size[0], def.size[1]),
      ls: Math.round(ls),
      bio,
      geo,
      terraformable,
      rings: type.startsWith('gas') && rng.chance(0.4),
      feature: rollFeature(rng, type, stub.regions),
      mats,
      revealed: 0, // 0 inconnu, 1 scan auto, 2 scan manuel
      hint: false,
      landed: false,
      seed: rng.int(0, 1e9),
    });
    ls *= rng.range(1.6, 3.2);
  }
  // Un système spécial peut porter un événement à l'arrivée.
  let event = null;
  if (!stub.isDestination) {
    const p = 0.32 + (stub.regions.includes('nebula') ? 0.15 : 0) + (stub.regions.includes('thargoid') ? 0.1 : 0);
    if (rng.chance(p)) event = pickSystemEvent(rng, stub);
  }
  return {
    ...stub,
    starDef: star,
    bodies,
    event,
    scooped: false,
    autoScanned: false,
    boostUsed: false,
    seed: rng.int(0, 1e9),
  };
}

function pickSystemEvent(rng, stub) {
  const hot = ['O', 'B', 'A', 'W'].includes(stub.star);
  const entries = [
    ['signal', 6],
    ['distress', 3],
    ['wreck', 4],
    ['anomaly', stub.regions.includes('nebula') ? 5 : 2],
    ['generation', 1],
    ['megaship', 0.8],
    ['flare', hot ? 5 : 0.5],
    ['thargoidProbe', stub.regions.includes('thargoid') ? 5 : 0.3],
  ];
  return rng.weighted(entries);
}
