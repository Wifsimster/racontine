/**
 * Persistance locale des photos du carnet en cours de saisie.
 *
 * Les photos prises dans l'écran de capture ne vivent d'ordinaire qu'en
 * mémoire (state React + object URL). Un échec d'envoi, une coupure réseau ou
 * un rafraîchissement forcé les ferait disparaître — au moment le plus
 * frustrant, puisque le carnet est souvent déjà rangé. On les enregistre donc
 * dans IndexedDB (capable de stocker des Blob, contrairement à localStorage)
 * dès leur ajout, et on ne purge qu'après un envoi réussi.
 */

const DB_NAME = "racontine-capture";
const STORE = "shots";
const DB_VERSION = 1;
const META_KEY = "racontine.capture.meta";

export type StoredShot = {
  id: string;
  blob: Blob;
  /** Nom de fichier d'origine, préservé pour reconstruire un File à l'envoi. */
  name: string;
  type: string;
  /** Horodatage d'ajout, sert à conserver l'ordre de prise. */
  addedAt: number;
};

/** Réglages de la journée en cours, restaurés avec les photos. */
export type DraftMeta = {
  childId?: string;
  source?: string;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Ouvre (et crée au besoin) la base. Renvoie `null` si IndexedDB est
 * indisponible (navigation privée sur certains navigateurs, contexte non
 * sécurisé…) : la capture continue alors de fonctionner en mémoire seule.
 */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Persiste des fichiers fraîchement pris et renvoie leurs enregistrements. */
export async function addPhotos(files: File[]): Promise<StoredShot[]> {
  const now = Date.now();
  const records: StoredShot[] = files.map((f, i) => ({
    id: newId(),
    blob: f,
    name: f.name || `page-${now}-${i}.jpg`,
    type: f.type || "image/jpeg",
    addedAt: now + i,
  }));

  const db = await openDb();
  if (!db) return records; // dégradé : pas de persistance, mais on garde les shots
  await new Promise<void>((resolve) => {
    const store = tx(db, "readwrite");
    for (const r of records) store.put(r);
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => resolve();
  }).finally(() => db.close());
  return records;
}

/** Recharge toutes les photos persistées, dans l'ordre de prise. */
export async function getPhotos(): Promise<StoredShot[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise<StoredShot[]>((resolve) => {
    const store = tx(db, "readonly");
    const req = store.getAll();
    req.onsuccess = () => {
      const shots = (req.result as StoredShot[]) ?? [];
      shots.sort((a, b) => a.addedAt - b.addedAt);
      resolve(shots);
    };
    req.onerror = () => resolve([]);
  }).finally(() => db.close());
}

/** Retire une photo persistée (suppression manuelle par l'utilisateur). */
export async function removePhoto(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const store = tx(db, "readwrite");
    store.delete(id);
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => resolve();
  }).finally(() => db.close());
}

/** Vide tout le brouillon (après un envoi réussi). */
export async function clearPhotos(): Promise<void> {
  saveDraftMeta(null);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const store = tx(db, "readwrite");
    store.clear();
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => resolve();
  }).finally(() => db.close());
}

/** Sauvegarde les réglages de la journée (enfant, lieu). `null` pour effacer. */
export function saveDraftMeta(meta: DraftMeta | null): void {
  try {
    if (meta === null) localStorage.removeItem(META_KEY);
    else localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* localStorage indisponible : sans gravité */
  }
}

/** Relit les réglages de la journée persistés. */
export function getDraftMeta(): DraftMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as DraftMeta) : null;
  } catch {
    return null;
  }
}
