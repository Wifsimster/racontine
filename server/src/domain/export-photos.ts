import type { ExportArchive } from "../ports.js";

/* ===========================================================================
   OÙ RANGER CHAQUE PHOTO DANS L'ARCHIVE.

   Une adresse `/api/attachments/…` n'est pas une photo : elle ne s'ouvre qu'avec
   une session, sur CETTE instance, tant qu'elle existe. Un export qui s'arrête
   là rend le texte et garde les images en otage. L'archive porte donc les
   fichiers eux-mêmes, et le JSON dit où les trouver (`page.file`).

   Les noms sont faits pour être lus par quelqu'un qui ouvre le zip sans l'app :
   `photos/Lou/2026-09-17-1.jpg` plutôt qu'un identifiant. Deux carnets au même
   prénom, ou deux journées à la même date, ne s'écrasent pas : le second prend
   un suffixe (`-2`). Aucun chemin interne au serveur ne sort — `storedPath`
   reste dans le serveur, seul `file` entre dans le JSON.
   =========================================================================== */

/** Une photo à verser dans l'archive : où elle est rangée, où elle ira. */
export type ExportPhoto = { pageId: string; file: string; storedPath: string };

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/**
 * Un prénom en nom de dossier : ni séparateur, ni caractère que Windows refuse,
 * ni point en tête (un dossier caché, ou `..`). Le reste — accents compris —
 * est gardé : le zip est écrit en UTF-8.
 */
export function folderName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 80);
  return cleaned || "carnet";
}

/** Réserve `wanted`, ou `wanted-2`, `-3`… si le nom est déjà pris. */
function claim(taken: Set<string>, stem: string, ext = ""): string {
  let name = `${stem}${ext}`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem}-${n}${ext}`;
  taken.add(name.toLowerCase());
  return name;
}

/**
 * Attribue à chaque page présente un chemin dans l'archive, et le reporte dans
 * `page.file`. Une page sans fichier (`stored` ne la connaît pas : fichier
 * absent du disque) garde `file: null` — le JSON le dit, plutôt que de promettre
 * une photo qu'on ne trouvera pas dans le zip.
 */
export function planExportPhotos(
  archive: ExportArchive,
  stored: ReadonlyMap<string, string>,
): { archive: ExportArchive; photos: ExportPhoto[] } {
  const photos: ExportPhoto[] = [];
  const folders = new Set<string>();

  const carnets = archive.carnets.map((carnet) => {
    const folder = `photos/${claim(folders, folderName(carnet.name))}`;
    const files = new Set<string>();
    return {
      ...carnet,
      entries: carnet.entries.map((entry) => ({
        ...entry,
        pages: entry.pages.map((page, index) => {
          const storedPath = stored.get(page.id);
          if (!storedPath) return { ...page, file: null };
          const ext = `.${EXTENSIONS[page.mime] ?? "bin"}`;
          const file = `${folder}/${claim(files, `${entry.date}-${index + 1}`, ext)}`;
          photos.push({ pageId: page.id, file, storedPath });
          return { ...page, file };
        }),
      })),
    };
  });

  return { archive: { ...archive, carnets }, photos };
}
