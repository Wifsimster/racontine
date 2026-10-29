import type { MemberRole } from "../db/schema.js";

export type CarnetStanding = {
  childId: string;
  childName: string;
  role: MemberRole;
  admins: number;
  members: number;
};

export type ErasureSnapshot = {
  isOwner: boolean;
  otherAccounts: number;
  carnets: CarnetStanding[];
  activeSubscription: boolean;
};

export type CarnetRef = { id: string; name: string };

export type ErasureBlockCode =
  | "subscription_active"
  | "instance_owner"
  | "sole_admin";

export type ErasurePlan =
  | {
      ok: true;
      deletes: CarnetRef[];
      leaves: CarnetRef[];
    }
  | {
      ok: false;
      code: ErasureBlockCode;
      error: string;
      carnets: CarnetRef[];
    };

const ref = (c: CarnetStanding): CarnetRef => ({
  id: c.childId,
  name: c.childName,
});

export function planAccountErasure(snapshot: ErasureSnapshot): ErasurePlan {
  if (snapshot.activeSubscription && snapshot.isOwner)
    return {
      ok: false,
      code: "subscription_active",
      error:
        "Un abonnement est encore actif sur cette instance. Résiliez-le depuis « Abonnement » (portail Stripe) avant d'effacer votre compte, sinon la carte continuerait d'être débitée pour un carnet vidé.",
      carnets: [],
    };

  if (snapshot.isOwner && snapshot.otherAccounts > 0)
    return {
      ok: false,
      code: "instance_owner",
      error:
        "Vous êtes le propriétaire de cette instance, et d'autres comptes y existent encore. Effacer le vôtre transmettrait la propriété — réglages, inscriptions, abonnement — au compte le plus ancien restant, sans que personne l'ait décidé. Retirez d'abord les autres comptes, ou transmettez l'instance en connaissance de cause.",
      carnets: [],
    };

  const orphaned = snapshot.carnets.filter(
    (c) => c.role === "admin" && c.admins === 1 && c.members > 1,
  );
  if (orphaned.length)
    return {
      ok: false,
      code: "sole_admin",
      error:
        orphaned.length === 1
          ? `Vous êtes le seul administrateur du carnet de ${orphaned[0]!.childName}, que d'autres proches suivent. Nommez un autre administrateur, ou effacez ce carnet, avant d'effacer votre compte.`
          : `Vous êtes le seul administrateur de ${orphaned.length} carnets que d'autres proches suivent (${orphaned.map((c) => c.childName).join(", ")}). Nommez un autre administrateur sur chacun, ou effacez-les, avant d'effacer votre compte.`,
      carnets: orphaned.map(ref),
    };

  const deletes = snapshot.carnets.filter((c) => c.members === 1);
  const leaves = snapshot.carnets.filter((c) => c.members > 1);
  return { ok: true, deletes: deletes.map(ref), leaves: leaves.map(ref) };
}

export function confirms(typed: string, expected: string): boolean {
  const fold = (s: string) =>
    s
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  const wanted = fold(expected);
  return wanted.length > 0 && fold(typed) === wanted;
}
