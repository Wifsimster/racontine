import type { AccessPolicy } from "../ports.js";

export type TargetResult =
  | { ok: true; childId: string }
  | { ok: false; httpCode: number; error: string };

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
