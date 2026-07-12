import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db } from "./db/index.js";
import {
  entries,
  entryItems,
  attachments,
  type EntryItemData,
} from "./db/schema.js";
import { accessibleChildIds, hasChildRole } from "./access.js";
import {
  storeCarnetImage,
  resolveUpload,
  deleteStored,
  type StoredImage,
} from "./storage.js";
import { extractFromImages, VlmError, type Extraction } from "./vlm.js";
import { getUserAnthropicKey } from "./llm-keys.js";

/** Où la journée a été passée — dimension de l'entrée (child + date + source). */
export const SOURCES = ["nounou", "mam", "creche", "maison"] as const;
export type Source = (typeof SOURCES)[number];

/** Types d'items structurés d'une journée. */
export const ITEM_TYPES = [
  "meal",
  "nap",
  "activity",
  "anecdote",
  "health",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readStored(relPath: string): Promise<Buffer> {
  return readFile(resolveUpload(relPath));
}

/** Extraction VLM → lignes entry_items. */
function extractionToItems(
  x: Extraction,
): { type: ItemType; data: EntryItemData; position: number }[] {
  const rows: { type: ItemType; data: EntryItemData; position: number }[] = [];
  let pos = 0;
  for (const r of x.repas) rows.push({ type: "meal", data: r, position: pos++ });
  for (const s of x.siestes)
    rows.push({ type: "nap", data: s, position: pos++ });
  for (const a of x.activites)
    rows.push({ type: "activity", data: { label: a }, position: pos++ });
  for (const a of x.anecdotes)
    rows.push({ type: "anecdote", data: { text: a }, position: pos++ });
  if (x.sante && x.sante.trim())
    rows.push({ type: "health", data: { note: x.sante }, position: pos++ });
  return rows;
}

/**
 * Traitement VLM en arrière-plan : processing → draft | failed.
 * Ré-extrait à partir de TOUTES les pages de l'entrée (chemins disque) pour
 * fusionner correctement un ajout de page à une journée existante. La lecture
 * utilise la clé API de `userId` (l'utilisateur qui a déclenché l'import).
 */
export async function processEntry(
  entryId: string,
  paths: string[],
  userId: string,
) {
  try {
    const apiKey = await getUserAnthropicKey(userId);
    if (!apiKey)
      throw new VlmError(
        "Aucune clé API Anthropic configurée. Ajoutez la vôtre dans les réglages puis réimportez le carnet.",
      );
    const jpegs = await Promise.all(paths.map((p) => readStored(p)));
    const x = await extractFromImages(jpegs, apiKey);
    if (x.illisible) {
      // Compare-and-set : ne marquer « failed » que si l'entrée est toujours en
      // cours de traitement (un PATCH utilisateur a pu la relire/publier).
      await db
        .update(entries)
        .set({
          status: "failed",
          failureReason:
            "Photo illisible : aucun contenu de carnet exploitable détecté.",
          updatedAt: new Date(),
        })
        .where(and(eq(entries.id, entryId), eq(entries.status, "processing")));
      return;
    }
    const items = extractionToItems(x);
    await db.transaction(async (tx) => {
      // On n'écrase le contenu que si l'entrée est encore en « processing » :
      // sinon une relecture humaine (PATCH) faite pendant l'extraction serait
      // silencieusement écrasée par la sortie VLM.
      const moved = await tx
        .update(entries)
        .set({
          status: "draft",
          mood: x.humeur,
          title: x.titre,
          story: x.recit,
          highlight: x.temps_fort,
          transcription: x.transcription_integrale,
          uncertainties: x.incertitudes,
          failureReason: null,
          updatedAt: new Date(),
        })
        .where(and(eq(entries.id, entryId), eq(entries.status, "processing")))
        .returning({ id: entries.id });
      if (!moved.length) return;
      await tx.delete(entryItems).where(eq(entryItems.entryId, entryId));
      if (items.length) {
        await tx
          .insert(entryItems)
          .values(items.map((it) => ({ ...it, entryId })));
      }
    });
  } catch (err) {
    // Seuls les VlmError portent un message déjà sûr pour l'utilisateur ; toute
    // autre erreur (DB, lecture disque…) pourrait divulguer des détails internes,
    // on la remplace par un message générique et on journalise le brut.
    if (!(err instanceof VlmError))
      console.error(
        "processEntry — échec inattendu :",
        err instanceof Error ? err.message : err,
      );
    const failureReason =
      err instanceof VlmError
        ? err.message
        : "La lecture automatique du carnet a échoué. Réessayez plus tard.";
    // Le write d'échec ne doit jamais rejeter à son tour (l'appel est
    // fire-and-forget) : on l'isole dans son propre try/catch.
    try {
      await db
        .update(entries)
        .set({
          status: "failed",
          failureReason,
          updatedAt: new Date(),
        })
        .where(and(eq(entries.id, entryId), eq(entries.status, "processing")));
    } catch (writeErr) {
      console.error(
        "Échec de l'enregistrement de l'état 'failed' :",
        writeErr instanceof Error ? writeErr.message : writeErr,
      );
    }
  }
}

/** Résultat d'une ingestion : succès (entrée en traitement) ou échec typé. */
export type IngestResult =
  | { ok: true; id: string; status: "processing" }
  | { ok: false; httpCode: number; error: string; id?: string };

export type IngestInput = {
  /** Utilisateur au nom duquel on ingère (droits vérifiés par enfant). */
  userId: string;
  /** Pages du carnet, décodées en Buffer (JPEG/PNG/HEIC/WebP bruts). */
  images: Buffer[];
  /** Facultatif si l'utilisateur ne suit qu'un seul enfant. */
  childId?: string;
  /** AAAA-MM-JJ. Défaut : aujourd'hui. Rejeté (400) si mal formé. */
  date?: string;
  /** Lieu de la journée. Défaut : nounou. Rejeté (400) si inconnu. */
  source?: string;
};

/**
 * Cœur partagé de l'ingestion d'une journée (route HTTP multipart *et* outil MCP).
 * Normalise/valide les métadonnées, stocke les images, crée-ou-fusionne l'entrée
 * (même enfant/date/source), rattache les pages puis lance l'extraction VLM en
 * arrière-plan. Ne lève pas pour les erreurs métier : renvoie un `IngestResult`.
 */
export async function ingestCarnetImages(
  input: IngestInput,
): Promise<IngestResult> {
  let date = todayIso();
  if (input.date !== undefined) {
    if (!DATE_RE.test(input.date))
      return {
        ok: false,
        httpCode: 400,
        error: "date invalide (attendu AAAA-MM-JJ)",
      };
    date = input.date;
  }

  let source: Source = "nounou";
  if (input.source !== undefined) {
    if (!(SOURCES as readonly string[]).includes(input.source))
      return {
        ok: false,
        httpCode: 400,
        error: "source invalide (nounou, mam, creche ou maison)",
      };
    source = input.source as Source;
  }

  if (!input.images.length)
    return { ok: false, httpCode: 400, error: "aucune photo fournie" };

  // Chaque contributeur apporte sa propre clé API Anthropic : sans clé, on ne
  // stocke rien et on répond tout de suite (plutôt qu'un échec en arrière-plan).
  if (!(await getUserAnthropicKey(input.userId)))
    return {
      ok: false,
      httpCode: 400,
      error:
        "Aucune clé API Anthropic configurée. Ajoutez la vôtre dans les réglages avant d'importer un carnet.",
    };

  // childId facultatif si l'utilisateur ne suit qu'un seul enfant.
  let childId = input.childId;
  if (!childId) {
    const ids = await accessibleChildIds(input.userId);
    if (ids.length === 1) childId = ids[0];
    else
      return {
        ok: false,
        httpCode: 400,
        error: "childId requis (plusieurs enfants)",
      };
  }

  // Contribuer exige le rôle contributor (ou admin) sur cet enfant. On ne
  // divulgue pas l'existence d'un enfant non partagé : 403 uniforme.
  if (!(await hasChildRole(input.userId, childId, "contributor")))
    return { ok: false, httpCode: 403, error: "accès refusé à cet enfant" };

  // Normalisation des images (auto-rotation, JPEG, redimensionnement + miniature).
  // sharp lève sur un format indécodable → on nettoie ce qui a déjà été écrit.
  const stored: StoredImage[] = [];
  try {
    for (const buf of input.images) stored.push(await storeCarnetImage(buf));
  } catch {
    await Promise.all(stored.map((img) => deleteStored(img)));
    return {
      ok: false,
      httpCode: 400,
      error: "Image indécodable (format non supporté ou fichier corrompu).",
    };
  }

  // Find-or-create sûr face aux requêtes concurrentes : INSERT … ON CONFLICT
  // DO NOTHING, puis relecture si l'entrée existait déjà. Une fois les pièces
  // jointes enregistrées, les fichiers sont référencés en base : on ne doit
  // plus les supprimer en cas d'erreur (sinon lignes orphelines).
  let attachmentsCommitted = false;
  try {
    const [inserted] = await db
      .insert(entries)
      .values({
        childId,
        date,
        source,
        status: "processing",
        createdBy: input.userId,
      })
      .onConflictDoNothing({
        target: [entries.childId, entries.date, entries.source],
      })
      .returning();

    let entry = inserted;
    if (!entry) {
      const [existing] = await db
        .select()
        .from(entries)
        .where(
          and(
            eq(entries.childId, childId),
            eq(entries.date, date),
            eq(entries.source, source),
          ),
        )
        .limit(1);
      // Ne pas écraser une journée déjà relue et publiée : les fichiers venant
      // d'être écrits ne seront rattachés à aucune entrée, on les supprime.
      if (existing.status === "published") {
        await Promise.all(stored.map((img) => deleteStored(img)));
        return {
          ok: false,
          httpCode: 409,
          error:
            "Cette journée est déjà publiée. Modifiez ou supprimez l'entrée existante avant de re-photographier.",
          id: existing.id,
        };
      }
      await db
        .update(entries)
        .set({ status: "processing", updatedAt: new Date() })
        .where(eq(entries.id, existing.id));
      entry = existing;
    }
    const entryId = entry.id;

    // Positions à la suite des pages déjà rattachées (fusion multi-requêtes).
    const existingAtts = await db
      .select({ position: attachments.position })
      .from(attachments)
      .where(eq(attachments.entryId, entryId));
    const basePos = existingAtts.reduce(
      (max, a) => Math.max(max, a.position + 1),
      0,
    );

    await db.insert(attachments).values(
      stored.map((img, i) => ({
        entryId,
        kind: "carnet" as const,
        originalPath: img.originalPath,
        thumbPath: img.thumbPath,
        mime: img.mime,
        width: img.width,
        height: img.height,
        position: basePos + i,
      })),
    );
    attachmentsCommitted = true;

    // Ré-extraction sur TOUTES les pages de l'entrée (existantes + nouvelles).
    const allAtts = await db
      .select({ path: attachments.originalPath })
      .from(attachments)
      .where(eq(attachments.entryId, entryId))
      .orderBy(attachments.position);

    // Extraction en arrière-plan : la réponse est immédiate. Le .catch final est
    // un garde-fou : processEntry gère déjà ses erreurs, mais on ne veut aucune
    // promesse rejetée non gérée sur un appel fire-and-forget.
    void processEntry(
      entryId,
      allAtts.map((a) => a.path),
      input.userId,
    ).catch((err) => {
      console.error(
        "processEntry a échoué de façon inattendue :",
        err instanceof Error ? err.message : err,
      );
    });

    return { ok: true, id: entryId, status: "processing" };
  } catch (err) {
    if (!attachmentsCommitted)
      await Promise.all(stored.map((img) => deleteStored(img)));
    throw err;
  }
}
