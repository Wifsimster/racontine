import type { Child, MemberRole } from "./types";

/* ===========================================================================
   QUI PEUT ÉCRIRE DANS LE CARNET.

   Un carnet Racontine se partage avec des proches, et la moitié d'entre eux
   sont LECTEURS : mamie ouvre le journal pour lire la journée de sa
   petite-fille, elle ne l'arbitre pas. Le serveur le sait depuis toujours
   (`roleAtLeast(role, "contributor")` sur l'ingestion et sur le PATCH), et il
   répond « accès refusé » — mais un 403 arrivé APRÈS le geste n'est pas une
   règle, c'est un piège : on a lu « Corriger la lecture », on a tapé, on a
   choisi une suggestion, on a vu le texte changer sous ses yeux, et le refus
   tombe à la fin sur du travail qui ne pourra jamais être enregistré.

   Une porte qu'on ne peut pas franchir ne doit pas être dessinée. Ce module est
   la seule définition du droit d'écrire côté client, pour que les trois écrans
   qui l'utilisent (le journal, la capture, la relecture) ne puissent pas
   diverger — et il est volontairement PLUS STRICT que le serveur : un rôle
   inconnu (absent de la réponse, valeur inattendue) est traité comme lecteur.
   Se tromper dans ce sens cache une porte à un contributeur, qui la retrouve
   par la capture ; se tromper dans l'autre sens fabrique le cul-de-sac.
   =========================================================================== */

/** Les rôles qui peuvent photographier, relire et publier une journée. */
const WRITERS: ReadonlySet<string> = new Set<MemberRole>([
  "admin",
  "contributor",
]);

/** Ce rôle peut-il écrire ? `undefined` (rôle inconnu) → non. */
export function canWrite(role: MemberRole | undefined | null): boolean {
  return !!role && WRITERS.has(role);
}

/** Les enfants dont on tient le carnet (par opposition à ceux qu'on lit). */
export function writableChildren(kids: Child[]): Child[] {
  return kids.filter((k) => canWrite(k.role));
}

/** Le rôle par enfant, prêt pour un test par journée du fil. */
export function roleMap(kids: Child[]): Map<string, MemberRole> {
  const m = new Map<string, MemberRole>();
  for (const k of kids) if (k.role) m.set(k.id, k.role);
  return m;
}
