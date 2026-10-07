// Sprites pixel art définis en texte : une lettre = une couleur de palette.

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
