/**
 * Utilitaires de sélection du terminal agent, sans dépendance native afin
 * d'être testables hors application.
 */

/**
 * Normalise une réponse d'API en tableau.
 *
 * Le backend ne renvoie pas la même forme selon l'endpoint : un objet unique
 * sous `data` pour `/terminals` (`{ message, data: { id: 46 } }`), un tableau
 * pour d'autres (`{ data: [...] }`), et une page pour les endpoints paginés
 * (`{ data: { data: [...] } }`). Appliquer `data.data || data` puis un
 * `.filter()` sur un objet invalide faisait perdre silencieusement les données.
 */
export const toArray = (payload: any): any[] => {
  if (payload == null) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === 'object') {
    if (Array.isArray(payload.data.data)) return payload.data.data;
    return [payload.data];
  }
  return [];
};

const freshness = (t: any): string =>
  t?.registered_at || t?.last_seen_at || t?.created_at || '';

/** Première valeur non nulle/undefined, sans court-circuiter sur `null`. */
const firstDefined = (...values: any[]): any => {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

/**
 * Choisit LE terminal à utiliser pour un agent.
 *
 * L'API pouvant renvoyer plusieurs terminaux pour un même agent (ancien
 * terminal non retiré + terminal courant), les enregistrer tous rendait
 * `getLocalTerminalForUser` arbitraire (`LIMIT 1` sans ORDER BY) : l'app
 * pouvait envoyer un terminal périmé et le backend le rejetait en 403.
 *
 * Ne devine jamais : si aucun signal ne départage, renvoie une liste vide.
 */
export const pickAgentTerminal = (terminals: any[], userId: number): any[] => {
  if (!Array.isArray(terminals) || terminals.length === 0) return [];

  const owned = terminals.filter((t) => {
    // `user_id: null` signifie NON attribué. Ne surtout pas écrire
    // `t.user_id ?? t.agent_id` ici : `??` traite null comme absent et
    // renvoyait undefined, ce qui faisait passer les 49 terminaux libres
    // comme s'ils appartenaient à l'agent.
    const owner = firstDefined(t?.user_id, t?.agent_id, t?.user?.id);
    // Aucun propriétaire déclaré : le terminal n'appartient à personne.
    if (owner === undefined || owner === null) return false;
    return owner === userId;
  });

  if (owned.length === 0) return [];

  if (owned.length > 1) {
    // L'id n'est pas un ordre de priorité : un tie-break sur id envoyait un
    // terminal arbitraire au backend.
    console.warn(
      `⚠️ ${owned.length} terminaux pour l'agent ${userId}, sélection ambiguë: ` +
        owned
          .map((t) => `#${t?.id ?? t?.terminal_id} registered_at=${freshness(t) || 'n/a'}`)
          .join(' | ')
    );
    if (new Set(owned.map(freshness)).size === 1) {
      return [];
    }
  }

  const [best] = [...owned].sort((a, b) => {
    // Un terminal bloqué ne peut pas encaisser : on l'évite
    const blockedA = a?.is_blocked ? 1 : 0;
    const blockedB = b?.is_blocked ? 1 : 0;
    if (blockedA !== blockedB) return blockedA - blockedB;
    return freshness(b).localeCompare(freshness(a));
  });

  return [best];
};