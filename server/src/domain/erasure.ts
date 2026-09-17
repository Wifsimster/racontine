import type { MemberRole } from "../db/schema.js";

/* ===========================================================================
   L'EFFACEMENT — ce qui part avec un compte, et ce qui ne peut pas partir seul.

   « Supprimez mes données » n'est pas un `DELETE` : c'est une décision, et elle
   se prend AVANT de toucher quoi que ce soit. Un compte ne vit pas seul sur une
   instance — il tient des rôles, il paie peut-être l'abonnement du foyer, et
   il est parfois le seul à pouvoir administrer le carnet d'un enfant. Effacer
   sans regarder, c'est au choix : laisser un carnet que plus personne ne peut
   administrer, transmettre la propriété de l'instance à quelqu'un qui ne l'a
   pas demandée, ou continuer de débiter une carte pour une instance vidée.

   Les trois refus ci-dessous ne protègent pas le produit contre la personne :
   ils protègent LES AUTRES de son départ, et ils disent tous ce qu'il faut
   faire pour lever l'obstacle. Aucun n'est un « non » définitif — un compte
   finit toujours par pouvoir partir, une fois qu'il ne tient plus la porte.

   Tout est ici, en fonctions pures : le droit à l'effacement se vérifie sans
   base, sans disque et sans Stripe.
   =========================================================================== */

/** Ce qu'un compte pèse dans le cercle d'un carnet. */
export type CarnetStanding = {
  childId: string;
  childName: string;
  /** Le rôle de celui qui part. */
  role: MemberRole;
  /** Administrateurs du carnet, CELUI QUI PART COMPRIS. */
  admins: number;
  /** Membres du carnet, CELUI QUI PART COMPRIS. */
  members: number;
};

/** L'état d'un compte face à l'effacement, tel que le dépôt le rassemble. */
export type ErasureSnapshot = {
  /** Propriétaire de l'instance = premier compte créé (voir `access.ts`). */
  isOwner: boolean;
  /** Comptes de l'instance AUTRES que celui qui part. */
  otherAccounts: number;
  carnets: CarnetStanding[];
  /** Un abonnement Stripe encaisse encore pour ce foyer. */
  activeSubscription: boolean;
};

/** Un carnet, tel qu'on le nomme à quelqu'un (jamais un identifiant nu). */
export type CarnetRef = { id: string; name: string };

export type ErasureBlockCode =
  | "subscription_active"
  | "instance_owner"
  | "sole_admin";

export type ErasurePlan =
  | {
      ok: true;
      /** Les carnets qui partent AVEC le compte : personne d'autre n'y tient. */
      deletes: CarnetRef[];
      /** Ceux qui restent, tenus par d'autres : le compte s'en retire, c'est tout. */
      leaves: CarnetRef[];
    }
  | {
      ok: false;
      code: ErasureBlockCode;
      /** La phrase montrée telle quelle : elle dit quoi faire, pas seulement non. */
      error: string;
      /** Les carnets qui bloquent, quand c'est d'eux qu'il s'agit. */
      carnets: CarnetRef[];
    };

const ref = (c: CarnetStanding): CarnetRef => ({
  id: c.childId,
  name: c.childName,
});

/**
 * LE PLAN D'EFFACEMENT D'UN COMPTE.
 *
 * Les refus sont ordonnés par ce qu'ils coûtent à ignorer, pas par commodité
 * d'écriture — on donne d'abord à faire ce qui, laissé en l'état, continue de
 * prélever de l'argent :
 *
 *  1. L'ABONNEMENT. Résilier n'est pas un geste qu'on fait à la place de
 *     quelqu'un : la résiliation passe par le portail Stripe, avec ses
 *     conditions et sa facture finale. Effacer d'abord le compte du payeur
 *     laisserait l'abonnement courir sans personne pour le voir.
 *  2. LA PROPRIÉTÉ DE L'INSTANCE. Le propriétaire est le COMPTE LE PLUS ANCIEN,
 *     calculé à chaque lecture (`ownerUserId`) : si le premier compte disparaît
 *     pendant que d'autres existent, le deuxième hérite à l'instant même des
 *     réglages, de l'ouverture des inscriptions et de la caisse — sans que
 *     personne l'ait décidé, sans que rien ne s'affiche. Un transfert de
 *     pouvoir silencieux n'est pas un effet de bord acceptable pour un bouton
 *     « effacer mon compte ». Quand c'est le dernier compte, la question ne se
 *     pose plus : il n'y a personne à qui transmettre.
 *  3. LE DERNIER ADMINISTRATEUR. Un carnet sans administrateur est un carnet
 *     que plus personne ne peut partager, révoquer, ni effacer — il survivrait
 *     à tout le monde. Et il ne suffit pas de le supprimer d'office : il porte
 *     le journal d'un enfant que d'AUTRES proches lisent, ce n'est pas au
 *     partant seul d'en décider. Il nomme un autre administrateur, ou il efface
 *     le carnet lui-même (geste explicite, écran d'administration) — puis il
 *     revient.
 *
 * Ce qui reste passe : le compte quitte les cercles qu'il partageait, et
 * emporte les carnets dont il était le SEUL membre. Ces derniers ne sont
 * réclamables par personne — les laisser derrière, ce serait garder sur le
 * disque le journal d'un enfant que plus aucun compte ne peut ni lire ni
 * effacer. L'oubli serait alors définitif dans le mauvais sens.
 */
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

  /* « Seul administrateur » ne se mesure qu'à partir de DEUX membres : un
     carnet dont il est l'unique membre n'a personne à laisser orphelin — il
     part avec lui, plus bas. */
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

/**
 * LA PHRASE À RECOPIER, avant un geste sans retour.
 *
 * Effacer un carnet, c'est effacer des mois de journées et les photos qui les
 * portent ; effacer un compte, c'est se déconnecter pour toujours. Aucun des
 * deux ne se rattrape — il n'y a pas de corbeille, et la sauvegarde, s'il y en
 * a une, appartient à l'exploitant. Un dialogue « Êtes-vous sûr ? » se clique
 * par réflexe ; recopier le nom de l'enfant, ou sa propre adresse, ne se fait
 * pas par accident.
 *
 * On compare à l'indulgence près : espaces autour, casse, et accents. Le but
 * est d'obtenir une INTENTION, pas de faire réussir une dictée — refuser
 * « lea » pour « Léa » n'aurait protégé personne, et aurait fini par pousser
 * au copier-coller, qui ne prouve plus rien.
 */
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
