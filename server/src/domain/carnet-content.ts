import { tidyUncertainties } from "../uncertainties.js";
import type { CarnetDay, TranscribedNote } from "./carnet.js";
import type { EntryContent } from "../ports.js";

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

export function contentFromNote(note: TranscribedNote): EntryContent {
  return {
    mood: note.mood ?? null,
    title: note.title ?? null,
    story: note.story ?? null,
    highlight: note.highlight ?? null,
    transcription: note.transcription ?? null,
    uncertainties: tidyUncertainties(note.uncertainties ?? []),
  };
}

export function mergeCarnetDays(a: CarnetDay, b: CarnetDay): CarnetDay {
  const join = (x: string | null, y: string | null) =>
    x && y ? `${x}\n\n${y}` : (x ?? y);
  return {
    date: a.date ?? b.date,
    enfant: a.enfant ?? b.enfant,
    repas: [...a.repas, ...b.repas],
    siestes: [...a.siestes, ...b.siestes],
    humeur: a.humeur ?? b.humeur,
    activites: [...a.activites, ...b.activites],
    sante: join(a.sante, b.sante),
    anecdotes: [...a.anecdotes, ...b.anecdotes],
    transcription_integrale: join(
      a.transcription_integrale,
      b.transcription_integrale,
    ),
    titre: a.titre ?? b.titre,
    recit: join(a.recit, b.recit),
    temps_fort: a.temps_fort ?? b.temps_fort,
    incertitudes: [...a.incertitudes, ...b.incertitudes],
    illisible: a.illisible && b.illisible,
    pages: [...a.pages, ...b.pages],
  };
}
