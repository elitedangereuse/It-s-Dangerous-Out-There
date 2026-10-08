// Décors pixel art, d'après les images de référence fournies :
// - espace : nébuleuses vives et lumineuses (un foyer brillant, une bande de gaz, des volutes),
//   sur lesquelles le moteur Pixel Planets pose planètes, astéroïdes et étoiles ;
// - planètes : panoramas en plans successifs (ciel dégradé, astre géant, nuages, chaînes de
//   montagnes de plus en plus sombres vers l'avant, sol et rochers de premier plan).
// Tout est déterministe : un numéro de recette donne toujours le même décor.
import { BODY_TYPES } from './data.js';

export const SPACE_COUNT = 250;
export const PLANET_COUNT = 250;
// La nébuleuse déborde de l'écran pour pouvoir glisser lentement (parallaxe).
export const NW = 400;
export const NH = 216;
// Les chaînes de montagnes bouclent sur 640 px.
export const LW = 640;
const W = 320;
const H = 180;
// Finesse : les décors sont calculés à K pixels réels par pixel logique (repère 320×180).
// Le pixel art reste net, mais deux fois plus fin, et les dégradés ont la place de respirer.
export const K = 2;

// ---------- Hasard, bruit, couleurs ----------

export function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x, y, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const mod = (a, n) => ((a % n) + n) % n;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Bruit de valeur, périodique en x (période en cellules) pour les calques qui bouclent.
function vnoise(x, y, period, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const x0 = mod(xi, period), x1 = mod(xi + 1, period);
  const a = hash3(x0, yi, s), b = hash3(x1, yi, s), c = hash3(x0, yi + 1, s), d = hash3(x1, yi + 1, s);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

function fbm(x, y, s, oct = 4, period = 1 << 20) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * vnoise(x * f, y * f, period * f, s + i * 131);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / norm;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

export const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const mix = (a, b, k) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k));
export const css = (c, a = 1) => (a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
// Rampe affinée : `sub` tons intermédiaires entre deux teintes consécutives.
export function rampFine(cols, sub) {
  const out = [];
  for (let i = 0; i < cols.length - 1; i++) for (let k = 0; k < sub; k++) out.push(mix(cols[i], cols[i + 1], k / sub));
  out.push(cols[cols.length - 1]);
  return out;
}
const toHex = (c) => '#' + c.map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('');

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function withPixels(w, h, fn) {
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  fn(img.data, w, h);
  ctx.putImageData(img, 0, 0);
  return c;
}

function put(d, w, x, y, c, a = 255) {
  const o = (y * w + x) * 4;
  if (a < 255 && d[o + 3]) {
    // Mélange avec ce qui est déjà là (calques transparents superposés dans un même canvas).
    const k = a / 255;
    d[o] = d[o] + (c[0] - d[o]) * k;
    d[o + 1] = d[o + 1] + (c[1] - d[o + 1]) * k;
    d[o + 2] = d[o + 2] + (c[2] - d[o + 2]) * k;
    d[o + 3] = Math.max(d[o + 3], a);
    return;
  }
  d[o] = c[0];
  d[o + 1] = c[1];
  d[o + 2] = c[2];
  d[o + 3] = a;
}

// ---------- Thèmes de couleurs de l'espace ----------
// Rampes du plus sombre au plus clair, choisies d'après les images de référence
// (violet et bleu électrique, vert acide, bleu glacier…).

export const THEMES = {
  violet: ['#0b0722', '#170c40', '#251262', '#391a86', '#5222ad', '#6a36d2', '#5c62ee', '#4f9cff', '#86dcff', '#e4fbff'],
  emeraude: ['#020c06', '#05200d', '#0a3713', '#105219', '#1b711e', '#319824', '#62c02a', '#a6e646', '#e0fb92', '#fbffe0'],
  azur: ['#060c30', '#0c1856', '#122782', '#1a3cab', '#2658cc', '#367ce4', '#52a4f4', '#86ccff', '#c6ecff', '#ffffff'],
  magenta: ['#110519', '#260a30', '#430e4c', '#69186a', '#912680', '#bd3d96', '#e463a6', '#ff98bd', '#ffcfdf', '#fff4f8'],
  braise: ['#130504', '#2a0a08', '#4a110b', '#741c0f', '#a02f14', '#cc4c1a', '#ec7628', '#ffa648', '#ffd688', '#fff6d6'],
  lagon: ['#03111a', '#06222e', '#093746', '#0e525e', '#147478', '#1f9a8c', '#3cc49e', '#7ce6b6', '#c4ffdc', '#f2fff8'],
};
const THEME_RGB = Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, v.map(hexRgb)]));

const STAR_THEMES = {
  O: ['azur', 'violet'], B: ['azur', 'violet'], A: ['azur', 'violet', 'lagon'], F: ['violet', 'azur', 'lagon', 'magenta'],
  G: ['violet', 'magenta', 'lagon', 'azur', 'braise'], K: ['braise', 'magenta', 'violet'], M: ['braise', 'magenta', 'violet'],
  L: ['braise', 'magenta'], T: ['braise', 'magenta'], Y: ['magenta', 'violet'], TTS: ['braise', 'magenta'],
  W: ['azur', 'lagon'], D: ['azur', 'violet'], N: ['azur', 'lagon'], BH: ['violet', 'braise', 'magenta'],
};
// Secondes teintes qui s'accordent avec chaque thème.
const ACCENTS = { violet: ['azur', 'magenta'], azur: ['violet', 'lagon'], magenta: ['violet', 'braise'], braise: ['magenta'], lagon: ['azur', 'emeraude'], emeraude: ['lagon'] };
const REGION_THEMES = { thargoid: ['emeraude', 'lagon'], nebula: ['magenta', 'violet'], neutron: ['azur', 'lagon'] };

// ---------- Recettes d'espace ----------

const DECO_KINDS = ['gas', 'gas', 'rock', 'ice', 'lava', 'land', 'ringed'];
const CORNERS = ['haut-droite', 'bas-droite', 'haut-gauche', 'bas-gauche'];

export function spaceRecipe(id, { region = null, star = null } = {}) {
  const r = rngOf(0x5eed + id * 7919);
  const pool = (region && REGION_THEMES[region]) || (star && STAR_THEMES[star]) || Object.keys(THEMES);
  const theme = pool[Math.floor(r() * pool.length)];
  const others = ACCENTS[theme];
  const accent = r() < 0.55 ? others[Math.floor(r() * others.length)] : null;
  return {
    id,
    theme,
    accent,
    focal: [NW * (0.32 + r() * 0.36), NH * (0.34 + r() * 0.3)],
    angle: (r() - 0.5) * 1.6,
    length: 120 + r() * 120,
    width: 34 + r() * 40,
    core: 24 + r() * 30,
    swirl: (r() - 0.5) * 3,
    lanes: r() * 0.45,
    rays: Math.floor(r() * 8),
    glow: 0.85 + r() * 0.3,
    asteroids: r() < 0.75 ? 7 + Math.floor(r() * 12) : 0,
    deco: r() < 0.75 ? { kind: DECO_KINDS[Math.floor(r() * DECO_KINDS.length)], corner: CORNERS[Math.floor(r() * CORNERS.length)], size: 70 + Math.floor(r() * 70), seed: Math.floor(r() * 1e6) } : null,
    seed: Math.floor(r() * 1e6),
  };
}

// La nébuleuse : un foyer très lumineux, une bande de gaz allongée et déformée, des volutes,
// des couloirs de poussière, quelques rayons. Calculée à K× ; entre deux teintes de la rampe,
// trois tons intermédiaires et un tramage léger donnent un dégradé doux mais toujours pixel.
export function buildNebula(R) {
  const ramp = THEME_RGB[R.theme];
  const acc = R.accent ? THEME_RGB[R.accent] : null;
  const n = ramp.length;
  const s = R.seed;
  const [fx, fy] = R.focal;
  const ca = Math.cos(R.angle), sa = Math.sin(R.angle);
  const PW = NW * K, PH = NH * K;
  const field = new Float32Array(PW * PH);
  for (let py = 0; py < PH; py++) {
    const y = py / K;
    for (let px = 0; px < PW; px++) {
      const x = px / K;
      let dx = x - fx, dy = y - fy;
      const r0 = Math.hypot(dx, dy);
      // Tourbillon autour du foyer.
      const tw = R.swirl * Math.exp(-r0 / 110);
      const c = Math.cos(tw), sn = Math.sin(tw);
      [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c];
      const wx = (fbm(x / 80, y / 80, s + 1, 3) - 0.5) * 90;
      const wy = (fbm(x / 80 + 7.3, y / 80, s + 2, 3) - 0.5) * 70;
      const u = (dx + wx) * ca + (dy + wy) * sa;
      const v = -(dx + wx) * sa + (dy + wy) * ca;
      const band = Math.exp(-((u * u) / (R.length * R.length) + (v * v) / (R.width * R.width)));
      const core = Math.exp(-(r0 * r0) / (R.core * R.core));
      const cloud = fbm((x + wx * 0.5) / 42, (y + wy * 0.5) / 42, s + 3, 5);
      const fil = 1 - Math.abs(2 * fbm((x + wx) / 36, (y + wy) / 22, s + 4, 5) - 1);
      const dust = smooth(clamp((fbm(x / 34, y / 30, s + 5, 4) - 0.5) * 3, 0, 1));
      let d = 0.1 + band * (0.18 + 0.62 * cloud) + fil * fil * band * 0.3 + core * 0.42 + cloud * 0.12;
      d -= R.lanes * dust * (0.3 + band * 0.6);
      const vx = x / NW - 0.5, vy = y / NH - 0.5;
      d *= (1 - (vx * vx + vy * vy) * 0.9) * R.glow;
      // Les hautes lumières sont tassées : un cœur brillant mais pas un aplat blanc.
      if (d > 0.72) d = 0.72 + (d - 0.72) * 0.35;
      field[py * PW + px] = d;
    }
  }
  const SUB = 4;
  const fine = rampFine(ramp, SUB);
  const fineAcc = acc ? rampFine(acc, SUB) : null;
  const top = fine.length - 1;
  return withPixels(PW, PH, (data, w) => {
    for (let py = 0; py < PH; py++) {
      for (let px = 0; px < PW; px++) {
        const d = field[py * PW + px];
        const i = clamp(Math.floor(d * top + bayer(px, py) * 0.85 + 0.5), 0, top);
        let c = fine[i];
        // Voiles d'une seconde teinte, comme les reflets bleus dans la nébuleuse violette.
        if (fineAcc && i >= 3 * SUB && i < top - SUB) {
          const a = fbm(px / K / 64, py / K / 64, s + 9, 3);
          const k = smooth(clamp((a - 0.5) / 0.16, 0, 1));
          if (k > 0) c = mix(c, fineAcc[i], Math.round((k + bayer(px, py) * 0.3) * 4) / 4 * 0.85);
        }
        put(data, w, px, py, c);
      }
    }
    const r = rngOf(s + 11);
    // Rayons fins partant du foyer.
    for (let k = 0; k < R.rays; k++) {
      const a = r() * Math.PI * 2, len = 30 + r() * 110, c = ramp[n - 2 - Math.floor(r() * 2)];
      for (let j = 14 * K; j < len * K; j++) {
        const x = Math.round(fx * K + Math.cos(a) * j), y = Math.round(fy * K + Math.sin(a) * j * 0.8);
        if (x < 0 || y < 0 || x >= PW || y >= PH) break;
        put(data, w, x, y, c, Math.round(70 * Math.sin((Math.PI * (j - 14 * K)) / (len * K - 14 * K))));
      }
    }
    // Poussière d'étoiles, plus dense dans la bande : un pixel fin, parfois une étoile plus grosse.
    for (let k = 0; k < 1400; k++) {
      const x = Math.floor(r() * PW), y = Math.floor(r() * PH);
      const d = field[y * PW + x];
      if (r() > 0.3 + d) continue;
      const c = r() < 0.7 ? [255, 255, 255] : ramp[n - 2];
      const al = 60 + Math.floor(r() * 170);
      put(data, w, x, y, c, al);
      if (r() < 0.08 && x + 1 < PW && y + 1 < PH) {
        put(data, w, x + 1, y, c, al >> 1);
        put(data, w, x, y + 1, c, al >> 1);
        put(data, w, x + 1, y + 1, c, al >> 2);
      }
    }
  });
}

// Étoiles scintillantes (dessinées à chaque image) et étoiles en croix.
export function sparkles(R, count = 26) {
  const r = rngOf(R.seed + 21);
  return Array.from({ length: count }, () => ({ x: r() * NW, y: r() * NH, ph: r() * 6.28, sp: 1 + r() * 2.5, big: r() < 0.3 }));
}

// Couleurs dérivées du thème pour les objets posés sur la nébuleuse.
export function themeColors(name) {
  const t = THEMES[name] || THEMES.violet;
  return {
    ramp: t,
    rock: [toHex(mix(hexRgb(t[5]), [200, 200, 210], 0.35)), toHex(mix(hexRgb(t[2]), [40, 40, 50], 0.4)), toHex(mix(hexRgb(t[0]), [0, 0, 0], 0.3))],
    gasLight: [t[8], t[7], t[6]],
    gasDark: [t[4], t[2], t[1]],
  };
}

// ---------- Panoramas planétaires ----------

// Ambiances de ciel. `sky` : du zénith à l'horizon.
const MOODS = {
  couchant: { sky: ['#1b1236', '#331a52', '#5c2667', '#93396c', '#c95a66', '#ec8a68', '#ffbf86'], sun: '#fff1cf', glow: '#ffb27a', cloud: ['#6e3466', '#b25a7e', '#ea9498', '#ffd9cc'], ambient: '#341c4c', stars: 0.35, sunLow: true },
  pourpre: { sky: ['#050204', '#0f0408', '#1d060b', '#330b0f', '#561410', '#8a2414', '#b83c1c'], sun: '#ffd6a6', glow: '#ff6436', cloud: null, ambient: '#170507', stars: 1 },
  givre: { sky: ['#0a1534', '#142c64', '#24509a', '#4080c2', '#7cb4de', '#bfe2f4', '#e8f8ff'], sun: '#ffffff', glow: '#c4ecff', cloud: ['#5674b0', '#8cacdc', '#cde0f6', '#ffffff'], ambient: '#1a2c5c', stars: 0.1 },
  aurore: { sky: ['#020711', '#04111f', '#071c30', '#0b2a40', '#103a50', '#174c5c', '#1e5e66'], sun: '#e4fff6', glow: '#6ae6c6', cloud: null, ambient: '#05202a', stars: 1, aurora: ['#26f0a0', '#86ffd6', '#b47aff'] },
  crepuscule: { sky: ['#0d0927', '#1b1242', '#2e1d5a', '#4a2b72', '#6f4386', '#986292', '#c08ca0'], sun: '#ffe6c8', glow: '#e09ab0', cloud: ['#3a2a5c', '#64487a', '#9c7898', '#d4aabb'], ambient: '#20163e', stars: 0.8 },
  poussiere: { sky: ['#365684', '#5274a2', '#7a96ba', '#a8b2bc', '#d2c2a8', '#ecd2a8', '#f8e2bc'], sun: '#fffbe6', glow: '#ffe2a6', cloud: ['#a89a8e', '#d0c0ac', '#ece0cc', '#ffffff'], ambient: '#4a3e54', stars: 0 },
  toxique: { sky: ['#03100c', '#07201a', '#0e3426', '#1a4c32', '#346638', '#628442', '#9aa452'], sun: '#f4ffd0', glow: '#c6e070', cloud: ['#264630', '#42683c', '#6e904c', '#aec470'], ambient: '#0c2418', stars: 0.3 },
};

const TYPE_MOODS = {
  icy: ['givre', 'aurore', 'crepuscule', 'givre'],
  rocky: ['couchant', 'poussiere', 'crepuscule', 'pourpre'],
  hmc: ['pourpre', 'couchant', 'poussiere', 'pourpre'],
  metal: ['toxique', 'aurore', 'crepuscule', 'pourpre'],
};
const TYPE_RIDGES = {
  icy: ['pics', 'cristaux', 'pics', 'aiguilles'],
  rocky: ['pics', 'domes', 'mesas', 'pics'],
  hmc: ['domes', 'mesas', 'pics', 'domes'],
  metal: ['aiguilles', 'cristaux', 'mesas', 'pics'],
};
const PARTICLES = { givre: 'neige', aurore: 'neige', pourpre: 'braises', poussiere: 'poussiere', couchant: 'poussiere', toxique: 'spores', crepuscule: 'poussiere' };

export function panoramaRecipe(id, type = 'rocky') {
  const r = rngOf(0xb0d1 + id * 104729);
  const airless = r() < 0.5;
  const moods = TYPE_MOODS[type] || TYPE_MOODS.rocky;
  const ridges = TYPE_RIDGES[type] || TYPE_RIDGES.rocky;
  const mood = airless ? 'vide' : moods[Math.floor(r() * moods.length)];
  return {
    id,
    type,
    mood,
    airless,
    ridge: ridges[Math.floor(r() * ridges.length)],
    ridge2: ridges[Math.floor(r() * ridges.length)],
    sunSide: r() < 0.6 ? 1 : -1,
    sunX: 0,
    sunY: 0,
    giant: r() < 0.8 ? { x: 40 + r() * 240, y: 40 + r() * 40, d: 44 + Math.floor(r() * 50) } : null,
    moons: Math.floor(r() * 4),
    clouds: !airless && r() < 0.85,
    particles: airless ? (r() < 0.4 ? 'poussiere' : null) : PARTICLES[mood],
    rocks: r() < 0.8,
    seed: Math.floor(r() * 1e6),
    _r: r(),
    _s: r(),
  };
}

// Montagnes : des pics (ou dômes, mesas, aiguilles, cristaux) dessinés un à un, chacun avec
// une face éclairée et une face à l'ombre séparées par une arête irrégulière, un liseré de
// lumière et, en altitude, de la neige. Les plus petits passent devant. Calcul à K× : les
// faces reçoivent un modelé doux (plus claires vers le sommet) et le pied se fond dans la brume.
function rangeLayer({ seed, style, base, amp, count, lit, shade, rim, snow = null, side = 1, h = H, haze = null }) {
  const r = rngOf(seed);
  const peaks = [];
  for (let i = 0; i < count; i++) {
    const tall = 0.35 + r() * 0.65;
    const ph = amp * tall;
    let hw;
    if (style === 'aiguilles') hw = 3 + r() * 6;
    else if (style === 'cristaux') hw = 5 + r() * 10;
    else if (style === 'mesas') hw = 20 + r() * 40;
    else if (style === 'domes') hw = 18 + r() * 30;
    else hw = ph * (0.9 + r() * 0.9);
    peaks.push({ x: r() * LW, top: base - ph, ph, hw, lean: (r() - 0.5) * 0.4, s: Math.floor(r() * 1e6), plat: 0.3 + r() * 0.4 });
  }
  peaks.sort((a, b) => b.ph - a.ph);
  const PW = LW * K, PH = h * K;
  const owner = new Int16Array(PW * PH).fill(-1);
  const rel = new Float32Array(PW * PH); // position relative dans le pic (-1 gauche, 1 droite)
  // Profil : renvoie la hauteur du pic à la distance horizontale u (en demi-largeurs).
  const profile = (p, u) => {
    const a = Math.abs(u);
    if (a >= 1) return -1;
    if (style === 'domes') return Math.pow(1 - a * a, 0.6);
    if (style === 'mesas') return a < p.plat ? 1 : Math.pow((1 - a) / (1 - p.plat), 0.35);
    if (style === 'cristaux') return 1 - a * 1.05;
    if (style === 'aiguilles') return 1 - Math.pow(a, 1.6);
    return 1 - a;
  };
  peaks.forEach((p, k) => {
    const span = Math.ceil(p.hw * K);
    for (let dx = -span; dx <= span; dx++) {
      const u = dx / (p.hw * K);
      let v = profile(p, u);
      if (v < 0) continue;
      // Arêtes irrégulières (bruit à deux échelles : grandes cassures, petites aspérités).
      const ldx = dx / K;
      v += (vnoise((p.x + ldx) / 5, 0, 1 << 20, p.s) - 0.5) * (style === 'domes' ? 0.06 : 0.12) * (1 - Math.abs(u));
      v += (vnoise((p.x + ldx) / 1.6, 3, 1 << 20, p.s) - 0.5) * (style === 'domes' ? 0.015 : 0.035) * (1 - Math.abs(u));
      const top = Math.round((p.top + p.ph * (1 - v)) * K);
      const x = mod(Math.round(p.x * K + dx), PW);
      for (let y = Math.max(0, top); y < PH; y++) {
        owner[y * PW + x] = k;
        rel[y * PW + x] = u;
      }
    }
  });
  const hz = haze || shade;
  return withPixels(PW, PH, (d, w) => {
    for (let py = 0; py < PH; py++) {
      const y = py / K;
      for (let px = 0; px < w; px++) {
        const x = px / K;
        const k = owner[py * PW + px];
        if (k < 0) {
          if (y >= base) put(d, w, px, py, hz);
          continue;
        }
        const p = peaks[k];
        const u = rel[py * PW + px];
        const depth = (y - p.top) / Math.max(1, p.ph); // 0 au sommet
        const dt = bayer(px, py);
        // Arête de partage lumière/ombre, qui serpente en descendant.
        const ridge = (vnoise(y / 4, p.s % 97, 1 << 20, p.s) - 0.5) * 0.5 + p.lean * depth;
        let litSide = (u - ridge) * side > 0;
        if (style === 'domes') litSide = u * side + (0.4 - depth) * 0.8 > 0.1;
        // Modelé : la face éclairée s'assombrit doucement en descendant et vers l'arête ;
        // la face à l'ombre reçoit un peu de lumière réfléchie près de l'arête.
        let c;
        if (litSide) {
          const edge = clamp(1 - Math.abs(u - ridge) * 2.2, 0, 1);
          c = mix(lit, shade, Math.round((clamp(depth * 0.32 + edge * 0.18, 0, 0.5) + dt * 0.12) * 6) / 6);
        } else {
          const near = clamp(1 - Math.abs(u - ridge) * 3, 0, 1);
          c = mix(shade, lit, Math.round((near * 0.16 + dt * 0.08) * 6) / 6);
        }
        // Ravines sombres sur la face éclairée.
        if (litSide && style !== 'cristaux') {
          const rv = vnoise(x / 2.6, y / 11, 1 << 20, p.s + 3);
          if (rv > 0.76) c = mix(c, shade, rv > 0.84 ? 0.38 : 0.2);
        }
        // Strates des mesas.
        if (style === 'mesas' && depth > 0.15 && (Math.floor(y) + (p.s & 7)) % 7 === 0 && py % K === 0) c = mix(c, shade, 0.3);
        // Neige en altitude.
        if (snow && depth < 0.3 + (vnoise(x / 3, 0, 1 << 20, p.s) - 0.5) * 0.25 && p.ph > 18) c = litSide ? snow[0] : snow[1];
        // Liseré lumineux sur la silhouette.
        const above = py > 0 ? owner[(py - 1) * PW + px] : -1;
        if (above !== k && (litSide || style === 'cristaux')) c = rim;
        else if (above !== k) c = mix(c, rim, 0.35);
        // Pied de la chaîne fondu dans la brume.
        const fog = clamp((depth - 0.55) / 0.45, 0, 1);
        if (fog > 0) c = mix(c, hz, Math.round((smooth(fog) * 0.85 + dt * 0.18) * 5) / 5);
        put(d, w, px, py, c);
      }
    }
  });
}

// Bancs de nuages pixel art : des bulles empilées, ombrées par le bas, base plate.
function cloudLayer({ seed, tones, base, spread, count, rMin, rMax, h = H }) {
  const r = rngOf(seed);
  const shades = rampFine(tones, 3);
  const n = shades.length;
  const blobs = [];
  const heaps = 3 + Math.floor(r() * 4);
  for (let hp = 0; hp < heaps; hp++) {
    const hx = r() * LW, hw = 40 + r() * 80, hh = spread * (0.5 + r() * 0.8);
    for (let i = 0; i < count / heaps; i++) {
      const u = (r() + r() + r()) / 3 - 0.5;
      const k = 1 - Math.abs(u) * 2;
      const rad = rMin + (rMax - rMin) * (0.3 + 0.7 * k) * (0.6 + r() * 0.4);
      blobs.push({ x: hx + u * hw * 2, y: base - k * hh * r() - rad * 0.3, rad });
    }
  }
  for (let x = 0; x < LW; x += rMin * 2) if (r() < 0.6) blobs.push({ x: x + r() * rMin, y: base - r() * 3, rad: rMin * (0.6 + r() * 0.6) });
  blobs.sort((a, b) => a.y - b.y);
  const PW = LW * K, PH = h * K;
  return withPixels(PW, PH, (d, w) => {
    blobs.forEach((b) => {
      const R = b.rad * K;
      const Ri = Math.round(R);
      const bx = b.x * K, by = b.y * K;
      for (let dy = -Ri; dy <= Ri; dy++) {
        const py = Math.round(by + dy);
        if (py < 0 || py >= PH || py > (base + 2) * K) continue;
        const half = Math.floor(Math.sqrt(R * R - dy * dy));
        for (let dx = -half; dx <= half; dx++) {
          const px = mod(Math.round(bx + dx), w);
          const shade = (-dy / R) * 0.75 + 0.25 - Math.max(0, (py / K - (base - 6)) / 8);
          let i = Math.floor(((shade + 1) / 2) * n + bayer(px, py) * 0.8);
          // Bord éclairé, d'un pixel fin, sur le haut des bulles.
          if (dy * dy + dx * dx > (R - 1.4) * (R - 1.4) && dy < -R * 0.3) i += 2;
          put(d, w, px, py, shades[clamp(i, 0, n - 1)]);
        }
      }
    });
  });
}

// Ciel : dégradé vertical finement tramé (avec des stries de nuages fins pour les ciels à atmosphère).
function skyLayer(stops, { seed, streaks = null }) {
  const fine = rampFine(stops.map(hexRgb), 8);
  const horizonY = 128;
  const PW = W * K, PH = H * K;
  return withPixels(PW, PH, (d, w) => {
    for (let py = 0; py < PH; py++) {
      const y = py / K;
      const t = clamp(y / horizonY, 0, 1) * (fine.length - 1);
      for (let px = 0; px < w; px++) {
        let k = t + bayer(px, py) * 1.2;
        if (streaks) {
          const n = fbm(px / K / 70, y / 5, seed, 4);
          if (n > 0.6) k += smooth(clamp((n - 0.6) / 0.14, 0, 1)) * 10;
        }
        put(d, w, px, py, fine[clamp(Math.round(k), 0, fine.length - 1)]);
      }
    }
  });
}

// Sol proche : la zone d'atterrissage, texturée, avec des cailloux et des rochers en bord de cadre.
function groundLayer({ seed, top, lit, mid, dark, deep, rim, rocks, side }) {
  // Hauteur du sol (repère logique, non arrondie) : plate dans la zone d'atterrissage.
  const heightAt = (x) => {
    const hgt = top + (fbm(x / 26, 3, seed, 3) - 0.5) * 12;
    if (x > 56 && x < 168) return top;
    if (x >= 168 && x < 180) return top + (hgt - top) * ((x - 168) / 12);
    if (x > 44 && x <= 56) return top + (hgt - top) * ((56 - x) / 12);
    return hgt;
  };
  const near = [];
  for (let x = 0; x < W; x++) near.push(Math.round(heightAt(x)));
  const PW = W * K, PH = H * K;
  const nearP = [];
  for (let px = 0; px < PW; px++) nearP.push(Math.round(heightAt(px / K) * K));
  const tones = rampFine([rim, lit, mid, dark, deep], 3);
  const r = rngOf(seed + 5);
  const canvas = withPixels(PW, PH, (d, w) => {
    for (let px = 0; px < PW; px++) {
      for (let py = nearP[px]; py < PH; py++) {
        const dd = py - nearP[px];
        let c;
        if (dd === 0) c = rim;
        else if (dd < 2) c = mix(rim, lit, 0.5);
        else {
          const t = clamp((py - nearP[px]) / (PH - nearP[px] + 1), 0, 1);
          const n = fbm(px / K / 9, py / K / 4, seed + 1, 4);
          const k = 3 + t * 7 + (n - 0.5) * 5 + bayer(px, py) * 1.1;
          c = tones[clamp(Math.round(k), 3, tones.length - 1)];
        }
        put(d, w, px, py, c);
      }
    }
    // Cailloux : un reflet fin dessus, une ombre portée dessous.
    for (let i = 0; i < 110; i++) {
      const px = Math.floor(r() * PW);
      const py = nearP[px] + 6 + Math.floor(r() * (PH - nearP[px] - 6));
      if (py >= PH - 2) continue;
      const s = r() < 0.25 ? 3 : r() < 0.6 ? 2 : 1;
      for (let a = 0; a <= s; a++) {
        for (let b = 0; b <= s; b++) {
          if (px + a >= PW || py + b >= PH) continue;
          if ((a === 0 || a === s) && (b === 0 || b === s) && s > 1) continue;
          put(d, w, px + a, py + b, b === 0 ? lit : b === s ? deep : mid);
        }
      }
      if (px + s + 1 < PW && py + s + 1 < PH) put(d, w, px + s + 1, py + s, deep, 140);
    }
  });
  // Rochers de premier plan, en silhouette modelée, sur les bords.
  if (rocks) {
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, PW, PH);
    const dd = img.data;
    const boulders = [];
    for (let i = 0; i < 3; i++) boulders.push({ x: r() * 40 - 6, y: H - r() * 20, rx: 14 + r() * 16, ry: 9 + r() * 12 });
    for (let i = 0; i < 3; i++) boulders.push({ x: W - 40 + r() * 46, y: H - r() * 20, rx: 14 + r() * 16, ry: 9 + r() * 12 });
    for (const b of boulders) {
      for (let py = Math.floor((b.y - b.ry) * K); py < PH; py++) {
        for (let px = Math.floor((b.x - b.rx) * K); px <= (b.x + b.rx) * K; px++) {
          if (px < 0 || px >= PW || py < 0) continue;
          const x = px / K, y = py / K;
          const u = (x - b.x) / b.rx, v = (y - b.y) / b.ry;
          const q = u * u + v * v + (vnoise(x / 4, y / 4, 1 << 20, seed + 9) - 0.5) * 0.35 + (vnoise(x, y, 1 << 20, seed + 19) - 0.5) * 0.06;
          if (q > 1) continue;
          const light = u * side - v * 0.8;
          const edge = q > 0.86 && v < 0 && u * side > -0.2;
          const k = clamp(Math.round((0.75 - light) * 3 + bayer(px, py) * 0.9), 0, 3);
          put(dd, PW, px, py, edge ? rim : [mid, dark, mix(dark, deep, 0.5), deep][k]);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  return { canvas, near };
}

// Construit un panorama complet. `space` (thème de la nébuleuse du système) colore les ciels
// sans atmosphère, pour que la surface prolonge la vue spatiale.
export function buildPanorama(R, { space = 'violet' } = {}) {
  const r = rngOf(R.seed);
  const pal = (BODY_TYPES[R.type] || BODY_TYPES.rocky).palette.map(hexRgb);
  const side = R.sunSide;
  let mood;
  if (R.airless) {
    const t = THEMES[space] || THEMES.violet;
    mood = { sky: null, sun: '#ffffff', glow: t[7], cloud: null, ambient: t[1], stars: 1, horizon: t[3] };
  } else {
    mood = MOODS[R.mood];
  }
  const horizon = hexRgb(mood.horizon || mood.sky[mood.sky.length - 1]);
  const ambient = hexRgb(mood.ambient);
  const sunC = hexRgb(mood.sun);
  const glow = hexRgb(mood.glow);
  // Position du soleil : bas sur l'horizon au couchant, plus haut sinon.
  const sunX = side > 0 ? 200 + R._r * 90 : 30 + R._r * 90;
  const sunY = mood.sunLow ? 92 + R._s * 18 : 22 + R._s * 34;
  const out = { recipe: R, mood: R.mood, airless: R.airless, horizon, sun: { x: sunX, y: sunY, color: mood.sun, glow: mood.glow, r: 6 + Math.round(R._r * 5) }, stars: mood.stars, aurora: mood.aurora || null, layers: [] };
  out.sky = mood.sky ? skyLayer(mood.sky, { seed: R.seed + 1, streaks: !!mood.cloud }) : null;
  // Brume pour les plans lointains, teintes de la planète tirées vers l'ambiance.
  const hazeK = R.airless ? 0.62 : 0.8;
  const tone = (c, k) => mix(c, horizon, k);
  const litBase = mix(pal[2], sunC, 0.25);
  const shadeBase = mix(pal[0], ambient, 0.45);
  const snow = R.type === 'icy' || (R.ridge === 'pics' && R.mood === 'givre') ? [mix([250, 252, 255], sunC, 0.2), mix([170, 190, 230], ambient, 0.4)] : null;
  if (R.clouds && mood.cloud) {
    out.layers.push({ name: 'nuages-hauts', canvas: cloudLayer({ seed: R.seed + 2, tones: mood.cloud.map(hexRgb), base: 102, spread: 26, count: 50, rMin: 6, rMax: 20 }), depth: 0.08, drift: 1.5 });
  }
  const plans = [
    { base: 128, amp: 62, count: 9, fog: hazeK, style: R.ridge, depth: 0.12 },
    { base: 136, amp: 46, count: 12, fog: hazeK * 0.62, style: R.ridge, depth: 0.22 },
    { base: 146, amp: 34, count: 14, fog: hazeK * 0.32, style: R.ridge2, depth: 0.4 },
  ];
  plans.forEach((p, i) => {
    const lit = tone(mix(litBase, pal[1], i * 0.15), p.fog);
    const shade = tone(mix(shadeBase, [0, 0, 0], i * 0.12), p.fog);
    const rim = tone(mix(litBase, [255, 255, 255], 0.3), p.fog * 0.8);
    // Brume au pied de chaque chaîne : plus claire pour les plans lointains (perspective aérienne).
    const haze = tone(mix(shade, lit, 0.2), Math.min(1, p.fog + (R.airless ? 0.1 : 0.22)));
    out.layers.push({
      name: `relief-${i}`,
      canvas: rangeLayer({ seed: R.seed + 10 + i, style: p.style, base: p.base, amp: p.amp, count: p.count, lit, shade, rim, snow: snow && i < 2 ? snow.map((c) => tone(c, p.fog * 0.6)) : null, side, haze }),
      depth: p.depth,
      drift: 0,
    });
    if (i === 0 && R.clouds && mood.cloud) {
      out.layers.push({ name: 'nuages-bas', canvas: cloudLayer({ seed: R.seed + 3, tones: mood.cloud.map((c) => mix(hexRgb(c), horizon, 0.2)), base: 132, spread: 12, count: 40, rMin: 4, rMax: 12 }), depth: 0.18, drift: 3 });
    }
  });
  const g = groundLayer({
    seed: R.seed + 30,
    top: 150,
    lit: mix(pal[2], sunC, 0.15),
    mid: mix(pal[1], ambient, 0.25),
    dark: mix(pal[0], ambient, 0.4),
    deep: mix(pal[0], [0, 0, 0], 0.55),
    rim: mix(pal[2], [255, 255, 255], 0.4),
    rocks: R.rocks,
    side,
  });
  out.ground = g.canvas;
  out.near = g.near;
  out.dust = pal[2];
  return out;
}

// ---------- Choix d'un décor pour un corps / un système ----------

const cache = new Map();
export function cached(key, make) {
  if (cache.has(key)) {
    const v = cache.get(key);
    cache.delete(key);
    cache.set(key, v);
    return v;
  }
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  const v = make();
  cache.set(key, v);
  return v;
}

export function spaceIdFor(seed) {
  return mod(Math.floor(hash3(seed | 0, 17, 3) * 1e9), SPACE_COUNT);
}

export function panoramaIdFor(body) {
  return mod(Math.floor(hash3((body.seed | 0) % 1000003, 29, 5) * 1e9), PLANET_COUNT);
}

// Dessine des calques bouclants (640 px logiques, calculés à K×). camX : avancée de la caméra ;
// camY : décalage vertical. Le défilement se fait au pixel fin.
export function drawLayers(ctx, layers, { t = 0, camX = 0, camY = 0 } = {}) {
  const PW = LW * K;
  for (const l of layers) {
    const ox = mod(Math.round((camX * l.depth + t * l.drift) * K), PW);
    const y = Math.round(camY * l.depth * K) / K;
    const lw = l.canvas.width / K, lh = l.canvas.height / K;
    ctx.drawImage(l.canvas, -ox / K, y, lw, lh);
    if (PW - ox < W * K) ctx.drawImage(l.canvas, (PW - ox) / K, y, lw, lh);
  }
}
