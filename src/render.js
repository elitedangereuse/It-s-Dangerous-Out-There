// Rendu pixel art sur canvas 320×180 : système, saut, cinématique d'atterrissage, surface.
import { STAR_CLASSES, BODY_TYPES } from './data.js';
import { SHIP, SHIP_GEAR, SHIP_PALETTE, ASTRO_FRAMES, ASTRO_PALETTE, drawSprite, drawText } from './sprites.js';
import { Rng, hashMix } from './rng.js';

export const W = 320;
export const H = 180;

export const LANDING_DURATION = 7.6;
export const TAKEOFF_DURATION = 2.4;
export const JUMP_DURATION = 1.8;

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => v / 16 - 0.5));

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

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

function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), 2 * w + 1, 1);
  }
}

function ring(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  const steps = Math.max(16, Math.floor(r * 6));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}

// Rend une planète ombrée avec tramage dans un canvas hors-écran (mis en cache).
function renderPlanet(r, body, light = [-0.8, -0.3, 0.55]) {
  const size = r * 2 + 1;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  const img = octx.createImageData(size, size);
  const def = BODY_TYPES[body.type];
  const pal = def.palette.map(hexToRgb);
  const night = [8, 9, 16];
  const levels = [night, pal[0], pal[1], pal[2]];
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
      let tex;
      if (def.banded) tex = 0.5 + 0.5 * Math.sin(ny * 9 + fbm(nx * 2, ny * 6, seed) * 4);
      else if (body.type === 'elw') tex = fbm(nx * 3 + 5, ny * 3, seed) > 0.52 ? 0.55 : 0.1;
      else tex = fbm(nx * 3 + 5, ny * 3 + 5, seed);
      const v = shade * (0.55 + 0.6 * tex);
      let idx = Math.floor(v * 3.2 + 0.4 + BAYER[y & 3][x & 3]);
      idx = Math.max(0, Math.min(3, idx));
      let c = levels[idx];
      if (body.type === 'elw' && shade > 0.3 && hash2(x >> 1, y, seed) > 0.93) c = [240, 245, 255];
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

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const cache = new Map();
  let currentStar = 'G';
  const starRng = new Rng(99);
  const stars = Array.from({ length: 140 }, () => ({
    x: starRng.range(0, W),
    y: starRng.range(0, H),
    b: starRng.range(0.2, 1),
    tw: starRng.range(0, 6.28),
  }));

  function planet(body, r) {
    const key = `${body.id}:${r}`;
    if (!cache.has(key)) {
      if (cache.size > 80) cache.clear();
      cache.set(key, renderPlanet(r, body));
    }
    return cache.get(key);
  }

  function starfield(t, drift = 2, tint = '#ffffff') {
    ctx.fillStyle = '#04050b';
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const x = (s.x - t * drift * s.b + W * 10) % W;
      const tw = 0.6 + 0.4 * Math.sin(t * 2 + s.tw);
      ctx.globalAlpha = s.b * tw;
      ctx.fillStyle = s.b > 0.85 ? tint : '#c8d0ff';
      ctx.fillRect(Math.round(x), Math.round(s.y), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawStar(code, cx, cy, t) {
    const s = STAR_CLASSES[code];
    if (code === 'BH') {
      // Disque d'accrétion et lentille gravitationnelle.
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.25 - i * 0.07;
        ring(ctx, cx, cy, s.radius + 6 + i * 3, '#8fb0ff');
      }
      ctx.globalAlpha = 1;
      for (let i = -40; i <= 40; i++) {
        const a = i / 40;
        const y = cy + Math.sin(t * 0.5 + i) * 0.5;
        ctx.fillStyle = Math.abs(a) < 0.3 ? '#ffe2a8' : '#ff9a3a';
        ctx.fillRect(Math.round(cx + i), Math.round(y + a * 2), 1, 2);
      }
      disc(ctx, cx, cy, s.radius, '#000000');
      ring(ctx, cx, cy, s.radius + 1, '#ffb36b');
      return;
    }
    const glowR = s.radius * 1.9 + 6;
    for (let i = 5; i >= 1; i--) {
      ctx.globalAlpha = 0.07 + (5 - i) * 0.02;
      disc(ctx, cx, cy, Math.round(s.radius + (glowR - s.radius) * (i / 5) + Math.sin(t * 1.5 + i) * 1), s.glow);
    }
    ctx.globalAlpha = 1;
    disc(ctx, cx, cy, s.radius, s.color);
    // Granulation
    const sr = new Rng(hashMix(code, Math.floor(t * 4)));
    for (let i = 0; i < s.radius * 2; i++) {
      const a = sr.range(0, 6.28), d = sr.range(0, s.radius - 1);
      ctx.fillStyle = s.glow;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1);
    }
    ctx.globalAlpha = 1;
    if (s.boost) {
      // Cônes de jet (étoile à neutrons, naine blanche).
      const len = s.boost >= 4 ? 90 : 55;
      for (let i = 0; i < len; i++) {
        const spread = i * 0.18;
        const flick = Math.sin(t * 20 + i * 0.7) > 0 ? 1 : 0.6;
        ctx.globalAlpha = (1 - i / len) * 0.8 * flick;
        ctx.fillStyle = i % 3 ? '#9fdcff' : '#ffffff';
        ctx.fillRect(Math.round(cx - spread / 2), Math.round(cy - s.radius - i), Math.max(1, Math.round(spread)), 1);
        ctx.fillRect(Math.round(cx - spread / 2), Math.round(cy + s.radius + i), Math.max(1, Math.round(spread)), 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawShip(x, y, t, { scale = 1, thrust = 0, gear = false, flip = false } = {}) {
    const flame = thrust > 0 ? (Math.sin(t * 40) > 0 ? '#ffe28a' : '#ff7a2a') : '#3a2a20';
    drawSprite(ctx, SHIP, SHIP_PALETTE, x, y, scale, flip, { e: flame });
    if (gear) drawSprite(ctx, SHIP_GEAR, SHIP_PALETTE, x, y + SHIP.length * scale, scale, flip);
  }

  // Disposition des corps dans la vue système.
  function layoutBodies(system) {
    const n = system.bodies.length;
    const left = 118, right = 308;
    const spacing = n > 1 ? (right - left) / (n - 1) : 0;
    return system.bodies.map((b, i) => {
      const x = n > 1 ? left + i * spacing : (left + right) / 2;
      const maxR = n > 1 ? Math.max(4, Math.floor(spacing / 2) - 2) : 18;
      const r = Math.min(b.size, maxR);
      const y = 92 + (i % 2 ? 10 : -6);
      return { body: b, x: Math.round(x), y, r };
    });
  }

  function systemScene(view, t) {
    const { state } = view;
    const sys = state.system;
    starfield(t, 1.5);
    const star = STAR_CLASSES[sys.star];
    const starX = star.radius > 20 ? 4 : 24;
    const starY = 90;
    drawStar(sys.star, starX, starY, t);

    const shipX = Math.max(starX + star.radius + 12, 46);
    const shipY = 104 + Math.round(Math.sin(t * 1.6) * 1.5);
    const shipCx = shipX + 13;

    // Ligne d'orbite
    ctx.fillStyle = '#1b2236';
    for (let x = 100; x < W; x += 3) ctx.fillRect(x, 92, 1, 1);

    const layout = layoutBodies(sys);
    view.layout = layout;
    const wave = view.scanWave;
    for (const { body, x, y, r } of layout) {
      const visible = body.revealed >= 1 && (wave == null || wave > x - shipCx);
      if (visible) {
        if (body.rings) {
          ctx.fillStyle = '#b8a888';
          ctx.globalAlpha = 0.7;
          ctx.fillRect(x - r - 5, y, r * 2 + 11, 1);
          ctx.globalAlpha = 1;
        }
        ctx.drawImage(planet(body, r), x - r, y - r);
        if (body.rings) {
          ctx.fillStyle = '#d8c8a0';
          ctx.fillRect(x - r - 5, y + 1, 5, 1);
          ctx.fillRect(x + r + 1, y + 1, 5, 1);
        }
      } else {
        const blink = 0.4 + 0.3 * Math.sin(t * 3 + x);
        ctx.globalAlpha = blink;
        ring(ctx, x, y, 3, '#7a86a8');
        ctx.globalAlpha = 1;
      }
      const labelY = y + Math.max(r, 4) + 4;
      drawText(ctx, body.index, x - (String(body.index).length * 4) / 2 + 1, labelY, visible ? '#8892b0' : '#4a5270');
      if (visible && (body.revealed >= 2 ? body.bio || body.geo || body.feature || body.terraformable : body.hint)) {
        drawText(ctx, '!', x - 1, y - Math.max(r, 4) - 8, Math.sin(t * 5) > 0 ? '#ffb347' : '#ff7a2a');
      }
      if (body.landed) {
        ctx.fillStyle = '#6fd3ff';
        ctx.fillRect(x - 1, y - Math.max(r, 4) - 3, 3, 1);
      }
      if (view.selectedBodyId === body.id) {
        const s = Math.max(r, 4) + 3 + (Math.sin(t * 6) > 0 ? 1 : 0);
        ctx.fillStyle = '#ffb347';
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.fillRect(x + sx * s - (sx > 0 ? 2 : 0), y + sy * s, 3, 1);
          ctx.fillRect(x + sx * s, y + sy * s - (sy > 0 ? 2 : 0), 1, 3);
        }
      }
    }

    // Vague du scan automatique
    if (wave != null && wave < 400) {
      ctx.globalAlpha = Math.max(0, 1 - wave / 300);
      ring(ctx, shipCx, shipY + 4, wave, '#6fd3ff');
      ring(ctx, shipCx, shipY + 4, Math.max(0, wave - 4), '#2a6f9a');
      ctx.globalAlpha = 1;
    }
    // Rayon du scan manuel
    if (view.beam && view.beam.until > t) {
      const target = layout.find((l) => l.body.id === view.beam.bodyId);
      if (target) {
        const steps = 60;
        for (let i = 0; i < steps; i++) {
          if ((i + Math.floor(t * 30)) % 3 === 0) continue;
          const k = i / steps;
          ctx.fillStyle = '#6fd3ff';
          ctx.fillRect(Math.round(shipCx + 13 + (target.x - shipCx - 13) * k), Math.round(shipY + 4 + (target.y - shipY - 4) * k), 1, 1);
        }
      }
    }
    // Écopage : traînée de plasma vers le vaisseau
    if (view.scoopUntil && view.scoopUntil > t) {
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? star.color : star.glow;
        ctx.fillRect(Math.round(shipX - Math.random() * 20), Math.round(shipY + 2 + Math.random() * 6), 1, 1);
      }
    }
    drawShip(shipX, shipY, t, { thrust: 1 });
  }

  function jumpScene(view, t) {
    const k = Math.min(1, view.sceneTime / JUMP_DURATION);
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, W, H);
    const target = STAR_CLASSES[view.jumpStar || 'G'];
    const rng = new Rng(7);
    for (let i = 0; i < 160; i++) {
      const a = rng.range(0, 6.28);
      const speed = rng.range(0.4, 1.2);
      const d0 = ((rng.range(0, 1) + view.sceneTime * speed * 1.4) % 1) * 200;
      const len = 4 + d0 * 0.25 * (0.5 + k);
      const cx = W / 2, cy = H / 2;
      ctx.fillStyle = i % 4 === 0 ? target.glow : i % 3 === 0 ? '#ffffff' : '#6a7cff';
      ctx.globalAlpha = Math.min(1, d0 / 60);
      for (let j = 0; j < len; j += 1) {
        ctx.fillRect(Math.round(cx + Math.cos(a) * (d0 + j)), Math.round(cy + Math.sin(a) * (d0 + j) * 0.7), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    // Le tunnel s'ouvre sur l'étoile cible.
    disc(ctx, W / 2, H / 2, Math.round(2 + k * k * 30), target.color);
    drawShip(W / 2 - 13, H / 2 + 22, view.sceneTime, { thrust: 1 });
    if (k > 0.85) {
      ctx.globalAlpha = (k - 0.85) / 0.15;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ----- Surface -----

  function terrain(body) {
    const key = `terrain:${body.id}`;
    if (cache.has(key)) return cache.get(key);
    const pal = BODY_TYPES[body.type].palette;
    const seed = body.seed % 100000;
    const far = [], near = [];
    for (let x = 0; x < W; x++) {
      far.push(118 + Math.round(fbm(x / 40, 0, seed) * 26 - 13));
      let h = 140 + Math.round(fbm(x / 22, 3, seed + 1) * 14 - 7);
      if (x > 60 && x < 130) h = 140; // zone d'atterrissage plane
      near.push(h);
    }
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const o = off.getContext('2d');
    for (let x = 0; x < W; x++) {
      o.fillStyle = pal[0];
      o.fillRect(x, far[x], 1, H - far[x]);
      o.fillStyle = pal[1];
      o.fillRect(x, near[x], 1, H - near[x]);
      o.fillStyle = pal[2];
      o.fillRect(x, near[x], 1, 1);
      for (let y = near[x] + 2; y < H; y++) {
        if (hash2(x, y, seed) > 0.93) {
          o.fillStyle = hash2(y, x, seed) > 0.5 ? pal[0] : pal[2];
          o.fillRect(x, y, 1, 1);
        }
      }
    }
    const t = { canvas: off, near, far };
    cache.set(key, t);
    return t;
  }

  function surfaceBackdrop(body, t) {
    starfield(t, 0.2);
    // Étoile du système, basse sur l'horizon, et une planète voisine dans le ciel.
    const star = STAR_CLASSES[currentStar];
    disc(ctx, 270, 34, Math.max(2, Math.round(star.radius / 8)), star.color === '#000000' ? '#ff9a3a' : star.color);
    const ter = terrain(body);
    ctx.drawImage(ter.canvas, 0, 0);
    return ter;
  }

  function drawFeatures(body, sf, ter, t) {
    if (!sf || !sf.analyzed) return;
    const g = (x) => ter.near[x];
    if (body.bio) {
      for (let i = 0; i < body.bio * 3; i++) {
        const x = 150 + ((i * 37 + body.seed) % 150);
        const y = g(x);
        const sway = Math.sin(t * 2 + i) > 0.6 ? 1 : 0;
        ctx.fillStyle = ['#7ef0a0', '#e0f070', '#f07ad0', '#70d0f0'][i % 4];
        ctx.fillRect(x + sway, y - 3, 1, 3);
        ctx.fillRect(x - 1 + sway, y - 4, 3, 1);
      }
    }
    if (body.geo) {
      const x = 250;
      const y = g(x);
      const phase = (t * 0.7) % 3;
      ctx.fillStyle = '#3a3a4a';
      ctx.fillRect(x - 3, y - 2, 7, 2);
      if (phase < 1.4) {
        for (let i = 0; i < 25; i++) {
          ctx.fillStyle = i % 2 ? '#d6ecff' : '#9fc8e8';
          ctx.globalAlpha = 1 - i / 25;
          ctx.fillRect(x + Math.round(Math.sin(i + t * 8) * (i / 8)), y - 2 - Math.round(i * phase * 1.4), 1, 1);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (body.feature === 'crash') {
      const x = 200, y = g(200);
      drawShip(x, y - 7, t, { flip: true });
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x - 6, y - 1, 40, 2);
      if (Math.sin(t * 3) > 0) {
        ctx.fillStyle = '#ff3a3a';
        ctx.fillRect(x + 10, y - 9, 1, 1);
      }
    }
    if (body.feature === 'guardian') {
      for (let i = 0; i < 4; i++) {
        const x = 180 + i * 28, y = g(x);
        ctx.fillStyle = '#3a4a5a';
        ctx.fillRect(x, y - 16 + (i % 2) * 4, 4, 16 - (i % 2) * 4);
        ctx.fillStyle = Math.sin(t * 2 + i) > 0 ? '#5affd8' : '#2a9a88';
        ctx.fillRect(x + 1, y - 12 + (i % 2) * 4, 2, 1);
        ctx.fillRect(x + 1, y - 8 + (i % 2) * 4, 2, 1);
      }
    }
    if (body.feature === 'thargoid') {
      for (let i = 0; i < 5; i++) {
        const x = 175 + i * 22, y = g(x);
        const h = 10 + ((i * 7) % 12);
        ctx.fillStyle = '#141a14';
        for (let j = 0; j < h; j++) ctx.fillRect(x + Math.round(Math.sin(j / 3 + i) * 2), y - j, 3, 1);
        ctx.fillStyle = Math.sin(t * 3 + i) > 0 ? '#4be08a' : '#1f7a44';
        ctx.fillRect(x + 1, y - h, 1, 1);
      }
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#4be08a';
      ctx.fillRect(160, 110, 160, 70);
      ctx.globalAlpha = 1;
    }
  }

  const SHIP_LAND_X = 80;

  function landingScene(view, t) {
    const body = view.body;
    const st = view.sceneTime;
    if (st < 2.2) {
      // Orbite : courbe de la planète en bas de l'écran.
      starfield(t, 4);
      const R = 260;
      const img = planet({ ...body, id: `${body.id}-big` }, R);
      ctx.drawImage(img, W / 2 - R, 120 - Math.round(st * 8));
      const k = st / 2.2;
      drawShip(-30 + k * 260, 50 + k * 30, t, { thrust: 1 });
      return;
    }
    const ter = surfaceBackdrop(body, t);
    const groundY = ter.near[SHIP_LAND_X + 26];
    const shipH = SHIP.length * 2;
    const landedY = groundY - shipH - 4;
    if (st < 4.4) {
      // Descente
      const k = (st - 2.2) / 2.2;
      const ease = 1 - (1 - k) * (1 - k);
      const y = -30 + (landedY + 30) * ease;
      const x = SHIP_LAND_X - 60 + 60 * ease;
      drawShip(x, y, t, { scale: 2, thrust: 1, gear: k > 0.7 });
      // Poussée verticale
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#ffe28a' : '#ff7a2a';
        ctx.globalAlpha = 0.8 - i * 0.12;
        ctx.fillRect(Math.round(x + 14 + (i % 3) * 8), Math.round(y + shipH + i * 2), 2, 2);
      }
      ctx.globalAlpha = 1;
      return;
    }
    drawShip(SHIP_LAND_X, landedY, t, { scale: 2, gear: true });
    // Poussière d'atterrissage
    if (st < 5.4) {
      const k = (st - 4.4) / 1;
      for (let i = 0; i < 20; i++) {
        const dir = i % 2 ? 1 : -1;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = BODY_TYPES[body.type].palette[2];
        ctx.fillRect(Math.round(SHIP_LAND_X + 26 + dir * (10 + k * (20 + i * 2))), Math.round(groundY - 1 - (i % 4) - k * 3), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    // Rampe
    const rampTopX = SHIP_LAND_X + 30;
    const rampTopY = landedY + shipH - 1;
    const open = Math.min(1, Math.max(0, (st - 5.0) / 0.8));
    const rampLen = 14;
    const angle = (Math.PI / 2) * (1 - open) + 0.5 * open; // de replié à incliné
    const rampEndX = rampTopX - Math.cos(angle) * rampLen;
    const rampEndY = rampTopY + Math.sin(angle) * rampLen * open + (1 - open) * 1;
    for (let i = 0; i <= rampLen; i++) {
      const k = i / rampLen;
      ctx.fillStyle = '#5a6270';
      ctx.fillRect(Math.round(rampTopX + (rampEndX - rampTopX) * k), Math.round(rampTopY + (rampEndY - rampTopY) * k), 2, 1);
    }
    if (open > 0) {
      ctx.fillStyle = '#ffd38a';
      ctx.globalAlpha = 0.6 * open;
      ctx.fillRect(rampTopX - 2, rampTopY - 6, 6, 6);
      ctx.globalAlpha = 1;
    }
    // Le commandant sort
    if (st > 5.9) {
      const k = Math.min(1, (st - 5.9) / 1.5);
      let ax, ay;
      if (k < 0.6) {
        const kk = k / 0.6;
        ax = rampTopX - (rampTopX - rampEndX) * kk;
        ay = rampTopY + (rampEndY - rampTopY) * kk - 9;
      } else {
        const kk = (k - 0.6) / 0.4;
        ax = rampEndX - kk * 18;
        ay = groundY - 9;
      }
      const frame = k >= 1 ? 2 : Math.floor(st * 6) % 2;
      drawSprite(ctx, ASTRO_FRAMES[frame], ASTRO_PALETTE, Math.round(ax) - 3, Math.round(ay), 1, true);
    }
    view.astroDone = st > 7.4;
  }

  function surfaceScene(view, t) {
    const body = view.body;
    const ter = surfaceBackdrop(body, t);
    drawFeatures(body, view.state.surface, ter, t);
    const groundY = ter.near[SHIP_LAND_X + 26];
    const shipH = SHIP.length * 2;
    const landedY = groundY - shipH - 4;
    drawShip(SHIP_LAND_X, landedY, t, { scale: 2, gear: true });
    const rampTopX = SHIP_LAND_X + 30, rampTopY = landedY + shipH - 1;
    for (let i = 0; i <= 14; i++) {
      const k = i / 14;
      ctx.fillStyle = '#5a6270';
      ctx.fillRect(Math.round(rampTopX - Math.cos(0.5) * 14 * k), Math.round(rampTopY + Math.sin(0.5) * 14 * k), 2, 1);
    }
    // Le commandant s'avance vers ce qu'il observe.
    const target = view.state.surface && view.state.surface.analyzed ? 150 : 100;
    view.astroX = view.astroX ?? 100;
    const moving = Math.abs(view.astroX - target) > 0.5;
    if (moving) view.astroX += Math.sign(target - view.astroX) * 0.6;
    const ax = Math.round(view.astroX);
    const frame = moving ? Math.floor(t * 6) % 2 : 2;
    drawSprite(ctx, ASTRO_FRAMES[frame], ASTRO_PALETTE, ax, ter.near[ax + 3] - 9, 1, target < view.astroX);
    // Lumière de la combinaison
    if (Math.sin(t * 2) > 0.8) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ax + (target < view.astroX ? 1 : 4), ter.near[ax + 3] - 8, 1, 1);
    }
  }

  function takeoffScene(view, t) {
    const body = view.body;
    const ter = surfaceBackdrop(body, t);
    const groundY = ter.near[SHIP_LAND_X + 26];
    const shipH = SHIP.length * 2;
    const landedY = groundY - shipH - 4;
    const k = view.sceneTime / TAKEOFF_DURATION;
    const y = landedY - k * k * 220;
    const x = SHIP_LAND_X + k * k * 120;
    drawShip(x, y, t, { scale: 2, thrust: 1, gear: k < 0.25 });
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#ffe28a' : '#ff7a2a';
      ctx.globalAlpha = 0.8 - i * 0.12;
      ctx.fillRect(Math.round(x + 14 + (i % 3) * 8), Math.round(y + shipH + i * 2), 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function endScene(view, t) {
    starfield(t, 0.5);
    const victory = view.state.phase === 'victory';
    if (victory) {
      // La nébuleuse de destination.
      for (let i = 0; i < 400; i++) {
        const a = hash2(i, 1, 3) * 6.28, d = hash2(i, 2, 3) * 70;
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = i % 3 ? '#b67ae0' : '#ff7ab0';
        ctx.fillRect(Math.round(200 + Math.cos(a) * d * 1.3 + Math.sin(t + i) * 0.5), Math.round(80 + Math.sin(a) * d * 0.7), 2, 2);
      }
      ctx.globalAlpha = 1;
      drawShip(60 + Math.sin(t) * 2, 100, t, { thrust: 1 });
    } else {
      // Épave dérivante.
      ctx.save();
      ctx.translate(160, 90);
      ctx.rotate(t * 0.15);
      drawShip(-13, -4, t, {});
      ctx.restore();
    }
  }

  return {
    render(view, t) {
      ctx.imageSmoothingEnabled = false;
      currentStar = view.state?.system?.star || 'G';
      switch (view.scene) {
        case 'jump': jumpScene(view, t); break;
        case 'landing': landingScene(view, t); break;
        case 'surface': surfaceScene(view, t); break;
        case 'takeoff': takeoffScene(view, t); break;
        case 'end': endScene(view, t); break;
        default: systemScene(view, t);
      }
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
