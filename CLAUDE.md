# Consignes pour Claude

## Déploiement (automatisé par GitHub Actions)

| Branche | Environnement | Workflow |
|---|---|---|
| `develop` | **Préprod** (version de test) | `.github/workflows/deploy_preprod.yaml` |
| `main` | **Prod** | `.github/workflows/deploy_prod.yml` |

Tout push (ou merge de PR) sur `develop` déploie en préprod ; tout push ou merge sur `main` déploie en prod. Le site est envoyé tel quel par FTP : pas d'étape de build.

## Règle obligatoire avant chaque push

**Avant chaque push, demander à Ben de choisir la destination et attendre sa réponse.** Les options :

- la branche de travail de la PR (aucun déploiement) ;
- `develop` (déploie en préprod) ;
- `main` (déploie en prod).

Cela vaut aussi pour la branche cible d'une PR : une PR vers `main` déploie en prod au moment du merge. Ne jamais pousser ni ouvrir de PR sans ce choix explicite.

## Projet

- Jeu web en JavaScript natif (modules ES) et canvas, sans dépendance ni build.
- `npm start` : serveur local sur http://localhost:8080.
- `npm test` : tests de la logique de jeu (à lancer avant toute proposition de push).
- Design : `docs/GAME_DESIGN.md`. Langue du projet : français.
