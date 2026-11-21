// Progression partagée avec miniship (le jeu du site, qui ouvre celui-ci dans sa fenêtre des jeux).
// Ici, le jeu ne voit pas le compte du site : il envoie sa progression à la page qui l'accueille
// (`{ type: 'idot:save', profile }`), qui la range au compte du CMDR connecté et rend la progression
// fusionnée de tous ses appareils (`{ type: 'idot:profile', profile }`). Joué seul dans un onglet, ou par
// un invité, le jeu garde sa progression dans le navigateur, comme avant.

// Les pages qui peuvent nous répondre : le site et ses sous-domaines, et un serveur local.
const ALLOWED = /^(https:\/\/([a-z0-9-]+\.)*elitedangereuse\.fr|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

function hostOrigin() {
  const ancestor = globalThis.location?.ancestorOrigins?.[0];
  if (ancestor) return ancestor;
  try { return new URL(document.referrer).origin; } catch { return ''; }
}

// onProfile(profile) : la progression rendue par la page d'accueil.
export function createSync(onProfile) {
  if (typeof window === 'undefined' || window.parent === window) return { push() {} };
  // Sans origine connue (référent masqué), on envoie quand même : la progression n'a rien de secret.
  // Seule une page autorisée peut répondre.
  const origin = hostOrigin();
  const target = ALLOWED.test(origin) ? origin : '*';
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !ALLOWED.test(e.origin)) return;
    if (e.data && e.data.type === 'idot:profile') onProfile(e.data.profile);
  });
  return {
    push(profile) {
      try { window.parent.postMessage({ type: 'idot:save', profile }, target); } catch { /* page fermée */ }
    },
  };
}
