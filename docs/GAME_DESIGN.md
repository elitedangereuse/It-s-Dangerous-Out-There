# It's Dangerous Out There — Document de design

> « La destination est certaine. Le voyage ne l'est jamais. »

## 1. Concept

Un jeu web **roguelite 2D**, en **pixel art vue de côté**, d'exploration spatiale.
Il reprend les mécaniques de survie et de choix de *Out There* et la tension
de *FTL*, transposées dans l'univers d'*Elite Dangerous*.

Le cœur de l'expérience est le **voyage** : découvrir, gérer ses ressources,
et décider à chaque système s'il vaut la peine de sortir de sa route.

## 2. Objectif d'une partie

- Au début de la partie, le commandant reçoit une **destination très éloignée**
  (nébuleuse, avant-poste, phénomène lointain).
- But : **l'atteindre**.
- Le trajet est la véritable aventure. Sur le chemin : signaux mystérieux,
  systèmes particuliers, régions dangereuses, phénomènes rares, épaves,
  imprévus. Tout cela reste **optionnel** : on peut toujours choisir
  « je m'arrête et j'explore » ou « je trace ma route ».

### Fin de partie

| Issue | Condition |
|---|---|
| Victoire | Arriver dans le système de destination |
| Défaite | Coque à 0, support vital à 0, ou bloqué sans carburant (après l'unique appel aux Fuel Rats) |

En fin de partie, un bilan affiche les **données d'exploration** accumulées
(valeur scientifique des découvertes), le nombre de sauts, de premiers pas,
d'organismes catalogués. Ce n'est **pas** une monnaie : c'est le score.

## 3. Boucle de gameplay

```
🚀 Saut FSD
 ↓
🌞 Arrivée près de l'étoile  ── (écopage de carburant possible)
 ↓
🔭 Scan du système (auto ou manuel)
 ↓
👀 Découverte des corps / phénomènes  ── (événements éventuels)
 ↓
🤔 Explorer ou continuer ?
 ↓                       ↘
🪐 Orbite → atterrissage   🚀 Carte de navigation → prochain saut
 ↓
🧑‍🚀 Exploration de surface (micro-récit)
 ↓
🔧 Synthèse : réparer / fabriquer / améliorer
 ↓
🚀 Repartir → 🌌 nouveau système → 🎯 plus près de la destination
```

## 4. Systèmes de jeu

### 4.1 Navigation et saut FSD

- Le joueur ouvre la **carte de navigation** et choisit parmi les systèmes à
  portée (classe de l'étoile visible, comme dans Elite ; corps inconnus).
- **Portée** = portée de base × état du FSD × boost éventuel.
- **Coût en carburant** croissant avec la distance (quadratique) : sauter
  loin coûte cher.
- **Boosts** (lore Elite) :
  - Jet d'une **étoile à neutrons** : portée ×4 pour le prochain saut, au
    prix de dégâts à la coque et au FSD.
  - Jet d'une **naine blanche** : portée ×1,5, plus dangereux.
  - **Injections FSD** (synthèse) : +25 % ou +100 %.
- Chaque saut a une chance de déclencher un **événement en hyperespace**
  (hyperdiction thargoïde, surchauffe du FSD…), plus probable dans les
  régions dangereuses.

### 4.2 Arrivée dans un système

Le vaisseau émerge toujours **près de l'étoile principale**.

- Étoiles **écopables** (classes K, G, B, F, O, A, M — « KGBFOAM ») : on peut
  écoper du carburant. Les étoiles chaudes (O, B) rapportent plus mais
  risquent la surchauffe (dégâts coque/modules).
- Étoiles non écopables : naines brunes (L, T, Y), étoiles T Tauri,
  Wolf-Rayet, naines blanches (D), étoiles à neutrons (N), trous noirs.
- L'énergie se recharge partiellement à chaque arrivée.

### 4.3 Scan

| Mode | Coût | Révèle |
|---|---|---|
| 🤖 **Scan automatique** (« honk ») | Énergie faible, une fois | Tous les corps : type, atterrissable ; parfois un indice « signal détecté » |
| 🔬 **Scan manuel** (FSS) | Énergie par corps | Matériaux, signaux biologiques et géologiques, anomalies, structures artificielles, informations cachées |

Le scan auto est rapide mais limité ; le scan manuel est précis mais coûte
plus d'énergie si l'on scanne tout. Le scanner endommagé réduit les
possibilités.

### 4.4 Exploration planétaire

Un corps **atterrissable** (rocheux, glacé, riche en métaux, à forte teneur
en métaux) peut être mis en orbite puis exploré.

**Cinématique signature** : vaisseau en orbite → descente → atterrissage →
ouverture de la rampe → le commandant en combinaison sort du vaisseau.

Le personnage **n'est pas jouable** façon FPS : l'exploration est une
**micro-expérience narrative** avec des actions courtes :

- **Analyser la surface** : révèle ce qu'il y a autour.
- **Rechercher des ressources** : récolte de matériaux (petit risque).
- **Échantillonner la vie** : exobiologie, si signaux biologiques.
- **Suivre l'anomalie / inspecter la structure** : événement narratif à choix
  (vaisseau écrasé, ruines gardiennes, site thargoïde, évents géologiques…).
- **Repartir** : décollage (énergie et un peu de carburant).

### 4.5 Gestion du vaisseau (survie, esprit Out There)

| Ressource | Rôle |
|---|---|
| ⛽ Carburant | Sauts, décollages. Écopage sur étoiles KGBFOAM |
| 🔧 Coque | Points de vie du vaisseau. 0 = destruction |
| ⚡ Énergie | Scans, atterrissages, actions de surface. Recharge partielle à chaque arrivée |
| 🧪 Matériaux | Fer, nickel, carbone, vanadium, germanium, polonium |
| 🔩 Modules | FSD, écope, scanner, propulseurs, support vital — chacun avec un état (%) |

Effets de l'état des modules :

- **FSD** abîmé → portée réduite.
- **Écope** abîmée → moins de carburant récupéré ; à 0, plus d'écopage.
- **Scanner** < 25 % → scan manuel impossible.
- **Propulseurs** < 20 % → atterrissage impossible ; < 50 % → atterrissages brutaux.
- **Support vital** à 0 → fin de partie.

**Synthèse** (inspirée de la synthèse d'Elite) : les matériaux servent à
**réparer → fabriquer → améliorer → survivre**.

- Réparer : coque, modules.
- Fabriquer : cellules d'énergie, injections FSD.
- Améliorer : blindage renforcé, réservoir supplémentaire, scanner calibré,
  booster FSD gardien (nécessite un plan trouvé dans des ruines gardiennes).

### 4.6 Régions et événements

La carte contient des **régions** générées pour chaque partie :

- **Nébuleuses** : plus de corps intéressants, plus d'événements.
- **Zones thargoïdes** : hyperdictions fréquentes, sites thargoïdes.
- **Amas d'étoiles à neutrons** : beaucoup de boosts possibles, mais coûteux
  pour la coque.

Les événements sont des **saynètes à choix** (texte + 2-3 options, parfois
conditionnées par l'énergie, le carburant ou des matériaux). Ils sont le
moteur des prises de risque et de l'identité du jeu.

### 4.7 Lore Elite Dangerous utilisé

Bulle humaine, noms de systèmes procéduraux (ex. *Synuefe EN-H d11-96*),
classes stellaires d'Elite, écopage, boost neutronique, synthèse, Gardiens,
Thargoïdes, Fuel Rats, navires générationnels, exobiologie, « premier pas ».

## 5. Ce qu'on retire volontairement

Pas d'équipage à gérer, pas d'économie, pas de commerce, pas de système
financier. **Le joueur est le commandant ; son vaisseau est son outil de survie.**

## 6. Direction artistique

- Pixel art, vue de côté, résolution interne 320×180 agrandie sans lissage.
- L'étoile domine la gauche de l'écran à l'arrivée ; les corps s'alignent
  vers la droite, révélés au fil du scan.
- Planètes rendues par pixel avec tramage (dithering) pour l'ombrage.
- La séquence d'atterrissage est la signature visuelle.

## 7. Prototype actuel (v0.1)

Le prototype dans ce dépôt implémente la boucle complète :

- [x] Destination lointaine, carte de navigation, sauts avec coût en carburant
- [x] Classes d'étoiles d'Elite, écopage, boosts neutron / naine blanche
- [x] Scan automatique progressif et scan manuel par corps
- [x] Orbite, cinématique d'atterrissage, actions de surface, décollage
- [x] Carburant, coque, énergie, matériaux, état des modules
- [x] Synthèse : réparation, fabrication, améliorations
- [x] Événements système, hyperespace et surface ; régions dangereuses
- [x] Victoire / défaite, bilan de fin de partie, graine reproductible

### Pistes pour la suite

- Équilibrage (longueur de partie, rareté des matériaux).
- Plus d'événements et de chaînes narratives sur plusieurs systèmes.
- Choix du vaisseau de départ (Asp Explorer, Diamondback, Krait Phantom…).
- Son et musique d'ambiance.
- Codex consultable des découvertes, méta-progression entre les parties.
- Sauvegarde de la partie en cours.
