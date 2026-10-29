export type CarnetUncertaintyField =
  | "titre"
  | "recit"
  | "temps_fort"
  | "transcription_integrale";

export type CarnetUncertainty = {
  original: string;
  contexte: string;
  suggestions: string[];
  champ: CarnetUncertaintyField | null;
};

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
  titre: string | null;
  recit: string | null;
  temps_fort: string | null;
  incertitudes: CarnetUncertainty[];
  illisible: boolean;
  pages: number[];
};

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
