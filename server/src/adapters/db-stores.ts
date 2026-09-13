import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { children, type MemberRole } from "../db/schema.js";
import { accessibleChildIds, childRole, hasChildRole } from "../access.js";
import { getChildGlossary } from "../corrections.js";
import { getUserAnthropicKey } from "../llm-keys.js";
import type {
  AccessPolicy,
  ApiKeyStore,
  ChildDirectory,
  GlossaryEntry,
  GlossaryStore,
} from "../ports.js";

/** Clés d'API stockées chiffrées, une par utilisateur. */
export class EncryptedApiKeyStore implements ApiKeyStore {
  getKey(userId: string): Promise<string | null> {
    return getUserAnthropicKey(userId);
  }
}

/** Vocabulaire confirmé d'un enfant, constitué au fil des relectures. */
export class CorrectionsGlossaryStore implements GlossaryStore {
  forChild(childId: string): Promise<GlossaryEntry[]> {
    return getChildGlossary(childId);
  }
}

/** Droits par enfant, lus dans les adhésions. */
export class MembershipAccessPolicy implements AccessPolicy {
  accessibleChildIds(userId: string): Promise<string[]> {
    return accessibleChildIds(userId);
  }
  hasChildRole(
    userId: string,
    childId: string,
    min: MemberRole,
  ): Promise<boolean> {
    return hasChildRole(userId, childId, min);
  }
  roleOn(userId: string, childId: string): Promise<MemberRole | null> {
    return childRole(userId, childId);
  }
}

/** Nom d'un enfant, pour les phrases de notification. */
export class DrizzleChildDirectory implements ChildDirectory {
  async nameOf(childId: string): Promise<string | null> {
    const [row] = await db
      .select({ name: children.name })
      .from(children)
      .where(eq(children.id, childId))
      .limit(1);
    return row?.name ?? null;
  }
}
