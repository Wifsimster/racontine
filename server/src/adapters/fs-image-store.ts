import { readFile } from "node:fs/promises";
import {
  deleteStored,
  resolveUpload,
  storeCarnetImage,
} from "../storage.js";
import type { ImageStore, StoredImage } from "../ports.js";

/**
 * Les pages de carnet sur le disque du homelab (normalisation sharp, miniature,
 * arborescence année/mois). Le port ne parle que de « ranger », « relire »,
 * « effacer » : un stockage objet (S3, Garage…) se substituerait ici sans que
 * l'ingestion en sache rien.
 */
export class FileSystemImageStore implements ImageStore {
  store(input: Buffer): Promise<StoredImage> {
    return storeCarnetImage(input);
  }

  read(relPath: string): Promise<Buffer> {
    return readFile(resolveUpload(relPath));
  }

  delete(img: { originalPath: string; thumbPath: string }): Promise<void> {
    return deleteStored(img);
  }
}
