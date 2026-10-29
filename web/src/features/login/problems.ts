export type Door = "password" | "magic" | "signup" | "forgot";
export type FieldId = "name" | "email" | "password";

export type Problem = {
  cause: string;
  remedy: string;
  field: "email" | "password" | "both" | null;
};

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

export function flags(problem: Problem | null, id: "email" | "password") {
  return !!problem && (problem.field === id || problem.field === "both");
}

export const FIELDS: Record<Door, FieldId[]> = {
  password: ["email", "password"],
  magic: ["email"],
  signup: ["name", "email", "password"],
  forgot: ["email"],
};

export function hasPassword(door: Door): boolean {
  return FIELDS[door].includes("password");
}

