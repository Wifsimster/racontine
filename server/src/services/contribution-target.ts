import type { AccessPolicy } from "../ports.js";

/** L'enfant visé par une contribution, ou le refus à renvoyer tel quel. */
export type TargetResult =
  | { ok: true; childId: string }
  | { ok: false; httpCode: number; error: string };

/**
 * À quel enfant s'adresse cette contribution, et l'appelant a-t-il le droit d'y
 * contribuer ?
 *
 * Deux règles, identiques pour une photo de carnet et pour une journée déjà
 * transcrite, et donc écrites UNE fois :
 *  · `childId` est facultatif tant que l'utilisateur ne suit qu'un seul enfant ;
 *  · contribuer exige le rôle `contributor` (ou `admin`) — et le refus est
 *    uniforme, pour ne pas divulguer l'existence d'un enfant non partagé.
 */
export async function resolveContributionTarget(
  access: AccessPolicy,
  userId: string,
  childId?: string,
): Promise<TargetResult> {
  let target = childId;
  if (!target) {
    const ids = await access.accessibleChildIds(userId);
    if (ids.length !== 1)
      return {
        ok: false,
        httpCode: 400,
        error: "childId requis (plusieurs enfants)",
      };
    target = ids[0];
  }

  if (!(await access.hasChildRole(userId, target, "contributor")))
    return { ok: false, httpCode: 403, error: "accès refusé à cet enfant" };

  return { ok: true, childId: target };
}
