import type { MemberRole } from "../db/schema.js";
import { roleAtLeast } from "../access.js";

/** Adhésion d'un utilisateur à un enfant. */
export type Membership = { childId: string; role: MemberRole };

/**
 * Ce que l'appelant a le droit de voir : les enfants dans la portée demandée, et
 * ceux dont il peut voir aussi les BROUILLONS (contributeur ou admin).
 */
export type VisibilityScope =
  | { kind: "empty" }
  | { kind: "denied" }
  | { kind: "scoped"; childIds: string[]; draftableChildIds: string[] };

/**
 * LA RÈGLE DE VISIBILITÉ DU JOURNAL, écrite une fois.
 *
 * « Un lecteur ne voit que le journal publié ; un contributeur ou un admin voit
 * aussi les brouillons » vivait en double — une fois dans la route timeline,
 * une fois dans l'outil MCP qui liste les journées. Deux copies d'une règle
 * d'ACCÈS, c'est la promesse qu'un jour l'une des deux montrera à un proche un
 * brouillon que l'autre lui cache.
 */
export function timelineScope(
  memberships: readonly Membership[],
  requestedChildId?: string,
): VisibilityScope {
  if (!memberships.length) return { kind: "empty" };

  const roleByChild = new Map(memberships.map((m) => [m.childId, m.role]));
  if (requestedChildId !== undefined && !roleByChild.has(requestedChildId))
    return { kind: "denied" };

  const childIds =
    requestedChildId !== undefined
      ? [requestedChildId]
      : [...roleByChild.keys()];

  return {
    kind: "scoped",
    childIds,
    draftableChildIds: childIds.filter((id) =>
      roleAtLeast(roleByChild.get(id)!, "contributor"),
    ),
  };
}
