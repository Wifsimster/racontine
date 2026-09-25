import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExportArchive } from "../ports.js";
import { folderName, planExportPhotos } from "./export-photos.js";

const page = (id: string, mime = "image/jpeg") => ({
  id,
  mime,
  width: null,
  height: null,
  url: `/api/attachments/${id}`,
  file: null,
});

function archive(
  carnets: { name: string; entries: { date: string; pages: string[] }[] }[],
): ExportArchive {
  return {
    carnets: carnets.map((c) => ({
      name: c.name,
      entries: c.entries.map((e) => ({ date: e.date, pages: e.pages.map((p) => page(p)) })),
    })),
  } as unknown as ExportArchive;
}

const all = (ids: string[]) => new Map(ids.map((id) => [id, `stock/${id}.jpg`]));

test("un prénom devient un dossier sans séparateur ni point en tête", () => {
  assert.equal(folderName("Lou"), "Lou");
  assert.equal(folderName("Zoé"), "Zoé");
  assert.equal(folderName("../../etc"), "etc");
  assert.equal(folderName("A/B:C"), "A B C");
  assert.equal(folderName("  "), "carnet");
  assert.equal(folderName("..."), "carnet");
});

test("chaque page prend un nom lisible, par enfant puis par date", () => {
  const plan = planExportPhotos(
    archive([{ name: "Lou", entries: [{ date: "2026-09-17", pages: ["a", "b"] }] }]),
    all(["a", "b"]),
  );
  assert.deepEqual(
    plan.photos.map((p) => [p.file, p.storedPath]),
    [
      ["photos/Lou/2026-09-17-1.jpg", "stock/a.jpg"],
      ["photos/Lou/2026-09-17-2.jpg", "stock/b.jpg"],
    ],
  );
  assert.equal(plan.archive.carnets[0].entries[0].pages[0].file, "photos/Lou/2026-09-17-1.jpg");
});

test("deux carnets au même prénom, deux journées à la même date : rien ne s'écrase", () => {
  const plan = planExportPhotos(
    archive([
      {
        name: "Lou",
        entries: [
          { date: "2026-09-17", pages: ["a"] },
          { date: "2026-09-17", pages: ["b"] },
        ],
      },
      { name: "lou", entries: [{ date: "2026-09-17", pages: ["c"] }] },
    ]),
    all(["a", "b", "c"]),
  );
  const files = plan.photos.map((p) => p.file);
  assert.equal(new Set(files.map((f) => f.toLowerCase())).size, 3);
  assert.deepEqual(files, [
    "photos/Lou/2026-09-17-1.jpg",
    "photos/Lou/2026-09-17-1-2.jpg",
    "photos/lou-2/2026-09-17-1.jpg",
  ]);
});

test("une page sans fichier garde file: null et n'entre pas dans l'archive", () => {
  const plan = planExportPhotos(
    archive([{ name: "Lou", entries: [{ date: "2026-09-17", pages: ["a", "b"] }] }]),
    all(["a"]),
  );
  assert.equal(plan.photos.length, 1);
  assert.equal(plan.archive.carnets[0].entries[0].pages[1].file, null);
});
