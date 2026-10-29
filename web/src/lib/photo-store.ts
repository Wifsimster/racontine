const DB_NAME = "racontine-capture";
const STORE = "shots";
const DB_VERSION = 1;
const META_KEY = "racontine.capture.meta";

export type StoredShot = {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  addedAt: number;
};

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
  if (!db) return records;
  await new Promise<void>((resolve) => {
    const store = tx(db, "readwrite");
    for (const r of records) store.put(r);
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => resolve();
  }).finally(() => db.close());
  return records;
}

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

export function saveDraftMeta(meta: DraftMeta | null): void {
  try {
    if (meta === null) localStorage.removeItem(META_KEY);
    else localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
  }
}

export function getDraftMeta(): DraftMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as DraftMeta) : null;
  } catch {
    return null;
  }
}
