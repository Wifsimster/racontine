import type { MemberRole } from "../db/schema.js";

export const ROLES: readonly MemberRole[] = ["admin", "contributor", "reader"];

export function isRole(value: string): value is MemberRole {
  return (ROLES as readonly string[]).includes(value);
}

export type MemberRow = {
  userId: string;
  role: MemberRole;
  name: string;
  email: string;
  createdAt: Date;
};

export type InvitationRow = {
  id: string;
  childId: string;
  email: string;
  role: MemberRole;
  token: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: Date;
};

export function roleRank(role: MemberRole): number {
  return ROLES.length - ROLES.indexOf(role);
}

export type CircleChange = "ok" | "missing" | "last-admin";

export interface MembershipRepository {
  listMembers(childId: string): Promise<MemberRow[]>;
  setRole(childId: string, userId: string, role: MemberRole): Promise<CircleChange>;
  remove(childId: string, userId: string): Promise<CircleChange>;
  nameIfBlank(
    childId: string,
    userId: string,
    name: string,
  ): Promise<"ok" | "missing" | "named">;
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
  revoke(id: string): Promise<boolean>;
  revokePendingFor(childId: string, email: string): Promise<void>;
  acceptIfPending(invitationId: string, userId: string): Promise<boolean>;
}

export interface UserDirectory {
  findIdByEmail(email: string): Promise<string | null>;
}

export interface LinkDelivery {
  deliver(to: string, subject: string, url: string): Promise<void>;
}

export type SharingDeps = {
  memberships: MembershipRepository;
  invitations: InvitationRepository;
  users: UserDirectory;
  delivery: LinkDelivery;
  invitationTtlDays(): Promise<number>;
  inviteUrl(token: string): string;
  newToken(): string;
  now(): Date;
};

export type Rejection = { ok: false; httpCode: number; error: string };
export type Ok<T> = { ok: true } & T;

const MAX_NAME = 80;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export class SharingService {
  constructor(private readonly deps: SharingDeps) {}

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

  async nameMember(params: {
    childId: string;
    userId: string;
    name?: string;
  }): Promise<Ok<{ name: string }> | Rejection> {
    const name = (params.name ?? "").trim().replace(/\s+/g, " ");
    if (!name || name.length > MAX_NAME)
      return {
        ok: false,
        httpCode: 400,
        error: `nom invalide (1 à ${MAX_NAME} caractères)`,
      };
    const outcome = await this.deps.memberships.nameIfBlank(
      params.childId,
      params.userId,
      name,
    );
    if (outcome === "missing")
      return { ok: false, httpCode: 404, error: "membre introuvable" };
    if (outcome === "named")
      return { ok: false, httpCode: 409, error: "ce proche a déjà un nom" };
    return { ok: true, name };
  }

  async removeMember(params: {
    childId: string;
    userId: string;
  }): Promise<Ok<object> | Rejection> {
    const outcome = await this.deps.memberships.remove(
      params.childId,
      params.userId,
    );
    return outcome === "missing" ? { ok: true } : circleOutcome(outcome);
  }

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

  async accept(params: {
    token: string;
    userId: string;
    userEmail: string;
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

  findInvitation(id: string): Promise<InvitationRow | null> {
    return this.deps.invitations.findById(id);
  }

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
