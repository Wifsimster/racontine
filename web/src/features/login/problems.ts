
/* CE QUI A ÉCHOUÉ, ET CE QU'ON PEUT Y FAIRE : la traduction d'un refus du
   serveur en une phrase utile, et les champs que chaque porte demande. */

export type Door = "password" | "magic" | "signup" | "forgot";
export type FieldId = "name" | "email" | "password";

/** Un problème EXPLIQUÉ : la cause (le message serveur), le remède, une issue. */
export type Problem = {
  /** Le message brut du serveur — jamais une exception, jamais un code nu. */
  cause: string;
  /** Ce que la personne peut faire, en une phrase. */
  remedy: string;
  /** Quel champ est en cause : lui seul reçoit le bord rouge + `aria-invalid`.
   *  Signaler les deux champs quand un seul est vide, c'est faire chercher. */
  field: "email" | "password" | "both" | null;
};

/** L'identifiant de la tuile d'erreur : les champs fautifs la citent. */
export const PROBLEM_ID = "probleme-connexion";

export const NETWORK: Problem = {
  cause: "Impossible de joindre votre instance Racontine.",
  remedy: "Vérifiez votre connexion, puis réessayez : rien n’a été envoyé.",
  field: null,
};

export function problemFor(raw: string | undefined, door: Door): Problem {
  if (door === "forgot")
    return {
      cause: raw ?? "L’envoi du lien a échoué.",
      remedy:
        "Vérifiez l’orthographe : c’est l’adresse avec laquelle vous vous connectez.",
      field: "email",
    };
  if (door === "magic")
    return {
      cause: raw ?? "L’envoi du lien a échoué.",
      remedy:
        "Vérifiez l’orthographe : c’est l’adresse à laquelle l’invitation a été envoyée.",
      field: "email",
    };
  if (door === "signup")
    return {
      cause: raw ?? "La création du compte a échoué.",
      remedy:
        "Le mot de passe doit faire 8 caractères au moins. Si cette adresse a déjà un compte, connectez-vous.",
      field: "password",
    };
  return {
    cause: raw ?? "La connexion a échoué.",
    remedy:
      "Vérifiez l’adresse et le mot de passe. Oublié ? Demandez un lien de réinitialisation. Jamais eu de mot de passe ? Recevez un lien de connexion.",
    field: "both",
  };
}

/** Ce champ-là est-il désigné par le problème en cours ? */
export function flags(problem: Problem | null, id: "email" | "password") {
  return !!problem && (problem.field === id || problem.field === "both");
}

/** Les champs d'une porte, dans l'ordre de saisie. */
export const FIELDS: Record<Door, FieldId[]> = {
  password: ["email", "password"],
  magic: ["email"],
  signup: ["name", "email", "password"],
  forgot: ["email"],
};

/** Cette porte demande-t-elle un mot de passe ? Les deux autres n'ont qu'une
 *  adresse — et c'est le seul endroit où la question se pose. */
export function hasPassword(door: Door): boolean {
  return FIELDS[door].includes("password");
}

