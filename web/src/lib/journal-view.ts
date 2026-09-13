import type { Entry } from "./types";

/* ===========================================================================
   CE QUE LE JOURNAL SE RAPPELLE — le carnet qu'on lit, la façon de le lire, et
   l'endroit où l'on en était.

   Mesuré avant : ouvrir une journée puis revenir remettait le fil à zéro. Les
   journées étaient un état local de l'écran, donc démontées avec lui ; on
   rechargeait les vingt premières et on repartait du haut. Sur un carnet de
   deux cents journées, chaque aller-retour effaçait jusqu'à cent cinquante
   écrans de pouce — et l'app n'offrait aucun moyen de revenir où l'on était.

   Trois mémoires, trois durées, et c'est délibéré :

   · LA PRÉFÉRENCE (quel enfant, quel mode) survit à la fermeture de l'app —
     `localStorage`. Un parent qui ne lit que le carnet d'Anouk ne rechoisit pas
     Anouk chaque soir.
   · LE FIL DÉJÀ CHARGÉ ne survit PAS au rechargement : il vit en mémoire, le
     temps de la session d'écran. Le remettre en `sessionStorage` reviendrait à
     ressortir un journal périmé au premier retour, et une liste de vingt
     journées entières pèse trop pour ce qu'elle rend.
   · LA POSITION dans la page est tenue par `<ScrollRestoration>` de
     react-router (dans `App.tsx`), qui la range par clé de route.

   Ces trois-là ne servent à rien séparément : restaurer la position sans les
   journées rend une page trop courte, qui se recale aussitôt en haut.
   =========================================================================== */

export type JournalMode = "lire" | "parcourir";

const CLE_ENFANT = "journal.enfant";
const CLE_MODE = "journal.mode";

/**
 * `localStorage` peut lever (Safari en navigation privée, stockage désactivé) :
 * une préférence de lecture ne fait jamais tomber un écran, elle retombe sur le
 * défaut.
 */
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
    /* pas de stockage : la préférence ne vaut que pour cette visite */
  }
}

/** Le carnet lu la dernière fois, ou null pour « tous les carnets ». */
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

/* ------------------------------------------------------------------------ */

export type FilCharge = {
  entries: Entry[];
  nextCursor: string | null;
  /** Le mois d'où l'on est reparti, s'il y a eu un saut. */
  from: string | null;
};

/**
 * Le fil déjà chargé, par carnet. En MÉMOIRE de module : il traverse un
 * aller-retour vers une journée (l'écran est démonté, pas le module) et meurt
 * au rechargement de la page, ce qui est exactement la durée voulue.
 */
const fil = new Map<string, FilCharge>();

const cle = (childId: string | null) => childId ?? "tous";

export function filMemorise(childId: string | null): FilCharge | null {
  return fil.get(cle(childId)) ?? null;
}

export function memoriserFil(childId: string | null, valeur: FilCharge): void {
  fil.set(cle(childId), valeur);
}

/** Après une publication ou une suppression : ce qu'on garde en tête a menti. */
export function oublierFil(): void {
  fil.clear();
}
