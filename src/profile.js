// Profil du commandant, conservé d'une partie à l'autre : savoir, codex, vaisseaux débloqués.
// La méta-progression donne du savoir et des choix de départ, jamais de puissance brute.
import { SHIPS } from './data.js';

const KEY = 'idot-profile-v1';
const ASP_LANDINGS = 25;

export function emptyProfile() {
  return { runs: 0, victories: 0, landings: 0, knowledge: { glyphs: 0, signals: 0 }, codex: {}, shipsFlown: { mandalay: true } };
}

export function loadProfile(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(KEY);
    if (!raw) return emptyProfile();
    const p = JSON.parse(raw);
    const base = emptyProfile();
    return { ...base, ...p, knowledge: { ...base.knowledge, ...p.knowledge }, codex: { ...p.codex }, shipsFlown: { ...base.shipsFlown, ...p.shipsFlown } };
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(profile, storage = globalThis.localStorage) {
  try {
    storage && storage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Stockage indisponible (navigation privée, cadre sandboxé) : la partie continue sans mémoire.
  }
}

// Fusion de la progression gardée ailleurs (le compte du site, cf. sync.js) dans celle-ci : les
// compteurs gardent le plus grand, le codex et les vaisseaux pilotés s'additionnent. Rien n'est perdu
// ni compté deux fois, quel que soit l'appareil qui a joué. Modifie `profile` ; vrai s'il a changé.
export function mergeProfile(profile, other) {
  if (!other || typeof other !== 'object') return false;
  const before = JSON.stringify(profile);
  const num = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  for (const k of ['runs', 'victories', 'landings']) profile[k] = Math.max(num(profile[k]), num(other[k]));
  for (const [k, v] of Object.entries(other.knowledge || {})) profile.knowledge[k] = Math.max(num(profile.knowledge[k]), num(v));
  for (const [k, v] of Object.entries(other.codex || {})) if (v) profile.codex[k] = true;
  for (const [k, v] of Object.entries(other.shipsFlown || {})) if (v && k in SHIPS) profile.shipsFlown[k] = true;
  if (!profile.lastShip && typeof other.lastShip === 'string' && other.lastShip in SHIPS) profile.lastShip = other.lastShip;
  return JSON.stringify(profile) !== before;
}

export function isUnlocked(profile, model) {
  switch (model) {
    case 'mandalay': return true;
    case 'dbx': return profile.victories > 0 || !!profile.shipsFlown.dbx;
    case 'krait': return !!profile.shipsFlown.krait;
    case 'asp': return profile.landings >= ASP_LANDINGS || !!profile.shipsFlown.asp;
    default: return false;
  }
}

export function unlockedShips(profile) {
  return Object.keys(SHIPS).filter((m) => isUnlocked(profile, m));
}

// Options de createGame tirées du profil.
export function gameOptions(profile, ship) {
  return { ship: isUnlocked(profile, ship) ? ship : 'mandalay', knowledge: { ...profile.knowledge }, codex: { ...profile.codex } };
}

// Reporte l'état d'une partie dans le profil. Idempotent : peut être appelé après chaque action.
// Renvoie la liste des vaisseaux nouvellement débloqués.
export function absorbRun(profile, state) {
  const before = unlockedShips(profile);
  for (const k of Object.keys(profile.knowledge)) profile.knowledge[k] = Math.max(profile.knowledge[k], state.knowledge[k] || 0);
  Object.assign(profile.codex, state.codex);
  for (const m of state.shipsFlown) profile.shipsFlown[m] = true;
  state.counted = state.counted || { landings: 0, ended: false };
  profile.landings += state.stats.landings - state.counted.landings;
  state.counted.landings = state.stats.landings;
  if (state.end && !state.counted.ended) {
    state.counted.ended = true;
    profile.runs++;
    if (state.end.victory) profile.victories++;
  }
  return unlockedShips(profile).filter((m) => !before.includes(m));
}
