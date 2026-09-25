import type { Readable } from "node:stream";
import { ZipFile } from "yazl";
import type { ArchiveEntry, ArchivePacker } from "../ports.js";

/**
 * L'export en zip, écrit au fil de l'eau. Les photos sont déjà du JPEG : les
 * recompresser coûterait du processeur pour rien gagner, elles sont donc
 * STOCKÉES telles quelles. Le texte (le JSON du journal), lui, se compresse
 * très bien. Chaque photo n'est ouverte qu'au moment où son tour vient : un
 * carnet de 500 pages n'ouvre pas 500 fichiers d'un coup.
 */
export class ZipArchivePacker implements ArchivePacker {
  pack(entries: ArchiveEntry[]): Readable {
    const zip = new ZipFile();
    const mtime = new Date();
    const output = zip.outputStream as Readable;
    /* yazl signale un fichier illisible sur le ZipFile, pas sur le flux : sans
       ce relais, l'erreur ferait tomber le serveur au lieu de couper UN
       téléchargement — que le navigateur marquera alors comme échoué, plutôt
       que d'enregistrer une archive tronquée qui aurait l'air complète. Branché
       AVANT le premier fichier : yazl peut l'ouvrir aussitôt ajouté. */
    zip.on("error", (err: Error) => output.destroy(err));
    for (const entry of entries) {
      if ("data" in entry) {
        zip.addBuffer(entry.data, entry.path, { mtime });
      } else {
        zip.addReadStreamLazy(entry.path, { mtime, compress: false }, (cb) => {
          try {
            cb(null, entry.open());
          } catch (e) {
            cb(e as Error, null as never);
          }
        });
      }
    }
    zip.end();
    return output;
  }
}
