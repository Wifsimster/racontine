import { isIsoDate } from "../domain/dates.js";
import type { ChildRepository } from "../ports.js";

export type ChildRecord = {
  id: string;
  name: string;
  birthdate: string | null;
  createdAt: Date;
};

export type CreateChildResult =
  | { ok: true; child: ChildRecord }
  | { ok: false; httpCode: number; error: string };

/**
 * L'ARRIVÉE D'UN ENFANT — et du cercle qui va avec.
 *
 * Son créateur en devient administrateur et suit d'office sa timeline. La
 * validation du nom et de la date de naissance est ici, et non dans le
 * gestionnaire HTTP : un outil MCP qui créerait un enfant demain devrait obéir
 * aux mêmes règles, et il n'aura pas à les recopier.
 */
export class ChildrenService {
  constructor(private readonly children: ChildRepository) {}

  async create(input: {
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

    const child = await this.children.createWithOwner({
      name,
      birthdate: birthdate ?? null,
      ownerUserId: input.userId,
    });
    return { ok: true, child };
  }
}
