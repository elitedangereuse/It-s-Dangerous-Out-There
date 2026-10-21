// Événements narratifs à choix. Chaque choix renvoie le texte de son issue.
// ctx : { s, rng, hull(d), module(id|null, d), mats(obj), data(pts, label), energy(d), fuel(d), flag(name),
//         learn(kind), swapShip(), takePassenger() }
// Un choix peut porter when(state) : il n'apparaît que si la condition est remplie (savoir acquis).
// title, text et label peuvent être des fonctions de l'état.
import { SHIPS } from './data.js';

const randomMats = (ctx, pool, n) => {
  const got = {};
  for (let i = 0; i < n; i++) {
    const m = ctx.rng.pick(pool);
    got[m] = (got[m] || 0) + 1;
  }
  ctx.mats(got);
  return got;
};

const leave = { label: 'Ignorer et poursuivre', run: () => 'Vous laissez la chose derrière vous. Certaines questions restent sans réponse.' };

export const EVENTS = {
  // --- Événements à l'arrivée dans un système ---
  signal: {
    title: 'Source de signal non identifiée',
    text: "Un signal faible et irrégulier apparaît sur le scanner, à quelques secondes-lumière de l'étoile.",
    choices: [
      {
        label: 'Désactiver la supercroisière et enquêter',
        cost: { energy: 5 },
        run: (ctx) => {
          const r = ctx.rng.next();
          if (r < 0.45) {
            randomMats(ctx, ['iron', 'nickel', 'carbon', 'vanadium', 'germanium'], 4);
            ctx.data(8, 'Signal : conteneurs dérivants');
            return 'Des conteneurs éventrés dérivent dans le vide. Vous récupérez des matériaux bruts.';
          }
          if (r < 0.75) {
            ctx.hull(-12);
            return "Une embuscade ! Un Cobra pirate ouvre le feu avant que vous ne relanciez le FSD. Coque −12.";
          }
          ctx.data(20, 'Signal : enregistrement ancien');
          return "Une vieille bouée de communication diffuse le journal d'un explorateur disparu il y a 40 ans. Données précieuses.";
        },
      },
      leave,
    ],
  },
  distress: {
    title: 'Balise de détresse',
    text: "« Ici CMDR Varek, réservoir vide, support vital à 12 %... quelqu'un m'entend ? »",
    choices: [
      {
        label: 'Transférer 4 t de carburant',
        cost: { fuel: 4 },
        run: (ctx) => {
          ctx.mats({ polonium: 1, germanium: 2 });
          ctx.data(10, 'Sauvetage de CMDR Varek');
          return "Varek vous remercie et vous transmet ce qu'il a de plus précieux : du polonium et du germanium. « o7, commandant. »";
        },
      },
      {
        label: 'Partager ses cellules d\'énergie (20)',
        cost: { energy: 20 },
        run: (ctx) => {
          ctx.data(6, 'Aide à CMDR Varek');
          ctx.mats({ vanadium: 2 });
          return 'Assez pour tenir jusqu\'aux Fuel Rats. Varek vous cède du vanadium en échange.';
        },
      },
      { label: 'Couper la communication', run: () => 'Le message se répète, puis s\'éteint. Le silence est pire.' },
    ],
  },
  wreck: {
    title: "Épave d'un Anaconda",
    text: "La carcasse d'un Anaconda tourne lentement sur elle-même, sa coque criblée d'impacts. Des débris l'entourent.",
    choices: [
      {
        label: 'Récupérer des pièces dans les débris',
        cost: { energy: 6 },
        run: (ctx) => {
          const got = randomMats(ctx, ['iron', 'iron', 'nickel', 'vanadium', 'germanium'], 5);
          if (ctx.rng.chance(0.4)) {
            ctx.hull(-8);
            return `Un débris heurte votre cockpit pendant la récupération (coque −8). Butin : ${fmt(got)}.`;
          }
          return `Récupération propre. Butin : ${fmt(got)}.`;
        },
      },
      {
        label: 'Télécharger la boîte noire',
        cost: { energy: 3 },
        run: (ctx) => {
          ctx.data(12, 'Boîte noire : Anaconda « Distant Hope »');
          return "Les derniers mots de l'équipage parlent d'une « forme verte qui a tout coupé ». Vous archivez l'enregistrement.";
        },
      },
      leave,
    ],
  },
  anomaly: {
    title: 'Nuage de particules lagrangien',
    text: 'Un nuage scintillant de particules occupe un point de Lagrange. Les capteurs grésillent.',
    choices: [
      {
        label: 'Traverser le nuage pour l\'étudier',
        run: (ctx) => {
          ctx.data(18, 'Codex : nuage lagrangien');
          if (ctx.rng.chance(0.5)) {
            ctx.energy(25);
            return 'Les particules rechargent vos condensateurs ! Énergie +25. Données de codex enregistrées.';
          }
          ctx.module(null, -15);
          return 'Une décharge parcourt la coque et grille un module (−15 %). Les données valaient-elles le coup ?';
        },
      },
      {
        label: 'Observer à distance',
        cost: { energy: 4 },
        run: (ctx) => {
          ctx.data(8, 'Codex : nuage lagrangien (distance)');
          return 'Observation prudente. Moins de données, aucun risque.';
        },
      },
    ],
  },
  generation: {
    title: 'Navire générationnel',
    text: "Un immense vaisseau d'avant l'hyperespace dérive, ses lumières éteintes depuis des siècles. Sa balise répète un nom : « Hyperion ».",
    choices: [
      {
        label: 'Télécharger les journaux de bord',
        cost: { energy: 8 },
        run: (ctx) => {
          ctx.data(35, 'Navire générationnel Hyperion');
          return "Des siècles d'histoire humaine, des naissances, une mutinerie, puis le silence. Une découverte majeure.";
        },
      },
      leave,
    ],
  },
  megaship: {
    title: 'Mégastructure abandonnée',
    text: 'Une station de recherche abandonnée est ancrée en orbite haute. Un dock semble encore fonctionnel.',
    choices: [
      {
        label: 'Accoster et fouiller',
        cost: { energy: 10 },
        run: (ctx) => {
          ctx.module('all', 25);
          ctx.data(25, 'Station de recherche abandonnée');
          randomMats(ctx, ['vanadium', 'germanium', 'nickel'], 3);
          return "L'atelier automatisé répare partiellement tous vos modules (+25 %). Vous emportez aussi quelques matériaux.";
        },
      },
      leave,
    ],
  },
  flare: {
    title: 'Éruption stellaire !',
    text: "L'étoile se déchaîne : une éjection de masse coronale arrive droit sur vous.",
    choices: [
      {
        label: 'Rediriger l\'énergie vers les boucliers',
        cost: { energy: 12 },
        run: () => 'Les boucliers encaissent le choc. Le vaisseau tremble, mais tient.',
      },
      {
        label: 'Encaisser',
        run: (ctx) => {
          ctx.hull(-15);
          ctx.module(null, -10);
          return 'La vague de plasma frappe de plein fouet. Coque −15, un module endommagé.';
        },
      },
    ],
  },
  thargoidProbe: {
    title: 'Sonde thargoïde',
    text: "Une sonde organique, sombre et nervurée, flotte près de vous. Elle émet un chant étrange qui fait clignoter votre HUD.",
    choices: [
      {
        label: 'Scanner la sonde',
        cost: { energy: 6 },
        run: (ctx) => {
          ctx.data(22, 'Codex : sonde thargoïde');
          ctx.learn('signals');
          if (ctx.rng.chance(0.5)) {
            ctx.module('scanner', -20);
            return "La sonde réagit : une impulsion fige vos systèmes. Le scanner est endommagé (−20 %), mais les données sont inestimables.";
          }
          return 'Le chant change de tonalité, puis la sonde s\'éloigne. Données uniques enregistrées.';
        },
      },
      {
        label: 'Répondre au chant (signaux déchiffrés)',
        when: (s) => s.knowledge.signals >= 2,
        run: (ctx) => {
          ctx.data(22, 'Codex : sonde thargoïde (dialogue)');
          ctx.learn('signals');
          return 'Vous rejouez les motifs appris. La sonde se calme, déroule un nouveau fragment de son chant, puis s\'éloigne sans vous toucher.';
        },
      },
      {
        label: 'Récupérer des fragments (polonium)',
        run: (ctx) => {
          ctx.mats({ polonium: 2 });
          ctx.hull(-10);
          return 'Des fragments caustiques rongent votre coque (−10), mais vous emportez 2 polonium.';
        },
      },
      leave,
    ],
  },

  // --- Événements en hyperespace ---
  hyperdiction: {
    title: 'Hyperdiction thargoïde !',
    text: "Le tunnel hyperspatial se déchire. Votre vaisseau est arraché du saut. Une forme gigantesque en fleur se déploie devant vous.",
    choices: [
      {
        label: 'Recharger le FSD et fuir',
        cost: { energy: 15 },
        run: (ctx) => {
          if (ctx.rng.chance(0.7)) return 'Le FSD hurle, et vous replongez dans le saut juste à temps.';
          ctx.hull(-15);
          ctx.module('fsd', -15);
          return 'Une onde EMP vous frappe pendant la recharge. Coque −15, FSD −15 %. Vous vous échappez de justesse.';
        },
      },
      {
        label: 'Imiter le signal thargoïde (savoir)',
        when: (s) => s.knowledge.signals >= 4,
        cost: { energy: 5 },
        run: (ctx) => {
          ctx.data(15, 'Rencontre thargoïde (signal imité)');
          return 'Vos haut-parleurs émettent le motif appris au fil de vos voyages. L\'Interceptor hésite, puis se replie en fleur et disparaît.';
        },
      },
      {
        label: 'Tout couper et attendre',
        run: (ctx) => {
          if (ctx.rng.chance(0.5)) {
            ctx.data(15, 'Rencontre thargoïde');
            ctx.learn('signals');
            return "Le vaisseau vous scanne longuement... puis disparaît. Vous enregistrez la rencontre, le cœur battant.";
          }
          ctx.hull(-25);
          ctx.module(null, -20);
          return 'Il ne vous ignore pas. Coque −25, un module gravement touché.';
        },
      },
    ],
  },
  fsdOverheat: {
    title: 'Surchauffe du FSD',
    text: "Une alarme : la température du FSD grimpe au-delà des limites pendant le saut.",
    choices: [
      {
        label: 'Purger la chaleur (énergie)',
        cost: { energy: 8 },
        run: () => 'La purge fonctionne. Le FSD est intact.',
      },
      {
        label: 'Laisser refroidir naturellement',
        run: (ctx) => {
          ctx.module('fsd', -12);
          return 'Le FSD a souffert (−12 %).';
        },
      },
    ],
  },

  // --- Événements de surface ---
  crash: {
    title: 'Vaisseau écrasé',
    text: "Les restes d'un Diamondback Explorer gisent au fond d'un cratère. Le cockpit est vide.",
    choices: [
      {
        label: 'Fouiller la soute',
        run: (ctx) => {
          const got = randomMats(ctx, ['iron', 'nickel', 'vanadium', 'germanium', 'carbon'], 5);
          return `Vous récupérez : ${fmt(got)}.`;
        },
      },
      {
        label: 'Récupérer le journal du pilote',
        run: (ctx) => {
          ctx.data(14, 'Journal du CMDR disparu');
          return "« Jour 112. Le FSD ne répond plus. J'ai vu des lumières vertes au-dessus des dunes. » La suite est illisible.";
        },
      },
    ],
  },
  guardian: {
    title: 'Ruines gardiennes',
    text: "Des obélisques d'une civilisation éteinte depuis un million d'années se dressent autour d'une structure centrale. Une sentinelle dort parmi elles.",
    choices: [
      {
        label: 'Activer les obélisques',
        cost: { energy: 10 },
        run: (ctx) => {
          ctx.data(40, 'Codex : ruines gardiennes');
          ctx.flag('guardianBlueprint');
          ctx.learn('glyphs');
          if (ctx.rng.chance(0.35)) {
            ctx.hull(-18);
            return 'La sentinelle s\'éveille et tire sur le vaisseau avant que vous ne fuyiez (coque −18). Mais vous avez le plan d\'un booster FSD gardien !';
          }
          return 'Les obélisques révèlent un plan : un booster FSD gardien. Vous pouvez désormais le synthétiser.';
        },
      },
      {
        label: 'Lire les glyphes (savoir)',
        when: (s) => s.knowledge.glyphs >= 3,
        run: (ctx) => {
          ctx.data(40, 'Codex : ruines gardiennes (glyphes lus)');
          ctx.flag('guardianBlueprint');
          ctx.learn('glyphs');
          return 'Les glyphes vous sont familiers. Vous lisez le plan du booster FSD gardien sans réveiller la sentinelle.';
        },
      },
      {
        label: 'Documenter discrètement',
        run: (ctx) => {
          ctx.data(18, 'Ruines gardiennes (relevés)');
          ctx.learn('glyphs');
          return 'Relevés et photos, sans rien toucher.';
        },
      },
    ],
  },
  thargoid: {
    title: 'Site de surface thargoïde',
    text: "Des structures organiques noires émergent du sol, entourées d'une brume caustique verte.",
    choices: [
      {
        label: 'Prélever des échantillons',
        run: (ctx) => {
          ctx.mats({ polonium: 2, germanium: 1 });
          ctx.data(25, 'Codex : site thargoïde');
          ctx.learn('signals');
          ctx.hull(-12);
          return 'La brume caustique ronge la coque (−12) pendant que vous prélevez polonium et germanium.';
        },
      },
      {
        label: 'Photographier et partir',
        run: (ctx) => {
          ctx.data(12, 'Site thargoïde (photos)');
          ctx.learn('signals');
          return 'Vous ne restez pas plus que nécessaire.';
        },
      },
    ],
  },
  geo: {
    title: 'Évents géologiques',
    text: 'Des geysers de glace jaillissent par intermittence d\'une faille.',
    choices: [
      {
        label: 'Échantillonner les dépôts',
        run: (ctx) => {
          const got = randomMats(ctx, ['germanium', 'vanadium', 'polonium', 'carbon'], 3);
          ctx.data(6, 'Codex : évents géologiques');
          if (ctx.rng.chance(0.2)) {
            ctx.hull(-6);
            return `Un geyser vous projette en arrière (coque −6). Butin : ${fmt(got)}.`;
          }
          return `Butin : ${fmt(got)}.`;
        },
      },
      leave,
    ],
  },

  // --- Milieu de partie : des événements qui changent la donne ---
  derelict: {
    title: (s) => `${SHIPS[s.derelict].name} abandonné`,
    text: (s) => `Un ${SHIPS[s.derelict].name} dérive moteurs coupés, sans équipage. Sa coque a souffert mais ses systèmes répondent encore. ${SHIPS[s.derelict].desc}`,
    choices: [
      {
        label: (s) => `Transférer l'équipage à bord du ${SHIPS[s.derelict].name}`,
        cost: { energy: 10 },
        run: (ctx) => {
          const name = SHIPS[ctx.s.derelict].name;
          const lost = ctx.swapShip();
          return `Vous transférez la soute et prenez les commandes du ${name}. Coque et modules sont abîmés${lost ? `, et vos ${lost} amélioration(s) restent sur l'ancien vaisseau` : ''}. Nouveau vaisseau, nouvelles règles.`;
        },
      },
      {
        label: 'Le démonter pour pièces',
        cost: { energy: 6 },
        run: (ctx) => {
          const got = randomMats(ctx, ['iron', 'nickel', 'vanadium', 'germanium', 'carbon', 'iron'], 6);
          return `Vous démontez ce qui peut l'être. Butin : ${fmt(got)}.`;
        },
      },
      leave,
    ],
  },
  escapePod: {
    title: 'Capsule de survie',
    text: "Une capsule de survie dérive, sa balise presque éteinte. À l'intérieur, une personne en cryostase. La prendre à bord, c'est partager l'oxygène jusqu'à la destination.",
    choices: [
      {
        label: 'Recueillir le passager',
        cost: { energy: 6 },
        run: (ctx) => {
          const p = ctx.takePassenger();
          return `${p.name} se réveille à bord. « Je vous revaudrai ça. » ${p.perk} Le support vital s'use plus vite, et l'amener à destination rapportera gros.`;
        },
      },
      {
        label: 'Relever la balise et signaler la capsule',
        run: (ctx) => {
          ctx.data(8, 'Capsule de survie signalée');
          return 'Vous transmettez sa position aux services de sauvetage. Quelqu\'un viendra, peut-être.';
        },
      },
      leave,
    ],
  },
  tankLeak: {
    title: 'Fuite du réservoir !',
    text: "Une micro-météorite a percé le réservoir pendant le saut. Le carburant s'échappe en un mince nuage cristallin.",
    choices: [
      {
        label: 'Colmater sur-le-champ',
        cost: { mats: { iron: 1, carbon: 1 } },
        run: (ctx) => {
          ctx.fuel(-1);
          return 'Une rustine de fer et de carbone, posée dans l\'urgence. Vous n\'avez perdu qu\'une tonne.';
        },
      },
      {
        label: 'Isoler la section percée',
        run: (ctx) => {
          ctx.s.ship.fuelMax = Math.max(8, ctx.s.ship.fuelMax - 6);
          ctx.fuel(0);
          return `La fuite s'arrête, mais le réservoir ne contient plus que ${ctx.s.ship.fuelMax} t.`;
        },
      },
      {
        label: 'Continuer malgré la fuite',
        run: (ctx) => {
          ctx.flag('tankLeak');
          return 'Vous perdrez du carburant à chaque saut tant que la brèche ne sera pas colmatée (recette de synthèse).';
        },
      },
    ],
  },

  // --- Panne sèche ---
  fuelRats: {
    title: 'Réservoir à sec',
    text: "Plus assez de carburant pour sauter, et aucune étoile écopable ici. Il reste un espoir : les Fuel Rats.",
    choices: [
      {
        label: 'Lancer un appel aux Fuel Rats',
        run: (ctx) => {
          ctx.fuel(10);
          ctx.flag('ratsUsed');
          return "Après des heures d'attente, un Krait arrive. « Fuel is on the way, CMDR ! » Réservoir +10 t. Ils ne viendront pas deux fois si loin.";
        },
      },
    ],
  },
};

export const JUMP_EVENTS = ['hyperdiction', 'fsdOverheat'];
export const MID_EVENTS = ['derelict', 'escapePod', 'tankLeak'];

export function fmt(got) {
  return Object.entries(got).map(([k, v]) => `${v} ${NAMES[k] || k}`).join(', ');
}

const NAMES = { iron: 'fer', nickel: 'nickel', carbon: 'carbone', vanadium: 'vanadium', germanium: 'germanium', polonium: 'polonium' };
