/**
 * Échec de lecture d'un carnet dont le message est DÉJÀ SÛR à afficher : il est
 * stocké tel quel dans `failureReason` et montré dans l'app.
 *
 * Tout ce qui n'est pas de ce type (erreur de base, de disque, du fournisseur)
 * reste dans les logs serveur et ressort en phrase générique : les détails bruts
 * — corps JSON, request_id, mention de facturation — ne partent jamais chez les
 * proches.
 */
export class CarnetReadError extends Error {}

/**
 * Une journée existe déjà pour cet enfant, cette date et ce lieu. Le dépôt
 * traduit ici la violation d'unicité de la base : le service au-dessus n'a pas à
 * connaître les codes d'erreur de Postgres pour répondre 409.
 */
export class DuplicateEntryError extends Error {}

/** Date bien formée (AAAA-MM-JJ) mais impossible au calendrier (2026-13-40). */
export class InvalidEntryDateError extends Error {}

/**
 * La journée n'est pas relisible : sa lecture est en cours (elle écraserait la
 * relecture en se terminant) ou a échoué (il n'y a rien à publier — une journée
 * vide partirait chez les proches).
 */
export class EntryNotReviewableError extends Error {}
