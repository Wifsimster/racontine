declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, string | number>) => void;
    };
  }
}

export type Evenement =
  | "accueil_offre_vue"
  | "accueil_commencer"
  | "accueil_connexion"
  | "inscription_creee";

export function mesure(evenement: Evenement): void {
  try {
    window.umami?.track(evenement);
  } catch {
  }
}
