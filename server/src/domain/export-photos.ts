import type { ExportArchive } from "../ports.js";

export type ExportPhoto = { pageId: string; file: string; storedPath: string };

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

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

function claim(taken: Set<string>, stem: string, ext = ""): string {
  let name = `${stem}${ext}`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem}-${n}${ext}`;
  taken.add(name.toLowerCase());
  return name;
}

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
