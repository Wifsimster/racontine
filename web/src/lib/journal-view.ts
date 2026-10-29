import type { Entry } from "./types";

export type JournalMode = "lire" | "parcourir";

const CLE_ENFANT = "journal.enfant";
const CLE_MODE = "journal.mode";

function lire(cle: string): string | null {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: string | null): void {
  try {
    if (valeur === null) window.localStorage.removeItem(cle);
    else window.localStorage.setItem(cle, valeur);
  } catch {
  }
}

export function enfantMemorise(): string | null {
  return lire(CLE_ENFANT);
}

export function memoriserEnfant(childId: string | null): void {
  ecrire(CLE_ENFANT, childId);
}

export function modeMemorise(): JournalMode {
  return lire(CLE_MODE) === "parcourir" ? "parcourir" : "lire";
}

export function memoriserMode(mode: JournalMode): void {
  ecrire(CLE_MODE, mode);
}

export type FilCharge = {
  entries: Entry[];
  nextCursor: string | null;
  from: string | null;
};

const fil = new Map<string, FilCharge>();

const cle = (childId: string | null) => childId ?? "tous";

export function filMemorise(childId: string | null): FilCharge | null {
  return fil.get(cle(childId)) ?? null;
}

export function memoriserFil(childId: string | null, valeur: FilCharge): void {
  fil.set(cle(childId), valeur);
}

export function oublierFil(): void {
  fil.clear();
}
