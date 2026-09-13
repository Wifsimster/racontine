/**
 * Ce qu'une LECTURE DE CARNET produit — le vocabulaire du domaine, indépendant
 * du modèle qui l'a produit.
 *
 * Ces types vivaient dans `vlm.ts`, c'est-à-dire dans l'adaptateur Anthropic :
 * importer « une journée lue » revenait à importer le SDK du fournisseur, et le
 * jour où la lecture passe à un VLM local, tout le domaine changeait d'import.
 * Ils sont ici ; `vlm.ts` implémente le port `CarnetReader` qui les rend.
 */

/** Champ de la valorisation auquel se rattache une incertitude de lecture. */
export type CarnetUncertaintyField =
  | "titre"
  | "recit"
  | "temps_fort"
  | "transcription_integrale";

/**
 * Incertitude telle que rendue par une lecture : le mot tel qu'il a été lu,
 * pourquoi il est douteux, et des lectures alternatives plausibles. `resolved`
 * n'existe pas encore à ce stade — il apparaît à la persistance, une fois la
 * relecture humaine faite.
 */
export type CarnetUncertainty = {
  original: string;
  contexte: string;
  suggestions: string[];
  champ: CarnetUncertaintyField | null;
};

/** Une journée extraite d'un sous-ensemble des pages envoyées. */
export type CarnetDay = {
  date: string | null;
  enfant: string | null;
  repas: { moment: string; contenu: string; appetit?: string }[];
  siestes: { debut?: string; fin?: string; note?: string }[];
  humeur: string | null;
  activites: string[];
  sante: string | null;
  anecdotes: string[];
  transcription_integrale: string | null;
  /** Valorisation automatique — le cœur du produit. */
  titre: string | null;
  recit: string | null;
  temps_fort: string | null;
  incertitudes: CarnetUncertainty[];
  illisible: boolean;
  /** Pages (1-based, dans l'ordre des images fournies) qui composent cette journée. */
  pages: number[];
};

/**
 * Contenu déjà transcrit d'une journée, fourni directement (sans photo ni
 * lecture automatique). Les champs texte sont libres ; les listes structurées
 * deviennent des `entry_items` typés — voir `entry-items.ts`.
 */
export type TranscribedNote = {
  title?: string | null;
  story?: string | null;
  highlight?: string | null;
  mood?: string | null;
  transcription?: string | null;
  uncertainties?: string[];
  meals?: { moment: string; contenu: string; appetit?: string }[];
  naps?: { debut?: string; fin?: string; note?: string }[];
  activities?: string[];
  anecdotes?: string[];
  health?: string[];
};
