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

- Cliquez sur un corps (à l'écran ou dans la liste) pour le sélectionner.
- **Scan automatique** : révèle tous les corps rapidement, avec peu de détails.
- **Scan manuel** : détaille un corps (matériaux, signaux, anomalies).
- **Mise en orbite et atterrissage** sur les corps atterrissables, puis actions de surface.
- **Écoper** l'étoile (classes KGBFOAM) pour refaire le plein.
- **Synthèse** : réparer, fabriquer, améliorer avec vos matériaux.
- **Carte de navigation** : choisir le prochain saut.
- Espace ou clic : passer une cinématique.

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
| `src/render.js`, `src/sprites.js` | Rendu canvas 320×180 en pixel art |
| `src/main.js` | Interface et boucle de jeu |

Le document de design est dans [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

---

Projet de fan non officiel. Elite Dangerous est une marque de Frontier Developments.
