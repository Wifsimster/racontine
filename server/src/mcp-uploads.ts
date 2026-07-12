import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "./db/index.js";
import { mcpUploads } from "./db/schema.js";
import { resolveUpload } from "./storage.js";

/**
 * Mise en attente d'octets bruts pour les clients MCP.
 *
 * Le problème : l'outil `upload_daily_note` recevait les photos en base64 dans
 * les arguments de l'appel d'outil. Une page de carnet (~quelques Mo) pèse des
 * centaines de milliers de caractères une fois encodée — trop pour transiter par
 * le contexte d'un modèle. Ici, un client shell téléverse les octets bruts en
 * une requête HTTP (le fichier est lu directement du disque par `curl`, rien ne
 * passe par le contexte), récupère un identifiant court, puis appelle l'outil
 * avec cet identifiant plutôt qu'avec du base64.
 */

/** Sous-dossier (relatif à UPLOADS_DIR) des fichiers bruts en attente. */
const STAGING_DIR = "staging";

/** Durée de vie d'un upload en attente : au-delà, il est balayé. */
export const STAGING_TTL_MS = 30 * 60 * 1000; // 30 min

/** Taille maximale d'une page brute (aligné sur la limite du formulaire web). */
export const MAX_STAGED_BYTES = 20 * 1024 * 1024; // 20 Mo

export type StagedUpload = {
  id: string;
  byteSize: number;
  expiresAt: Date;
};

/** Supprime du disque les fichiers d'uploads balayés (best-effort). */
async function unlinkStaged(paths: string[]): Promise<void> {
  await Promise.allSettled(
    paths.map((rel) => unlink(resolveUpload(rel))),
  );
}

/**
 * Balaye les uploads périmés (ligne + fichier). Best-effort, appelé de façon
 * opportuniste à chaque nouvelle mise en attente : pas de tâche planifiée à
 * maintenir, et le volume reste faible (un foyer, quelques photos par jour).
 */
export async function sweepExpiredUploads(): Promise<void> {
  try {
    const stale = await db
      .delete(mcpUploads)
      .where(lt(mcpUploads.expiresAt, new Date()))
      .returning({ path: mcpUploads.path });
    if (stale.length) await unlinkStaged(stale.map((r) => r.path));
  } catch {
    /* balayage best-effort : une erreur ici ne doit pas casser l'appel courant */
  }
}

/**
 * Met en attente les octets bruts d'une page pour `userId`. Écrit le fichier
 * sous `UPLOADS_DIR/staging/<uuid>` puis enregistre la ligne de suivi (chemin,
 * taille, expiration). Renvoie l'identifiant court à passer à `upload_daily_note`.
 */
export async function stageUpload(
  userId: string,
  bytes: Buffer,
): Promise<StagedUpload> {
  void sweepExpiredUploads();

  const id = randomUUID();
  const rel = path.join(STAGING_DIR, id);
  await mkdir(path.dirname(resolveUpload(rel)), { recursive: true });
  await writeFile(resolveUpload(rel), bytes);

  const expiresAt = new Date(Date.now() + STAGING_TTL_MS);
  try {
    await db.insert(mcpUploads).values({
      id,
      userId,
      path: rel,
      byteSize: bytes.length,
      expiresAt,
    });
  } catch (err) {
    // Si le suivi en base échoue, ne pas laisser de fichier orphelin sur disque.
    await unlinkStaged([rel]);
    throw err;
  }

  return { id, byteSize: bytes.length, expiresAt };
}

export type ResolvedUploads =
  | { ok: true; buffers: Buffer[] }
  | { ok: false; error: string };

/**
 * Résout des identifiants d'uploads en attente en Buffers, dans l'ordre demandé.
 * N'accepte que les uploads appartenant à `userId` et non périmés — un
 * identifiant inconnu, périmé ou appartenant à autrui fait échouer l'ensemble
 * (message uniforme, on ne divulgue pas la cause exacte). Ne consomme rien :
 * l'appelant appelle `consumeStagedUploads` après une ingestion réussie.
 */
export async function resolveStagedUploads(
  userId: string,
  ids: string[],
): Promise<ResolvedUploads> {
  if (!ids.length) return { ok: true, buffers: [] };

  // On ne retient que les uploads de `userId` encore valides : un identifiant
  // périmé est traité comme absent (message uniforme, le fichier sera balayé).
  const rows = await db
    .select({ id: mcpUploads.id, path: mcpUploads.path })
    .from(mcpUploads)
    .where(
      and(
        eq(mcpUploads.userId, userId),
        inArray(mcpUploads.id, ids),
        gt(mcpUploads.expiresAt, new Date()),
      ),
    );

  const byId = new Map(rows.map((r) => [r.id, r.path]));

  const buffers: Buffer[] = [];
  for (const id of ids) {
    const rel = byId.get(id);
    if (!rel)
      return {
        ok: false,
        error: `Upload « ${id} » introuvable ou expiré. Re-téléversez la page via POST /api/mcp/uploads.`,
      };
    try {
      buffers.push(await readFile(resolveUpload(rel)));
    } catch {
      return {
        ok: false,
        error: `Upload « ${id} » illisible sur le serveur. Re-téléversez la page.`,
      };
    }
  }
  return { ok: true, buffers };
}

/**
 * Supprime les uploads en attente (ligne + fichier) après une ingestion réussie.
 * Best-effort : un échec de nettoyage n'invalide pas l'ingestion déjà faite (le
 * balayage d'expiration rattrapera les restes).
 */
export async function consumeStagedUploads(
  userId: string,
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  try {
    const removed = await db
      .delete(mcpUploads)
      .where(and(eq(mcpUploads.userId, userId), inArray(mcpUploads.id, ids)))
      .returning({ path: mcpUploads.path });
    if (removed.length) await unlinkStaged(removed.map((r) => r.path));
  } catch {
    /* nettoyage best-effort : le balayage d'expiration rattrapera les restes */
  }
}
