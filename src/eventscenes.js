// Cinématiques des événements : une courte scène animée (≈ 3,5 s, passable) qui montre ce
// que décrit l'événement avant que la carte de choix n'apparaisse, puis reste en fond.
// La scène illustre la situation, jamais l'issue : elle ne dévoile pas le résultat d'un choix.
//
// Même repère que render.js (320×180 logiques, pixel fin = 1/K). Les grandes pièces de décor
// (épave, station, vaisseau générationnel, xénos) sont des formes calculées au pixel fin une
// seule fois, ombrées et cernées comme les sprites, puis recopiées à chaque image.
import { STAR_CLASSES } from './data.js';
import { K, css } from './scenery.js';

export const EVENT_INTRO = 3.6;

const PX = 1 / K;
const snap = (v) => Math.round(v * K) / K;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (k) => 1 - Math.pow(1 - clamp01(k), 3);

function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const OUTLINE = '#141a2b';
const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

// Pièce de décor : fn(x, y) en coordonnées logiques (centre du pixel fin) renvoie une couleur
// '#rrggbb' ou null. Le contour est ajouté automatiquement autour de la forme.
const props = new Map();
function prop(key, w, h, fn) {
  let c = props.get(key);
  if (c) return c;
  const cw = Math.ceil(w * K) + 2, ch = Math.ceil(h * K) + 2;
  c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d');
  const img = g.createImageData(cw, ch);
  const cols = new Array(cw * ch).fill(null);
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) cols[y * cw + x] = fn((x - 1 + 0.5) / K, (y - 1 + 0.5) / K);
  }
  const o = rgb(OUTLINE);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let col = cols[y * cw + x];
      let rgbc = null;
      if (col) rgbc = rgb(col);
      else {
        const n = (dx, dy) => cols[(y + dy) * cw + x + dx];
        const edge = y > 0 && y < ch - 1 && x > 0 && x < cw - 1 && (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1));
        if (edge) rgbc = o;
      }
      if (!rgbc) continue;
      const i = (y * cw + x) * 4;
      img.data[i] = rgbc[0];
      img.data[i + 1] = rgbc[1];
      img.data[i + 2] = rgbc[2];
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  props.set(key, c);
  return c;
}

// Ombrage commun : lumière en haut à gauche, ombres teintées bleu-violet (palette des sprites).
const HULL = ['#f6f2e8', '#d4d8df', '#a4aabd', '#6c7392', '#3d4363', '#262b45'];
const shade = (k, ramp = HULL) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.floor(k * ramp.length)))];

// --- Pièces de décor ---

// Épave d'Anaconda : longue coque en coin, criblée de brèches, nez vers la droite.
function wreckProp() {
  return prop('wreck', 132, 40, (x, y) => {
    const u = x / 132;
    // Profil d'Anaconda : dos plat, pont surélevé à l'arrière, nez en coin, ventre qui remonte.
    const bridge = x > 12 && x < 34 ? (x < 16 ? (x - 12) * 1.2 : x > 30 ? (34 - x) * 1.2 : 5) : 0;
    const top = (x < 96 ? 9 : 9 + ((x - 96) / 36) * 14) - bridge;
    const bot = x < 4 ? 30 : x < 60 ? 33 : 33 - ((x - 60) / 72) * 10;
    if (y < top || y > bot || x < 1) return null;
    if (bridge > 2 && y < top + 2.5 && Math.floor(x * 2) % 3 === 0) return '#2f4d7a'; // baies du pont
    // Brèches : trous ronds et une déchirure en dents de scie.
    const holes = [[34, 18, 4.5], [58, 23, 3.2], [92, 17, 3.8], [46, 27, 2.4]];
    for (const [hx, hy, hr] of holes) {
      const d = Math.hypot(x - hx, (y - hy) * 1.2);
      if (d < hr - 1) return d < hr - 2.2 ? '#090b16' : '#2a1a1a';
      if (d < hr) return '#ff8a3a';
    }
    const tear = 70 + Math.sin(y * 1.7) * 2.5 + (hash(Math.floor(y * 2), 3, 9) - 0.5) * 2;
    if (Math.abs(x - tear) < 1.3) return '#090b16';
    if (Math.abs(x - tear) < 2) return '#4a2a22';
    const v = (y - top) / (bot - top);
    let k = v * 0.95 + (hash(Math.floor(x * 2), Math.floor(y * 2), 4) - 0.5) * 0.12;
    if (Math.floor(x) % 16 === 0) k += 0.18; // lignes de panneaux
    if (v > 0.32 && v < 0.38 && Math.floor(x * 2) % 5 === 0 && u > 0.1 && u < 0.85) return hash(Math.floor(x * 2), 1, 2) > 0.88 ? '#ffe9a8' : '#20283d';
    // Traces de brûlure.
    if (hash(Math.floor(x / 3), Math.floor(y / 3), 7) > 0.86) k += 0.25;
    return shade(clamp01(k * 0.9 + 0.08));
  });
}

// Vaisseau générationnel : un long cylindre cerclé d'anneaux, éteint depuis des siècles.
function generationProp() {
  return prop('generation', 230, 46, (x, y) => {
    const ringAt = x % 38;
    const isRing = ringAt < 5;
    const r = isRing ? 21 : 17;
    const cy = 23;
    const nose = x < 14 ? Math.sqrt(Math.max(0, 1 - Math.pow((14 - x) / 14, 2))) : 1;
    const rr = r * nose;
    if (Math.abs(y - cy) > rr) return null;
    const v = (y - (cy - rr)) / (2 * rr);
    let k = Math.pow(v, 0.8);
    if (isRing) k = k * 0.8 + 0.1;
    if (!isRing && Math.abs(v - 0.42) < 0.03 && Math.floor(x * 2) % 4 === 0) return '#20283d';
    if (hash(Math.floor(x / 4), Math.floor(y / 4), 11) > 0.84) k += 0.15; // rouille
    const ramp = ['#e8dcc8', '#c7b9a2', '#9a8c7c', '#6c6272', '#433d55', '#27243a'];
    return shade(clamp01(k), ramp);
  });
}

// Station de recherche : un anneau à rayons autour d'un moyeu, avec la fente du dock.
function stationProp() {
  return prop('station', 96, 96, (x, y) => {
    const dx = x - 48, dy = y - 48;
    const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const light = clamp01(0.5 - (Math.cos(a + 2.4) * 0.45) * (d / 48));
    if (d > 33 && d < 46) {
      const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24);
      if (Math.abs(d - 39.5) < 0.6 && seg % 2 === 0) return '#ffe9a8';
      return shade(clamp01(light + (d > 43 ? 0.25 : 0) + (seg % 3 === 0 ? 0.08 : 0)));
    }
    for (let i = 0; i < 4; i++) {
      const sa = i * Math.PI / 2 + 0.4;
      const along = dx * Math.cos(sa) + dy * Math.sin(sa);
      const across = -dx * Math.sin(sa) + dy * Math.cos(sa);
      if (along > 10 && along < 34 && Math.abs(across) < 2.2) return shade(clamp01(light + 0.15));
    }
    if (d < 14) {
      if (Math.abs(dy) < 2 && dx > -6 && dx < 6) return '#090b16'; // fente du dock
      return shade(clamp01(light - 0.1 + d / 40));
    }
    return null;
  });
}

// Sonde thargoïde : bulbe organique noir nervuré.
function probeProp() {
  return prop('probe', 30, 34, (x, y) => {
    const dx = (x - 15) / 12, dy = (y - 17) / 15;
    const d = dx * dx + dy * dy * (dy > 0 ? 1.4 : 1);
    if (d > 1) return null;
    const rib = Math.abs(Math.sin(Math.atan2(dy, dx) * 5 + dy * 2));
    if (rib < 0.12) return '#2f4a38';
    return d > 0.7 ? '#0d120f' : rib < 0.3 ? '#1d2a22' : '#151c18';
  });
}

// Interceptor thargoïde : une fleur dont les pétales s'ouvrent (k de 0 à 1, par paliers).
function interceptorProp(step) {
  const k = step / 6;
  return prop(`interceptor:${step}`, 120, 120, (x, y) => {
    const dx = x - 60, dy = y - 60;
    const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d < 12) {
      if (d < 4) return '#4be08a';
      return d < 6 ? '#1f7a44' : '#151c18';
    }
    const spread = 0.25 + k * 0.5;
    const len = 18 + k * 38;
    for (let i = 0; i < 3; i++) {
      const pa = -Math.PI / 2 + i * (Math.PI * 2 / 3);
      let da = a - pa;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const w = spread * Math.sin(Math.PI * clamp01((d - 8) / len)) * 0.8;
      if (d < 8 + len && Math.abs(da) < w) {
        const edge = Math.abs(da) / w;
        if (edge > 0.82) return '#0d120f';
        if (Math.abs(da) < 0.025 * (1 + k)) return k > 0.5 ? '#4be08a' : '#1f7a44';
        return edge > 0.5 ? '#1d2a22' : '#26362b';
      }
    }
    return null;
  });
}

// Capsule de survie : petit cylindre givré avec un hublot.
function podProp() {
  return prop('pod', 22, 13, (x, y) => {
    const dx = (x - 11) / 10.5, dy = (y - 6.5) / 6;
    if (dx * dx + dy * dy * dy * dy > 1) return null;
    if (Math.hypot(x - 15, y - 5.5) < 2.2) return Math.hypot(x - 14.4, y - 4.8) < 0.8 ? '#cdf2ff' : '#2f4d7a';
    if (x > 3 && x < 4.2) return '#ea8a2e';
    const v = (y - 0.5) / 12;
    return shade(clamp01(v * 0.9 + (hash(Math.floor(x * 2), Math.floor(y * 2), 5) > 0.8 ? -0.1 : 0)));
  });
}

// Conteneur dérivant (signal non identifié, vu de loin).
function crateProp() {
  return prop('crate', 10, 7, (x, y) => {
    if (Math.floor(x) % 3 === 0 && y > 1) return '#a14c22';
    return y < 1.5 ? '#ffd36e' : y > 5 ? '#a14c22' : '#ea8a2e';
  });
}

// Obélisque gardien : colonne effilée en pierre bleutée.
function obeliskProp(h) {
  return prop(`obelisk:${h}`, 8, h, (x, y) => {
    const half = 2.2 + (y / h) * 1.6;
    if (Math.abs(x - 4) > half) return null;
    if (y < 2 && Math.abs(x - 4) > half - (2 - y)) return null;
    const k = clamp01((x - 4 + half) / (2 * half));
    return ['#7f8ca8', '#5b6680', '#3e475e', '#2a3044'][Math.min(3, Math.floor(k * 4))];
  });
}

// Structure centrale gardienne : pyramide à degrés.
function guardianCoreProp() {
  return prop('gcore', 48, 26, (x, y) => {
    const step = Math.floor(y / 6.5);
    const half = 10 + step * 4.5;
    if (Math.abs(x - 24) > half) return null;
    if (Math.abs(y % 6.5) < 0.6) return '#2a3044';
    return x < 24 ? '#6a7690' : '#3e475e';
  });
}

// Flèche thargoïde : épine noire et courbe.
function spireProp(h, seed) {
  return prop(`spire:${h}:${seed}`, 14, h, (x, y) => {
    const v = y / h;
    const cx = 7 + Math.sin(v * 3 + seed) * 3 * (1 - v);
    const half = 0.6 + v * 3.2;
    if (Math.abs(x - cx) > half) return null;
    return Math.abs(x - cx) < half * 0.35 && Math.floor(y) % 5 === 0 ? '#1f7a44' : x < cx ? '#1d2a22' : '#0d120f';
  });
}

// ---------------------------------------------------------------------------

export function createEventScenes(R) {
  const { ctx, W, H } = R;
  const put = (c, x, y) => ctx.drawImage(c, snap(x) - PX, snap(y) - PX, c.width / K, c.height / K);

  // Fond spatial du système, caméra qui glisse lentement.
  function spaceBackdrop(view, t, st, { star = true } = {}) {
    const sys = view.state.system;
    R.drawSpace(R.systemSpace(sys), t, { camX: st * 8 + Math.sin(t * 0.05) * 20, camY: Math.sin(t * 0.04) * 8, deco: false, rocks: true });
    if (star) R.drawStar(sys.star, -STAR_CLASSES[sys.star].radius * 0.4, 70, t);
    // Voile sombre : le décor recule, l'objet de l'événement ressort.
    ctx.fillStyle = 'rgba(4, 4, 18, 0.42)';
    ctx.fillRect(0, 0, W, H);
  }

  // Le vaisseau entre par la gauche et se stabilise ; renvoie sa position.
  function shipIn(st, t, { x = 34, y = 104, thrust = true } = {}) {
    const k = easeOut(st / 1.4);
    const sx = -80 + (x + 80) * k;
    const sy = y + Math.round(Math.sin(t * 1.6) * 1.5);
    if (k < 1) {
      for (let i = 0; i < 10; i++) {
        ctx.globalAlpha = (1 - k) * (0.5 - i * 0.04);
        ctx.fillStyle = i % 3 ? '#8a9cff' : '#ffffff';
        ctx.fillRect(sx - (1 - k) * (30 + i * 4), sy + 4 + (i % 5) * 2, (1 - k) * (30 + i * 4), PX);
      }
      ctx.globalAlpha = 1;
    }
    R.drawShip(sx, sy, t, { thrust: thrust ? (k < 1 ? 1 : 0.5) : 0 });
    return { x: sx, y: sy };
  }

  function pulseRings(x, y, st, color, { period = 1.1, max = 34, n = 3 } = {}) {
    for (let i = 0; i < n; i++) {
      const p = ((st / period + i / n) % 1);
      ctx.globalAlpha = (1 - p) * 0.8;
      R.ring(ctx, x, y, 2 + p * max, color);
    }
    ctx.globalAlpha = 1;
  }

  // Faisceau de scanner pointillé du vaisseau vers une cible.
  function scanBeam(ax, ay, bx, by, st) {
    const steps = 90;
    for (let i = 0; i < steps; i++) {
      const k = i / steps;
      const p = ((i + Math.floor(st * 50)) % 9) / 9;
      ctx.globalAlpha = 0.25 + 0.5 * p;
      ctx.fillStyle = p > 0.8 ? '#ffffff' : '#8fe4ff';
      ctx.fillRect(snap(ax + (bx - ax) * k), snap(ay + (by - ay) * k), PX, PX);
    }
    ctx.globalAlpha = 1;
  }

  function flash(color, a) {
    if (a <= 0) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // Bandes de parasites (HUD perturbé).
  function glitch(st, strength, color = '#4be08a') {
    for (let i = 0; i < 6; i++) {
      if (hash(i, Math.floor(st * 14), 3) > strength) continue;
      const y = hash(i, Math.floor(st * 14), 4) * H;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = color;
      ctx.fillRect(0, snap(y), W, PX * (1 + (i % 3)));
    }
    ctx.globalAlpha = 1;
  }

  // Tunnel hyperspatial à vitesse constante (événements pendant un saut).
  function tunnel(t, st, { calm = 0 } = {}) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, W, H);
    const scroll = t * 160;
    for (let x = 0; x < W; x += PX) {
      const wob = Math.sin((x + scroll) * 0.045) * 6 + Math.sin((x + scroll * 1.3) * 0.11) * 3;
      const top = snap(34 + wob), bot = snap(H - 34 - wob);
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = (0.32 - i * 0.05) * (1 - calm);
        ctx.fillStyle = i === 0 ? '#b8c4ff' : i < 3 ? '#8a9cff' : '#3a4ac0';
        ctx.fillRect(x, top - i * 1.5, PX, PX);
        ctx.fillRect(x, bot + i * 1.5, PX, PX);
      }
    }
    for (let i = 0; i < 110; i++) {
      const y = Math.round(hash(i, 1, 21) * H);
      const speed = 0.5 + hash(i, 2, 21);
      const len = Math.round(6 + speed * 30);
      const span = W + len + 20;
      const x = snap(W - ((hash(i, 3, 21) + t * speed * 1.4) % 1) * span);
      ctx.globalAlpha = (0.3 + 0.4 * (speed - 0.5)) * (1 - calm);
      ctx.fillStyle = i % 3 === 0 ? '#ffffff' : '#8a9cff';
      ctx.fillRect(x, y, len, PX);
    }
    ctx.globalAlpha = 1;
  }

  // Débris qui dérivent autour d'une épave.
  function debrisField(cx, cy, t, n = 26, spread = 70, color = '#6c7392') {
    for (let i = 0; i < n; i++) {
      const a = hash(i, 1, 31) * 6.28, r = 10 + hash(i, 2, 31) * spread;
      const x = cx + Math.cos(a + t * 0.02 * (i % 3 + 1)) * r;
      const y = cy + Math.sin(a + t * 0.02 * (i % 3 + 1)) * r * 0.5;
      ctx.fillStyle = i % 4 === 0 ? '#a4aabd' : color;
      const s = i % 5 === 0 ? 2 : 1;
      ctx.fillRect(snap(x), snap(y), s * PX * (i % 2 ? 2 : 1), s * PX);
    }
  }

  function sparks(x, y, st, n = 6, color = '#ffd27a') {
    for (let i = 0; i < n; i++) {
      const p = (st * 1.8 + hash(i, 1, 41)) % 1;
      const a = hash(i, 2, 41) * 6.28;
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = p < 0.3 ? '#ffffff' : color;
      ctx.fillRect(snap(x + Math.cos(a) * p * 8), snap(y + Math.sin(a) * p * 8 + p * p * 3), PX, PX);
    }
    ctx.globalAlpha = 1;
  }

  // --- Scènes dans l'espace ---

  const SPACE = {
    signal(view, t, st) {
      spaceBackdrop(view, t, st);
      const ship = shipIn(st, t);
      // Un point lumineux qui hésite, entouré de parasites ; quelques formes à peine visibles.
      const sx = 222, sy = 72;
      const on = st > 0.9;
      if (on) {
        pulseRings(sx, sy, st, '#bfe4ff', { max: 26 });
        const flick = hash(Math.floor(st * 12), 1, 5) > 0.25 ? 1 : 0.3;
        R.halo(ctx, sx, sy, 2, 14, '#9fd8ff', 0.6 * flick);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(snap(sx) - 1, snap(sy), 3, 1);
        ctx.fillRect(snap(sx), snap(sy) - 1, 1, 3);
        for (let i = 0; i < 18; i++) {
          ctx.globalAlpha = 0.5 * hash(i, Math.floor(st * 10), 6);
          ctx.fillStyle = '#9fd8ff';
          ctx.fillRect(snap(sx - 14 + hash(i, 7, Math.floor(st * 10)) * 28), snap(sy - 10 + hash(i, 8, Math.floor(st * 10)) * 20), PX, PX);
        }
        ctx.globalAlpha = 1;
      }
      if (st > 1.8) {
        ctx.globalAlpha = clamp01((st - 1.8) / 1.2) * 0.8;
        put(crateProp(), sx + 18 + Math.sin(t * 0.7) * 2, sy + 12);
        put(crateProp(), sx - 26, sy - 14 + Math.sin(t * 0.5 + 1) * 2);
        ctx.globalAlpha = 1;
        scanBeam(ship.x + 60, ship.y + 8, sx, sy, st);
      }
    },
    distress(view, t, st) {
      spaceBackdrop(view, t, st);
      shipIn(st, t);
      // Vaisseau en panne : il dérive, feux éteints, balise rouge.
      const dx = 214 + Math.sin(t * 0.3) * 3, dy = 70 + Math.sin(t * 0.4) * 2;
      R.drawShip(dx, dy, t, { small: true, flip: true, npc: true });
      const blink = Math.floor(st * 2.5) % 2 === 0;
      if (blink) {
        R.halo(ctx, dx + 15, dy - 1, 0.5, 7, '#ff5a5a', 0.6);
        ctx.fillStyle = '#ff8a8a';
        ctx.fillRect(snap(dx + 15), snap(dy - 1), 1, 1);
      }
      if (st > 0.6) pulseRings(dx + 15, dy + 4, st, '#ff6b81', { period: 1.4, max: 40 });
    },
    wreck(view, t, st) {
      spaceBackdrop(view, t, st);
      const wx = 150 - st * 2, wy = 42 + Math.sin(t * 0.3) * 2;
      debrisField(wx + 66, wy + 20, t, 34, 80);
      put(wreckProp(), wx, wy);
      // Brèches encore incandescentes.
      sparks(wx + 34, wy + 18, st);
      sparks(wx + 92, wy + 17, st + 0.4, 4);
      if (Math.floor(st * 3) % 2) R.halo(ctx, wx + 58, wy + 23, 1, 5, '#ff8a3a', 0.45);
      shipIn(st, t, { y: 112 });
    },
    anomaly(view, t, st) {
      spaceBackdrop(view, t, st);
      shipIn(st, t);
      // Nuage de particules en tourbillon, avec des décharges.
      const cx = 214, cy = 78;
      const grow = easeOut(st / 2);
      for (let i = 0; i < 260; i++) {
        const a = hash(i, 1, 51) * 6.28 + t * (0.2 + hash(i, 2, 51) * 0.3);
        const r = Math.pow(hash(i, 3, 51), 0.7) * 60 * grow;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.55;
        const tw = 0.5 + 0.5 * Math.sin(t * 4 + i);
        ctx.globalAlpha = 0.45 + 0.55 * tw;
        ctx.fillStyle = i % 5 === 0 ? '#ffffff' : i % 3 === 0 ? '#ff9ad8' : i % 2 ? '#ffd36e' : '#9fe4ff';
        const sz = i % 7 === 0 ? 1 : PX * 1.5;
        ctx.fillRect(snap(x), snap(y), sz, sz);
      }
      ctx.globalAlpha = 1;
      R.halo(ctx, cx, cy, 4, 40 * grow + 4, '#ff9ad8', 0.22);
      const bolt = Math.floor(st * 4);
      if (st > 1.2 && hash(bolt, 1, 52) > 0.45) {
        let x = cx - 30 + hash(bolt, 2, 52) * 60, y = cy - 20;
        ctx.fillStyle = '#e6f8ff';
        for (let i = 0; i < 22; i++) {
          x += (hash(bolt, i, 53) - 0.5) * 3;
          y += 1.6;
          ctx.fillRect(snap(x), snap(y), PX, PX * 3);
        }
      }
    },
    generation(view, t, st) {
      spaceBackdrop(view, t, st);
      // La caméra longe la coque immense.
      const gx = 300 - easeOut(st / 3.2) * 190, gy = 24;
      put(generationProp(), gx, gy);
      // Une seule balise vit encore.
      if (Math.floor(st * 1.5) % 2 === 0) {
        R.halo(ctx, gx + 61, gy + 3, 0.5, 6, '#ffd27a', 0.6);
        ctx.fillStyle = '#fff1c0';
        ctx.fillRect(snap(gx + 61), snap(gy + 3), 1, 1);
      }
      shipIn(st, t, { y: 118 });
    },
    megaship(view, t, st) {
      spaceBackdrop(view, t, st);
      const mx = 176 + Math.sin(t * 0.2) * 2, my = 8;
      put(stationProp(), mx, my);
      // Le dock clignote en vert : il répond encore.
      if (Math.floor(st * 2) % 2 === 0) {
        R.halo(ctx, mx + 48, my + 48, 1, 8, '#7df0b4', 0.55);
        ctx.fillStyle = '#7df0b4';
        ctx.fillRect(snap(mx + 43), snap(my + 46), 10, PX);
      }
      shipIn(st, t, { y: 112 });
    },
    flare(view, t, st) {
      const sys = view.state.system;
      R.drawSpace(R.systemSpace(sys), t, { camX: st * 8, deco: false, rocks: false });
      const s = STAR_CLASSES[sys.star];
      const sx = 40, sy = 90;
      const swell = 1 + 0.08 * Math.sin(t * 9) * clamp01(st);
      R.halo(ctx, sx, sy, s.radius, s.radius * 3 * swell + 20, s.glow, 0.5);
      R.drawStar(sys.star, sx, sy, t);
      // Éjection de masse coronale : un front de plasma qui avance vers le vaisseau.
      const k = clamp01((st - 0.6) / 2.6);
      if (k > 0) {
        const fr = s.radius + k * 230;
        for (let i = 0; i < 220; i++) {
          const a = -0.9 + (i / 220) * 1.8;
          const jitter = hash(i, Math.floor(st * 8), 61) * 10;
          const r = fr - jitter;
          ctx.globalAlpha = 0.85 - jitter / 14;
          ctx.fillStyle = jitter < 3 ? '#fff1c0' : jitter < 6 ? '#ffb054' : '#ff6a2a';
          ctx.fillRect(snap(sx + Math.cos(a) * r), snap(sy + Math.sin(a) * r), PX * 2, PX * 2);
        }
        ctx.globalAlpha = 1;
      }
      const shake = st > 3 ? Math.sin(st * 60) * 1.5 : 0;
      const k2 = easeOut(st / 1.2);
      R.drawShip(320 - k2 * 90, 70 + shake, t, { flip: true, thrust: 0.6, npc: true });
      flash('#fff1c0', (st - 3.2) * 2);
    },
    thargoidProbe(view, t, st) {
      spaceBackdrop(view, t, st);
      shipIn(st, t);
      const px = 206, py = 58 + Math.sin(t * 0.8) * 3;
      put(probeProp(), px, py);
      // Le chant : anneaux verts et nervures qui s'allument.
      for (let i = 0; i < 5; i++) {
        const on = (Math.sin(t * 3 + i * 1.3) + 1) / 2;
        ctx.globalAlpha = 0.4 + 0.6 * on;
        ctx.fillStyle = '#4be08a';
        ctx.fillRect(snap(px + 9 + i * 3), snap(py + 12 + (i % 2) * 6), PX * 2, PX * 2);
      }
      ctx.globalAlpha = 1;
      if (st > 0.8) pulseRings(px + 15, py + 17, st, '#4be08a', { period: 0.9, max: 50 });
      glitch(st, 0.25 * clamp01(st - 1));
    },
    derelict(view, t, st) {
      spaceBackdrop(view, t, st);
      shipIn(st, t, { x: 20, y: 120 });
      // Le vaisseau abandonné, moteurs coupés, face à nous.
      const dx = 196 + Math.sin(t * 0.25) * 2, dy = 56 + Math.sin(t * 0.35) * 2;
      R.drawShip(dx, dy, t, { flip: true, model: view.state?.derelict || null, npc: true });
      if (st > 1.2) {
        // Les feux de position répondent encore, faiblement.
        if (Math.floor(st * 1.5) % 2) R.halo(ctx, dx + 4, dy + 11, 0.5, 5, '#7df0b4', 0.5);
        R.halo(ctx, dx + 52, dy + 9, 1, 8, '#cdf2ff', 0.18 + 0.1 * Math.sin(t * 2));
      }
    },
    escapePod(view, t, st) {
      spaceBackdrop(view, t, st);
      shipIn(st, t);
      const px = 214 + Math.sin(t * 0.4) * 4, py = 72 + Math.sin(t * 0.6) * 3;
      put(podProp(), px, py);
      // Givre scintillant et balise presque éteinte.
      for (let i = 0; i < 8; i++) {
        ctx.globalAlpha = 0.3 + 0.5 * ((Math.sin(t * 3 + i * 2) + 1) / 2);
        ctx.fillStyle = '#e6f4ff';
        ctx.fillRect(snap(px + 2 + hash(i, 1, 71) * 18), snap(py + 1 + hash(i, 2, 71) * 11), PX, PX);
      }
      ctx.globalAlpha = 1;
      if (hash(Math.floor(st * 3), 1, 72) > 0.55) {
        R.halo(ctx, px + 2, py + 6, 0.5, 5, '#ff6b81', 0.5);
        ctx.fillStyle = '#ff8a8a';
        ctx.fillRect(snap(px + 1), snap(py + 6), PX * 2, PX * 2);
      }
      if (st > 1.6) scanBeam(110, 112, px + 6, py + 6, st);
    },
    tankLeak(view, t, st) {
      spaceBackdrop(view, t, st, { star: false });
      const sx = 120, sy = 82 + Math.sin(t * 1.6);
      // La micro-météorite.
      if (st < 0.5) {
        const k = st / 0.5;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 12; i++) ctx.fillRect(snap(320 - k * 180 + i * 2), snap(10 + k * 76 - i * 0.8), PX * 2, PX);
      }
      flash('#ffffff', (0.65 - st) * 3);
      R.drawShip(sx, sy, t, { thrust: 0.4 });
      // Le carburant s'échappe en un nuage cristallin.
      if (st > 0.45) {
        const n = Math.min(160, Math.floor((st - 0.45) * 70));
        for (let i = 0; i < n; i++) {
          const age = ((st - 0.45) - i / 70);
          const a = -2.4 + hash(i, 1, 81) * 0.9;
          const v = 10 + hash(i, 2, 81) * 18;
          const x = sx + 22 + Math.cos(a) * v * age, y = sy + 4 + Math.sin(a) * v * age * 0.6;
          ctx.globalAlpha = clamp01(1 - age / 3) * (0.5 + 0.5 * Math.sin(t * 6 + i));
          ctx.fillStyle = i % 4 === 0 ? '#ffffff' : '#9fe4ff';
          ctx.fillRect(snap(x), snap(y), PX, PX);
        }
        ctx.globalAlpha = 1;
      }
    },
    fuelRats(view, t, st) {
      spaceBackdrop(view, t, st);
      // Le vaisseau dérive, moteurs éteints ; puis des feux approchent au loin.
      const sx = 60, sy = 96 + Math.sin(t * 0.6) * 2;
      R.drawShip(sx, sy, t, { thrust: 0 });
      if (Math.floor(st * 2) % 2 === 0) R.halo(ctx, sx + 30, sy - 2, 0.5, 6, '#ffb054', 0.5);
      if (st > 1.4) pulseRings(sx + 30, sy + 8, st, '#ffb054', { period: 1.6, max: 46, n: 2 });
      if (st > 2) {
        const k = easeOut((st - 2) / 1.6);
        R.drawShip(330 - k * 90, 40 + k * 20, t, { small: true, flip: true, thrust: 1, npc: true });
      }
    },
  };

  // --- Scènes en hyperespace ---

  const HYPER = {
    hyperdiction(view, t, st) {
      const tear = clamp01((st - 0.7) / 0.5);
      if (st < 1.2) {
        tunnel(t, st);
        glitch(st, tear * 0.9, '#ffffff');
        R.drawShip(90 + Math.sin(st * 37) * tear * 2, H / 2 - 10, t, { thrust: 1 });
        flash('#ffffff', (st - 0.9) * 3);
        return;
      }
      // Arraché du saut : espace noir, brume verte, une fleur gigantesque se déploie.
      ctx.fillStyle = '#030806';
      ctx.fillRect(0, 0, W, H);
      R.halo(ctx, 230, 80, 10, 130, '#1f7a44', 0.25);
      for (let i = 0; i < 60; i++) {
        ctx.globalAlpha = 0.25 + 0.35 * hash(i, 3, 91);
        ctx.fillStyle = '#4be08a';
        ctx.fillRect(snap((hash(i, 1, 91) * W + t * 4) % W), snap(hash(i, 2, 91) * H), PX, PX);
      }
      ctx.globalAlpha = 1;
      const k = clamp01((st - 1.3) / 1.8);
      put(interceptorProp(Math.round(k * 6)), 170, 20);
      const core = 0.5 + 0.5 * Math.sin(t * 5);
      R.halo(ctx, 230, 80, 2, 10 + core * 6, '#4be08a', 0.5);
      R.drawShip(50 + Math.sin(st * 20) * 0.5, 104, t, { thrust: 0 });
      glitch(st, 0.3);
      flash('#ffffff', (1.5 - st) * 3);
    },
    fsdOverheat(view, t, st) {
      tunnel(t, st);
      const heat = clamp01(st / 2.4);
      const sx = 100 + Math.sin(st * 41) * heat * 1.5, sy = H / 2 - 10;
      R.halo(ctx, sx + 20, sy + 12, 4, 18 + heat * 16, '#ff6a2a', 0.2 + heat * 0.4);
      R.drawShip(sx, sy, t, { thrust: 1 });
      sparks(sx + 14, sy + 14, st, Math.round(heat * 10), '#ff8a3a');
      // Alarme : vignette rouge qui clignote.
      if (st > 0.8 && Math.floor(st * 3) % 2 === 0) {
        for (let i = 0; i < 10; i++) {
          ctx.globalAlpha = 0.28 * (1 - i / 10);
          ctx.fillStyle = '#ff3a4a';
          ctx.fillRect(0, i * 2, W, 2);
          ctx.fillRect(0, H - (i + 1) * 2, W, 2);
        }
        ctx.globalAlpha = 1;
      }
    },
  };

  // --- Scènes au sol ---

  // Le commandant descend du vaisseau et marche vers la découverte (x cible).
  function surfaceBase(view, t, st, target) {
    const { near, P } = R.surfaceBackdrop(view.body, t);
    const landedY = R.landedYFor(near);
    R.drawShip(R.SHIP_LAND_X, landedY, t, { gear: 1 });
    const ramp = R.drawRamp(landedY, near[R.SHIP_LAND_X + Math.round(R.SHIP_W / 2)], 1);
    const g = (x) => near[Math.max(0, Math.min(W - 1, Math.round(x)))];
    return { near, P, g, ramp, walk: () => {
      const start = ramp.ex + 20;
      const k = easeOut(st / 2.6);
      const ax = start + (target - start) * k;
      const moving = k < 0.98;
      R.drawAstro(ax, g(ax + R.ASTRO_W / 2) - R.ASTRO_H, t, moving ? 'walk' : 'scan', false);
    } };
  }

  const SURFACE = {
    crash(view, t, st) {
      const b = surfaceBase(view, t, st, 168);
      const x = 206, y = b.g(240);
      ctx.save();
      ctx.translate(x + 32, y - 6);
      ctx.rotate(0.28);
      R.drawShip(-32, -10, t, { flip: true, npc: true });
      ctx.restore();
      // Bourrelet du cratère par-dessus la coque enfoncée.
      ctx.fillStyle = css(b.P.dust);
      for (let i = 0; i < 60; i++) ctx.fillRect(snap(x - 6 + i), snap(b.g(x - 6 + i) - 1 - Math.sin((i / 60) * Math.PI) * 3), PX * 2, 4);
      for (let i = 0; i < 12; i++) {
        const p = (t * 0.4 + i / 12) % 1;
        ctx.globalAlpha = 0.35 * (1 - p);
        ctx.fillStyle = '#6a6a7a';
        ctx.fillRect(snap(x + 40 + Math.sin(t + i) * 3 + p * 6), snap(y - 12 - p * 40), 2 + p * 2, 2 + p * 2);
      }
      ctx.globalAlpha = 1;
      if (Math.floor(st * 2) % 2) R.halo(ctx, x + 20, y - 14, 0.5, 5, '#ff5a5a', 0.6);
      b.walk();
      R.surfaceParticles(b.P, t);
    },
    guardian(view, t, st) {
      const b = surfaceBase(view, t, st, 160);
      const core = guardianCoreProp();
      put(core, 236, b.g(260) - 24);
      const hs = [26, 34, 30, 22];
      for (let i = 0; i < 4; i++) {
        const x = 188 + i * 32 - (i > 1 ? 0 : 0), h = hs[i];
        put(obeliskProp(h), x, b.g(x + 4) - h + 1);
        // Les glyphes s'allument un à un.
        const on = clamp01((st - 0.8 - i * 0.45) / 0.3);
        if (on > 0) {
          ctx.globalAlpha = on * (0.7 + 0.3 * Math.sin(t * 3 + i));
          ctx.fillStyle = '#5affd8';
          for (let j = 0; j < 3; j++) ctx.fillRect(snap(x + 3), snap(b.g(x + 4) - h + 6 + j * 6), 2, PX * 2);
          R.halo(ctx, x + 4, b.g(x + 4) - h / 2, 1, 8, '#5affd8', 0.25 * on);
          ctx.globalAlpha = 1;
        }
      }
      // La sentinelle dort : un œil qui s'entrouvre.
      const sx = 290, sy = b.g(290) - 5;
      ctx.fillStyle = '#2a3044';
      ctx.fillRect(sx - 5, sy, 11, 5);
      ctx.fillRect(sx - 3, sy - 2, 7, 2);
      ctx.fillStyle = st > 2.6 && Math.sin(t * 2) > 0 ? '#5aa8ff' : '#1a2a44';
      ctx.fillRect(sx - 1, sy + 1, 3, 1);
      b.walk();
      R.surfaceParticles(b.P, t);
    },
    thargoid(view, t, st) {
      const b = surfaceBase(view, t, st, 162);
      for (let i = 0; i < 6; i++) {
        const x = 190 + i * 20, h = 22 + ((i * 11) % 18);
        put(spireProp(h, i), x, b.g(x + 7) - h + 1);
        ctx.fillStyle = Math.sin(t * 3 + i) > 0 ? '#4be08a' : '#1f7a44';
        ctx.fillRect(snap(x + 7), snap(b.g(x + 7) - h + 2), PX * 2, PX * 2);
      }
      // Brume caustique qui ondule au ras du sol.
      for (let i = 0; i < 140; i++) {
        const x = 170 + hash(i, 1, 101) * 150 + Math.sin(t * 0.8 + i) * 4;
        const y = b.g(x) - 2 - hash(i, 2, 101) * 22;
        ctx.globalAlpha = 0.18 + 0.2 * Math.sin(t * 2 + i);
        ctx.fillStyle = '#4be08a';
        ctx.fillRect(snap(x), snap(y), 2, 1);
      }
      ctx.globalAlpha = 1;
      b.walk();
      R.surfaceParticles(b.P, t);
    },
    geo(view, t, st) {
      const b = surfaceBase(view, t, st, 170);
      for (const [x, ph] of [[214, 0], [256, 1.1], [292, 2.2]]) {
        const y = b.g(x);
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(x - 4, y - 2, 9, 2);
        ctx.fillStyle = '#4a4a5e';
        ctx.fillRect(x - 3, y - 3, 7, 1);
        const p = ((t * 0.6 + ph) % 2.4);
        if (p < 1.5) {
          const hgt = Math.sin((p / 1.5) * Math.PI) * 60;
          for (let i = 0; i < 70; i++) {
            const k = i / 70;
            ctx.globalAlpha = (1 - k) * 0.9;
            ctx.fillStyle = i % 3 ? '#e6f4ff' : '#a8d0f0';
            ctx.fillRect(snap(x + Math.sin(i * 1.7 + t * 9) * k * 6), snap(y - 3 - k * hgt), PX * 2, PX * 2);
          }
          ctx.globalAlpha = 1;
        }
      }
      b.walk();
      R.surfaceParticles(b.P, t);
    },
  };

  return {
    has: (id) => !!(SPACE[id] || HYPER[id] || SURFACE[id]),
    draw(view, t) {
      const id = view.eventId;
      // Une fois la carte affichée, la scène se fige sur sa fin (seule l'animation continue).
      const st = view.eventReady ? Math.min(view.sceneTime, 2.9) : view.sceneTime;
      const fn = SURFACE[id] || HYPER[id] || SPACE[id];
      if (SURFACE[id] && !view.body) return SPACE.signal(view, t, st);
      // Quand le dialogue s'affiche en bas de la scène, la caméra descend un peu : l'action
      // remonte au-dessus du texte (davantage au sol, où tout se passe près de l'horizon).
      const lift = view.eventReady && view.dialogBottom ? (SURFACE[id] ? 46 : 30) * easeOut((view.sceneTime - view.eventReadyAt) / 0.6) : 0;
      if (lift) {
        ctx.save();
        ctx.translate(0, -snap(lift));
      }
      fn(view, t, st);
      if (lift) {
        ctx.restore();
        ctx.fillStyle = '#02030a';
        ctx.fillRect(0, H - snap(lift), W, snap(lift) + 1);
      }
      // Bandeaux de cinéma pendant l'introduction.
      const bars = view.eventReady ? Math.max(0, 1 - (view.sceneTime - view.eventReadyAt) * 3) : easeOut(st / 0.5);
      if (bars > 0) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, W, snap(16 * bars));
        ctx.fillRect(0, H - snap(16 * bars), W, snap(16 * bars));
      }
      // Fondu d'ouverture.
      flash('#02030a', 1 - st / 0.35);
    },
  };
}
