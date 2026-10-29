import type { MemberRole } from "../db/schema.js";
import { roleAtLeast } from "../access.js";

export type Membership = { childId: string; role: MemberRole };

export type VisibilityScope =
  | { kind: "empty" }
  | { kind: "denied" }
  | { kind: "scoped"; childIds: string[]; draftableChildIds: string[] };

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
