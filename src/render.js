// Rendu pixel art dans un repère logique 320×180 : titre, système, saut, atterrissage, surface, fin.
// L'image est calculée à K× (640×360) : décors, planètes et sprites ont un pixel deux fois plus
// fin, puis elle est agrandie à la taille de l'écran (pixels entiers, puis lissage léger).
// Les décors viennent de scenery.js (nébuleuses, panoramas) ; planètes, étoiles et astéroïdes
// sont animés par le portage WebGL de Pixel Planets (pixelplanets.js).
import { STAR_CLASSES, BODY_TYPES } from './data.js';
import * as S from './sprites.js';
import { Rng, hashMix } from './rng.js';
import {
  NW, NH, THEMES, spaceRecipe, buildNebula, sparkles, themeColors, panoramaRecipe, buildPanorama,
  panoramaIdFor, spaceIdFor, drawLayers, cached, rngOf, hexRgb, mix, css, K,
} from './scenery.js';
import { createEventScenes } from './eventscenes.js';
import { createPixelPlanets, makeSpec, specForBody, specForStar, specForDestination } from './pixelplanets.js';

export const W = 320;
export const H = 180;
// Un pixel fin (réel) dans le repère logique.
const PX = 1 / K;
const snap = (v) => Math.round(v * K) / K;

export const LANDING_DURATION = 7.6;
export const TAKEOFF_DURATION = 2.4;
export const JUMP_DURATION = 1.8;
export const ARRIVAL_DURATION = 1.4;

// Dimensions du vaisseau et du commandant (fournies par sprites.js, valeurs de secours sinon).
const SHIP_W = S.SHIP_W ?? 52;
const SHIP_H = S.SHIP_H ?? 16;
const GEAR_H = S.SHIP_GEAR_H ?? 4;
const SMALL_W = S.SHIP_SMALL_W ?? 26;
const SMALL_H = S.SHIP_SMALL_H ?? 8;
const HATCH0 = S.SHIP_HATCH ?? { x: Math.round(SHIP_W * 0.55), y: SHIP_H - 1 };
const ASTRO_W = S.ASTRO_W ?? 6;
const ASTRO_H = S.ASTRO_H ?? 9;

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => v / 16 - 0.5));

function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}

function fbm(x, y, seed) {
  return valueNoise(x, y, seed) * 0.6 + valueNoise(x * 2.1, y * 2.1, seed + 7) * 0.3 + valueNoise(x * 4.3, y * 4.3, seed + 13) * 0.1;
}

// Disque plein, tracé au pixel fin.
function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  const R = Math.round(r * K), X = Math.round(cx * K), Y = Math.round(cy * K);
  for (let dy = -R; dy <= R; dy++) {
    const w = Math.floor(Math.sqrt(R * R - dy * dy));
    ctx.fillRect((X - w) / K, (Y + dy) / K, (2 * w + 1) / K, PX);
  }
}

// Cercle d'un pixel fin (sélection, vague de scan).
function ring(ctx, cx, cy, r, color, thick = 1) {
  ctx.fillStyle = color;
  const R = r * K;
  const steps = Math.max(24, Math.floor(R * 6));
  const X = Math.round(cx * K), Y = Math.round(cy * K);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.fillRect(Math.round(X + Math.cos(a) * R) / K, Math.round(Y + Math.sin(a) * R) / K, thick / K, thick / K);
  }
}

const rgbOf = (c) => (typeof c === 'string' && c[0] === '#' ? hexRgb(c) : [255, 255, 255]);

// Halo lumineux : dégradé radial doux, quantifié et finement tramé (pas de bandes visibles).
const glows = new Map();
function glowCanvas(r0, r1, color, alpha) {
  const key = `${r0}|${r1}|${color}|${alpha}`;
  let c = glows.get(key);
  if (c) return c;
  if (glows.size > 60) glows.clear();
  const R = Math.ceil(r1 * K);
  const size = R * 2 + 1;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const [cr, cg, cb] = rgbOf(color);
  const peak = Math.min(1, alpha * 1.15);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - R, y - R) / K;
      if (d > r1) continue;
      const k = d <= r0 ? 1 : 1 - (d - r0) / (r1 - r0);
      const a = peak * k * k * (0.6 + 0.4 * k);
      const q = Math.max(0, Math.round(a * 32 + BAYER[y & 3][x & 3] * 0.9) / 32);
      if (q <= 0) continue;
      const o = (y * size + x) * 4;
      img.data[o] = cr;
      img.data[o + 1] = cg;
      img.data[o + 2] = cb;
      img.data[o + 3] = Math.round(Math.min(1, q) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  glows.set(key, c);
  return c;
}

function halo(ctx, cx, cy, r0, r1, color, alpha = 0.35) {
  const g = glowCanvas(Math.round(r0 * 2) / 2, Math.round(r1 * 2) / 2, color, alpha);
  const s = g.width / K;
  ctx.drawImage(g, snap(cx) - s / 2 + PX / 2, snap(cy) - s / 2 + PX / 2, s, s);
}

// Texte des repères (numéros des corps…) : la police pixel de l'interface, ombrée.
function label(ctx, text, x, y, color, size = 7) {
  ctx.font = `600 ${size}px DotGothic16, "Pixelify Sans", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(4, 4, 20, 0.75)';
  ctx.fillText(String(text), x + PX, y + PX);
  ctx.fillStyle = color;
  ctx.fillText(String(text), x, y);
  ctx.textAlign = 'start';
}

// Numéro d'un corps : plaque sombre cerclée, chiffre clair, bien lisible sur les nébuleuses.
function bodyTag(ctx, text, x, y, { visible, selected, hover }) {
  const size = 9;
  ctx.font = `700 ${size}px DotGothic16, "Pixelify Sans", monospace`;
  const w = Math.max(9, Math.ceil(ctx.measureText(String(text)).width) + 5);
  const h = size + 3;
  const left = snap(x - w / 2);
  const top = snap(y);
  const border = selected ? '#ffd27a' : hover ? '#cfe4ff' : visible ? '#7d84f0' : '#4a51ad';
  ctx.fillStyle = border;
  ctx.fillRect(left + 1, top, w - 2, h);
  ctx.fillRect(left, top + 1, w, h - 2);
  ctx.fillStyle = 'rgba(8, 9, 32, 0.92)';
  ctx.fillRect(left + 1, top + 1, w - 2, h - 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = selected ? '#ffe2a8' : visible ? '#ffffff' : '#aab3e0';
  ctx.fillText(String(text), left + w / 2, top + h / 2 + 0.5);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'top';
}

// Atmosphère : visuelle uniquement, stable par corps (une partie des corps atterrissables).
export function bodyAtmosphere(body) {
  if (!body || !BODY_TYPES[body.type]?.landable) return null;
  const R = panoramaRecipe(panoramaIdFor(body), body.type);
  return R.airless ? null : R.mood;
}

// Rendu de secours d'une planète (sans WebGL) : disque ombré et tramé.
function renderPlanet(r, body, light = [-0.8, -0.3, 0.55]) {
  const size = r * 2 + 1;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  const img = octx.createImageData(size, size);
  const def = BODY_TYPES[body.type] || BODY_TYPES.rocky;
  const pal = def.palette.map(hexRgb);
  const levels = [[8, 9, 16], pal[0], pal[1], pal[2]];
  const ln = Math.hypot(...light);
  const L = light.map((v) => v / ln);
  const seed = body.seed % 100000;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - r) / r, ny = (y - r) / r;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const shade = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const tex = def.banded ? 0.5 + 0.5 * Math.sin(ny * 9 + fbm(nx * 2, ny * 6, seed) * 4) : fbm(nx * 3 + 5, ny * 3 + 5, seed);
      const v = shade * (0.55 + 0.6 * tex);
      const idx = Math.max(0, Math.min(3, Math.floor(v * 3.2 + 0.4 + BAYER[y & 3][x & 3])));
      const c = levels[idx];
      const o = (y * size + x) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return off;
}

// Planète décorative posée dans un coin de la nébuleuse (couleurs accordées au thème).
// Teinte contrastée pour que l'astre se détache de la nébuleuse (planètes orange sur nébuleuse verte…).
const CONTRAST = { violet: 'braise', emeraude: 'braise', azur: 'magenta', magenta: 'lagon', braise: 'violet', lagon: 'braise' };

function decoSpec(deco, theme) {
  const tc = themeColors(CONTRAST[theme] || 'braise');
  const seed = 1 + (deco.seed % 900) / 100;
  switch (deco.kind) {
    case 'gas':
    case 'ringed':
      return makeSpec('gasLayers', {
        seed,
        rotation: -0.3,
        rings: deco.kind === 'ringed',
        ringTilt: 0.35,
        colors: { light: tc.gasLight, dark: tc.gasDark, ringLight: tc.gasLight, ringDark: tc.gasDark },
      });
    case 'lava':
      return makeSpec('lava', { seed, colors: { ground: ['#8f4d57', '#52333f', '#3d2936'], craters: ['#52333f', '#3d2936'], lava: ['#ff8933', '#e64539', '#ad2f45'] } });
    case 'ice':
      return specForBody({ type: 'icy', seed: deco.seed });
    case 'land':
      return specForBody({ type: 'elw', seed: deco.seed });
    default:
      return specForBody({ type: 'rocky', seed: deco.seed });
  }
}

// Composition fixe de l'écran titre.
const TITLE_SPACE = {
  theme: 'violet', accent: 'azur', focal: [NW * 0.42, NH * 0.42], angle: -0.35, length: 200, width: 52, core: 34,
  swirl: 1.1, lanes: 0.25, rays: 5, glow: 1, asteroids: 16, seed: 4242,
  deco: { kind: 'ringed', corner: 'bas-droite', size: 96, seed: 3141, at: [258, 138] },
};

export function createRenderer(canvas) {
  // Image de travail à K× ; le canvas visible suit la taille réelle de l'écran.
  const buf = document.createElement('canvas');
  buf.width = W * K;
  buf.height = H * K;
  const ctx = buf.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const out = canvas.getContext('2d');
  let up = null;

  // Agrandissement « net puis doux » : facteur entier au plus proche pixel, puis une légère
  // interpolation pour la fraction restante. Les pixels gardent tous la même taille à l'écran.
  function present() {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    let tw = W * K, th = H * K;
    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      tw = Math.round(canvas.clientWidth * dpr);
      th = Math.round(canvas.clientHeight * dpr);
    }
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }
    if (tw === buf.width && th === buf.height) {
      out.imageSmoothingEnabled = false;
      out.drawImage(buf, 0, 0);
      return;
    }
    const n = Math.max(1, Math.ceil(Math.min(tw / buf.width, th / buf.height)));
    let src = buf;
    if (n > 1) {
      if (!up || up.width !== buf.width * n) {
        up = document.createElement('canvas');
        up.width = buf.width * n;
        up.height = buf.height * n;
      }
      const u = up.getContext('2d');
      u.imageSmoothingEnabled = false;
      u.drawImage(buf, 0, 0, up.width, up.height);
      src = up;
    }
    out.imageSmoothingEnabled = true;
    out.imageSmoothingQuality = 'high';
    out.drawImage(src, 0, 0, tw, th);
  }
  const cache = new Map();
  let currentStar = 'G';
  let currentBodies = [];
  let currentSystem = null;
  let currentModel = 'mandalay';
  let currentNpc = 0;

  // ---------- Pixel Planets ----------
  // Chaque sprite est rafraîchi à cadence réduite dans un petit canvas 2D.
  const pp = createPixelPlanets();
  const specs = new Map();
  const sprites = new Map();
  const specOf = (key, make) => {
    if (!specs.has(key)) {
      if (specs.size > 200) specs.clear();
      specs.set(key, make());
    }
    return specs.get(key);
  };

  // Le sprite est calculé à K× (D·K pixels de shader) : planètes et astéroïdes plus fins.
  // s.size et s.off sont exprimés dans le repère logique.
  function ppSprite(key, spec, D, t, fps = 12, tint = null) {
    if (!pp.ok) return null;
    const DK = Math.max(1, Math.round(D * K));
    const ext = pp.extent(spec, DK);
    let s = sprites.get(key);
    if (!s || s.ext !== ext || s.D !== D) {
      if (sprites.size > 90) sprites.clear();
      const c = document.createElement('canvas');
      c.width = ext;
      c.height = ext;
      s = { canvas: c, ctx: c.getContext('2d'), ext, D, at: -1, ok: false, off: Math.round(ext / 2 - DK / 2) / K, size: ext / K };
      sprites.set(key, s);
    }
    if (s.at < 0 || t - s.at >= 1 / fps || t < s.at) {
      s.ctx.clearRect(0, 0, ext, ext);
      s.ok = pp.draw(s.ctx, spec, ext / 2, ext / 2, DK, t);
      if (s.ok && tint) {
        // Voile d'atmosphère sur un astre vu depuis le sol.
        s.ctx.globalCompositeOperation = 'source-atop';
        s.ctx.fillStyle = tint;
        s.ctx.fillRect(0, 0, ext, ext);
        s.ctx.globalCompositeOperation = 'source-over';
      }
      s.at = t;
    }
    return s.ok ? s : null;
  }
  const blitSpr = (spr, x, y) => ctx.drawImage(spr.canvas, snap(x), snap(y), spr.size, spr.size);

  // Dessine un corps de rayon r centré en (x, y). Renvoie false si WebGL est indisponible.
  function drawBody(body, x, y, r, t, { key = body.id, fps = 12, tint = null } = {}) {
    const D = r * 2 + 1;
    const spr = ppSprite(`${key}:${D}`, specOf(`b:${body.id}:${body.type}`, () => specForBody(body)), D, t, fps, tint);
    if (!spr) return false;
    blitSpr(spr, x - r - spr.off, y - r - spr.off);
    return true;
  }

  // Rendu de secours, calculé à K× et posé au pixel fin.
  function planet(body, r) {
    const key = `${body.id}:${r}`;
    if (!cache.has(key)) {
      if (cache.size > 80) cache.clear();
      cache.set(key, renderPlanet(r * K, body));
    }
    return cache.get(key);
  }
  const blit = (img, x, y) => ctx.drawImage(img, snap(x), snap(y), img.width / K, img.height / K);

  // ---------- Espace ----------

  // Un « espace » : nébuleuse précalculée + étoiles scintillantes + astéroïdes + planète décor.
  function spaceOf(id, opts = {}, over = null) {
    return cached(`space:${id}:${opts.region || ''}:${opts.star || ''}:${over ? 'x' : ''}`, () => {
      const R = { ...spaceRecipe(id, opts), ...over };
      const r = rngOf(R.seed + 31);
      const tc = themeColors(R.theme);
      const [fx, fy] = R.focal;
      const rocks = [];
      for (let i = 0; i < R.asteroids; i++) {
        // Un champ d'astéroïdes qui s'éloigne lentement du foyer lumineux.
        const big = r() < 0.25;
        const D = big ? 16 + Math.floor(r() * 10) : 7 + Math.floor(r() * 8);
        const a = r() * Math.PI * 2, dist = 24 + r() * 120;
        const x = fx - (NW - W) / 2 + Math.cos(a) * dist, y = fy - (NH - H) / 2 + Math.sin(a) * dist * 0.7;
        const depth = 0.5 + D / 14;
        rocks.push({
          x, y, D, depth,
          vx: Math.cos(a) * (0.6 + r() * 1.4) * depth, vy: Math.sin(a) * (0.4 + r() * 0.8) * depth,
          rot: r() * 6.28, spin: (r() - 0.5) * 0.8,
          spec: makeSpec('asteroid', { seed: 1 + r() * 9, size: 4 + r() * 3, colors: { rock: tc.rock } }),
        });
      }
      const debris = Array.from({ length: R.asteroids ? 40 : 12 }, () => ({ x: r() * W, y: r() * H, s: r() < 0.25 ? 2 : 1, v: 2 + r() * 6, a: r() * 6.28 }));
      return {
        R,
        neb: buildNebula(R),
        stars: sparkles(R),
        rocks,
        debris,
        deco: R.deco ? { ...R.deco, spec: decoSpec(R.deco, R.theme) } : null,
        dark: hexRgb(THEMES[R.theme][0]),
        light: THEMES[R.theme][8],
      };
    });
  }

  const systemSpace = (sys) => spaceOf(spaceIdFor(hashMix(sys.name, sys.star)), { region: sys.regions?.[0] || null, star: sys.star });

  // Dessine un espace. cam : décalage de caméra (parallaxe) ; corners : coins permis pour la planète décor.
  function drawSpace(sp, t, { camX = 0, camY = 0, rocks = true, deco = true, corners = null, alpha = 1, zoom = 1 } = {}) {
    const ox = (NW - W) / 2 + camX * 0.25;
    const oy = (NH - H) / 2 + camY * 0.25;
    ctx.globalAlpha = alpha;
    if (zoom !== 1) {
      const w = W / zoom, h = H / zoom;
      ctx.drawImage(sp.neb, (NW / 2 - w / 2 + camX * 0.25) * K, (NH / 2 - h / 2 + camY * 0.25) * K, w * K, h * K, 0, 0, W, H);
    } else {
      // La nébuleuse glisse au pixel fin.
      const x = Math.max(0, Math.min((NW - W) * K, Math.round(ox * K)));
      const y = Math.max(0, Math.min((NH - H) * K, Math.round(oy * K)));
      ctx.drawImage(sp.neb, x, y, W * K, H * K, 0, 0, W, H);
    }
    // Étoiles scintillantes.
    // Étoiles scintillantes : un cœur fin, et pour les plus brillantes une croix qui s'étire.
    for (const s of sp.stars) {
      const x = snap(s.x - (NW - W) / 2 - camX * 0.3), y = snap(s.y - (NH - H) / 2 - camY * 0.3);
      if (x < -3 || y < -3 || x > W + 3 || y > H + 3) continue;
      const k = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
      ctx.globalAlpha = alpha * (0.35 + 0.65 * k);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, s.big ? 1 : PX, s.big ? 1 : PX);
      if (s.big && k > 0.55) {
        const arm = k > 0.9 ? 3 : 2;
        ctx.globalAlpha = alpha * (k - 0.45);
        ctx.fillStyle = sp.light;
        ctx.fillRect(x - arm, y + PX / 2, arm, PX);
        ctx.fillRect(x + 1, y + PX / 2, arm, PX);
        ctx.fillRect(x + PX / 2, y - arm, PX, arm);
        ctx.fillRect(x + PX / 2, y + 1, PX, arm);
      }
    }
    ctx.globalAlpha = alpha;
    // Planète géante dans un coin.
    if (deco && sp.deco) {
      const d = sp.deco;
      const corner = corners ? corners[(d.seed >> 3) % corners.length] : d.corner;
      const size = corners ? Math.min(d.size, 110) : d.size;
      const right = corner.includes('droite'), top = corner.includes('haut');
      let cx = right ? W - size * 0.12 : size * 0.12;
      let cy = top ? -size * 0.08 : H + size * 0.12;
      if (d.at) [cx, cy] = d.at;
      const spr = ppSprite(`deco:${sp.R.id}:${size}`, d.spec, size, t, 5);
      if (spr) blitSpr(spr, cx - size / 2 - spr.off - camX * 0.5, cy - size / 2 - spr.off - camY * 0.5);
    }
    // Astéroïdes (Pixel Planets) et débris.
    if (rocks) {
      const span = W + 60, spanY = H + 50;
      for (const d of sp.debris) {
        const x = (((d.x + Math.cos(d.a) * d.v * t - camX * 0.8) % span) + span) % span - 30;
        const y = (((d.y + Math.sin(d.a) * d.v * t * 0.6 - camY * 0.8) % spanY) + spanY) % spanY - 25;
        ctx.fillStyle = css(sp.dark);
        ctx.fillRect(snap(x), snap(y), d.s * PX, d.s * PX);
      }
      for (let i = 0; i < sp.rocks.length; i++) {
        const a = sp.rocks[i];
        const x = (((a.x + a.vx * t - camX * a.depth) % span) + span) % span - 30;
        const y = (((a.y + a.vy * t - camY * a.depth) % spanY) + spanY) % spanY - 25;
        a.spec.layers[0].u.rotation = a.rot + t * a.spin;
        const spr = ppSprite(`rock:${sp.R.id}:${i}`, a.spec, a.D, t + i * 0.023, 5);
        if (spr) blitSpr(spr, x - a.D / 2 - spr.off, y - a.D / 2 - spr.off);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawStar(code, cx, cy, t) {
    const s = STAR_CLASSES[code];
    if (code === 'BH') {
      const spr = ppSprite('star:BH', specOf('s:BH', () => specForStar('BH')), s.radius * 2 + 1, t, 15);
      if (spr) {
        blitSpr(spr, cx - s.radius - spr.off, cy - s.radius - spr.off);
        return;
      }
      disc(ctx, cx, cy, s.radius + 4, '#ff9a3a');
      disc(ctx, cx, cy, s.radius, '#000000');
      return;
    }
    halo(ctx, cx, cy, s.radius * 0.9, s.radius * 2.6 + 14, s.glow, 0.42);
    halo(ctx, cx, cy, s.radius, s.radius * 1.35 + 4, s.color, 0.35);
    const spr = ppSprite(`star:${code}:${s.radius}`, specOf(`s:${code}`, () => specForStar(code)), s.radius * 2 + 1, t, 15);
    if (spr) blitSpr(spr, cx - s.radius - spr.off, cy - s.radius - spr.off);
    else disc(ctx, cx, cy, s.radius, s.color);
    if (s.boost) {
      // Cônes de jet (étoile à neutrons, naine blanche).
      const len = (s.boost >= 4 ? 90 : 55) * K;
      for (let i = 0; i < len; i++) {
        const spread = (i / K) * 0.18;
        const flick = 0.75 + 0.25 * Math.sin(t * 20 + i * 0.35);
        const k = 1 - i / len;
        ctx.globalAlpha = k * k * 0.85 * flick;
        ctx.fillStyle = '#9fdcff';
        ctx.fillRect(snap(cx - spread / 2), snap(cy - s.radius) - i * PX, Math.max(PX, snap(spread)), PX);
        ctx.fillRect(snap(cx - spread / 2), snap(cy + s.radius) + i * PX, Math.max(PX, snap(spread)), PX);
        ctx.fillStyle = '#ffffff';
        const core = Math.max(PX, snap(spread * 0.35));
        ctx.fillRect(snap(cx - core / 2), snap(cy - s.radius) - i * PX, core, PX);
        ctx.fillRect(snap(cx - core / 2), snap(cy + s.radius) + i * PX, core, PX);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Vaisseau et commandant ----------

  // model : modèle à dessiner (par défaut celui du joueur) ; npc : un autre vaisseau que le sien.
  function drawShip(x, y, t, { thrust = 0, gear = 0, flip = false, small = false, model = null, npc = false } = {}) {
    if (S.drawShip) {
      let m = model || currentModel;
      if (npc && !model) {
        const others = (S.SHIP_MODEL_IDS || []).filter((id) => id !== currentModel);
        m = others.length ? others[(currentNpc >>> 0) % others.length] : currentModel;
      }
      S.drawShip(ctx, Math.round(x), Math.round(y), { t, thrust, gear, flip, small, model: m });
      return;
    }
    // Ancien sprite (si sprites.js n'expose pas encore drawShip).
    const scale = small ? 1 : 2;
    const flame = thrust > 0 ? (Math.sin(t * 40) > 0 ? '#ffe28a' : '#ff7a2a') : '#3a2a20';
    S.drawSprite(ctx, S.SHIP, S.SHIP_PALETTE, x, y, scale, flip, { e: flame });
    if (gear) S.drawSprite(ctx, S.SHIP_GEAR, S.SHIP_PALETTE, x, y + S.SHIP.length * scale, scale, flip);
  }

  function drawAstro(x, y, t, pose, flip) {
    if (S.drawAstronaut) {
      S.drawAstronaut(ctx, Math.round(x), Math.round(y), { t, pose, flip });
      return;
    }
    const frame = pose === 'walk' ? Math.floor(t * 6) % 2 : 2;
    S.drawSprite(ctx, S.ASTRO_FRAMES[frame], S.ASTRO_PALETTE, Math.round(x), Math.round(y), 1, flip);
  }

  // ---------- Vue système ----------

  function layoutBodies(system) {
    const n = system.bodies.length;
    const left = 112, right = 300;
    const spacing = n > 1 ? (right - left) / (n - 1) : 0;
    return system.bodies.map((b, i) => {
      const x = n > 1 ? left + i * spacing : (left + right) / 2;
      const maxR = n > 1 ? Math.max(5, Math.floor(spacing / 2) - 2) : 24;
      const r = Math.min(Math.round(b.size * 1.25), maxR);
      const y = 92 + Math.round(Math.sin(i * 1.9 + n) * 12);
      return { body: b, x: Math.round(x), y, r };
    });
  }

  function systemScene(view, t) {
    const { state } = view;
    const sys = state.system;
    const sp = systemSpace(sys);
    // La caméra dérive très lentement : le décor vit sans gêner la lecture.
    drawSpace(sp, t, { camX: Math.sin(t * 0.05) * 40, camY: Math.sin(t * 0.037) * 12, deco: false });
    const star = STAR_CLASSES[sys.star];
    const starX = star.radius > 20 ? 4 : 24;
    const starY = 90;
    drawStar(sys.star, starX, starY, t);

    const restX = Math.max(starX + star.radius + 10, 40);
    // Arrivée de saut : le vaisseau entre par la gauche et freine jusqu'à sa place.
    const arr = view.arriving ? Math.min(1, view.sceneTime / ARRIVAL_DURATION) : 1;
    const ease = 1 - Math.pow(1 - arr, 3);
    const shipX = Math.round(-SMALL_W - 30 + (restX + SMALL_W + 30) * ease);
    const shipY = 116 + Math.round(Math.sin(t * 1.6) * 1.5);
    const shipCx = shipX + SMALL_W / 2;

    const layout = layoutBodies(sys);
    view.layout = layout;
    const wave = view.scanWave;
    // Orbite discrète.
    ctx.fillStyle = '#c8d4ff';
    for (let x = 100; x < W; x += 2) {
      ctx.globalAlpha = 0.3 * Math.min(1, (x - 100) / 30);
      ctx.fillRect(x, snap(92 + Math.sin(((x - 112) / Math.max(1, (300 - 112) / Math.max(1, layout.length - 1))) * 1.9 + layout.length) * 12), PX, PX);
    }
    ctx.globalAlpha = 1;
    for (const { body, x, y, r } of layout) {
      const visible = body.revealed >= 1 && (wave == null || wave > x - shipCx);
      if (visible && drawBody(body, x, y, r, t)) {
        // Rendu WebGL (anneaux compris).
      } else if (visible) {
        blit(planet(body, r), x - r, y - r);
      } else {
        // Signal inconnu : une petite lueur qui pulse, cerclée d'un anneau fin.
        const blink = 0.5 + 0.3 * Math.sin(t * 3 + x);
        halo(ctx, x, y, 0.5, 5, '#9fb4ff', 0.35 * blink);
        ctx.globalAlpha = blink;
        ring(ctx, x, y, 3, '#cfd8ff');
        ctx.fillStyle = '#eef2ff';
        ctx.fillRect(x - PX / 2, y - PX / 2, PX, PX);
        ctx.globalAlpha = 1;
      }
      const labelY = y + Math.max(r, 4) + 6;
      bodyTag(ctx, body.index, x + 0.5, labelY, { visible, selected: view.selectedBodyId === body.id, hover: view.hoverBody === body.id });
      if (visible && (body.revealed >= 2 ? body.bio || body.geo || body.feature || body.terraformable : body.hint)) {
        label(ctx, '!', x + 0.5, y - Math.max(r, 4) - 10, Math.sin(t * 5) > 0 ? '#ffd27a' : '#ff9a4a', 8);
      }
      if (body.landed) {
        ctx.fillStyle = '#7fe0ff';
        ctx.fillRect(x - 1, y - Math.max(r, 4) - 3, 3, PX);
      }
      if (view.hoverBody === body.id && view.selectedBodyId !== body.id) {
        ctx.globalAlpha = 0.7;
        ring(ctx, x, y, Math.max(r, 4) + 3, '#cfe4ff');
        ctx.globalAlpha = 1;
      }
      if (view.selectedBodyId === body.id) {
        const s = Math.max(r, 4) + 3 + (0.5 + 0.5 * Math.sin(t * 4)) * 1.5;
        ring(ctx, x, y, s, '#ffd27a', 2);
        ctx.globalAlpha = 0.35;
        ring(ctx, x, y, s + 2, '#ffd27a');
        ctx.globalAlpha = 1;
      }
    }

    // Vague du scan automatique
    if (wave != null && wave < 400) {
      const fade = Math.max(0, 1 - wave / 300);
      ctx.globalAlpha = fade;
      ring(ctx, shipCx, shipY + 4, wave, '#bff4ff', 2);
      ctx.globalAlpha = fade * 0.6;
      ring(ctx, shipCx, shipY + 4, Math.max(0, wave - 2), '#62c8f0');
      ctx.globalAlpha = fade * 0.3;
      ring(ctx, shipCx, shipY + 4, Math.max(0, wave - 5), '#3a8ac0');
      ctx.globalAlpha = 1;
    }
    // Rayon du scan manuel
    if (view.beam && view.beam.until > t) {
      const target = layout.find((l) => l.body.id === view.beam.bodyId);
      if (target) {
        const steps = 160;
        for (let i = 0; i < steps; i++) {
          const k = i / steps;
          const pulse = ((i + Math.floor(t * 60)) % 8) / 8;
          ctx.globalAlpha = 0.35 + 0.65 * pulse;
          ctx.fillStyle = pulse > 0.8 ? '#ffffff' : '#8fe4ff';
          ctx.fillRect(snap(shipCx + SMALL_W / 2 + (target.x - shipCx - SMALL_W / 2) * k), snap(shipY + 4 + (target.y - shipY - 4) * k), PX, PX);
        }
        ctx.globalAlpha = 1;
      }
    }
    // Écopage : traînée de plasma vers le vaisseau
    if (view.scoopUntil && view.scoopUntil > t) {
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? star.color : star.glow;
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        const sz = Math.random() < 0.2 ? 1 : PX;
        ctx.fillRect(snap(shipX - Math.random() * 24), snap(shipY + 2 + Math.random() * 6), sz, sz);
      }
      ctx.globalAlpha = 1;
    }
    if (arr < 1) {
      // Sillage de sortie d'hyperespace derrière le vaisseau.
      for (let i = 0; i < 16; i++) {
        ctx.globalAlpha = (1 - arr) * (0.6 - i * 0.03);
        ctx.fillStyle = i % 3 ? '#8a9cff' : '#ffffff';
        const len = Math.round((1 - arr) * (40 + i * 5));
        ctx.fillRect(shipX - len, shipY + 1 + ((i * 3) % (SMALL_H * K)) * PX, len, PX);
      }
      ctx.globalAlpha = 1;
    }
    drawShip(shipX, shipY, t, { thrust: arr < 1 ? 0.6 + 0.4 * (1 - arr) : 0.6, small: true });
    // Fin du flash blanc du saut.
    if (view.arriving && view.sceneTime < 0.35) {
      ctx.globalAlpha = 1 - view.sceneTime / 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Saut ----------

  function jumpScene(view, t) {
    // Vue de côté, comme le sprite : le vaisseau file vers la droite dans le tunnel hyperspatial.
    const st = view.sceneTime;
    const k = Math.min(1, st / JUMP_DURATION);
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, W, H);
    // Le décor d'arrivée transparaît peu à peu derrière le tunnel.
    if (view.state?.system) drawSpace(systemSpace(view.state.system), t, { alpha: 0.1 + 0.6 * k * k, camX: -st * 60, rocks: false, deco: false });
    const target = STAR_CLASSES[view.jumpStar || 'G'];
    // Parois du tunnel : deux bandes ondulantes qui défilent vers la gauche.
    const scroll = st * 90 + st * st * 120;
    for (let x = 0; x < W; x += PX) {
      const wob = Math.sin((x + scroll) * 0.045) * 6 + Math.sin((x + scroll * 1.3) * 0.11) * 3;
      const top = snap(34 + wob - k * 10);
      const bot = snap(H - 34 - wob + k * 10);
      for (let i = 0; i < 7; i++) {
        ctx.globalAlpha = (0.34 - i * 0.045) * (1 - k * 0.4);
        ctx.fillStyle = i === 0 ? '#b8c4ff' : i < 3 ? '#8a9cff' : '#3a4ac0';
        ctx.fillRect(x, top - i * 1.5, PX, PX);
        ctx.fillRect(x, bot + i * 1.5, PX, PX);
      }
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#3a4ac0';
      ctx.fillRect(x, 0, PX, Math.max(0, top - 12));
      ctx.fillRect(x, bot + 12, PX, H - bot - 12);
    }
    // Traînées d'étoiles : elles filent de droite à gauche en s'allongeant (le vaisseau accélère).
    const rng = new Rng(7);
    for (let i = 0; i < 150; i++) {
      const y = Math.round(rng.range(0, H));
      const speed = rng.range(0.5, 1.4);
      const ph = rng.range(0, 1);
      const travel = speed * (0.7 * st + 0.9 * st * st);
      const len = Math.round(3 + speed * (6 + k * k * 70));
      const span = W + len + 20;
      const x = snap(W - ((ph + travel) % 1) * span);
      const yy = y + (i & 1) * PX;
      ctx.fillStyle = i % 4 === 0 ? target.glow : i % 3 === 0 ? '#ffffff' : '#8a9cff';
      ctx.globalAlpha = (0.35 + 0.5 * (speed - 0.5)) * (1 - k * 0.3);
      ctx.fillRect(x, yy, len, PX);
      // Tête de la traînée plus vive.
      ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 1.6);
      ctx.fillRect(x, yy, Math.min(len, 2), PX);
    }
    ctx.globalAlpha = 1;
    // L'étoile d'arrivée grossit au bout du tunnel, à droite.
    const sr = Math.round(2 + k * k * 22);
    const sx = Math.round(W + 6 - k * k * 40);
    halo(ctx, sx, H / 2, sr, sr * 2.4 + 10, target.glow, 0.6);
    disc(ctx, sx, H / 2, sr, target.color);
    halo(ctx, sx, H / 2, 0, sr * 0.8, '#ffffff', 0.5);
    // Le vaisseau, de profil, tremble sous la poussée et avance vers l'étoile à la fin.
    const shake = Math.round(Math.sin(st * 37) * (0.5 + k));
    const shipX = 70 + k * k * k * 90;
    drawShip(shipX, H / 2 - SHIP_H / 2 + shake, st, { thrust: 1 });
    if (k > 0.85) {
      ctx.globalAlpha = (k - 0.85) / 0.15;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Surface ----------

  function panoramaOf(body) {
    const R = panoramaRecipe(panoramaIdFor(body), body.type);
    const theme = currentSystem ? systemSpace(currentSystem).R.theme : 'violet';
    return cached(`pano:${R.id}:${body.type}:${R.airless ? theme : ''}`, () => buildPanorama(R, { space: theme }));
  }

  // L'astre géant vu depuis le sol : le plus gros voisin du système, sinon une planète décor.
  function skyGiant(body) {
    const others = currentBodies.filter((b) => b.id !== body.id);
    const big = others.sort((a, b) => b.size - a.size)[0];
    return big || { id: `giant-${body.id}`, type: 'gas', seed: body.seed + 7 };
  }

  const twinkles = Array.from({ length: 90 }, (_, i) => ({ x: hash2(i, 1, 5) * W, y: hash2(i, 2, 5) * 110, b: 0.3 + hash2(i, 3, 5) * 0.7, ph: hash2(i, 4, 5) * 6.28 }));

  // Décor de surface : ciel, soleil, astres, nuages, chaînes de montagnes, sol.
  // cam.x > 0 avance vers la droite ; cam.y > 0 décale les plans vers le bas (le sol monte).
  function surfaceBackdrop(body, t, cam = { x: 0, y: 0 }) {
    return drawPanorama(panoramaOf(body), body, t, cam);
  }

  function drawPanorama(P, body, t, cam) {
    if (P.sky) {
      blit(P.sky, 0, cam.y * 0.03);
    } else {
      // Sans atmosphère : la nébuleuse du système, assombrie.
      drawSpace(systemSpace(currentSystem), t, { camX: cam.x * 0.2, camY: -cam.y * 0.2 - 30, rocks: false, deco: false });
      ctx.fillStyle = 'rgba(4, 4, 12, 0.35)';
      ctx.fillRect(0, 0, W, H);
    }
    // Étoiles
    if (P.stars > 0) {
      for (const s of twinkles) {
        ctx.globalAlpha = P.stars * s.b * (0.55 + 0.45 * Math.sin(t * 1.7 + s.ph));
        ctx.fillStyle = '#f4f6ff';
        const sz = s.b > 0.92 ? 1 : PX;
        ctx.fillRect(snap(s.x), snap(s.y + cam.y * 0.05), sz, sz);
      }
      ctx.globalAlpha = 1;
    }
    // Aurores
    if (P.aurora) {
      // Rideaux d'aurore : un ruban ondulant, des rayons verticaux qui s'estompent vers le bas.
      for (let px = 0; px < W * K; px++) {
        const x = px / K;
        const y0 = snap(16 + Math.sin(x * 0.022 + t * 0.3) * 10 + Math.sin(x * 0.009 - t * 0.17) * 8 + cam.y * 0.08);
        const ray = valueNoise(x * 0.18 + t * 0.6, 0, 77);
        const len = (18 + ray * 26) * K;
        const hue = valueNoise(x * 0.012 - t * 0.05, 3, 78);
        const top = hue > 0.62 ? P.aurora[2] : P.aurora[1];
        // Rideau : un ourlet vif en haut, puis des segments de plus en plus transparents.
        ctx.globalAlpha = 0.2 + 0.4 * ray;
        ctx.fillStyle = top;
        ctx.fillRect(x, y0, PX, 3 * PX);
        ctx.fillStyle = P.aurora[0];
        for (let j = 3; j < len; j += 3) {
          const k = j / len;
          ctx.globalAlpha = (0.1 + 0.28 * ray) * (1 - k) * (1 - k * 0.3);
          ctx.fillRect(x, y0 + j * PX, PX, 3 * PX);
        }
      }
      ctx.globalAlpha = 1;
    }
    // Soleil et halo
    const sun = P.sun;
    const sx = Math.round(sun.x - cam.x * 0.02), sy = Math.round(sun.y + cam.y * 0.05);
    halo(ctx, sx, sy, sun.r * 0.8, sun.r * 6, sun.glow, P.airless ? 0.28 : 0.42);
    halo(ctx, sx, sy, sun.r, sun.r * 2, sun.color, P.airless ? 0.35 : 0.5);
    disc(ctx, sx, sy, sun.r, css(mix(rgbOf(sun.color), rgbOf(sun.glow), 0.35)));
    disc(ctx, sx - 0.5, sy - 0.5, sun.r - 1, sun.color);
    disc(ctx, sx - 1, sy - 1, Math.max(1, sun.r - 3.5), '#ffffff');
    // Astre géant (Pixel Planets) et petites lunes
    const R = P.recipe;
    const tint = P.airless ? null : css(P.horizon, 0.28);
    if (R.giant) {
      const g = skyGiant(body);
      drawBody(g, R.giant.x - cam.x * 0.05, R.giant.y + cam.y * 0.08, Math.round(R.giant.d / 2), t, { key: `${g.id}-sky-${body.id}`, fps: 6, tint });
    }
    for (let i = 0; i < R.moons; i++) {
      const mx = 30 + hash2(i, R.id, 9) * 260, my = 14 + hash2(i, R.id, 11) * 40;
      const mr = 2 + Math.floor(hash2(i, R.id, 13) * 4);
      const moon = { id: `moon-${R.id}-${i}`, type: i % 2 ? 'icy' : 'rocky', seed: R.seed + i * 17 };
      if (!drawBody(moon, mx - cam.x * 0.03, my + cam.y * 0.06, mr, t, { fps: 3, tint })) disc(ctx, mx, my, mr, '#c8c0d8');
    }
    drawLayers(ctx, P.layers, { t, camX: cam.x, camY: cam.y });
    blit(P.ground, 0, cam.y);
    return { near: P.near, P };
  }

  // Neige, braises, poussière ou spores, au premier plan.
  function surfaceParticles(P, t, cam = { x: 0, y: 0 }) {
    const kind = P.recipe.particles;
    if (!kind) return;
    const n = kind === 'neige' ? 70 : 34;
    for (let i = 0; i < n; i++) {
      const a = hash2(i, 7, P.recipe.id), b = hash2(i, 8, P.recipe.id), c = hash2(i, 9, P.recipe.id);
      let x, y, col;
      if (kind === 'neige') {
        x = (a * W + t * (6 + c * 8) + Math.sin(t + i) * 4 - cam.x * 0.5) % W;
        y = (b * H + t * (10 + c * 14) + cam.y) % H;
        col = c > 0.5 ? '#ffffff' : '#d8e8ff';
      } else if (kind === 'braises') {
        x = (a * W + Math.sin(t * 0.7 + i) * 6 - cam.x * 0.5) % W;
        y = H - ((b * H + t * (6 + c * 10)) % H) + cam.y;
        col = c > 0.6 ? '#ffd27a' : '#ff6a2a';
      } else if (kind === 'spores') {
        x = (a * W + t * 3 + Math.sin(t * 0.5 + i) * 10 - cam.x * 0.5) % W;
        y = (b * 150 + Math.sin(t * 0.8 + i * 2) * 8 + cam.y) % H;
        col = c > 0.5 ? '#d8ff9a' : '#7ae0a0';
      } else {
        x = (a * W + t * (8 + c * 20) - cam.x * 0.5) % W;
        y = 100 + b * 80 + Math.sin(t + i) * 3 + cam.y;
        col = css(P.dust);
      }
      x = ((x % W) + W) % W;
      ctx.globalAlpha = 0.5 + c * 0.5;
      ctx.fillStyle = col;
      // Les particules proches (c élevé) sont plus grosses : un peu de profondeur.
      const sz = c > 0.8 ? 1 : PX;
      ctx.fillRect(snap(x), snap(y), sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  function drawFeatures(body, sf, near, t) {
    if (!sf || !sf.analyzed) return;
    const g = (x) => near[Math.max(0, Math.min(W - 1, x))];
    if (body.bio) {
      for (let i = 0; i < body.bio * 3; i++) {
        const x = 190 + ((i * 37 + body.seed) % 120);
        const y = g(x);
        const sway = Math.sin(t * 2 + i) > 0.6 ? 1 : 0;
        const c = ['#7ef0a0', '#e0f070', '#f07ad0', '#70d0f0'][i % 4];
        ctx.fillStyle = '#1e3a2a';
        ctx.fillRect(x, y - 4, 1, 4);
        ctx.fillStyle = c;
        ctx.fillRect(x - 1 + sway, y - 6, 3, 2);
        ctx.fillRect(x + sway, y - 7, 1, 1);
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 3 + i);
        ctx.fillRect(x - 2 + sway, y - 7, 5, 4);
        ctx.globalAlpha = 1;
      }
    }
    if (body.geo) {
      const x = 260;
      const y = g(x);
      const phase = (t * 0.7) % 3;
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(x - 4, y - 2, 9, 2);
      ctx.fillStyle = '#4a4a5e';
      ctx.fillRect(x - 3, y - 3, 7, 1);
      if (phase < 1.4) {
        for (let i = 0; i < 30; i++) {
          ctx.fillStyle = i % 2 ? '#e6f4ff' : '#a8d0f0';
          ctx.globalAlpha = 1 - i / 30;
          ctx.fillRect(x + Math.round(Math.sin(i + t * 8) * (i / 7)), y - 3 - Math.round(i * phase * 1.4), 1 + (i % 3 === 0 ? 1 : 0), 1);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (body.feature === 'crash') {
      const x = 214, y = g(230);
      ctx.save();
      ctx.translate(x + SMALL_W / 2, y - 3);
      ctx.rotate(0.25);
      drawShip(-SMALL_W / 2, -SMALL_H / 2, t, { flip: true, small: true, npc: true });
      ctx.restore();
      ctx.fillStyle = '#1a1a22';
      ctx.fillRect(x - 10, y - 1, 46, 2);
      if (Math.sin(t * 3) > 0) {
        ctx.fillStyle = '#ff3a3a';
        ctx.fillRect(x + 12, y - 9, 1, 1);
      }
      for (let i = 0; i < 8; i++) {
        ctx.globalAlpha = 0.3 * (1 - i / 8);
        ctx.fillStyle = '#6a6a7a';
        ctx.fillRect(Math.round(x + 18 + Math.sin(t + i) * 2), Math.round(y - 8 - i * 3 - ((t * 6) % 3)), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (body.feature === 'guardian') {
      for (let i = 0; i < 4; i++) {
        const x = 200 + i * 26, y = g(x);
        const hh = 18 - (i % 2) * 5;
        ctx.fillStyle = '#2e3a4a';
        ctx.fillRect(x, y - hh, 5, hh);
        ctx.fillStyle = '#4a5a6e';
        ctx.fillRect(x, y - hh, 1, hh);
        ctx.fillStyle = Math.sin(t * 2 + i) > 0 ? '#5affd8' : '#2a9a88';
        ctx.fillRect(x + 2, y - hh + 4, 2, 1);
        ctx.fillRect(x + 2, y - hh + 8, 2, 1);
      }
    }
    if (body.feature === 'thargoid') {
      for (let i = 0; i < 5; i++) {
        const x = 196 + i * 22, y = g(x);
        const h = 10 + ((i * 7) % 12);
        ctx.fillStyle = '#121a14';
        for (let j = 0; j < h; j++) ctx.fillRect(x + Math.round(Math.sin(j / 3 + i) * 2), y - j, 3, 1);
        ctx.fillStyle = Math.sin(t * 3 + i) > 0 ? '#4be08a' : '#1f7a44';
        ctx.fillRect(x + 1, y - h, 1, 1);
      }
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = '#4be08a';
      ctx.fillRect(180, 110, 140, 70);
      ctx.globalAlpha = 1;
    }
  }

  const SHIP_LAND_X = 66;
  const landedYFor = (near) => near[SHIP_LAND_X + Math.round(SHIP_W / 2)] - SHIP_H - GEAR_H;

  // Rampe de la soute vers le sol, du côté droit.
  function drawRamp(landedY, groundY, open = 1) {
    const hatch = S.shipHatch ? S.shipHatch(currentModel) : HATCH0;
    const hx = SHIP_LAND_X + hatch.x, hy = landedY + hatch.y;
    const len = Math.max(6, groundY - hy + 4);
    const ang = (Math.PI / 2) * (1 - open) + 0.55 * open;
    const ex = hx + Math.cos(ang) * len * 0.9, ey = Math.min(groundY, hy + Math.sin(ang) * len);
    for (let i = 0; i <= 20; i++) {
      const k = i / 20;
      ctx.fillStyle = i % 4 === 0 ? '#3a4050' : '#6a7282';
      ctx.fillRect(Math.round(hx + (ex - hx) * k), Math.round(hy + (ey - hy) * k), 3, 1);
    }
    if (open > 0) {
      ctx.globalAlpha = 0.5 * open;
      ctx.fillStyle = '#ffe2a8';
      ctx.fillRect(hx - 1, hy - 3, 5, 3);
      ctx.globalAlpha = 1;
    }
    return { hx, hy, ex, ey };
  }

  function landingScene(view, t) {
    const body = view.body;
    const st = view.sceneTime;
    if (st < 2.2) {
      // Le panorama (calcul fin, un peu long) est préparé dès le début, avant la descente.
      panoramaOf(body);
      // Orbite : la planète occupe le bas de l'écran, la nébuleuse défile.
      drawSpace(systemSpace(currentSystem), t, { camX: st * 40, rocks: true, deco: false });
      const R = 230;
      if (!drawBody(body, W / 2, 128 - Math.round(st * 10) + R, R, t, { key: `${body.id}-big`, fps: 6 })) {
        blit(planet({ ...body, id: `${body.id}-big` }, R), W / 2 - R, 128 - Math.round(st * 10));
      }
      const k = st / 2.2;
      drawShip(-30 + k * 250, 46 + k * 34, t, { thrust: 1, small: true });
      return;
    }
    const kd = Math.min(1, (st - 2.2) / 2.2);
    const easeD = 1 - (1 - kd) * (1 - kd);
    // Caméra : on arrive de haut et de la gauche, les plans proches défilent plus vite.
    const cam = { x: -(1 - easeD) * 260, y: (1 - easeD) * 110 };
    const { near, P } = surfaceBackdrop(body, t, cam);
    const groundY = near[SHIP_LAND_X + Math.round(SHIP_W / 2)];
    const landedY = landedYFor(near);
    if (st < 4.4) {
      const ease = easeD;
      const y = -30 + (landedY + 30) * ease;
      const x = SHIP_LAND_X - 70 + 70 * ease;
      drawShip(x, y, t, { thrust: 1, gear: Math.max(0, (kd - 0.6) / 0.4) });
      surfaceParticles(P, t, cam);
      return;
    }
    drawShip(SHIP_LAND_X, landedY, t, { gear: 1, thrust: st < 4.8 ? (4.8 - st) / 0.4 : 0 });
    // Poussière d'atterrissage
    if (st < 5.6) {
      const k = (st - 4.4) / 1.2;
      for (let i = 0; i < 28; i++) {
        const dir = i % 2 ? 1 : -1;
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.fillStyle = css(P.dust);
        ctx.fillRect(Math.round(SHIP_LAND_X + SHIP_W / 2 + dir * (8 + k * (24 + i * 2))), Math.round(groundY - 1 - (i % 5) - k * 4), 2, 1);
      }
      ctx.globalAlpha = 1;
    }
    const open = Math.min(1, Math.max(0, (st - 5.0) / 0.8));
    const ramp = drawRamp(landedY, groundY, open);
    // Le commandant sort
    if (st > 5.9) {
      const k = Math.min(1, (st - 5.9) / 1.5);
      let ax, ay;
      if (k < 0.5) {
        const kk = k / 0.5;
        ax = ramp.hx + (ramp.ex - ramp.hx) * kk;
        ay = ramp.hy + (ramp.ey - ramp.hy) * kk - ASTRO_H;
      } else {
        const kk = (k - 0.5) / 0.5;
        ax = ramp.ex + kk * 20;
        ay = near[Math.round(ax + ASTRO_W / 2)] - ASTRO_H;
      }
      drawAstro(ax, ay, t, k >= 1 ? 'idle' : 'walk', false);
    }
    surfaceParticles(P, t);
    view.astroDone = st > 7.4;
  }

  function surfaceScene(view, t) {
    const body = view.body;
    const { near, P } = surfaceBackdrop(body, t);
    drawFeatures(body, view.state.surface, near, t);
    const landedY = landedYFor(near);
    drawShip(SHIP_LAND_X, landedY, t, { gear: 1 });
    const ramp = drawRamp(landedY, near[SHIP_LAND_X + Math.round(SHIP_W / 2)], 1);
    // Le commandant s'avance vers ce qu'il observe.
    const analyzed = view.state.surface && view.state.surface.analyzed;
    const start = Math.round(ramp.ex + 20);
    const target = analyzed ? 176 : start;
    view.astroX = view.astroX ?? start;
    const moving = Math.abs(view.astroX - target) > 0.5;
    if (moving) view.astroX += Math.sign(target - view.astroX) * 0.5;
    const ax = Math.round(view.astroX);
    const pose = moving ? 'walk' : analyzed ? 'scan' : 'idle';
    drawAstro(ax, near[Math.max(0, Math.min(W - 1, ax + Math.round(ASTRO_W / 2)))] - ASTRO_H, t, pose, target < view.astroX);
    surfaceParticles(P, t);
  }

  function takeoffScene(view, t) {
    const body = view.body;
    const k = view.sceneTime / TAKEOFF_DURATION;
    const cam = { x: k * k * 160, y: k * k * 120 };
    const { near, P } = surfaceBackdrop(body, t, cam);
    const landedY = landedYFor(near) + cam.y;
    const y = landedY - k * k * 220;
    const x = SHIP_LAND_X + k * k * 120;
    drawShip(x, y, t, { thrust: 1, gear: Math.max(0, 1 - k * 4) });
    surfaceParticles(P, t, cam);
  }

  // ---------- Titre et fin ----------

  // Écran titre : une nébuleuse violette, une géante gazeuse annelée, le Mandalay passe.
  function titleScene(view, t) {
    const sp = spaceOf(7, {}, TITLE_SPACE);
    drawSpace(sp, t, { camX: Math.sin(t * 0.06) * 40, camY: Math.sin(t * 0.1) * 8 });
    const k = (t * 0.045) % 1.4;
    drawShip(Math.round(-70 + k * 340), Math.round(96 - k * 40 + Math.sin(t * 1.4) * 1.5), t, { thrust: 1 });
  }

  function endScene(view, t) {
    const sp = currentSystem ? systemSpace(currentSystem) : spaceOf(7, {}, TITLE_SPACE);
    drawSpace(sp, t, { camX: t * 2, deco: false });
    const victory = view.state.phase === 'victory';
    const gal = victory && ppSprite('dest', specOf('dest', specForDestination), 121, t, 12);
    if (gal) blitSpr(gal, 200 - 60 - gal.off, 80 - 60 - gal.off);
    if (victory) {
      drawShip(40 + Math.sin(t) * 2, 104, t, { thrust: 1 });
    } else {
      // Épave dérivante.
      ctx.save();
      ctx.translate(160, 96);
      ctx.rotate(t * 0.15);
      drawShip(-SHIP_W / 2, -SHIP_H / 2, t, {});
      ctx.restore();
    }
  }

  // Cinématiques d'événement (eventscenes.js), avec les outils de dessin de ce module.
  const eventScenes = createEventScenes({
    ctx, W, H, drawSpace, systemSpace, drawStar, drawShip, drawAstro, halo, ring, disc,
    surfaceBackdrop, surfaceParticles, landedYFor, drawRamp, SHIP_LAND_X, SHIP_W, ASTRO_W, ASTRO_H,
  });

  return {
    hasEventScene: (id) => eventScenes.has(id),
    render(view, t) {
      ctx.setTransform(K, 0, 0, K, 0, 0);
      ctx.imageSmoothingEnabled = false;
      currentStar = view.state?.system?.star || 'G';
      currentBodies = view.state?.system?.bodies || [];
      currentSystem = view.state?.system || null;
      currentModel = view.state?.ship?.model || 'mandalay';
      currentNpc = (view.state?.jumps || 0) + (view.state?.system?.bodies?.length || 0);
      switch (view.scene) {
        case 'jump': jumpScene(view, t); break;
        case 'landing': landingScene(view, t); break;
        case 'surface': surfaceScene(view, t); break;
        case 'takeoff': takeoffScene(view, t); break;
        case 'end': endScene(view, t); break;
        case 'title': titleScene(view, t); break;
        case 'event': eventScenes.draw(view, t); break;
        default: systemScene(view, t);
      }
      present();
    },
    // Prépare à l'avance le décor d'un système (évite un à-coup au moment du saut).
    warm(sys) {
      systemSpace(sys);
    },
    // Aperçus pour la galerie : un fond d'espace ou un panorama, par numéro de recette.
    preview(kind, id, t, { type = 'rocky', theme = 'violet' } = {}) {
      ctx.setTransform(K, 0, 0, K, 0, 0);
      ctx.imageSmoothingEnabled = false;
      if (kind === 'space') {
        drawSpace(spaceOf(id), t, { camX: t * 6 });
        present();
        return spaceOf(id).R;
      }
      const R = panoramaRecipe(id, type);
      const P = cached(`pano:${R.id}:${type}:${R.airless ? theme : ''}`, () => buildPanorama(R, { space: theme }));
      currentSystem = currentSystem || { name: 'Galerie', star: 'G', bodies: [], regions: [] };
      currentBodies = [];
      // Dessin direct (sans passer par panoramaIdFor, qui dépend de la graine du corps).
      drawPanorama(P, { id: `gal-${id}`, type, seed: R.seed }, t, { x: t * 8, y: 0 });
      present();
      return R;
    },
    // Renvoie le corps sous un point du canvas (coordonnées internes).
    pick(view, x, y) {
      if (!view.layout) return null;
      let best = null, bd = 1e9;
      for (const l of view.layout) {
        const d = Math.hypot(l.x - x, l.y - y);
        if (d < Math.max(l.r, 6) + 4 && d < bd) {
          best = l.body;
          bd = d;
        }
      }
      return best;
    },
  };
}
