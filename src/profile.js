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
