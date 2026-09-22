import type { MemberRole } from "../db/schema.js";

/* ===========================================================================
   LE CERCLE D'UN ENFANT — qui en fait partie, et à quelles conditions.

   Ces règles vivaient dans les gestionnaires HTTP de `routes/sharing.ts`, entre
   deux requêtes SQL : « il doit rester au moins un administrateur », « une
   invitation ne sert qu'une fois », « elle est nominative », « retirer un
   proche retire aussi son abonnement ». Ce sont les règles qui décident QUI VOIT
   LA JOURNÉE D'UN ENFANT — les plus sensibles du produit —, et aucune n'était
   vérifiable sans une base Postgres et une requête HTTP.

   Elles sont ici, derrière des ports. La route ne fait plus que traduire.
   =========================================================================== */

/** Les rôles acceptés, dans l'ordre décroissant de droits. */
export const ROLES: readonly MemberRole[] = ["admin", "contributor", "reader"];

export function isRole(value: string): value is MemberRole {
  return (ROLES as readonly string[]).includes(value);
}

/** Une adhésion au cercle d'un enfant. */
export type MemberRow = {
  userId: string;
  role: MemberRole;
  name: string;
  email: string;
  createdAt: Date;
};

/** Une invitation en attente ou déjà tranchée. */
export type InvitationRow = {
  id: string;
  childId: string;
  email: string;
  role: MemberRole;
  token: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: Date;
};

/** Rang d'un rôle : plus il est haut, plus il donne de droits. */
export function roleRank(role: MemberRole): number {
  return ROLES.length - ROLES.indexOf(role);
}

/**
 * Issue d'une modification du cercle. « last-admin » : elle aurait laissé
 * l'enfant sans administrateur, et n'a donc PAS été appliquée.
 */
export type CircleChange = "ok" | "missing" | "last-admin";

export interface MembershipRepository {
  listMembers(childId: string): Promise<MemberRow[]>;
  /**
   * Change le rôle d'un membre, sauf s'il est le dernier administrateur et
   * perdrait ce rôle. La vérification et l'écriture sont ATOMIQUES (verrou sur
   * le cercle) : deux rétrogradations croisées ne peuvent pas passer toutes
   * les deux.
   */
  setRole(childId: string, userId: string, role: MemberRole): Promise<CircleChange>;
  /**
   * Retire l'adhésion, l'abonnement et les invitations encore en attente pour
   * son adresse, d'un seul tenant — sauf s'il s'agit du dernier administrateur
   * (même atomicité que `setRole`).
   */
  remove(childId: string, userId: string): Promise<CircleChange>;
  /** Crée ou met à jour l'adhésion d'un utilisateur. */
  upsert(childId: string, userId: string, role: MemberRole): Promise<void>;
  isMember(childId: string, userId: string): Promise<boolean>;
}

export interface InvitationRepository {
  listPending(childId: string): Promise<InvitationRow[]>;
  create(row: {
    childId: string;
    email: string;
    role: MemberRole;
    token: string;
    invitedBy: string;
    expiresAt: Date;
  }): Promise<InvitationRow>;
  findById(id: string): Promise<InvitationRow | null>;
  findByToken(token: string): Promise<(InvitationRow & { childName: string }) | null>;
  /** Révoque une invitation EN ATTENTE. False si elle ne l'était plus. */
  revoke(id: string): Promise<boolean>;
  /** Révoque toutes les invitations en attente de cet enfant pour cette adresse. */
  revokePendingFor(childId: string, email: string): Promise<void>;
  /**
   * Marque l'invitation acceptée SI elle est encore en attente, et crée
   * l'adhésion dans la même transaction. False si quelqu'un l'a acceptée
   * entre-temps — c'est la garde contre le double usage concurrent.
   */
  acceptIfPending(invitationId: string, userId: string): Promise<boolean>;
}

/** L'adresse e-mail d'un compte existant, s'il y en a un. */
export interface UserDirectory {
  findIdByEmail(email: string): Promise<string | null>;
}

/** Remise d'un lien de capacité (e-mail, webhook). */
export interface LinkDelivery {
  deliver(to: string, subject: string, url: string): Promise<void>;
}

export type SharingDeps = {
  memberships: MembershipRepository;
  invitations: InvitationRepository;
  users: UserDirectory;
  delivery: LinkDelivery;
  /** Durée de validité d'une invitation, en jours (réglage d'instance). */
  invitationTtlDays(): Promise<number>;
  /** Lien public d'acceptation d'une invitation. */
  inviteUrl(token: string): string;
  newToken(): string;
  now(): Date;
};

export type Rejection = { ok: false; httpCode: number; error: string };
export type Ok<T> = { ok: true } & T;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export class SharingService {
  constructor(private readonly deps: SharingDeps) {}

  /** Membres du cercle + invitations en attente (vue d'administration). */
  async circle(childId: string) {
    const [members, pending] = await Promise.all([
      this.deps.memberships.listMembers(childId),
      this.deps.invitations.listPending(childId),
    ]);
    const now = this.deps.now().getTime();
    return {
      members,
      invitations: pending.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt,
        expired: i.expiresAt.getTime() < now,
        url: this.deps.inviteUrl(i.token),
      })),
    };
  }

  /** Invite un proche : valide, crée le lien, et le remet à son destinataire. */
  async invite(params: {
    childId: string;
    inviterId: string;
    email?: string;
    role?: string;
  }): Promise<Ok<{ invitation: InvitationRow; url: string }> | Rejection> {
    const email = params.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email))
      return { ok: false, httpCode: 400, error: "email invalide" };

    const role = params.role ?? "reader";
    if (!isRole(role)) return { ok: false, httpCode: 400, error: "rôle invalide" };

    // Déjà membre ? (le compte existe et suit déjà cet enfant.)
    const existingUser = await this.deps.users.findIdByEmail(email);
    if (
      existingUser &&
      (await this.deps.memberships.isMember(params.childId, existingUser))
    )
      return {
        ok: false,
        httpCode: 409,
        error: "cette personne suit déjà cet enfant",
      };

    // Une seule invitation vivante par adresse : les liens précédents tombent.
    // Sinon, un doublon oublié survivrait à l'acceptation du premier… et au
    // retrait du proche, qu'il ferait revenir dans le cercle.
    await this.deps.invitations.revokePendingFor(params.childId, email);

    const token = this.deps.newToken();
    const ttlDays = await this.deps.invitationTtlDays();
    const expiresAt = new Date(
      this.deps.now().getTime() + ttlDays * 24 * 60 * 60 * 1000,
    );
    const invitation = await this.deps.invitations.create({
      childId: params.childId,
      email,
      role,
      token,
      invitedBy: params.inviterId,
      expiresAt,
    });

    const url = this.deps.inviteUrl(token);
    await this.deps.delivery.deliver(
      email,
      "Invitation à suivre un enfant sur Racontine",
      url,
    );
    return { ok: true, invitation, url };
  }

  /** Change le rôle d'un membre, sans jamais laisser l'enfant sans administrateur. */
  async setRole(params: {
    childId: string;
    userId: string;
    role?: string;
  }): Promise<Ok<object> | Rejection> {
    const role = params.role ?? "";
    if (!isRole(role)) return { ok: false, httpCode: 400, error: "rôle invalide" };

    return circleOutcome(
      await this.deps.memberships.setRole(params.childId, params.userId, role),
    );
  }

  /** Retire un membre (et son abonnement), sauf s'il est le dernier admin. */
  async removeMember(params: {
    childId: string;
    userId: string;
  }): Promise<Ok<object> | Rejection> {
    // Retirer l'adhésion ET l'abonnement : sans quoi le proche continuerait de
    // recevoir notifications et e-mails de la timeline malgré l'accès révoqué.
    const outcome = await this.deps.memberships.remove(
      params.childId,
      params.userId,
    );
    // Déjà absent : l'état voulu est atteint (retrait idempotent).
    return outcome === "missing" ? { ok: true } : circleOutcome(outcome);
  }

  /** Aperçu public d'une invitation (le jeton EST la capacité). */
  async preview(token: string) {
    const inv = await this.deps.invitations.findByToken(token);
    if (!inv) return null;
    return {
      email: inv.email,
      role: inv.role,
      childName: inv.childName,
      status: inv.status,
      expired: inv.expiresAt.getTime() < this.deps.now().getTime(),
    };
  }

  /**
   * Accepte une invitation pour un compte connecté.
   *
   * Trois refus, dans cet ordre : usage unique (un lien transféré ne doit pas
   * rester exploitable), expiration, et destinataire — l'invitation est
   * NOMINATIVE, le jeton ne doit pas faire entrer un tiers dans le cercle d'un
   * enfant.
   */
  async accept(params: {
    token: string;
    userId: string;
    userEmail: string;
    /**
     * L'adresse du compte a-t-elle été PROUVÉE (lien magique suivi) ? Une
     * adresse seulement déclarée à l'inscription ne dit pas que ce compte est
     * bien le destinataire : sans cette preuve, quiconque tient un lien
     * transféré pourrait créer le compte à l'adresse invitée et entrer.
     */
    emailVerified: boolean;
  }): Promise<Ok<{ childId: string; role: MemberRole }> | Rejection> {
    const inv = await this.deps.invitations.findByToken(params.token);
    if (!inv) return { ok: false, httpCode: 404, error: "invitation introuvable" };
    if (inv.status !== "pending")
      return {
        ok: false,
        httpCode: 410,
        error: "invitation déjà utilisée ou révoquée",
      };
    if (inv.expiresAt.getTime() < this.deps.now().getTime())
      return { ok: false, httpCode: 410, error: "invitation expirée" };
    if (params.userEmail.trim().toLowerCase() !== inv.email.toLowerCase())
      return {
        ok: false,
        httpCode: 403,
        error: "cette invitation est destinée à une autre adresse e-mail",
      };
    if (!params.emailVerified)
      return {
        ok: false,
        httpCode: 403,
        error:
          "confirmez d'abord votre adresse e-mail : demandez un lien de connexion",
      };

    if (!(await this.deps.invitations.acceptIfPending(inv.id, params.userId)))
      return {
        ok: false,
        httpCode: 410,
        error: "invitation déjà utilisée ou révoquée",
      };

    return { ok: true, childId: inv.childId, role: inv.role };
  }

  /**
   * L'invitation visée, pour savoir DE QUEL ENFANT elle relève — c'est ce qui
   * permet à l'appelant de vérifier qu'il en est administrateur AVANT de la
   * révoquer.
   */
  findInvitation(id: string): Promise<InvitationRow | null> {
    return this.deps.invitations.findById(id);
  }

  /**
   * Révoque une invitation en attente (l'autorisation est déjà vérifiée).
   * False si elle ne l'était plus (acceptée ou déjà révoquée).
   */
  revokeInvitation(id: string): Promise<boolean> {
    return this.deps.invitations.revoke(id);
  }
}

function circleOutcome(outcome: CircleChange): Ok<object> | Rejection {
  if (outcome === "missing")
    return { ok: false, httpCode: 404, error: "membre introuvable" };
  if (outcome === "last-admin")
    return {
      ok: false,
      httpCode: 400,
      error: "il doit rester au moins un administrateur",
    };
  return { ok: true };
}
