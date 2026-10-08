// Données de jeu : classes stellaires, corps, matériaux, recettes, destinations.

// Classes stellaires d'Elite Dangerous. « KGBFOAM » sont écopables.
export const STAR_CLASSES = {
  O: { name: 'Étoile de classe O', color: '#9bb0ff', glow: '#5a6fff', radius: 46, scoopable: true, heat: 0.35, weight: 0.5, value: 6 },
  B: { name: 'Étoile de classe B', color: '#aabfff', glow: '#6f86ff', radius: 42, scoopable: true, heat: 0.25, weight: 2, value: 5 },
  A: { name: 'Étoile de classe A', color: '#d5e0ff', glow: '#a3b6ff', radius: 38, scoopable: true, heat: 0.15, weight: 5, value: 4 },
  F: { name: 'Étoile de classe F', color: '#f8f7ff', glow: '#e6e3c8', radius: 36, scoopable: true, heat: 0.08, weight: 7, value: 3 },
  G: { name: 'Étoile de classe G', color: '#fff4c9', glow: '#ffd36b', radius: 34, scoopable: true, heat: 0.05, weight: 9, value: 3 },
  K: { name: 'Étoile de classe K', color: '#ffd29a', glow: '#ff9e3d', radius: 32, scoopable: true, heat: 0.03, weight: 15, value: 2 },
  M: { name: 'Naine rouge (M)', color: '#ff9d6f', glow: '#e0482a', radius: 28, scoopable: true, heat: 0.02, weight: 30, value: 2 },
  L: { name: 'Naine brune (L)', color: '#c4542e', glow: '#7a2410', radius: 22, scoopable: false, weight: 8, value: 2 },
  T: { name: 'Naine brune (T)', color: '#9c3a3a', glow: '#5a1620', radius: 20, scoopable: false, weight: 7, value: 2 },
  Y: { name: 'Naine brune (Y)', color: '#6e3a5a', glow: '#341a3a', radius: 18, scoopable: false, weight: 3, value: 3 },
  TTS: { name: 'Étoile T Tauri', color: '#ffb36b', glow: '#a85a2a', radius: 30, scoopable: false, weight: 3, value: 3 },
  W: { name: 'Étoile Wolf-Rayet', color: '#c6f0ff', glow: '#3ad0ff', radius: 44, scoopable: false, weight: 0.7, value: 12, rare: true },
  D: { name: 'Naine blanche', color: '#ffffff', glow: '#cfe8ff', radius: 9, scoopable: false, weight: 4, value: 10, boost: 1.5, rare: true },
  N: { name: 'Étoile à neutrons', color: '#e8f4ff', glow: '#7fc8ff', radius: 6, scoopable: false, weight: 3, value: 15, boost: 4, rare: true },
  BH: { name: 'Trou noir', color: '#000000', glow: '#ff9a3a', radius: 12, scoopable: false, weight: 0.8, value: 30, rare: true },
};

export const BODY_TYPES = {
  icy: { name: 'Corps glacé', landable: true, palette: ['#3d5a73', '#7fa8c9', '#d6ecff'], size: [5, 9], weight: 14, value: 2, mats: ['carbon', 'nickel', 'germanium'] },
  rocky: { name: 'Corps rocheux', landable: true, palette: ['#4a3a30', '#8a7360', '#c7b39b'], size: [4, 8], weight: 16, value: 2, mats: ['iron', 'carbon', 'vanadium'] },
  hmc: { name: 'Monde à forte teneur en métaux', landable: true, palette: ['#4a2f2a', '#9a6248', '#d9a07a'], size: [6, 10], weight: 12, value: 4, mats: ['iron', 'nickel', 'vanadium', 'germanium'] },
  metal: { name: 'Monde riche en métaux', landable: true, palette: ['#3a3236', '#7a6a62', '#d0c0a8'], size: [5, 9], weight: 4, value: 8, mats: ['iron', 'nickel', 'polonium', 'vanadium'] },
  gas: { name: 'Géante gazeuse', landable: false, palette: ['#7a4a2a', '#c9905a', '#ecd2a6'], size: [12, 18], weight: 14, value: 3, banded: true },
  gasw: { name: 'Géante gazeuse à eau', landable: false, palette: ['#284a7a', '#5a8ac9', '#bfe0ff'], size: [12, 17], weight: 3, value: 6, banded: true },
  water: { name: "Monde d'eau", landable: false, palette: ['#123a6a', '#2a6fc0', '#8fd0ff'], size: [7, 11], weight: 4, value: 20 },
  ammonia: { name: 'Monde à ammoniaque', landable: false, palette: ['#4a3a10', '#9a8a3a', '#d8cf8a'], size: [7, 11], weight: 2, value: 30 },
  elw: { name: 'Monde de type terrestre', landable: false, palette: ['#0f3a7a', '#2f8a4a', '#e8f4ff'], size: [7, 10], weight: 1, value: 60 },
};

export const MATERIALS = {
  iron: { name: 'Fer', short: 'Fe' },
  nickel: { name: 'Nickel', short: 'Ni' },
  carbon: { name: 'Carbone', short: 'C' },
  vanadium: { name: 'Vanadium', short: 'V' },
  germanium: { name: 'Germanium', short: 'Ge' },
  polonium: { name: 'Polonium', short: 'Po', rare: true },
};

export const MODULES = {
  fsd: { name: 'FSD' },
  scoop: { name: 'Écope' },
  scanner: { name: 'Scanner' },
  thrusters: { name: 'Propulseurs' },
  life: { name: 'Support vital' },
};

// Approches de l'écopage : plus près de l'étoile, plus de carburant et plus de chaleur.
// risk : chance de surchauffe de base ; heatK : poids de la chaleur propre à l'étoile.
export const SCOOP_APPROACHES = {
  far: { name: 'Loin', desc: 'Lent mais sans danger', mult: 0.55, risk: 0, heatK: 0.4, dmg: [3, 6], mod: [3, 8] },
  normal: { name: 'Normale', desc: 'Le compromis habituel', mult: 1, risk: 0.06, heatK: 1.5, dmg: [4, 10], mod: [5, 15] },
  close: { name: 'Au ras de l\'étoile', desc: 'Plein rapide, chaleur extrême', mult: 1.7, risk: 0.3, heatK: 2.5, dmg: [8, 16], mod: [10, 22] },
};

// Vaisseaux d'exploration. Les vaisseaux de départ se débloquent d'une partie à l'autre (unlock),
// les autres se trouvent en épave au milieu d'une partie.
export const SHIPS = {
  mandalay: { name: 'Mandalay', maker: 'Zorgon Peterson', fuel: 24, hull: 100, energy: 100, range: 48, desc: 'Équilibré et fiable.' },
  dbx: { name: 'Diamondback Explorer', maker: 'Lakon', fuel: 28, hull: 80, energy: 90, range: 56, desc: 'Grande portée, coque fragile.', unlock: 'Atteindre une destination, ou piloter un Diamondback récupéré.' },
  krait: { name: 'Krait Phantom', maker: 'Faulcon DeLacy', fuel: 26, hull: 125, energy: 110, range: 43, desc: 'Robuste mais courte portée.', unlock: 'Piloter un Krait Phantom récupéré sur une épave.' },
  asp: { name: 'Asp Explorer', maker: 'Lakon', fuel: 32, hull: 100, energy: 100, range: 45, desc: 'Grand réservoir, portée moyenne.', unlock: 'Se poser 25 fois au total, toutes parties confondues.' },
};

// Passagers récupérés en capsule de survie : un atout, mais le support vital s'use plus vite.
export const PASSENGERS = {
  engineer: { name: 'Ingénieure Saskia Orrell', role: 'ingénieure', perk: 'Les réparations de synthèse rendent 50 % de plus.' },
  navigator: { name: 'Navigateur Idris Kalo', role: 'navigateur', perk: 'Portée de saut +5 al.' },
  scientist: { name: 'Exobiologiste Mei Tanaka', role: 'exobiologiste', perk: 'Les échantillons biologiques rapportent deux fois plus de données.' },
};

// Codex des découvertes, conservé d'une partie à l'autre.
export const CODEX = {
  'ev:guardian': { cat: 'Xéno', name: 'Ruines gardiennes' },
  'ev:thargoid': { cat: 'Xéno', name: 'Site de surface thargoïde' },
  'ev:thargoidProbe': { cat: 'Xéno', name: 'Sonde thargoïde' },
  'ev:hyperdiction': { cat: 'Xéno', name: 'Hyperdiction thargoïde' },
  'ev:anomaly': { cat: 'Phénomènes', name: 'Nuage de particules lagrangien' },
  'ev:flare': { cat: 'Phénomènes', name: 'Éruption stellaire' },
  'ev:geo': { cat: 'Phénomènes', name: 'Évents géologiques' },
  'ev:generation': { cat: 'Humains', name: 'Navire générationnel' },
  'ev:megaship': { cat: 'Humains', name: 'Mégastructure abandonnée' },
  'ev:wreck': { cat: 'Humains', name: "Épave d'Anaconda" },
  'ev:crash': { cat: 'Humains', name: 'Vaisseau écrasé' },
  'ev:distress': { cat: 'Humains', name: 'Balise de détresse' },
  'ev:derelict': { cat: 'Humains', name: 'Vaisseau abandonné intact' },
  'ev:escapePod': { cat: 'Humains', name: 'Capsule de survie' },
  'ev:tankLeak': { cat: 'Humains', name: 'Fuite du réservoir' },
  'star:W': { cat: 'Étoiles', name: 'Étoile Wolf-Rayet' },
  'star:D': { cat: 'Étoiles', name: 'Naine blanche' },
  'star:N': { cat: 'Étoiles', name: 'Étoile à neutrons' },
  'star:BH': { cat: 'Étoiles', name: 'Trou noir' },
  'body:elw': { cat: 'Planètes', name: 'Monde de type terrestre' },
  'body:ammonia': { cat: 'Planètes', name: 'Monde à ammoniaque' },
  'body:water': { cat: 'Planètes', name: "Monde d'eau" },
  'body:gasw': { cat: 'Planètes', name: 'Géante gazeuse à eau' },
  ...Object.fromEntries(['Bacterium', 'Stratum', 'Tussock', 'Osseus', 'Fonticulua', 'Concha', 'Frutexa', 'Aleoida'].map((g) => [`bio:${g}`, { cat: 'Exobiologie', name: g }])),
};

// Savoir xéno conservé entre parties : chaque palier débloque une réponse, pas de la puissance.
export const KNOWLEDGE = {
  glyphs: { name: 'Glyphes gardiens', max: 5, tiers: { 2: 'Le scan automatique signale toujours les ruines gardiennes.', 3: 'Vous savez lire le plan gardien sans éveiller la sentinelle.' } },
  signals: { name: 'Signaux thargoïdes', max: 5, tiers: { 2: 'Vous savez répondre au chant des sondes.', 4: 'Vous savez imiter le signal qui calme une hyperdiction.' } },
};

// Recettes de synthèse : réparer → fabriquer → améliorer.
export const RECIPES = [
  { id: 'hull', kind: 'Réparer', name: 'Réparation de coque', cost: { iron: 2, nickel: 1 }, desc: '+20 coque' },
  { id: 'module', kind: 'Réparer', name: 'Réparation de module', cost: { iron: 1, vanadium: 1, germanium: 1 }, desc: '+40 % au module le plus abîmé' },
  { id: 'patch', kind: 'Réparer', name: 'Colmater le réservoir', cost: { iron: 1, carbon: 1 }, desc: 'Stoppe la fuite de carburant', needs: 'tankLeak' },
  { id: 'cells', kind: 'Fabriquer', name: "Cellules d'énergie", cost: { carbon: 2, nickel: 1 }, desc: '+35 énergie' },
  { id: 'inj1', kind: 'Fabriquer', name: 'Injection FSD standard', cost: { carbon: 1, vanadium: 1, germanium: 1 }, desc: 'Portée +25 % au prochain saut' },
  { id: 'inj2', kind: 'Fabriquer', name: 'Injection FSD premium', cost: { carbon: 2, germanium: 1, polonium: 1 }, desc: 'Portée +100 % au prochain saut' },
  { id: 'armor', kind: 'Améliorer', name: 'Blindage renforcé', cost: { iron: 4, nickel: 2, vanadium: 1 }, desc: 'Coque max +20', once: true },
  { id: 'tank', kind: 'Améliorer', name: 'Réservoir supplémentaire', cost: { iron: 3, nickel: 2, vanadium: 2 }, desc: 'Carburant max +8 t', once: true },
  { id: 'scanner', kind: 'Améliorer', name: 'Scanner calibré', cost: { germanium: 2, carbon: 1, polonium: 1 }, desc: 'Scan manuel 2× moins cher', once: true },
  { id: 'guardian', kind: 'Améliorer', name: 'Booster FSD gardien', cost: { vanadium: 2, germanium: 2, polonium: 1 }, desc: 'Portée de base +12 al', once: true, needs: 'guardianBlueprint' },
];

// Destinations lointaines (distances de jeu, en années-lumière).
export const DESTINATIONS = [
  { name: 'Nébuleuse de la Tête de Sorcière', system: 'Witch Head Sector IR-W c1-9', dist: 900 },
  { name: 'Nébuleuse de la Californie', system: 'California Sector BA-A e6', dist: 1000 },
  { name: 'Avant-poste de Jaques', system: 'Colonia', dist: 1100 },
  { name: 'Nébuleuse du Cœur', system: 'Heart Sector IR-V b2-0', dist: 950 },
  { name: 'Nébuleuse de la Rosette', system: 'Rosette Sector CQ-Y d59', dist: 1050 },
];

export const ORIGINS = ['Shinrarta Dezhra', 'Deciat', 'Jameson', 'Maia', 'Lave', 'Diaguandri'];

// Noms de secteurs procéduraux à la manière d'Elite.
export const SECTORS = [
  'Synuefe', 'Eol Prou', 'Pru Euq', 'Hypuae', 'Blae Drye', 'Thaile', 'Boewnst',
  'Dryio Flyuae', 'Clooku', 'Phroi Bluae', 'Wregoe', 'Swoilz', 'Flyiedgiae',
  'Prua Phoe', 'Byeia Eurk', 'Oevasy', 'Graea Hypue', 'Skaude',
];

export const REGION_TYPES = {
  nebula: { name: 'Nébuleuse', color: 'rgba(170, 90, 220, 0.18)', stroke: '#b67ae0' },
  thargoid: { name: 'Zone thargoïde', color: 'rgba(60, 220, 120, 0.15)', stroke: '#4be08a' },
  neutron: { name: 'Amas de neutrons', color: 'rgba(120, 190, 255, 0.15)', stroke: '#7fc8ff' },
};
