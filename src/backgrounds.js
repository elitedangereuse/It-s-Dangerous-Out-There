// Générateur de fonds pixel art en calques de parallaxe, inspiré des packs de ciels fournis :
// nuages posterisés éclairés par le haut, rampes de couleurs à teinte décalée, tramage aux transitions.
// 250 fonds d'espace + 250 environnements planétaires, tous déterministes à partir de leur numéro.
// Chaque calque fait 640 px de large et boucle horizontalement, pour défiler sans fin.
import { BODY_TYPES } from './data.js';

export const LW = 640;
export const LH = 180;
export const SPACE_COUNT = 250;
export const PLANET_COUNT = 250;

// ---------- Hasard et bruit ----------

function rngOf(seed) {
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

// Bruit de valeur périodique en x (période en cellules), pour des calques qui bouclent.
function vnoise(x, y, period, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const x0 = mod(xi, period), x1 = mod(xi + 1, period);
  const a = hash3(x0, yi, s), b = hash3(x1, yi, s), c = hash3(x0, yi + 1, s), d = hash3(x1, yi + 1, s);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

function fbm(x, y, period, s, oct = 5) {
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

// ---------- Couleurs ----------

function hsl(h, s, l) {
  h = mod(h, 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    t = mod(t, 1);
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

// Rampe pixel art : les ombres tirent vers le bleu-violet, les lumières vers le jaune.
function ramp(h, s, n, l0, l1, shift = 24) {
  const toward = (target, k) => {
    let d = mod(target - h + 180, 360) - 180;
    return h + clamp(d, -shift, shift) * k;
  };
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const hue = t < 0.5 ? toward(250, (0.5 - t) * 2) : toward(55, (t - 0.5) * 2);
    const sat = clamp(s * (0.75 + 0.5 * Math.sin(Math.PI * t)), 0, 1);
    return hsl(hue, sat, l0 + (l1 - l0) * t);
  });
}

const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, k) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k));
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// ---------- Canvas ----------

function canvasOf(w = LW, h = LH) {
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
  d[o] = c[0];
  d[o + 1] = c[1];
  d[o + 2] = c[2];
  d[o + 3] = a;
}

// ---------- Briques ----------

// Dégradé vertical tramé (fond opaque).
function gradientLayer(base, { h = LH } = {}) {
  // Interpole les couleurs pour des marches plus fines.
  const stops = [];
  for (let i = 0; i < base.length - 1; i++) for (let k = 0; k < 3; k++) stops.push(mix(base[i], base[i + 1], k / 3));
  stops.push(base[base.length - 1]);
  return withPixels(LW, h, (d, w) => {
    for (let y = 0; y < h; y++) {
      const t = (y / (h - 1)) * (stops.length - 1);
      for (let x = 0; x < w; x++) {
        const k = clamp(t + bayer(x, y) * 0.9, 0, stops.length - 1);
        put(d, w, x, y, stops[Math.round(k)]);
      }
    }
  });
}

// Gaz posterisé (nébuleuses, voiles d'altitude) : bruit à domaine déformé, découpé en bandes
// concentriques comme dans les packs fournis, avec un liseré clair côté haut.
// stretch < 1 étire horizontalement. `bias(x, y)` module la densité.
function gasLayer({ seed, tones, cell = 64, cover = 0.5, stretch = 1, warp = 1.2, ridged = false, bias = () => 0, oct = 4, alpha = 255, bands = 1.4, halo = 0, h = LH }) {
  const period = LW / cell;
  const W2 = LW, H2 = h + 2;
  const field = new Float32Array(W2 * H2);
  for (let y = 0; y < H2; y++) {
    for (let x = 0; x < W2; x++) {
      const qx = x / cell, qy = y / (cell * stretch);
      const wx = fbm(qx + 3.1, qy, period, seed + 9, 3) * warp;
      let v = fbm(qx + wx, qy + wx * 0.6, period, seed, oct);
      if (ridged) v = 1 - Math.abs(2 * v - 1);
      field[y * W2 + x] = v;
    }
  }
  // Étire le bruit sur 0..1 pour que les bandes de couleur soient toutes utilisées.
  let lo = Infinity, hi = -Infinity;
  for (const v of field) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) field[y * W2 + x] = (field[y * W2 + x] - lo) / (hi - lo) + bias(x, y);
  const n = tones.length;
  return withPixels(LW, h, (d, w) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = field[y * W2 + x];
        if (v < cover) {
          // Halo tramé autour du gaz : le bord se fond dans le fond au lieu de couper net.
          if (halo && v > cover - halo && bayer(x, y) + 0.5 > (cover - v) / halo) put(d, w, x, y, tones[0], alpha);
          continue;
        }
        const level = Math.sqrt((v - cover) / (1 - cover));
        // Structure interne : un second bruit plus fin creuse des volutes dans le gaz.
        const fine = fbm(x / (cell / 3), y / ((cell / 3) * stretch), period * 3, seed + 77, 3);
        let i = Math.floor((level * 0.55 + fine * 0.75 - 0.25) * n * bands * 0.8 + bayer(x, y) * 0.7);
        const below = field[(y + 2) * W2 + x];
        if (v - below > 0.015) i++; // éclairé par le haut
        if (field[(y + 1) * W2 + x] < cover) i = Math.min(i, 0);
        put(d, w, x, y, tones[clamp(i, 0, n - 1)], alpha);
      }
    }
  });
}

// Cumulus « en bulles » : des disques empilés le long d'une ligne de base, ombrés par le haut,
// les plus bas (plus proches) devant et plus clairs. C'est la forme des nuages des packs.
function bubbleLayer({ seed, tones, base = 120, spread = 30, count = 70, rMin = 6, rMax = 22, flat = true, alpha = 255, h = LH }) {
  const r = rngOf(seed);
  const n = tones.length;
  const blobs = [];
  // Des amas : chaque amas est un tas de bulles, plus grosses et plus hautes au centre.
  const heaps = 4 + Math.floor(r() * 4);
  for (let hp = 0; hp < heaps; hp++) {
    const hx = r() * LW, hw = 40 + r() * 90, hh = spread * (0.5 + r() * 0.8);
    for (let i = 0; i < count / heaps; i++) {
      const u = (r() + r() + r()) / 3 - 0.5; // à peu près gaussien
      const k = 1 - Math.abs(u) * 2;
      const rad = rMin + (rMax - rMin) * (0.3 + 0.7 * k) * (0.6 + r() * 0.4);
      blobs.push({ x: hx + u * hw * 2, y: base - k * hh * r() - rad * 0.3, rad });
    }
  }
  // Un tapis continu à la base.
  for (let x = 0; x < LW; x += rMin * 1.5) blobs.push({ x: x + r() * rMin, y: base - r() * 4, rad: rMin + r() * rMin });
  blobs.sort((a, b) => a.y - b.y);
  const c = withPixels(LW, h, (d, w) => {
    blobs.forEach((b, k) => {
      const front = k / blobs.length; // 0 = fond, 1 = devant
      const R = Math.round(b.rad);
      for (let dy = -R; dy <= R; dy++) {
        const py = Math.round(b.y + dy);
        if (py < 0 || py >= h) continue;
        if (flat && py > base + 4) continue; // base plate des cumulus
        const half = Math.floor(Math.sqrt(R * R - dy * dy));
        for (let dx = -half; dx <= half; dx++) {
          const px = mod(Math.round(b.x + dx), w);
          const shade = (-dy / R) * 0.65 + (-dx / R) * 0.2 + front * 0.9 - 0.3;
          let i = Math.floor(((shade + 1) / 2) * n + bayer(px, py) * 0.6);
          if (dy * dy + dx * dx > (R - 1) * (R - 1) && dy < 0) i += 1; // liseré lumineux
          if (flat && py >= base + 3) i = 0;
          put(d, w, px, py, tones[clamp(i, 0, n - 1)], alpha);
        }
      }
    });
  });
  return c;
}

// Étoiles sur calque transparent.
function starLayer({ seed, count, colors, big = 0, h = LH }) {
  const r = rngOf(seed);
  return withPixels(LW, h, (d, w) => {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(r() * w), y = Math.floor(r() * h);
      const c = colors[Math.floor(r() * colors.length)];
      const a = 90 + Math.floor(r() * 165);
      put(d, w, x, y, c, a);
      if (r() < big) {
        // Étoile en croix.
        const arm = r() < 0.3 ? 2 : 1;
        for (let k = 1; k <= arm; k++) {
          const ca = Math.round(a * (k === 1 ? 0.6 : 0.3));
          for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) put(d, w, mod(x + dx, w), clamp(y + dy, 0, h - 1), c, ca);
        }
      }
    }
  });
}

// Galaxie spirale lointaine ou planète lointaine, dessinée sur un calque.
function featureLayer({ seed, tones, kind, h = LH }) {
  const r = rngOf(seed);
  const c = canvasOf(LW, h);
  const ctx = c.getContext('2d');
  const cx = Math.floor(80 + r() * 480), cy = Math.floor(20 + r() * 80);
  if (kind === 'galaxy') {
    const rot = r() * Math.PI, tilt = 0.35 + r() * 0.4, size = 10 + r() * 14, arms = r() < 0.5 ? 2 : 3;
    for (let i = 0; i < 700; i++) {
      const arm = i % arms;
      const t = r() * 3.2;
      const a = t * 1.8 + (arm / arms) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const rad = (t / 3.2) * size + r() * 1.5;
      const x = Math.cos(a) * rad, y = Math.sin(a) * rad * tilt;
      const px = cx + x * Math.cos(rot) - y * Math.sin(rot), py = cy + x * Math.sin(rot) + y * Math.cos(rot);
      const k = 1 - t / 3.2;
      ctx.globalAlpha = 0.35 + 0.5 * k;
      ctx.fillStyle = css(tones[clamp(Math.floor(k * tones.length + r()), 0, tones.length - 1)]);
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = css(tones[tones.length - 1]);
    ctx.fillRect(cx - 1, cy, 3, 1);
    ctx.fillRect(cx, cy - 1, 1, 3);
  } else {
    // Planète lointaine : disque à bandes, éclairée d'un côté, parfois des anneaux.
    const R = 5 + Math.floor(r() * 12), ringed = r() < 0.4, lx = r() < 0.5 ? -1 : 1;
    const img = ctx.getImageData(0, 0, LW, h);
    const s = Math.floor(r() * 1e6);
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const d2 = (x * x + y * y) / (R * R);
        if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2);
        const shade = clamp((x / R) * lx * 0.7 + nz * 0.6 - (y / R) * 0.2, 0, 1);
        const band = vnoise(0, (y + R) / 3, 1, s) * 0.35;
        const i = clamp(Math.floor((shade + band) * tones.length * 0.85 + bayer(x, y) * 0.9), 0, tones.length - 1);
        put(img.data, LW, cx + x, cy + y, shade < 0.08 ? [6, 7, 14] : tones[i]);
      }
    }
    ctx.putImageData(img, 0, 0);
    if (ringed) {
      ctx.fillStyle = css(tones[tones.length - 2]);
      for (let x = -R * 2; x <= R * 2; x++) {
        const y = Math.round(x * 0.18);
        if (Math.abs(x) < R && y < 1) continue; // l'anneau passe derrière en haut
        ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }
  return c;
}

// Crêtes montagneuses bouclantes, liseré éclairé sur le dessus.
const RIDGES = ['pics', 'mesas', 'dunes', 'aiguilles', 'cristaux', 'collines'];

function ridgeLayer({ seed, style, base, amp, color, rim, cell = 64, strata = null, h = LH }) {
  const period = LW / cell;
  const heights = new Int16Array(LW);
  const r = rngOf(seed);
  const spikes = [];
  if (style === 'aiguilles' || style === 'cristaux') {
    for (let i = 0; i < 18; i++) spikes.push({ x: Math.floor(r() * LW), w: 3 + Math.floor(r() * (style === 'cristaux' ? 6 : 4)), hgt: 8 + r() * amp * 1.3 });
  }
  for (let x = 0; x < LW; x++) {
    let v;
    if (style === 'pics') v = 1 - Math.abs(2 * fbm(x / cell, 0.5, period, seed, 5) - 1);
    else if (style === 'dunes') v = 0.3 + 0.2 * Math.sin((x / LW) * Math.PI * 6 + fbm(x / cell, 0, period, seed, 2) * 4) + fbm(x / cell, 1, period, seed, 3) * 0.4;
    else if (style === 'mesas') v = Math.round(fbm(x / cell, 0.5, period, seed, 4) * 5) / 5;
    else v = fbm(x / cell, 0.5, period, seed, style === 'collines' ? 3 : 4);
    let y = base - v * amp;
    for (const s of spikes) {
      const dx = Math.min(Math.abs(x - s.x), LW - Math.abs(x - s.x));
      if (dx < s.w) y = Math.min(y, base - amp * 0.3 - s.hgt * (style === 'cristaux' ? 1 - dx / s.w : 1 - (dx / s.w) ** 3));
    }
    heights[x] = Math.round(y);
  }
  return withPixels(LW, h, (d, w) => {
    for (let x = 0; x < w; x++) {
      const top = clamp(heights[x], 0, h);
      const slope = heights[mod(x + 1, w)] - heights[mod(x - 1, w)];
      for (let y = top; y < h; y++) {
        let c = color;
        if (y === top || (y === top + 1 && slope > 0)) c = rim;
        else if (strata && (y - top) % strata < 1 && hash3(x >> 3, y, seed) > 0.3) c = mix(color, [0, 0, 0], 0.18);
        else if (slope < -1 && y < top + 3) c = mix(color, rim, 0.5);
        put(d, w, x, y, c);
      }
    }
  });
}

// ---------- Fonds d'espace ----------

const SPACE_STYLES = ['nuages', 'voiles', 'filaments', 'brume', 'colonnes'];

// Teinte imposée par la région traversée.
const REGION_HUES = { nebula: [290, 340], thargoid: [105, 150], neutron: [190, 225] };

export function spaceRecipe(id, region = null) {
  const r = rngOf(0x5eed + id * 7919);
  const hues = region && REGION_HUES[region];
  const h = hues ? hues[0] + r() * (hues[1] - hues[0]) : r() * 360;
  return {
    id,
    hue: h,
    accent: mod(h + (r() < 0.65 ? (r() < 0.5 ? 1 : -1) * (35 + r() * 35) : 160 + r() * 40), 360),
    sat: 0.25 + r() * 0.4,
    style: SPACE_STYLES[Math.floor(r() * SPACE_STYLES.length)],
    density: (region === 'nebula' ? 0.1 : 0) + 0.12 + r() * 0.16,
    // Bande galactique : position et pente.
    band: { y: 50 + r() * 80, tilt: (r() - 0.5) * 50, width: 30 + r() * 40 },
    feature: r() < 0.3 ? 'galaxy' : r() < 0.55 ? 'planet' : null,
    dust: r() < 0.6,
    seed: Math.floor(r() * 1e6),
  };
}

export function spaceBackground(id, region = null) {
  const R = spaceRecipe(id, region);
  const s = R.seed;
  const neb = ramp(R.hue, R.sat, 6, 0.08, 0.66);
  const acc = ramp(R.accent, R.sat * 0.8, 4, 0.1, 0.48);
  const deep = ramp(R.hue, R.sat * 0.5, 4, 0.015, 0.07);
  const starCols = [[200, 210, 255], [255, 240, 220], [255, 255, 255], hsl(R.accent, 0.5, 0.82)];
  const cover = 1 - R.density;
  // La bande galactique concentre le gaz (sinusoïde pour rester bouclante).
  const band = (x, y) => {
    const cy = R.band.y + Math.sin((x / LW) * Math.PI * 2) * R.band.tilt;
    const k = (y - cy) / R.band.width;
    return Math.exp(-k * k) * 0.22 - 0.1;
  };
  const neb1 = {
    nuages: { cell: 80, stretch: 1, warp: 1.4 },
    voiles: { cell: 96, stretch: 0.4, warp: 1.8 },
    filaments: { cell: 80, stretch: 0.7, warp: 1, ridged: true },
    brume: { cell: 128, stretch: 0.6, warp: 2.2 },
    colonnes: { cell: 64, stretch: 2.2, warp: 1.2 },
  }[R.style];
  const layers = [
    { canvas: gradientLayer([deep[0], deep[1], deep[2], deep[1], deep[0]]), depth: 0.05, drift: 0.4 },
    { canvas: gasLayer({ seed: s + 8, tones: deep.slice(1), cover: 0.35, cell: 160, stretch: 0.5, warp: 2, oct: 3, bias: band, bands: 1 }), depth: 0.06, drift: 0.5 },
    { canvas: starLayer({ seed: s + 1, count: 600, colors: starCols, big: 0 }), depth: 0.1, drift: 0.8 },
    { canvas: gasLayer({ seed: s + 2, tones: [deep[2], deep[3], ...neb], cover, alpha: 240, bias: band, bands: 2.2, halo: 0.08, ...neb1 }), depth: 0.25, drift: 1.6 },
  ];
  if (R.style !== 'brume') {
    layers.push({
      canvas: gasLayer({ seed: s + 3, tones: acc, cover: cover + 0.12, halo: 0.05, bands: 2, cell: neb1.cell / 2, stretch: neb1.stretch, warp: 1.5, ridged: !neb1.ridged, oct: 3, alpha: 200, bias: band }),
      depth: 0.4, drift: 2.6,
    });
  }
  if (R.feature) layers.push({ canvas: featureLayer({ seed: s + 4, tones: R.feature === 'galaxy' ? acc : neb, kind: R.feature }), depth: 0.5, drift: 3.2 });
  layers.push({ canvas: starLayer({ seed: s + 5, count: 150, colors: starCols, big: 0.2 }), depth: 0.7, drift: 4.5 });
  if (R.dust) {
    // Nuages de poussière sombre au premier plan, en silhouette.
    layers.push({
      canvas: gasLayer({ seed: s + 6, tones: [deep[0], deep[1], deep[2]], cover: 0.75, cell: 48, stretch: 0.5, warp: 1.6, oct: 4, alpha: 245,
        bias: (x, y) => (y > 135 ? (y - 135) / 120 : -0.6) }),
      depth: 0.9, drift: 7,
    });
  }
  layers.push({ canvas: starLayer({ seed: s + 7, count: 30, colors: [[255, 255, 255]], big: 0.5 }), depth: 1, drift: 11 });
  return { kind: 'space', recipe: R, layers };
}

// ---------- Environnements planétaires ----------

export function planetRecipe(id) {
  const r = rngOf(0xb0d1 + id * 104729);
  const atmo = r() < 0.5;
  return {
    id,
    atmo,
    hue: r() * 360,
    sat: 0.25 + r() * 0.5,
    light: atmo ? 0.45 + r() * 0.3 : 0,
    ridge: RIDGES[Math.floor(r() * RIDGES.length)],
    clouds: atmo ? (r() < 0.7 ? 'bancs' : 'voiles') : null,
    nebula: !atmo && r() < 0.45,
    strata: r() < 0.4 ? 3 + Math.floor(r() * 4) : null,
    seed: Math.floor(r() * 1e6),
  };
}

// Fonds planétaires : `sky` (ciel, nuages) et `ground` (crêtes) sont séparés pour pouvoir
// poser un ciel des packs fournis devant des crêtes générées.
export function planetBackground(id, bodyType = 'rocky') {
  const R = planetRecipe(id);
  const s = R.seed;
  const pal = (BODY_TYPES[bodyType] || BODY_TYPES.rocky).palette.map(hexRgb);
  const sky = [];
  let horizon;
  if (R.atmo) {
    const t = ramp(R.hue, R.sat, 6, 0.14, R.light + 0.15);
    horizon = t[5];
    sky.push({ canvas: gradientLayer([t[1], t[2], t[3], t[4], t[5], t[5]]), depth: 0.02, drift: 0 });
    const ct = ramp(mod(R.hue + 25, 360), R.sat * 0.6, 5, R.light - 0.08, Math.min(0.96, R.light + 0.42));
    sky.push({
      canvas: gasLayer({ seed: s + 1, tones: ct, cover: 0.6, cell: 112, stretch: 0.3, warp: 1.5, oct: 3, bands: 1, bias: (x, y) => -y / 500 }),
      depth: 0.08, drift: 1.2,
    });
    // Bancs de cumulus : gros et hauts (« bancs ») ou bas et épars (« voiles »).
    const big = R.clouds === 'bancs';
    sky.push({ canvas: bubbleLayer({ seed: s + 2, tones: ct.slice(0, 4), base: big ? 72 : 84, spread: big ? 30 : 14, count: big ? 60 : 30, rMin: big ? 8 : 5, rMax: big ? 24 : 12 }), depth: 0.12, drift: 1.8 });
    sky.push({ canvas: bubbleLayer({ seed: s + 9, tones: ct.slice(1), base: 92, spread: 16, count: big ? 70 : 40, rMin: 5, rMax: 15 }), depth: 0.18, drift: 2.8 });
  } else {
    const deep = ramp(R.hue, 0.3, 4, 0.015, 0.09);
    horizon = mix(pal[0], deep[3], 0.5);
    sky.push({ canvas: gradientLayer([deep[0], deep[0], deep[1], deep[2], deep[3]]), depth: 0.02, drift: 0.2 });
    sky.push({ canvas: starLayer({ seed: s + 3, count: 420, colors: [[210, 220, 255], [255, 240, 220], [255, 255, 255]], big: 0.06 }), depth: 0.04, drift: 0.4 });
    if (R.nebula) {
      const nt = ramp(R.hue, R.sat, 4, 0.07, 0.34);
      sky.push({ canvas: gasLayer({ seed: s + 4, tones: nt, cover: 0.58, cell: 96, stretch: 0.4, warp: 1.8, oct: 3, alpha: 220, bias: (x, y) => -y / 400 }), depth: 0.06, drift: 0.6 });
    }
  }
  // Perspective atmosphérique : les crêtes lointaines se fondent dans l'horizon.
  const haze = R.atmo ? 0.6 : 0.35;
  const ground = [
    { canvas: ridgeLayer({ seed: s + 5, style: R.ridge, base: 122, amp: 34, color: mix(pal[1], horizon, haze), rim: mix(pal[2], horizon, haze * 0.7), cell: 128 }), depth: 0.3, drift: 0 },
    { canvas: ridgeLayer({ seed: s + 6, style: R.ridge, base: 132, amp: 26, color: mix(pal[0], horizon, haze * 0.5), rim: mix(pal[1], horizon, haze * 0.4), cell: 80, strata: R.strata }), depth: 0.55, drift: 0 },
  ];
  return { kind: 'planet', recipe: R, sky, ground, horizon };
}

// ---------- Choix et dessin ----------

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) {
    if (cache.size > 24) cache.delete(cache.keys().next().value);
    cache.set(key, make());
  }
  return cache.get(key);
}

export function spaceBackgroundFor(seed, region) {
  const id = mod(Math.floor(hash3(seed | 0, 17, 3) * 1e9), SPACE_COUNT);
  return cached(`s:${id}:${region || ''}`, () => spaceBackground(id, region));
}

export function planetBackgroundFor(body, atmo) {
  const r = rngOf((body.seed | 0) + 99);
  let id = Math.floor(r() * PLANET_COUNT);
  // On cherche l'environnement le plus proche qui correspond à l'atmosphère du corps.
  for (let k = 0; k < PLANET_COUNT && planetRecipe(id).atmo !== atmo; k++) id = (id + 1) % PLANET_COUNT;
  return cached(`p:${id}:${body.type}`, () => planetBackground(id, body.type));
}

// Dessine des calques bouclants. camX : avancée horizontale de la caméra ; camY : décalage
// vertical (l'atterrissage fait remonter les plans proches plus vite que le ciel).
export function drawLayers(ctx, layers, { t = 0, camX = 0, camY = 0, from = 0, to = layers.length } = {}) {
  for (let i = from; i < to; i++) {
    const l = layers[i];
    const ox = mod(Math.round(camX * l.depth + t * l.drift), LW);
    const y = Math.round(camY * l.depth);
    ctx.drawImage(l.canvas, -ox, y);
    ctx.drawImage(l.canvas, LW - ox, y);
  }
}
