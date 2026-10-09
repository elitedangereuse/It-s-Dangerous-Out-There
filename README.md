# It's Dangerous Out There

> « La destination est certaine. Le voyage ne l'est jamais. »

Roguelite web d'exploration spatiale en **pixel art vue de côté**, inspiré de
*Out There* et *FTL*, dans l'univers d'*Elite Dangerous*.

Une destination lointaine, un vaisseau, des ressources limitées. À chaque
système : explorer ou continuer ?

## Jouer

Aucune dépendance, aucune étape de build. Il faut seulement Node.js 18+ pour le
petit serveur local (les modules ES ne se chargent pas en `file://`).

```bash
npm start
# puis ouvrir http://localhost:8080
```

N'importe quel serveur statique fonctionne aussi (`python3 -m http.server`, GitHub Pages…).

Ajoutez `?seed=1234` à l'URL pour rejouer une galaxie précise.

### Commandes

Toutes les actions sont dans la barre sous l'écran, chacune avec son raccourci.

| Touche | Action |
|---|---|
| clic, `←` `→`, `1`–`9` | Sélectionner un corps du système |
| `A` | Scan du système |
| `M` | Scan détaillé du corps sélectionné |
| `L` | Atterrir sur le corps sélectionné |
| `E` | Écoper l'étoile (classes KGBFOAM) |
| `B` | Traverser le jet d'une étoile à neutrons ou naine blanche |
| `Y` | Synthèse (réparer, fabriquer, améliorer) |
| `N` | Carte de navigation, puis `↑` `↓` et `Entrée` pour sauter |
| `1`–`9`, `D` | En surface : actions, puis décoller |
| `M`, `J` | Onglets Modules et Journal |
| `Échap` | Retour |
| `Espace` | Passer une cinématique |

## Développement

```bash
npm test   # tests de la logique de jeu (node:test), dont 60 parties simulées
```

| Fichier | Rôle |
|---|---|
| `src/game.js` | Logique pure (état, saut, scan, surface, synthèse, fin de partie) |
| `src/galaxy.js` | Génération procédurale (régions, systèmes, corps) |
| `src/events.js` | Événements narratifs à choix |
| `src/data.js` | Classes stellaires, corps, matériaux, recettes, destinations |
| `src/render.js` | Rendu canvas 320×180 des scènes (titre, système, saut, atterrissage, surface, fin) |
| `src/sprites.js` | Vaisseau (inspiré du Mandalay) et commandant en combinaison, en pixel art |
| `src/pixelplanets.js` | Planètes, étoiles et astéroïdes pixel art animés (WebGL) |
| `src/scenery.js` | Décors : 250 nébuleuses d'espace et 250 panoramas planétaires, en parallaxe |
| `galerie.html` | Galerie pour parcourir les fonds générés |
| `src/main.js` | Interface et boucle de jeu |

Le document de design est dans [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

## Crédits

- Planètes, étoiles et astéroïdes : portage WebGL des shaders [PixelPlanets](https://github.com/Deep-Fold/PixelPlanets) de Deep-Fold (licence MIT).

---

Projet de fan non officiel. Elite Dangerous est une marque de Frontier Developments.
