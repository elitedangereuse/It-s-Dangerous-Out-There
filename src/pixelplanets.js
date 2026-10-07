// Portage WebGL des shaders « PixelPlanets » de Deep-Fold (projet Godot, licence MIT) :
// https://github.com/Deep-Fold/PixelPlanets
// Chaque planète est un empilement de couches (shaders de fragment) rendues dans un
// canvas WebGL hors-écran partagé, puis recopiées pixel pour pixel sur le contexte 2D du jeu.
// Un pixel de shader = un pixel du canvas (uniforme `pixels` = taille de la couche).
//
// Licence de l'œuvre originale :
//
// MIT License
//
// Copyright (c) 2020 Deep-Fold
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// ---------------------------------------------------------------------------
// Shaders (GLSL ES 1.00 : fonctionne en contexte webgl comme webgl2)
// ---------------------------------------------------------------------------

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// Préambule commun : uniformes partagés et fonctions utilitaires de Deep-Fold.
// RAND_MUL et TILE varient selon les shaders d'origine.
const PRELUDE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_origin;
uniform float u_res;
uniform float pixels;
uniform float rotation;
uniform vec2 light_origin;
uniform float time_speed;
uniform float time;
uniform float size;
uniform float seed;
uniform int OCTAVES;
uniform bool should_dither;
uniform vec4 colors[8];
uniform int n_colors;

// UV façon Godot : origine en haut à gauche, centre du pixel.
vec2 getUV() {
  vec2 p = gl_FragCoord.xy - u_origin;
  return vec2(p.x, u_res - p.y) / u_res;
}
float rnd(float x) { return floor(x + 0.5); }
// smoothstep tolérant aux bornes inversées ou égales (comme les GPU usuels).
float ss(float e0, float e1, float x) {
  float d = e1 - e0;
  if (abs(d) < 1e-6) return step(e0, x);
  float t = clamp((x - e0) / d, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
vec4 pick(int i) {
  vec4 c = colors[0];
  for (int k = 1; k < 8; k++) { if (k == i) c = colors[k]; }
  return c;
}
// Indice borné dans [base, base + n - 1].
vec4 pickIn(int base, int i, int n) {
  return pick(base + int(clamp(float(i), 0.0, float(n - 1))));
}
float rand(vec2 coord) {
#ifdef TILE
  coord = mod(coord, TILE * rnd(size));
#endif
  return fract(sin(dot(coord.xy, vec2(12.9898, 78.233))) * RAND_MUL * seed);
}
float noise(vec2 coord) {
  vec2 i = floor(coord);
  vec2 f = fract(coord);
  float a = rand(i);
  float b = rand(i + vec2(1.0, 0.0));
  float c = rand(i + vec2(0.0, 1.0));
  float d = rand(i + vec2(1.0, 1.0));
  vec2 cubic = f * f * (3.0 - 2.0 * f);
  return mix(a, b, cubic.x) + (c - a) * cubic.y * (1.0 - cubic.x) + (d - b) * cubic.x * cubic.y;
}
float fbm(vec2 coord) {
  float value = 0.0;
  float scale = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= OCTAVES) break;
    value += noise(coord) * scale;
    coord *= 2.0;
    scale *= 0.5;
  }
  return value;
}
bool dither(vec2 uv1, vec2 uv2) {
  return mod(uv1.x + uv2.y, 2.0 / pixels) <= 1.0 / pixels;
}
vec2 rotate(vec2 coord, float angle) {
  coord -= 0.5;
  coord *= mat2(vec2(cos(angle), -sin(angle)), vec2(sin(angle), cos(angle)));
  return coord + 0.5;
}
vec2 spherify(vec2 uv) {
  vec2 centered = uv * 2.0 - 1.0;
  float z = sqrt(max(0.0, 1.0 - dot(centered.xy, centered.xy)));
  vec2 sphere = centered / (z + 1.0);
  return sphere * 0.5 + 0.5;
}
// Leukbaars, https://www.shadertoy.com/view/4tK3zR (variante nuages)
float circleNoise(vec2 uv) {
  float uv_y = floor(uv.y);
  uv.x += uv_y * 0.31;
  vec2 f = fract(uv);
  float h = rand(vec2(floor(uv.x), floor(uv_y)));
  float m = length(f - 0.25 - (h * 0.5));
  float r = h * 0.25;
  return ss(0.0, r, m * 0.75);
}
`;

const SHADERS = {
  // NoAtmosphere/NoAtmosphere.gdshader (aussi le sol de LavaWorld)
  noAtmo: {
    defs: { TILE: 'vec2(1.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float dither_size;
uniform float light_border_1;
uniform float light_border_2;
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  float d_circle = distance(uv, vec2(0.5));
  float d_light = distance(uv, light_origin);
  float a = step(d_circle, 0.49999);
  bool dith = dither(uv, UV);
  uv = rotate(uv, rotation);
  float fbm1 = fbm(uv);
  d_light += fbm(uv * size + fbm1 + vec2(time * time_speed, 0.0)) * 0.3;
  float dither_border = (1.0 / pixels) * dither_size;
  vec4 col = colors[0];
  if (d_light > light_border_1) {
    col = colors[1];
    if (d_light < light_border_1 + dither_border && (dith || !should_dither)) col = colors[0];
  }
  if (d_light > light_border_2) {
    col = colors[2];
    if (d_light < light_border_2 + dither_border && (dith || !should_dither)) col = colors[1];
  }
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },

  // NoAtmosphere/Craters.gdshader
  craters: {
    defs: { TILE: 'vec2(1.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float light_border;
float craterNoise(vec2 uv) {
  float uv_y = floor(uv.y);
  uv.x += uv_y * 0.31;
  vec2 f = fract(uv);
  float h = rand(vec2(floor(uv.x), floor(uv_y)));
  float m = length(f - 0.25 - (h * 0.5));
  float r = h * 0.25;
  return ss(r - 0.10 * r, r, m);
}
float crater(vec2 uv) {
  float c = 1.0;
  for (int i = 0; i < 2; i++) {
    c *= craterNoise((uv * size) + (float(i + 1) + 10.0) + vec2(time * time_speed, 0.0));
  }
  return 1.0 - c;
}
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  float d_circle = distance(uv, vec2(0.5));
  float d_light = distance(uv, light_origin);
  float a = step(d_circle, 0.49999);
  uv = rotate(uv, rotation);
  uv = spherify(uv);
  float c1 = crater(uv);
  float c2 = crater(uv + (light_origin - 0.5) * 0.03);
  vec4 col = colors[0];
  a *= step(0.5, c1);
  if (c2 < c1 - (0.5 - d_light) * 2.0) col = colors[1];
  if (d_light > light_border) col = colors[1];
  a *= step(d_circle, 0.5);
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },

  // DryTerran (shader intégré à DryTerran.tscn)
  dryTerran: {
    defs: { TILE: 'vec2(2.0, 1.0)', RAND_MUL: '43758.5453' },
    src: `
uniform float light_distance1;
uniform float light_distance2;
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  bool dith = dither(uv, UV);
  float d_circle = distance(uv, vec2(0.5));
  float a = step(d_circle, 0.49999);
  uv = spherify(uv);
  float d_light = distance(uv, light_origin);
  uv = rotate(uv, rotation);
  float f = fbm(uv * size + vec2(time * time_speed, 0.0));
  d_light = ss(-0.3, 1.2, d_light);
  if (d_light < light_distance1) d_light *= 0.9;
  if (d_light < light_distance2) d_light *= 0.9;
  float c = d_light * pow(f, 0.8) * 3.5;
  if (dith || !should_dither) {
    c += 0.02;
    c *= 1.05;
  }
  float posterize = floor(c * 4.0) / 4.0;
  posterize = min(posterize, 1.0);
  vec4 col = pickIn(0, int(posterize * float(n_colors - 1)), n_colors);
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },

  // LandMasses/PlanetUnder.gdshader (océan de LandMasses, sol d'IceWorld)
  under: {
    defs: { TILE: 'vec2(2.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float dither_size;
uniform float light_border_1;
uniform float light_border_2;
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  bool dith = dither(uv, UV);
  float d_light = distance(uv, light_origin);
  float d_circle = distance(uv, vec2(0.5));
  float a = step(d_circle, 0.49999);
  uv = spherify(uv);
  uv = rotate(uv, rotation);
  d_light += fbm(uv * size + vec2(time * time_speed, 0.0)) * 0.3;
  float dither_border = (1.0 / pixels) * dither_size;
  vec4 col = colors[0];
  if (d_light > light_border_1) {
    col = colors[1];
    if (d_light < light_border_1 + dither_border && (dith || !should_dither)) col = colors[0];
  }
  if (d_light > light_border_2) {
    col = colors[2];
    if (d_light < light_border_2 + dither_border && (dith || !should_dither)) col = colors[1];
  }
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },

  // LandMasses/PlanetLandmass.gdshader
  landmass: {
    defs: { TILE: 'vec2(2.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float light_border_1;
uniform float light_border_2;
uniform float land_cutoff;
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  float d_light = distance(uv, light_origin);
  float d_circle = distance(uv, vec2(0.5));
  float a = step(d_circle, 0.49999);
  uv = rotate(uv, rotation);
  uv = spherify(uv);
  vec2 base_fbm_uv = uv * size + vec2(time * time_speed, 0.0);
  float fbm1 = fbm(base_fbm_uv);
  float fbm2 = fbm(base_fbm_uv - light_origin * fbm1);
  float fbm3 = fbm(base_fbm_uv - light_origin * 1.5 * fbm1);
  float fbm4 = fbm(base_fbm_uv - light_origin * 2.0 * fbm1);
  if (d_light < light_border_1) fbm4 *= 0.9;
  if (d_light > light_border_1) { fbm2 *= 1.05; fbm3 *= 1.05; fbm4 *= 1.05; }
  if (d_light > light_border_2) { fbm2 *= 1.3; fbm3 *= 1.4; fbm4 *= 1.8; }
  d_light = pow(d_light, 2.0) * 0.1;
  vec4 col = colors[3];
  if (fbm4 + d_light < fbm1) col = colors[2];
  if (fbm3 + d_light < fbm1) col = colors[1];
  if (fbm2 + d_light < fbm1) col = colors[0];
  gl_FragColor = vec4(col.rgb, step(land_cutoff, fbm1) * a * col.a);
}`,
  },

  // LandMasses/Clouds.gdshader — identique à GasPlanet/GasPlanet.gdshader
  clouds: {
    defs: { TILE: 'vec2(1.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float cloud_cover;
uniform float stretch;
uniform float cloud_curve;
uniform float light_border_1;
uniform float light_border_2;
float cloud_alpha(vec2 uv) {
  float c_noise = 0.0;
  for (int i = 0; i < 9; i++) {
    c_noise += circleNoise((uv * size * 0.3) + (float(i + 1) + 10.0) + vec2(time * time_speed, 0.0));
  }
  return fbm(uv * size + c_noise + vec2(time * time_speed, 0.0));
}
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  float d_light = distance(uv, light_origin);
  float a = step(length(uv - vec2(0.5)), 0.49999);
  float d_to_center = distance(uv, vec2(0.5));
  uv = rotate(uv, rotation);
  uv = spherify(uv);
  uv.y += ss(0.0, cloud_curve, abs(uv.x - 0.4));
  float c = cloud_alpha(uv * vec2(1.0, stretch));
  vec4 col = colors[0];
  if (c < cloud_cover + 0.03) col = colors[1];
  if (d_light + c * 0.2 > light_border_1) col = colors[2];
  if (d_light + c * 0.2 > light_border_2) col = colors[3];
  c *= step(d_to_center, 0.5);
  gl_FragColor = vec4(col.rgb, step(cloud_cover, c) * a * col.a);
}`,
  },

  // Rivers/LandRivers.gdshader
  rivers: {
    defs: { TILE: 'vec2(2.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float dither_size;
uniform float light_border_1;
uniform float light_border_2;
uniform float river_cutoff;
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  bool dith = dither(uv, UV);
  float a = step(length(uv - vec2(0.5)), 0.49999);
  uv = spherify(uv);
  float d_light = distance(uv, light_origin);
  uv = rotate(uv, rotation);
  vec2 base_fbm_uv = uv * size + vec2(time * time_speed, 0.0);
  float fbm1 = fbm(base_fbm_uv);
  float fbm2 = fbm(base_fbm_uv - light_origin * fbm1);
  float fbm3 = fbm(base_fbm_uv - light_origin * 1.5 * fbm1);
  float fbm4 = fbm(base_fbm_uv - light_origin * 2.0 * fbm1);
  float river_fbm = fbm(base_fbm_uv + fbm1 * 6.0);
  river_fbm = step(river_cutoff, river_fbm);
  float dither_border = (1.0 / pixels) * dither_size;
  if (d_light < light_border_1) fbm4 *= 0.9;
  if (d_light > light_border_1) { fbm2 *= 1.05; fbm3 *= 1.05; fbm4 *= 1.05; }
  if (d_light > light_border_2) {
    fbm2 *= 1.3; fbm3 *= 1.4; fbm4 *= 1.8;
    if (d_light < light_border_2 + dither_border) {
      if (dith || !should_dither) fbm4 *= 0.5;
    }
  }
  d_light = pow(d_light, 2.0) * 0.4;
  vec4 col = colors[3];
  if (fbm4 + d_light < fbm1 * 1.5) col = colors[2];
  if (fbm3 + d_light < fbm1 * 1.0) col = colors[1];
  if (fbm2 + d_light < fbm1) col = colors[0];
  if (river_fbm < fbm1 * 0.5) {
    col = colors[5];
    if (fbm4 + d_light < fbm1 * 1.5) col = colors[4];
  }
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },

  // Lacs d'IceWorld (shader intégré à IceWorld.tscn)
  iceLakes: {
    defs: { TILE: 'vec2(2.0, 1.0)', RAND_MUL: '43758.5453' },
    src: `
uniform float light_border_1;
uniform float light_border_2;
uniform float lake_cutoff;
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  float d_light = distance(uv, light_origin);
  uv = rotate(uv, rotation);
  float d_circle = distance(uv, vec2(0.5));
  uv = spherify(uv);
  float lake = fbm(uv * size + vec2(time * time_speed, 0.0));
  d_light = pow(d_light, 2.0) * 0.4;
  d_light -= d_light * lake;
  vec4 col = colors[0];
  if (d_light > light_border_1) col = colors[1];
  if (d_light > light_border_2) col = colors[2];
  float a = step(lake_cutoff, lake);
  a *= step(d_circle, 0.5);
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },

  // LavaWorld/Rivers.gdshader
  lavaRivers: {
    defs: { TILE: 'vec2(2.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float light_border_1;
uniform float light_border_2;
uniform float river_cutoff;
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  float d_light = distance(uv, light_origin);
  float d_circle = distance(uv, vec2(0.5));
  float a = step(d_circle, 0.49999);
  uv = rotate(uv, rotation);
  uv = spherify(uv);
  float fbm1 = fbm(uv * size + vec2(time * time_speed, 0.0));
  float river_fbm = fbm(uv + fbm1 * 2.5);
  d_light = pow(d_light, 2.0) * 0.4;
  d_light -= d_light * river_fbm;
  river_fbm = step(river_cutoff, river_fbm);
  vec4 col = colors[0];
  if (d_light > light_border_1) col = colors[1];
  if (d_light > light_border_2) col = colors[2];
  a *= step(river_cutoff, river_fbm);
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },

  // GasPlanetLayers/GasLayers.gdshader (colors[0..2] = colors, colors[3..5] = dark_colors)
  gasLayers: {
    defs: { TILE: 'vec2(2.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float bands;
float turbulence(vec2 uv) {
  float c_noise = 0.0;
  for (int i = 0; i < 10; i++) {
    c_noise += circleNoise((uv * size * 0.3) + (float(i + 1) + 10.0) + vec2(time * time_speed, 0.0));
  }
  return c_noise;
}
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  float light_d = distance(uv, light_origin);
  bool dith = dither(uv, UV);
  float a = step(length(uv - vec2(0.5)), 0.49999);
  uv = rotate(uv, rotation);
  uv = spherify(uv);
  float band = fbm(vec2(0.0, uv.y * size * bands));
  float turb = turbulence(uv);
  float fbm1 = fbm(uv * size);
  float fbm2 = fbm(uv * vec2(1.0, 2.0) * size + fbm1 + vec2(-time * time_speed, 0.0) + turb);
  fbm2 *= pow(band, 2.0) * 7.0;
  float light = fbm2 + light_d * 1.8;
  fbm2 += pow(light_d, 1.0) - 0.3;
  fbm2 = ss(-0.2, 4.0 - fbm2, light);
  if (dith && should_dither) fbm2 *= 1.1;
  float posterized = floor(fbm2 * 4.0) / 2.0;
  vec4 col;
  if (fbm2 < 0.625) {
    col = pickIn(0, int(posterized * float(n_colors - 1)), n_colors);
  } else {
    col = pickIn(3, int((posterized - 1.0) * float(n_colors - 1)), n_colors);
  }
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },

  // GasPlanetLayers/Ring.gdshader
  ring: {
    defs: { TILE: 'vec2(2.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float ring_width;
uniform float ring_perspective;
uniform float scale_rel_to_planet;
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  float light_d = distance(uv, light_origin);
  uv = rotate(uv, rotation);
  vec2 uv_center = uv - vec2(0.0, 0.5);
  uv_center *= vec2(1.0, ring_perspective);
  float center_d = distance(uv_center, vec2(0.5, 0.0));
  float ring = ss(0.5 - ring_width * 2.0, 0.5 - ring_width, center_d);
  ring *= ss(center_d - ring_width, center_d, 0.4);
  if (uv.y < 0.5) ring *= step(1.0 / scale_rel_to_planet, distance(uv, vec2(0.5)));
  uv_center = rotate(uv_center + vec2(0.0, 0.5), time * time_speed);
  ring *= fbm(uv_center * size);
  float posterized = floor((ring + pow(light_d, 2.0) * 2.0) * 4.0) / 4.0;
  posterized = min(posterized, 2.0);
  vec4 col;
  if (posterized <= 1.0) {
    col = pickIn(0, int(posterized * float(n_colors - 1)), n_colors);
  } else {
    col = pickIn(3, int((posterized - 1.0) * float(n_colors - 1)), n_colors);
  }
  float ring_a = step(0.28, ring);
  gl_FragColor = vec4(col.rgb, ring_a * col.a);
}`,
  },

  // Star/Star.gdshader
  star: {
    defs: { TILE: 'vec2(1.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float TILES;
vec2 Hash2(vec2 p) {
  float r = 523.0 * sin(dot(p, vec2(53.3158, 43.6143)));
  return vec2(fract(15.32354 * r), fract(17.25865 * r));
}
// Bruit cellulaire répétable de Dave_Hoskins : https://www.shadertoy.com/view/4djGRh
float Cells(vec2 p, float numCells) {
  p *= numCells;
  float d = 1.0e10;
  for (int xo = -1; xo <= 1; xo++) {
    for (int yo = -1; yo <= 1; yo++) {
      vec2 tp = floor(p) + vec2(float(xo), float(yo));
      tp = p - tp - Hash2(mod(tp, numCells / TILES));
      d = min(d, dot(tp, tp));
    }
  }
  return sqrt(d);
}
void main() {
  vec2 UV = getUV();
  vec2 pixelized = floor(UV * pixels) / pixels;
  float a = step(distance(pixelized, vec2(0.5)), 0.49999);
  bool dith = dither(UV, pixelized);
  pixelized = rotate(pixelized, rotation);
  pixelized = spherify(pixelized);
  // Adaptation : cellules deux fois plus grosses sous 48 px pour rester lisible.
  float k = pixels < 48.0 ? 0.5 : 1.0;
  float n = Cells(pixelized - vec2(time * time_speed * 2.0, 0.0), 10.0 * k);
  n *= Cells(pixelized - vec2(time * time_speed * 1.0, 0.0), 20.0 * k);
  n *= 2.0;
  n = clamp(n, 0.0, 1.0);
  if (dith || !should_dither) n *= 1.3;
  float interpolate = floor(n * float(n_colors - 1)) / float(n_colors - 1);
  vec4 col = pickIn(0, int(interpolate * float(n_colors - 1)), n_colors);
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },

  // Star/StarBlobs.gdshader
  starBlobs: {
    defs: { TILE: 'vec2(1.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float circle_amount;
uniform float circle_size;
float circle(vec2 uv) {
  float invert = 1.0 / circle_amount;
  if (mod(uv.y, invert * 2.0) < invert) uv.x += invert * 0.5;
  vec2 rand_co = floor(uv * circle_amount) / circle_amount;
  uv = mod(uv, invert) * circle_amount;
  float r = rand(rand_co);
  r = clamp(r, invert, 1.0 - invert);
  float cd = distance(uv, vec2(r));
  return ss(cd, cd + 0.5, invert * circle_size * rand(rand_co * 1.5));
}
void main() {
  vec2 UV = getUV();
  vec2 pixelized = floor(UV * pixels) / pixels;
  vec2 uv = rotate(pixelized, rotation);
  float angle = atan(uv.x - 0.5, uv.y - 0.5);
  float d = distance(pixelized, vec2(0.5));
  float c = 0.0;
  for (int i = 0; i < 15; i++) {
    float r = rand(vec2(float(i)));
    vec2 circleUV = vec2(d, angle);
    c += circle(circleUV * size - time * time_speed - (1.0 / max(d, 1e-4)) * 0.1 + r);
  }
  c *= 0.37 - d;
  c = step(0.07, c - d);
  gl_FragColor = vec4(colors[0].rgb, c * colors[0].a);
}`,
  },

  // Star/StarFlares.gdshader
  starFlares: {
    defs: { TILE: 'vec2(1.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float storm_width;
uniform float storm_dither_width;
uniform float scale;
uniform float circle_amount;
uniform float circle_scale;
float circle(vec2 uv) {
  float invert = 1.0 / circle_amount;
  if (mod(uv.y, invert * 2.0) < invert) uv.x += invert * 0.5;
  vec2 rand_co = floor(uv * circle_amount) / circle_amount;
  uv = mod(uv, invert) * circle_amount;
  float r = rand(rand_co);
  r = clamp(r, invert, 1.0 - invert);
  float cd = distance(uv, vec2(r));
  return ss(cd, cd + 0.5, invert * circle_scale * rand(rand_co * 1.5));
}
void main() {
  vec2 UV = getUV();
  vec2 pixelized = floor(UV * pixels) / pixels;
  bool dith = dither(UV, pixelized);
  pixelized = rotate(pixelized, rotation);
  vec2 uv = pixelized;
  float angle = atan(uv.x - 0.5, uv.y - 0.5) * 0.4;
  float d = distance(pixelized, vec2(0.5));
  vec2 circleUV = vec2(d, angle);
  float n = fbm(circleUV * size - time * time_speed);
  float nc = circle(circleUV * scale - time * time_speed + n);
  nc *= 1.5;
  float n2 = fbm(circleUV * size - time + vec2(100.0, 100.0));
  nc -= n2 * 0.1;
  float a = 0.0;
  if (1.0 - d > nc) {
    if (nc > storm_width - storm_dither_width + d && (dith || !should_dither)) {
      a = 1.0;
    } else if (nc > storm_width + d) {
      a = 1.0;
    }
  }
  float interpolate = floor(n2 + nc);
  vec4 col = pickIn(0, int(interpolate), 2);
  a *= step(n2 * 0.25, d);
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },

  // BlackHole/BlackHole.gdshader
  blackHole: {
    defs: { RAND_MUL: '15.5453' },
    src: `
uniform float radius;
uniform float light_width;
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  float d_to_center = distance(uv, vec2(0.5));
  vec4 col = colors[0];
  if (d_to_center > radius - light_width) col = colors[1];
  if (d_to_center > radius - light_width * 0.5) col = colors[2];
  float a = step(d_to_center, radius);
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },

  // BlackHole/BlackHoleRing.gdshader
  bhRing: {
    defs: { TILE: 'vec2(2.0, 1.0)', RAND_MUL: '15.5453' },
    src: `
uniform float disk_width;
uniform float ring_perspective;
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  bool dith = dither(UV, uv);
  uv = rotate(uv, rotation);
  vec2 uv2 = uv;
  uv.x -= 0.5;
  uv.x *= 1.3;
  uv.x += 0.5;
  uv = rotate(uv, sin(time * time_speed * 2.0) * 0.01);
  vec2 l_origin = vec2(0.5);
  float d_width = disk_width;
  if (uv.y < 0.5) {
    uv.y += ss(distance(vec2(0.5), uv), 0.5, 0.2);
    d_width += ss(distance(vec2(0.5), uv), 0.5, 0.3);
    l_origin.y -= ss(distance(vec2(0.5), uv), 0.5, 0.2);
  } else if (uv.y > 0.53) {
    uv.y -= ss(distance(vec2(0.5), uv), 0.4, 0.17);
    d_width += ss(distance(vec2(0.5), uv), 0.5, 0.2);
    l_origin.y += ss(distance(vec2(0.5), uv), 0.5, 0.2);
  }
  float light_d = distance(uv2 * vec2(1.0, ring_perspective), l_origin * vec2(1.0, ring_perspective)) * 0.3;
  vec2 uv_center = uv - vec2(0.0, 0.5);
  uv_center *= vec2(1.0, ring_perspective);
  float center_d = distance(uv_center, vec2(0.5, 0.0));
  float disk = ss(0.1 - d_width * 2.0, 0.5 - d_width, center_d);
  disk *= ss(center_d - d_width, center_d, 0.4);
  uv_center = rotate(uv_center + vec2(0.0, 0.5), time * time_speed * 3.0);
  disk *= pow(fbm(uv_center * size), 0.5);
  if (dith || !should_dither) disk *= 1.2;
  float n_posterized = float(n_colors - 1);
  float posterized = floor((disk + light_d) * n_posterized);
  posterized = min(posterized, n_posterized);
  vec4 col = pickIn(0, int(posterized), n_colors);
  float disk_a = step(0.15, disk);
  gl_FragColor = vec4(col.rgb, disk_a * col.a);
}`,
  },

  // Galaxy/Galaxy.gdshader
  galaxy: {
    defs: { RAND_MUL: '15.5453' },
    src: `
uniform float tilt;
uniform float n_layers;
uniform float layer_height;
uniform float zoom;
uniform float swirl;
void main() {
  vec2 UV = getUV();
  vec2 uv = floor(UV * pixels) / pixels;
  bool dith = dither(uv, UV);
  uv *= zoom;
  uv -= (zoom - 1.0) / 2.0;
  uv = rotate(uv, rotation);
  vec2 uv2 = uv;
  uv.y *= tilt;
  uv.y -= (tilt - 1.0) / 2.0;
  float d_to_center = distance(uv, vec2(0.5, 0.5));
  float rot = swirl * pow(d_to_center, 0.4);
  vec2 rotated_uv = rotate(uv, rot + time * time_speed);
  float f1 = fbm(rotated_uv * size);
  f1 = floor(f1 * n_layers) / n_layers;
  uv2.y *= tilt;
  uv2.y -= (tilt - 1.0) / 2.0 + f1 * layer_height;
  float d_to_center2 = distance(uv2, vec2(0.5, 0.5));
  float rot2 = swirl * pow(d_to_center2, 0.4);
  vec2 rotated_uv2 = rotate(uv2, rot2 + time * time_speed);
  float f2 = fbm(rotated_uv2 * size + vec2(f1) * 10.0);
  float a = step(f2 + d_to_center2, 0.7);
  f2 *= 2.3;
  if (should_dither && dith) f2 *= 0.94;
  f2 = floor(f2 * float(n_colors));
  f2 = min(f2, float(n_colors));
  vec4 col = pickIn(0, int(f2), n_colors + 1);
  gl_FragColor = vec4(col.rgb, a * col.a);
}`,
  },
};

const INT_UNIFORMS = new Set(['OCTAVES', 'n_colors']);

// ---------------------------------------------------------------------------
// Couleurs et hasard déterministe
// ---------------------------------------------------------------------------

function hexRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function mixHex(a, b, k) {
  const ca = hexRgb(a), cb = hexRgb(b);
  const c = ca.map((v, i) => Math.round((v + (cb[i] - v) * k) * 255));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Tableau de 8 vec4 pour l'uniforme `colors`.
function palette(list) {
  const out = new Float32Array(32);
  list.forEach((hex, i) => {
    const [r, g, b] = hexRgb(hex);
    out.set([r, g, b, 1], i * 4);
  });
  return out;
}

// Petit générateur (mulberry32) pour dériver des variations stables d'une graine entière.
function seeded(seed) {
  let a = (seed >>> 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Graine Godot dans [1, 10[ comme les scripts .gd (sd % 1000 / 100), sans le cas dégénéré 0.
function godotSeed(seed) {
  const s = Math.abs(Math.floor(Number(seed) || 0));
  return 1 + (s % 900) / 100;
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Couches (valeurs par défaut reprises des .tscn de Deep-Fold)
// ---------------------------------------------------------------------------

// rel : taille de la couche relative au diamètre ; k : facteur de update_time() du .gd.
// fixedTime : temps des anneaux (t * 314.15 * k) au lieu du multiplicateur standard.
function layer(shader, u, { rel = 1, k = 0.02, fixedTime = false } = {}) {
  const ts = u.time_speed || 0;
  let tf = 0;
  if (fixedTime) tf = 314.15 * k;
  else if (ts !== 0) tf = ((Math.round(u.size || 0) * 2) / ts) * k;
  return { shader, rel, tf, u };
}

function common(o) {
  return { seed: o.seed, rotation: o.rotation, should_dither: true };
}

const BUILDERS = {
  noAtmosphere(o) {
    const c = o.colors;
    return [
      layer('noAtmo', { ...common(o), light_origin: [0.25, 0.25], time_speed: 0.4, dither_size: 2, light_border_1: 0.615, light_border_2: 0.729, size: 8, OCTAVES: 4, colors: palette(c.ground) }),
      layer('craters', { ...common(o), light_origin: [0.25, 0.25], time_speed: 0.001, light_border: 0.465, size: 5, colors: palette(c.craters) }),
    ];
  },
  lava(o) {
    const c = o.colors;
    return [
      layer('noAtmo', { ...common(o), light_origin: [0.3, 0.3], time_speed: 0.2, dither_size: 2, light_border_1: 0.4, light_border_2: 0.6, size: 10, OCTAVES: 3, colors: palette(c.ground) }),
      layer('craters', { ...common(o), light_origin: [0.3, 0.3], time_speed: 0.2, light_border: 0.4, size: 3.5, colors: palette(c.craters) }),
      layer('lavaRivers', { ...common(o), light_origin: [0.3, 0.3], time_speed: 0.2, light_border_1: 0.019, light_border_2: 0.036, river_cutoff: 0.579, size: 10, OCTAVES: 4, colors: palette(c.lava) }),
    ];
  },
  dryTerran(o) {
    return [
      layer('dryTerran', { ...common(o), light_origin: [0.4, 0.3], light_distance1: 0.362, light_distance2: 0.525, time_speed: 0.1, dither_size: 2, n_colors: 5, size: 8, OCTAVES: 3, colors: palette(o.colors.land) }),
    ];
  },
  ice(o) {
    const c = o.colors;
    return [
      layer('under', { ...common(o), light_origin: [0.3, 0.3], time_speed: 0.25, dither_size: 2, light_border_1: 0.48, light_border_2: 0.632, size: 8, OCTAVES: 2, colors: palette(c.land) }),
      layer('iceLakes', { ...common(o), light_origin: [0.3, 0.3], time_speed: 0.2, light_border_1: 0.024, light_border_2: 0.047, lake_cutoff: o.lakeCutoff ?? 0.55, size: 10, OCTAVES: 3, colors: palette(c.lakes) }),
      layer('clouds', { ...common(o), cloud_cover: o.cloudCover ?? 0.546, light_origin: [0.3, 0.3], time_speed: 0.1, stretch: 2.5, cloud_curve: 1.3, light_border_1: 0.566, light_border_2: 0.781, size: 4, OCTAVES: 4, colors: palette(c.clouds) }, { k: 0.01 }),
    ];
  },
  landMasses(o) {
    const c = o.colors;
    return [
      layer('under', { ...common(o), light_origin: [0.39, 0.39], time_speed: 0.1, dither_size: 2, light_border_1: 0.4, light_border_2: 0.6, size: 5.228, OCTAVES: 3, colors: palette(c.water) }),
      layer('landmass', { ...common(o), light_origin: [0.39, 0.39], time_speed: 0.2, light_border_1: 0.32, light_border_2: 0.534, land_cutoff: o.landCutoff ?? 0.633, size: 4.292, OCTAVES: 6, colors: palette(c.land) }),
      layer('clouds', { ...common(o), cloud_cover: o.cloudCover ?? 0.415, light_origin: [0.39, 0.39], time_speed: 0.47, stretch: 2, cloud_curve: 1.3, light_border_1: 0.52, light_border_2: 0.62, size: 7.745, OCTAVES: 2, colors: palette(c.clouds) }, { k: 0.01 }),
    ];
  },
  rivers(o) {
    const c = o.colors;
    return [
      layer('rivers', { ...common(o), light_origin: [0.39, 0.39], time_speed: 0.1, dither_size: 3.951, light_border_1: 0.287, light_border_2: 0.476, river_cutoff: o.riverCutoff ?? 0.368, size: 4.6, OCTAVES: 6, colors: palette(c.land) }),
      layer('clouds', { ...common(o), cloud_cover: o.cloudCover ?? 0.47, light_origin: [0.39, 0.39], time_speed: 0.1, stretch: 2, cloud_curve: 1.3, light_border_1: 0.52, light_border_2: 0.62, size: 7.315, OCTAVES: 2, colors: palette(c.clouds) }, { k: 0.01 }),
    ];
  },
  gas(o) {
    const c = o.colors;
    return [
      layer('clouds', { ...common(o), cloud_cover: 0, light_origin: [0.25, 0.25], time_speed: 0.7, stretch: 1, cloud_curve: 1.3, light_border_1: 0.692, light_border_2: 0.666, size: 9, OCTAVES: 5, colors: palette(c.base) }, { k: 0.005 }),
      layer('clouds', { ...common(o), cloud_cover: o.cloudCover ?? 0.538, light_origin: [0.25, 0.25], time_speed: 0.47, stretch: 1, cloud_curve: 1.3, light_border_1: 0.439, light_border_2: 0.746, size: 9, OCTAVES: 5, colors: palette(c.clouds) }, { k: 0.005 }),
    ];
  },
  gasLayers(o) {
    const c = o.colors;
    const out = [
      layer('gasLayers', { ...common(o), light_origin: [-0.1, 0.3], time_speed: 0.05, bands: o.bands ?? 0.892, n_colors: 3, size: 10.107, OCTAVES: 3, colors: palette([...c.light, ...c.dark]) }, { k: 0.004 }),
    ];
    if (o.rings) {
      // Godot incline l'anneau de +0.7 rad ; un peu moins ici pour la vue système horizontale.
      out.push(layer('ring', { ...common(o), rotation: o.rotation + (o.ringTilt ?? 0.45), light_origin: [-0.1, 0.3], time_speed: 0.2, ring_width: 0.127, ring_perspective: 6, scale_rel_to_planet: 6, n_colors: 3, size: 15, OCTAVES: 4, colors: palette([...c.ringLight, ...c.ringDark]) }, { rel: 3, k: 0.004, fixedTime: true }));
    }
    return out;
  },
  star(o) {
    const c = o.colors;
    const out = [];
    if (o.blobs !== false) {
      out.push(layer('starBlobs', { ...common(o), time_speed: 0.05, circle_amount: 2, circle_size: 1, size: 4.93, OCTAVES: 4, colors: palette([c.blob]) }, { rel: 2, k: 0.01 }));
    }
    out.push(layer('star', { ...common(o), time_speed: 0.05, n_colors: 4, size: 4.463, OCTAVES: 4, TILES: 1, colors: palette(c.surface) }, { k: 0.005 }));
    if (o.flares !== false) {
      out.push(layer('starFlares', { ...common(o), time_speed: 0.05, storm_width: o.stormWidth ?? 0.3, storm_dither_width: 0, scale: 1, circle_amount: 2, circle_scale: 1, size: 1.6, OCTAVES: 4, colors: palette(c.flares) }, { rel: 2, k: 0.015 }));
    }
    return out;
  },
  blackHole(o) {
    const c = o.colors;
    return [
      // Le diamètre demandé est celui de l'horizon : la couche centrale fait 2× (rayon 0.247).
      layer('blackHole', { radius: 0.247, light_width: 0.028, colors: palette(c.hole) }, { rel: 2 }),
      layer('bhRing', { ...common(o), rotation: o.rotation + 0.7, light_origin: [0.607, 0.444], time_speed: 0.2, disk_width: 0.065, ring_perspective: 14, n_colors: 5, size: 6.598, OCTAVES: 3, colors: palette(c.disk) }, { rel: 6, k: 0.004, fixedTime: true }),
    ];
  },
  galaxy(o) {
    return [
      layer('galaxy', { ...common(o), rotation: o.rotation, time_speed: 1, n_colors: 6, size: 7, OCTAVES: 1, tilt: 3, n_layers: 4, layer_height: 0.4, zoom: 1.375, swirl: -9, colors: palette(o.colors.galaxy) }, { k: 0.04 }),
    ];
  },
};

// Côté du carré couvert, relatif au diamètre (BH : la vue Godot rogne le disque à 2× la couche centrale).
const EXTENT_REL = { blackHole: 4.8 };

// Construit une spec : { kind, seed, rotation, timeScale, extentRel, layers, ...options }.
export function makeSpec(kind, opts = {}) {
  const build = BUILDERS[kind];
  if (!build) throw new Error(`PixelPlanets : type inconnu ${kind}`);
  const o = { rotation: 0, timeScale: 1, ...opts, kind };
  o.seed = o.seed ?? 1;
  const layers = build(o);
  if (o.light) for (const l of layers) if (l.u.light_origin) l.u.light_origin = o.light;
  let rel = 1;
  for (const l of layers) rel = Math.max(rel, l.rel);
  return { kind, seed: o.seed, rotation: o.rotation, timeScale: o.timeScale, rings: !!o.rings, extentRel: EXTENT_REL[kind] ?? rel, layers };
}

// ---------------------------------------------------------------------------
// Correspondances avec les données du jeu
// ---------------------------------------------------------------------------

const BODY_PRESETS = {
  rocky: (r) => ({
    kind: 'noAtmosphere',
    colors: {
      ground: ['#b8aa98', '#7a6a5c', '#3a302a'],
      craters: ['#7a6a5c', '#3a302a'],
    },
  }),
  metal: (r) => ({
    kind: 'noAtmosphere',
    colors: {
      ground: ['#e6cf9c', '#a3835a', '#4d3a2c'],
      craters: ['#a3835a', '#4d3a2c'],
    },
  }),
  hmc: (r) => ({
    kind: 'dryTerran',
    colors: { land: ['#e8b48a', '#b9714f', '#8a4838', '#52302c', '#2e1c1c'] },
  }),
  icy: (r) => ({
    kind: 'ice',
    cloudCover: 0.5 + r() * 0.1,
    colors: {
      land: ['#faffff', '#c7d4e1', '#928fb8'],
      lakes: ['#4fa4b8', '#4c6885', '#3a3f5e'],
      clouds: ['#e1f2ff', '#c0e3ff', '#5e70a5', '#404973'],
    },
  }),
  gas: (r) => ({
    kind: 'gasLayers',
    bands: 0.8 + r() * 0.25,
    colors: {
      light: ['#eec39a', '#d9a066', '#8f563b'],
      dark: ['#663931', '#45283c', '#222034'],
      ringLight: ['#eec39a', '#b37a50', '#8f563b'],
      ringDark: ['#553036', '#322337', '#222034'],
    },
  }),
  gasw: (r) => ({
    kind: 'gasLayers',
    bands: 0.8 + r() * 0.25,
    colors: {
      light: ['#cfe8ff', '#86b4e6', '#4f7fc0'],
      dark: ['#2f4f8a', '#22346a', '#161c3c'],
      ringLight: ['#d6ecff', '#8fb4dc', '#5a7fb0'],
      ringDark: ['#33507e', '#253660', '#161c3c'],
    },
  }),
  water: (r) => ({
    kind: 'rivers',
    riverCutoff: 0.58 + r() * 0.06,
    cloudCover: 0.42 + r() * 0.12,
    colors: {
      // Terres rares (hauts-fonds et îles), le reste est océan.
      land: ['#5fb0c8', '#3f86b0', '#2a5f94', '#1a3a6a', '#2a6fc0', '#123a6a'],
      clouds: ['#f2faff', '#cfe6f8', '#6a86b8', '#34487a'],
    },
  }),
  ammonia: (r) => ({
    kind: 'landMasses',
    landCutoff: 0.5 + r() * 0.08,
    cloudCover: 0.45 + r() * 0.1,
    colors: {
      water: ['#d8cf8a', '#a8943e', '#4a3a10'],
      land: ['#c9a85a', '#9a7a34', '#6a5220', '#3e2e10'],
      clouds: ['#f0e8c0', '#d8c88a', '#9a8a4a', '#5a4a24'],
    },
  }),
  elw: (r) => ({
    kind: 'landMasses',
    landCutoff: 0.53 + r() * 0.06,
    cloudCover: 0.4 + r() * 0.15,
    colors: {
      water: ['#5fb4e0', '#2f78c0', '#16305a'],
      land: ['#c8d45d', '#63ab3f', '#2f5753', '#283540'],
      clouds: ['#f4f8ff', '#cfd8ea', '#68709a', '#404973'],
    },
  }),
};

export function specForBody(body) {
  const type = body && BODY_PRESETS[body.type] ? body.type : 'rocky';
  const seed = Math.floor(Number(body?.seed) || 0);
  const r = seeded(seed);
  const preset = BODY_PRESETS[type](r);
  // Légère inclinaison propre à chaque corps.
  const rotation = (r() - 0.5) * 0.6;
  return makeSpec(preset.kind, { ...preset, seed: godotSeed(seed), rotation, rings: !!body?.rings });
}

// Couleurs des classes stellaires (miroir de STAR_CLASSES, pour rester autonome).
const STAR_COLORS = {
  O: ['#9bb0ff', '#5a6fff'],
  B: ['#aabfff', '#6f86ff'],
  A: ['#d5e0ff', '#a3b6ff'],
  F: ['#f8f7ff', '#e6e3c8'],
  G: ['#fff4c9', '#ffd36b'],
  K: ['#ffd29a', '#ff9e3d'],
  M: ['#ff9d6f', '#e0482a'],
  L: ['#c4542e', '#7a2410'],
  T: ['#9c3a3a', '#5a1620'],
  Y: ['#6e3a5a', '#341a3a'],
  TTS: ['#ffb36b', '#a85a2a'],
  W: ['#c6f0ff', '#3ad0ff'],
  D: ['#ffffff', '#cfe8ff'],
  N: ['#e8f4ff', '#7fc8ff'],
};

export function specForStar(code) {
  const seed = godotSeed(hashString(String(code)));
  if (code === 'BH') {
    return makeSpec('blackHole', {
      seed,
      rotation: 0.066,
      colors: {
        hole: ['#272736', '#ffffeb', '#ed7b39'],
        disk: ['#ffffeb', '#fff540', '#ffb84a', '#ed7b39', '#bd4035'],
      },
    });
  }
  const [color, glow] = STAR_COLORS[code] || STAR_COLORS.G;
  const white = '#f5ffe8';
  const brown = code === 'L' || code === 'T' || code === 'Y';
  if (brown) {
    // Naines brunes : surface sombre, pas de taches brillantes, éruptions discrètes.
    return makeSpec('star', {
      seed,
      blobs: false,
      stormWidth: 0.42,
      colors: {
        surface: [mixHex(color, '#ffd0a0', 0.35), color, mixHex(color, glow, 0.6), mixHex(glow, '#000000', 0.45)],
        flares: [glow, color],
      },
    });
  }
  const compact = code === 'D' || code === 'N';
  return makeSpec('star', {
    seed,
    blobs: !compact,
    stormWidth: code === 'W' || code === 'TTS' ? 0.22 : code === 'O' || code === 'B' ? 0.26 : 0.3,
    colors: {
      blob: mixHex(color, '#ffffff', 0.7),
      surface: [compact ? '#ffffff' : white, color, mixHex(color, glow, 0.6), mixHex(glow, '#000000', 0.35)],
      flares: [glow, mixHex(color, '#ffffff', 0.5)],
    },
  });
}

export function specForDestination() {
  return makeSpec('galaxy', {
    seed: 5.881,
    rotation: 0.674,
    timeScale: 0.3,
    colors: { galaxy: ['#fff0fb', '#ffc2ea', '#f08ad6', '#b45cc8', '#7a3fa6', '#4a2a78', '#2a1a48'] },
  });
}

// ---------------------------------------------------------------------------
// Moteur WebGL
// ---------------------------------------------------------------------------

const DISABLED = { ok: false, draw() { return false; }, extent() { return 0; } };

function extentPx(spec, D) {
  return Math.max(1, Math.round((spec.extentRel || 1) * D));
}

export function createPixelPlanets() {
  try {
    return createEngine() || DISABLED;
  } catch (e) {
    return DISABLED;
  }
}

function createEngine() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const attrs = { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
  const gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
  if (!gl) return null;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(log || 'compilation');
    }
    return sh;
  }

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const programs = {};
  for (const [name, def] of Object.entries(SHADERS)) {
    const defines = Object.entries(def.defs).map(([k, v]) => `#define ${k} ${v}\n`).join('');
    const fs = compile(gl.FRAGMENT_SHADER, defines + PRELUDE + def.src);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(gl.getProgramInfoLog(prog) || 'link');
    }
    gl.deleteShader(fs);
    programs[name] = {
      prog,
      locs: new Map(),
      origin: gl.getUniformLocation(prog, 'u_origin'),
      res: gl.getUniformLocation(prog, 'u_res'),
      pixels: gl.getUniformLocation(prog, 'pixels'),
      time: gl.getUniformLocation(prog, 'time'),
    };
  }

  // Un grand triangle couvrant le viewport.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);

  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
  });

  const maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048, gl.getParameter(gl.MAX_VIEWPORT_DIMS)?.[0] || 2048, 4096);

  // Uniformes constants d'une couche, résolus une fois par programme.
  const bound = new WeakMap();
  function bind(p, l) {
    let list = bound.get(l);
    if (list) return list;
    list = [];
    for (const key of Object.keys(l.u)) {
      const loc = gl.getUniformLocation(p.prog, key === 'colors' ? 'colors[0]' : key);
      if (!loc) continue;
      const v = l.u[key];
      let kind;
      if (v instanceof Float32Array) kind = 4;
      else if (Array.isArray(v)) kind = 2;
      else if (typeof v === 'boolean' || INT_UNIFORMS.has(key)) kind = 1;
      else kind = 0;
      list.push(loc, kind, key);
    }
    bound.set(l, list);
    return list;
  }

  function applyUniforms(list, u) {
    for (let i = 0; i < list.length; i += 3) {
      const loc = list[i], kind = list[i + 1], v = u[list[i + 2]];
      if (kind === 0) gl.uniform1f(loc, v);
      else if (kind === 1) gl.uniform1i(loc, typeof v === 'boolean' ? (v ? 1 : 0) : v);
      else if (kind === 2) gl.uniform2f(loc, v[0], v[1]);
      else gl.uniform4fv(loc, v);
    }
  }

  function ensureSize(E) {
    if (canvas.width >= E && canvas.height >= E) return;
    const s = Math.min(maxSize, Math.ceil(Math.max(E, canvas.width) / 64) * 64);
    canvas.width = canvas.height = s;
  }

  function draw(ctx, spec, cx, cy, diameter, t = 0) {
    if (lost || gl.isContextLost() || !spec || !spec.layers) return false;
    const D = Math.max(1, Math.round(diameter));
    let E = extentPx(spec, D);
    ensureSize(E);
    const H = canvas.height;
    E = Math.min(E, canvas.width);
    gl.viewport(0, H - E, E, E);
    gl.scissor(0, H - E, E, E);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const time = t * (spec.timeScale ?? 1);
    let current = null;
    for (const l of spec.layers) {
      const p = programs[l.shader];
      const L = Math.max(1, Math.round(l.rel * D));
      const off = Math.floor((E - L) / 2); // haut-gauche de la couche dans la zone (repère canvas)
      const vx = off, vy = H - off - L; // repère GL (origine en bas)
      gl.viewport(vx, vy, L, L);
      if (current !== p) {
        gl.useProgram(p.prog);
        current = p;
      }
      applyUniforms(bind(p, l), l.u);
      gl.uniform2f(p.origin, vx, vy);
      gl.uniform1f(p.res, L);
      gl.uniform1f(p.pixels, L);
      if (p.time) gl.uniform1f(p.time, time * l.tf);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const planetOff = Math.floor((E - D) / 2);
    const dx = Math.round(cx - D / 2) - planetOff;
    const dy = Math.round(cy - D / 2) - planetOff;
    ctx.drawImage(canvas, 0, 0, E, E, dx, dy, E, E);
    return true;
  }

  return {
    get ok() {
      return !lost;
    },
    draw,
    extent(spec, diameter) {
      return extentPx(spec, Math.max(1, Math.round(diameter)));
    },
    canvas,
  };
}
