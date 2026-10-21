// Sprites pixel art définis en texte : une lettre = une couleur de palette.
//
// Vaisseaux : Mandalay, Diamondback Explorer, Krait Phantom et Asp Explorer (profil, nez à droite).
// Astronaute : combinaison EVA blanche, visière dorée, sac de survie.
// Chaque image fixe est pré-rendue une seule fois dans un petit canvas
// hors écran (création paresseuse : rien n'est créé à l'import du module),
// puis copiée avec drawImage ; seuls les éléments animés (panache, feux,
// train d'atterrissage, voyant du scanner) sont dessinés à chaque image.
//
// Finesse : le pré-rendu se fait à K× (pixel deux fois plus fin que le repère logique).
// Les dessins sont agrandis par Scale2x, qui arrondit les diagonales sans flou, puis le
// contour est adouci côté lumière ; panache et effets sont tracés directement au pixel fin.
import { K } from './scenery.js';
import { SHIP_MODELS } from './shipsprites.js';
const PX = 1 / K;
const snap = (v) => Math.round(v * K) / K;

// Palette commune (ombres teintées bleu-violet, lumières chaudes, lumière en haut à gauche).
export const SPRITE_PALETTE = {
  o: '#141a2b', // contour
  x: '#0c0f1a', // noir profond
  d: '#3d4363', // ombre profonde
  s: '#6c7392', // ombre
  m: '#a4aabd', // ton moyen
  l: '#d4d8df', // clair
  w: '#f6f2e8', // reflet (chaud)
  a: '#ea8a2e', // orange Zorgon Peterson
  b: '#a14c22', // orange sombre
  y: '#ffe9a8', // lampe
  c: '#17223a', // verrière sombre
  k: '#2f4d7a', // verrière reflet bleu
  g: '#cdf2ff', // éclat de verrière
  e: '#20283d', // tuyère éteinte
  r: '#4d5472', // bord de tuyère
};

// ---------------------------------------------------------------------------
// Vaisseaux : quatre modèles dessinés au pixel fin (shipsprites.js), même cadre pour tous.
export const SHIP_W = 64;
export const SHIP_H = 20;
export const SHIP_GEAR_H = 4;
export const SHIP_SMALL_W = 30;
export const SHIP_SMALL_H = 11;
export const SHIP_MODEL_IDS = Object.keys(SHIP_MODELS);
const modelOf = (id) => SHIP_MODELS[id] || SHIP_MODELS.mandalay;
const modelId = (id) => (SHIP_MODELS[id] ? id : 'mandalay');

// Tuyères : suites verticales de pixels « e » dans la colonne de gauche (pixels fins).
// Le panache part vers la gauche, sa longueur suit la hauteur de la tuyère.
const portsCache = new Map();
function portsOf(id, small) {
  const key = id + (small ? '|s' : '');
  let ports = portsCache.get(key);
  if (ports) return ports;
  const rows = small ? modelOf(id).small : modelOf(id).rows;
  ports = [];
  for (let y = 0; y < rows.length; y++) {
    if (rows[y][0] !== 'e') continue;
    let y1 = y;
    while (y1 + 1 < rows.length && rows[y1 + 1][0] === 'e') y1++;
    const h = (y1 - y + 1) / K;
    ports.push({ y0: y, y1, len: small ? 6 + 2.5 * h : 8 + 4 * h });
    y = y1;
  }
  portsCache.set(key, ports);
  return ports;
}

// Feux de la petite version : ceux de la grande, ramenés à son échelle.
const smallLight = ([x, y, c, ph]) => [Math.round((x * SHIP_SMALL_W) / SHIP_W), Math.round((y * SHIP_SMALL_H) / SHIP_H), c, ph];

// Sas / départ de la rampe : sous la coque, juste derrière le train avant.
export function shipHatch(id) {
  const x = 47;
  return { x, y: gearTop(modelId(id), x) - 1 };
}
// Compatibilité : sas du Mandalay.
export const SHIP_HATCH = { x: 47, y: 14 };

// ---------------------------------------------------------------------------
// Astronaute : 12×16, tourné vers la droite. Les pieds touchent la ligne 15.
const ASTRO = {
  idle0: [
    '...oooooo...',
    '..owwwlloo..',
    '.owwllloVVo.',
    '.owllloVgVo.',
    '.ollmmovvvo.',
    'ooosmmouuo..',
    'olmossoooo..',
    'olmolwaaso..',
    'oamoldwlmo..',
    'osmsldwlmo..',
    'osdsmoddmo..',
    '.ooosoosso..',
    '...omsowlo..',
    '...omsowlo..',
    '..okddodsso.',
    '...ooo.ooo..',
  ],
  idle1: [
    '............',
    '...oooooo...',
    '..owwwlloo..',
    '.owwllloVVo.',
    '.owllloVgVo.',
    '.ollmmovvvo.',
    'ooosmmouuo..',
    'olmossoooo..',
    'olmolwaaso..',
    'oamoldwlmo..',
    'osmsldwlmo..',
    'osdsmoddmo..',
    '.ooosoosso..',
    '...omsowlo..',
    '..okddodsso.',
    '...ooo.ooo..',
  ],
  w0: [
    '............',
    '...oooooo...',
    '..owwwlloo..',
    '.owwllloVVo.',
    '.owllloVgVo.',
    '.ollmmovvvo.',
    'ooosmmouuo..',
    'olmossoooo..',
    'olmodaadmo..',
    'oamowldmmo..',
    'osowldlmmo..',
    'osoddommmo..',
    '.ooooddsso..',
    '.oomsoowloo.',
    'okddo..odsso',
    '.ooo....ooo.',
  ],
  w1: [
    '...oooooo...',
    '..owwwlloo..',
    '.owwllloVVo.',
    '.owllloVgVo.',
    '.ollmmovvvo.',
    'ooosmmouuo..',
    'olmossoooo..',
    'olmolwaaso..',
    'oamoldwlmo..',
    'osmsldwlmo..',
    'osdsmoddmo..',
    '.ooosoosso..',
    '...omswlo...',
    '..okddwlo...',
    '...ooodsso..',
    '......ooo...',
  ],
  w2: [
    '............',
    '...oooooo...',
    '..owwwlloo..',
    '.owwllloVVo.',
    '.owllloVgVo.',
    '.ollmmovvvo.',
    'ooosmmouuo..',
    'olmossoooo..',
    'olmolwaaoo..',
    'oamoldwllo..',
    'osmslldwlo..',
    'osdsmmmoddo.',
    '.ooosddsoo..',
    '.oowloomsoo.',
    'odsso..okddo',
    '.ooo....ooo.',
  ],
  w3: [
    '...oooooo...',
    '..owwwlloo..',
    '.owwllloVVo.',
    '.owllloVgVo.',
    '.ollmmovvvo.',
    'ooosmmouuo..',
    'olmossoooo..',
    'olmolwaaso..',
    'oamoldwlmo..',
    'osmsldwlmo..',
    'osdsmoddmo..',
    '.ooosoosso..',
    '...omswlo...',
    '...omsdsso..',
    '...okddoo...',
    '....ooo.....',
  ],
  scan: [
    '...oooooo...',
    '..owwwlloo..',
    '.owwllloVVo.',
    '.owllloVgVo.',
    '.ollmmovvvo.',
    'ooosmmouuo..',
    'olmossoooooo',
    'olmolwawlkco',
    'oamoldlmdkko',
    'osmslldddoo.',
    'osdsmmmmmo..',
    '.ooosddsso..',
    '...omsowlo..',
    '...omsowlo..',
    '..okddodsso.',
    '...ooo.ooo..',
  ],
};

// Palette de la combinaison : celle du vaisseau + visière dorée et scanner.
const ASTRO_PALETTE_V2 = {
  ...SPRITE_PALETTE,
  V: '#ffd27a', // visière, reflet
  v: '#e0902e', // visière
  u: '#7a3a22', // visière, ombre
  g: '#ffffff', // éclat de visière
  k: '#232a45', // bottes, scanner
  c: '#6fe8ff', // voyant du scanner
};

export const ASTRO_W = 12;
export const ASTRO_H = 16;
const WALK = ['w0', 'w1', 'w2', 'w3'];
const SCAN_LIGHT = { x: 10, y: 7 };

// ---------------------------------------------------------------------------
// Pré-rendu paresseux.
const baked = new Map();

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

// Scale2x (EPX) sur la grille de lettres : chaque pixel devient 2×2 et les escaliers
// des diagonales et des courbes sont arrondis, sans couleur inventée.
export function scale2x(rows) {
  const h = rows.length, w = rows[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : rows[y][x]);
  const top = [], bot = [];
  for (let y = 0; y < h; y++) {
    let r0 = '', r1 = '';
    for (let x = 0; x < w; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
      r0 += (C === A && C !== D && A !== B ? A : P) + (A === B && A !== C && B !== D ? B : P);
      r1 += (D === C && D !== B && C !== A ? C : P) + (B === D && B !== A && D !== C ? D : P);
    }
    top.push(r0);
    bot.push(r1);
  }
  return top.flatMap((r, i) => [r, bot[i]]);
}

// Contour adouci : sur le dessus (côté lumière), le trait noir devient une ombre bleutée
// quand il borde une surface claire ; il reste sombre partout ailleurs pour la lisibilité.
const LIGHT = new Set(['w', 'l', 'm', 'a', 'A', 'g', 'h', 'V']);
function softenOutline(rows) {
  const h = rows.length, w = rows[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : rows[y][x]);
  return rows.map((row, y) => [...row].map((ch, x) => {
    if (ch !== 'o') return ch;
    if (at(x, y - 1) === '.' && LIGHT.has(at(x, y + 1))) return 'd';
    return ch;
  }).join(''));
}

const hiRes = new Map();
// fine : lignes déjà dessinées au pixel fin (×2), seulement agrandies si K > 2.
function rowsK(key, rows, fine = false) {
  let r = hiRes.get(key);
  if (!r) {
    r = rows;
    for (let s = fine ? 2 : 1; s < K; s *= 2) r = scale2x(r);
    r = softenOutline(r);
    hiRes.set(key, r);
  }
  return r;
}

function bake(key, rows, flip, palette = SPRITE_PALETTE, fine = false) {
  const k = key + (flip ? '|f' : '');
  let c = baked.get(k);
  if (c) return c;
  const hr = rowsK(key, rows, fine);
  c = makeCanvas(hr[0].length, hr.length);
  const g = c.getContext('2d');
  drawSprite(g, hr, palette, 0, 0, 1, flip);
  baked.set(k, c);
  return c;
}
// Pose un pré-rendu K× à sa taille logique.
const put = (ctx, c, x, y) => ctx.drawImage(c, x, y, c.width / K, c.height / K);

// Petit bruit déterministe pour le scintillement.
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------------------
// x, y = coin haut gauche de la coque ; le vaisseau regarde à droite sauf si flip.
// model : 'mandalay' | 'dbx' | 'krait' | 'asp' (Mandalay par défaut).
export function drawShip(ctx, x, y, { t = 0, thrust = 0, gear = 0, flip = false, small = false, model = 'mandalay' } = {}) {
  x = snap(x); y = snap(y);
  t = Number.isFinite(t) ? t : 0;
  const id = modelId(model);
  const M = SHIP_MODELS[id];
  const W = small ? SHIP_SMALL_W : SHIP_W;
  // rectangle local -> écran (gère le miroir)
  const rect = (lx, ly, w, h) => ctx.fillRect(flip ? x + W - lx - w : x + lx, y + ly, w, h);
  const th = Math.max(0, Math.min(1, thrust));
  const ports = portsOf(id, small);

  // 1. Panache des moteurs (derrière la coque), tracé au pixel fin : un fuseau bleu
  // translucide, un jet cyan, un cœur presque blanc, et une traînée qui s'efface.
  if (th > 0.01) {
    ports.forEach((p, pi) => {
      const flick = 0.82 + 0.18 * hash(Math.floor(t * 30) + pi * 7.3);
      const L = Math.max(2, p.len * th * flick + 2);
      const ya = p.y0 / K, yb = (p.y1 + 1) / K;
      const mid = (ya + yb) / 2;
      const half = (yb - ya) / 2 + 1;
      for (let ry = p.y0 - K; ry < p.y1 + 1 + K; ry++) {
        const ly = ry / K;
        const k = 1 - Math.abs(ly + PX / 2 - mid) / half;
        if (k <= 0) continue;
        const outer = snap(L * (0.3 + 0.7 * Math.sqrt(k)));
        const inner = snap(L * 0.72 * k);
        const inCore = ly >= ya && ly < yb;
        const core = inCore ? snap(L * 0.42 * k) : 0;
        ctx.globalAlpha = 0.4 * th * (0.5 + 0.5 * k);
        ctx.fillStyle = '#3d7cff';
        rect(-outer, ly, outer, PX);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#62d6ff';
        if (inner > 0) rect(-inner, ly, inner, PX);
        ctx.fillStyle = '#eafcff';
        if (core > 0) rect(-core, ly, core, PX);
        // traînée ténue au bout du jet (lignes centrales)
        if (inCore && th > 0.3) {
          const tail = snap(L * 0.6 * th);
          for (let j = 0; j < 3; j++) {
            ctx.globalAlpha = 0.18 * th * (1 - j / 3);
            ctx.fillStyle = '#62d6ff';
            rect(-outer - tail * (j + 1) / 3, ly, tail / 3, PX);
          }
        }
      }
      ctx.globalAlpha = 1;
    });
  }

  // 2. Train d'atterrissage (sous la coque, grande version seulement)
  const g = typeof gear === 'boolean' ? (gear ? 1 : 0) : Math.max(0, Math.min(1, gear));
  if (!small && g > 0) {
    const ground = SHIP_H + SHIP_GEAR_H - 1;
    for (const gx of M.gear) {
      const top = gearTop(id, gx);
      const full = ground - 1 - top; // longueur de jambe quand le train est sorti
      const len = Math.round(g * full);
      // jambe : contour + 2 px (clair à gauche, ombre à droite)
      ctx.fillStyle = SPRITE_PALETTE.o;
      rect(gx - 1, top - 1, 3, len + 1);
      ctx.fillStyle = SPRITE_PALETTE.m; rect(gx, top - 1, 1, len);
      // vérin (épaississement sombre en haut de la jambe)
      if (len >= 3) { ctx.fillStyle = SPRITE_PALETTE.s; rect(gx, top - 1, 1, 2); }
      // patin
      const fy = top - 1 + len;
      ctx.fillStyle = SPRITE_PALETTE.o; rect(gx - 2, fy, 5, 2);
      ctx.fillStyle = SPRITE_PALETTE.s; rect(gx - 1, fy, 3, 1);
    }
  }

  // 3. Coque pré-rendue
  put(ctx, bake(`ship_${id}${small ? 'S' : 'L'}`, small ? M.small : M.rows, flip, M.palette, true), x, y);

  // 4. Tuyères : sombres au repos, incandescentes avec la poussée (pixel fin)
  if (th > 0.01) {
    ctx.fillStyle = th > 0.5 ? '#eafcff' : '#62d6ff';
    for (const p of ports) rect(0, p.y0 / K, small ? PX : 1, (p.y1 - p.y0 + 1) / K);
  }

  // 5. Feux de navigation clignotants
  for (const light of M.lights) {
    const [lx, ly, col, ph] = small ? smallLight(light) : light;
    const f = ((((t + ph) % 1.1) + 1.1) % 1.1);
    if (f < 0.22) {
      // Un éclat fin et un petit halo qui s'éteint en douceur.
      const k = f < 0.12 ? 1 : 1 - (f - 0.12) / 0.1;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.35 * k;
      rect(lx - PX, ly - PX, 1 + 2 * PX, 1 + 2 * PX);
      ctx.globalAlpha = k;
      rect(lx, ly, 1, 1);
      ctx.globalAlpha = 1;
    }
  }
}

// Ligne logique où la jambe du train sort (juste sous la coque, colonnes gx et gx + 1).
const gearTops = new Map();
function gearTop(id, gx) {
  const key = id + '|' + gx;
  let v = gearTops.get(key);
  if (v !== undefined) return v;
  const rows = modelOf(id).rows;
  v = 0;
  for (let j = rows.length - 1; j >= 0 && !v; j--) {
    for (let i = gx * 2; i < gx * 2 + 4; i++) if (rows[j][i] && rows[j][i] !== '.') { v = Math.ceil((j + 1) / 2); break; }
  }
  gearTops.set(key, v);
  return v;
}

// Miniature d'un modèle (choix du vaisseau) : image pixel fin, sans train ni panache.
export function shipThumb(model) {
  const id = modelId(model);
  const M = SHIP_MODELS[id];
  return bake(`ship_${id}L`, M.rows, false, M.palette, true);
}

// x, y = coin haut gauche ; pose : 'walk' | 'idle' | 'scan' ; t en secondes.
export function drawAstronaut(ctx, x, y, { t = 0, pose = 'idle', flip = false } = {}) {
  x = snap(x); y = snap(y);
  // t quelconque (grand, négatif, NaN) : index toujours ramené dans les bornes
  t = Number.isFinite(t) ? t : 0;
  const wrap = (n, m) => ((n % m) + m) % m;
  let key;
  if (pose === 'walk') key = WALK[wrap(Math.floor(t * 8), WALK.length)];
  else if (pose === 'scan') key = 'scan';
  else key = wrap(t, 1.8) < 1.1 ? 'idle0' : 'idle1';
  if (!ASTRO[key]) key = 'idle0';
  put(ctx, bake('astro_' + key, ASTRO[key], flip, ASTRO_PALETTE_V2), x, y);
  if (pose === 'scan') {
    const px = (lx) => (flip ? x + ASTRO_W - 1 - lx : x + lx);
    const on = wrap(t * 4, 1) < 0.55;
    ctx.fillStyle = on ? '#8ff3ff' : '#2a6b80';
    ctx.fillRect(px(SCAN_LIGHT.x), y + SCAN_LIGHT.y, 1, 1);
    // faisceau du scanner : cône pointillé vers le sol, devant l'astronaute
    if (on) {
      ctx.fillStyle = '#6fe8ff';
      const tick = Math.floor(t * 24);
      for (let i = 1; i <= 7 * K; i++) {
        const lx = SCAN_LIGHT.x + 1 + i * PX;
        const y0 = SCAN_LIGHT.y + snap(i * PX * 0.6);
        const h = 1 + Math.floor(i * 0.9);
        ctx.globalAlpha = 0.55 * (1 - i / (8 * K));
        for (let j = 0; j < h; j++) if (wrap(i + j + tick, 4) === 0) ctx.fillRect(flip ? x + ASTRO_W - lx - PX : x + lx, y + y0 + j * PX, PX, PX);
      }
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Anciennes définitions (conservées pour compatibilité, à retirer quand plus utilisées).

export const SHIP = [
  '..........aaaaaa..........',
  '.......aaabbbbbbaaa.......',
  '....aaabbbbbbbbbbbbaaddd..',
  '..aabbbccccbbbbbbbbbbbdda.',
  'eeabbbbbbbbbbbbbbbbbbbbbba',
  'eeabbbbbbbbbbbbbbbbbbbbaa.',
  '..aaabbbbbbbbbbbbbbaaaa...',
  '.....aaaaaaaaaaaaaa.......',
];

export const SHIP_GEAR = [
  '......g.........g.........',
  '.....ggg.......ggg........',
];

export const SHIP_PALETTE = {
  a: '#1c2230',
  b: '#8e98a6',
  c: '#e07a2a',
  d: '#6fd3ff',
  e: '#ff9a3a',
  g: '#4a505c',
};

const ASTRO_TOP = [
  '..hh..',
  '.hvvh.',
  '..hh..',
  '.pwwb.',
  'pwwwwb',
  '.wwww.',
  '..ww..',
];

export const ASTRO_FRAMES = [
  [...ASTRO_TOP, '.w..w.', '.w..w.'],
  [...ASTRO_TOP, '..ww..', '.w..w.'],
  [...ASTRO_TOP, '..ww..', '..ww..'],
];

export const ASTRO_PALETTE = {
  h: '#e8eaee',
  v: '#ffb347',
  w: '#cfd4dc',
  b: '#8a93a3',
  p: '#c0662a',
};

// Police pixel 3×5 pour les chiffres et quelques signes.
export const FONT = {
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  '?': ['###', '..#', '.##', '...', '.#.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
};

export function drawSprite(ctx, rows, palette, x, y, scale = 1, flip = false, override = {}) {
  const w = rows[0].length;
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      const color = override[ch] ?? palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      const px = flip ? w - 1 - i : i;
      ctx.fillRect(Math.round(x + px * scale), Math.round(y + j * scale), scale, scale);
    }
  }
}

export function drawText(ctx, text, x, y, color) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of String(text)) {
    const glyph = FONT[ch];
    if (glyph) {
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (glyph[j][i] === '#') ctx.fillRect(cx + i, y + j, 1, 1);
    }
    cx += 4;
  }
}
