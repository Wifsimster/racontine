import { isIsoDate } from "../domain/dates.js";
import { childRepository } from "../composition.js";

export type CreateChildResult =
  | {
      ok: true;
      child: {
        id: string;
        name: string;
        birthdate: string | null;
        createdAt: Date;
      };
    }
  | { ok: false; httpCode: number; error: string };

/**
 * Crée un enfant et le cercle qui va avec : son créateur en devient admin et
 * suit d'office sa timeline. La validation du nom et de la date de naissance
 * est ici, et non dans le gestionnaire HTTP — un outil MCP qui créerait un
 * enfant demain devrait obéir aux mêmes règles.
 */
export async function createChild(input: {
  userId: string;
  name?: string;
  birthdate?: string;
}): Promise<CreateChildResult> {
  const name = input.name?.trim();
  if (!name) return { ok: false, httpCode: 400, error: "name requis" };

  const birthdate = input.birthdate?.trim();
  if (birthdate && !isIsoDate(birthdate))
    return {
      ok: false,
      httpCode: 400,
      error: "birthdate invalide (attendu AAAA-MM-JJ)",
    };

  const child = await childRepository.createWithOwner({
    name,
    birthdate: birthdate ?? null,
    ownerUserId: input.userId,
  });
  return { ok: true, child };
}
