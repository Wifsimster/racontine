import { tidyUncertainties } from "../uncertainties.js";
import type { CarnetDay, TranscribedNote } from "./carnet.js";
import type { EntryContent } from "../ports.js";

/**
 * Journée lue par le modèle → champs de contenu d'une entrée.
 *
 * Les incertitudes gagnent ici leur `resolved: null` (rien n'est encore
 * tranché) et sont remises en forme AVANT d'être stockées : un mot dans
 * `original`, sa glose dans `contexte` — voir `uncertainties.ts`, qui explique
 * ce que coûtait l'inverse.
 */
export function contentFromCarnetDay(day: CarnetDay): EntryContent {
  return {
    mood: day.humeur,
    title: day.titre,
    story: day.recit,
    highlight: day.temps_fort,
    transcription: day.transcription_integrale,
    uncertainties: tidyUncertainties(
      day.incertitudes.map((u) => ({ ...u, resolved: null })),
    ),
  };
}

/** Journée déjà transcrite → champs de contenu d'une entrée. */
export function contentFromNote(note: TranscribedNote): EntryContent {
  return {
    mood: note.mood ?? null,
    title: note.title ?? null,
    story: note.story ?? null,
    highlight: note.highlight ?? null,
    transcription: note.transcription ?? null,
    /* Même remise en forme que pour une lecture : un agent MCP envoie lui aussi
       « «mot» : explication » dans une simple chaîne, et c'est `original` qui
       sera remplacé dans le récit à la relecture. */
    uncertainties: tidyUncertainties(note.uncertainties ?? []),
  };
}
