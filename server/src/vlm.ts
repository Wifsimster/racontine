import Anthropic from "@anthropic-ai/sdk";
import { getSettings } from "./settings.js";

/**
 * Incertitude telle que renvoyée par le VLM : le mot tel que lu, pourquoi il
 * est incertain, et des lectures alternatives plausibles. `resolved` n'existe
 * pas encore à ce stade — il est ajouté à la persistance une fois la relecture
 * humaine faite (voir `ingest.ts`).
 */
export type VlmUncertainty = {
  original: string;
  contexte: string;
  suggestions: string[];
  champ: "titre" | "recit" | "temps_fort" | "transcription_integrale" | null;
};

/** Une journée extraite d'un sous-ensemble des pages envoyées. */
export type DayExtraction = {
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
  incertitudes: VlmUncertainty[];
  illisible: boolean;
  /** Pages (1-based, dans l'ordre des images fournies) qui composent cette journée. */
  pages: number[];
};

const UNCERTAINTY_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      original: {
        type: "string",
        description: "le mot ou passage tel que lu, incertain",
      },
      contexte: {
        type: "string",
        description:
          "brève explication de l'incertitude (position dans le texte, raison)",
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        description:
          "au moins 3 lectures alternatives plausibles, classées de la plus probable à la moins probable",
      },
      champ: {
        type: ["string", "null"],
        enum: ["titre", "recit", "temps_fort", "transcription_integrale", null],
        description:
          "champ de la valorisation où ce mot apparaît, si identifiable, sinon null",
      },
    },
    required: ["original", "contexte", "suggestions"],
  },
  description:
    "mots ou passages dont la lecture est incertaine, chacun avec au moins 3 suggestions de correction, à faire valider par un humain",
} as const;

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "enregistrer_journees",
  description:
    "Enregistre une ou plusieurs journées de l'enfant, extraites des pages photographiées d'un carnet de liaison manuscrit.",
  input_schema: {
    type: "object",
    properties: {
      journees: {
        type: "array",
        minItems: 1,
        description:
          "Une entrée par journée distincte détectée dans les pages fournies (une seule si tout le lot ne couvre qu'un jour).",
        items: {
          type: "object",
          properties: {
            pages: {
              type: "array",
              items: { type: "integer" },
              description:
                "Numéros de page (1-based, dans l'ordre des images fournies) composant cette journée. Chaque page fournie doit figurer dans exactement une journée.",
            },
            date: {
              type: ["string", "null"],
              description:
                "Date de cette journée au format ISO YYYY-MM-DD si lisible.",
            },
            enfant: {
              type: ["string", "null"],
              description: "Prénom de l'enfant si mentionné.",
            },
            repas: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  moment: {
                    type: "string",
                    description: "matin, midi, goûter, soir…",
                  },
                  contenu: { type: "string" },
                  appetit: {
                    type: "string",
                    description: "ex. tout mangé, moitié, refusé",
                  },
                },
                required: ["moment", "contenu"],
              },
            },
            siestes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  debut: { type: "string", description: "heure de début, ex. 13h" },
                  fin: { type: "string", description: "heure de fin, ex. 15h10" },
                  note: { type: "string" },
                },
              },
            },
            humeur: { type: ["string", "null"] },
            activites: { type: "array", items: { type: "string" } },
            sante: {
              type: ["string", "null"],
              description: "température, soins, incidents… sinon null",
            },
            anecdotes: {
              type: "array",
              items: { type: "string" },
              description: "moments marquants, premières fois, mots rigolos",
            },
            transcription_integrale: {
              type: ["string", "null"],
              description:
                "transcription fidèle et intégrale du texte manuscrit de cette journée",
            },
            titre: {
              type: ["string", "null"],
              description:
                "Titre court et évocateur de la journée (3 à 6 mots, sans point final), ex. « Peinture et premiers papillons ». Basé uniquement sur ce qui est écrit.",
            },
            recit: {
              type: ["string", "null"],
              description:
                "Récit chaleureux de 2 à 4 phrases racontant la journée de l'enfant à ses proches, à la 3e personne, au présent, ton tendre et vivant mais jamais mièvre. Uniquement à partir du contenu réel du carnet — n'invente aucun détail. Null si le carnet est trop vide pour un récit.",
            },
            temps_fort: {
              type: ["string", "null"],
              description:
                "Le moment le plus marquant de la journée en une phrase courte (première fois, mot rigolo, jolie activité…), sinon null.",
            },
            incertitudes: UNCERTAINTY_SCHEMA,
            illisible: {
              type: "boolean",
              description:
                "true si les pages de cette journée ne montrent aucun contenu de carnet exploitable",
            },
          },
          required: [
            "pages",
            "repas",
            "siestes",
            "activites",
            "anecdotes",
            "incertitudes",
            "illisible",
          ],
        },
      },
    },
    required: ["journees"],
  },
};

const SYSTEM_PROMPT = `Tu es l'assistant d'extraction de Racontine. On te fournit une ou plusieurs photos de pages manuscrites d'un carnet de liaison d'enfant (nounou, MAM ou crèche), en français, numérotées dans l'ordre où elles te sont données (page 1, page 2, page 3…).

Ces pages peuvent couvrir UNE SEULE journée (recto/verso, pages multiples de la même date) OU PLUSIEURS journées différentes : un parent photographie parfois plusieurs jours du carnet d'un coup. Repère les en-têtes de date manuscrits (ex. « Mardi 25 Novembre 2025 ») pour découper les pages en autant de journées distinctes que nécessaire :
- Une page qui commence par un nouvel en-tête de date ouvre une nouvelle journée.
- Une page sans nouvel en-tête poursuit la journée précédente (continuation d'écriture).
- Une page hors-sujet (couverture, page blanche, tableau récapitulatif sans date) peut être rattachée à la journée la plus proche plutôt que d'être ignorée.
- Si tout le lot ne concerne qu'une seule journée, renvoie un tableau "journees" d'un seul élément couvrant toutes les pages.

Pour chaque journée, indique dans "pages" la liste des numéros (1-based) des pages qui la composent — chaque page fournie doit apparaître dans exactement une journée.

Lis attentivement l'écriture manuscrite, structure chaque journée, puis **valorise-la** : transforme des notes brutes en un joli souvenir que les proches auront plaisir à lire. C'est le cœur du produit.

Consignes, pour chaque journée :
- N'invente jamais : si une information est absente, laisse le champ vide (liste vide ou null). Le récit ne doit contenir que des faits présents dans le carnet.
- "titre", "recit" et "temps_fort" sont la valorisation : rédige-les avec chaleur, dans un français soigné et vivant, à partir des repas, siestes, activités, humeur et anecdotes réels de CETTE journée.
- Signale dans "incertitudes" tout mot ou champ dont la lecture n'est pas sûre, avec au moins 3 suggestions de correction plausibles classées par probabilité.
- Si un « vocabulaire déjà confirmé » est fourni ci-dessous, utilise-le en priorité pour interpréter une écriture ambiguë (mêmes mots d'enfant, mêmes surnoms, même main) : s'il permet de lever le doute, retiens directement la lecture confirmée sans la signaler en incertitude.
- "transcription_integrale" doit reproduire fidèlement le texte manuscrit de cette journée.
- Si les pages de cette journée ne contiennent pas de carnet lisible, mets "illisible" à true.
Appelle toujours l'outil enregistrer_journees.`;

/**
 * Erreur d'extraction dont le message est déjà sûr à afficher à l'utilisateur
 * (stocké tel quel dans `failureReason` et montré dans l'app). Les détails bruts
 * du fournisseur — corps JSON, request_id, mention de facturation — restent dans
 * les logs serveur et ne fuitent jamais vers les proches.
 */
export class VlmError extends Error {}

/** Traduit une erreur d'appel VLM en message français sûr pour l'utilisateur. */
function vlmUserMessage(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    const type = err.type ?? "";
    if (
      status === 401 ||
      status === 403 ||
      type === "authentication_error" ||
      type === "permission_error"
    )
      return "Votre clé API Anthropic est invalide ou révoquée. Vérifiez-la dans les réglages.";
    // Solde de crédits épuisé / facturation : lié au compte Anthropic de l'utilisateur.
    if (/credit balance|billing|quota|payment/i.test(err.message))
      return "Le solde de crédits de votre compte Anthropic est insuffisant. Rechargez-le puis réessayez.";
    if (status === 429 || type === "rate_limit_error")
      return "Trop de lectures en cours. Patientez un instant puis réessayez.";
    if (status === 529 || type === "overloaded_error")
      return "Le service de lecture est surchargé pour le moment. Réessayez dans quelques minutes.";
    if (status >= 500)
      return "Le service de lecture est temporairement indisponible. Réessayez plus tard.";
    // Autres erreurs de requête (ex. image refusée par l'API).
    return "La lecture automatique du carnet a échoué. Réessayez avec une photo plus nette.";
  }
  if (err instanceof VlmError) return err.message;
  return "La lecture automatique du carnet a échoué. Réessayez plus tard.";
}

/**
 * Construit un client Anthropic pour la clé fournie. La clé appartient à
 * l'utilisateur qui téléverse (chacun apporte la sienne) — on ne met donc rien
 * en cache entre appels, pour ne jamais mélanger les clés de deux comptes.
 */
function clientFor(apiKey: string): Anthropic {
  if (!apiKey.trim())
    throw new VlmError(
      "Aucune clé API Anthropic configurée. Ajoutez la vôtre dans les réglages.",
    );
  return new Anthropic({ apiKey });
}

/** Correction déjà validée par un proche pour un enfant — voir `corrections.ts`. */
export type GlossaryEntry = { original: string; corrected: string };

/** Construit le bloc « vocabulaire déjà confirmé » ajouté au prompt système. */
function glossaryBlock(glossary: GlossaryEntry[]): string {
  if (!glossary.length) return "";
  const lines = glossary
    .map((g) => `- « ${g.original} » → « ${g.corrected} »`)
    .join("\n");
  return `\n\nVocabulaire déjà confirmé pour cet enfant (lectures validées lors de relectures précédentes) :\n${lines}`;
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const UNCERTAINTY_CHAMPS = ["titre", "recit", "temps_fort", "transcription_integrale"];

function normalizeUncertainties(raw: unknown): VlmUncertainty[] {
  return arr<Partial<VlmUncertainty>>(raw)
    .filter((u) => typeof u?.original === "string" && u.original.trim())
    .map((u) => ({
      original: u.original as string,
      contexte: typeof u.contexte === "string" ? u.contexte : "",
      suggestions: arr<string>(u.suggestions).filter(
        (s) => typeof s === "string" && s.trim(),
      ),
      champ: UNCERTAINTY_CHAMPS.includes(u.champ as string)
        ? (u.champ as VlmUncertainty["champ"])
        : null,
    }));
}

/**
 * Normalise la sortie brute (non fiable — le SDK n'impose pas le schéma à
 * l'exécution) en un tableau de journées cohérent : chaque page de `1..totalPages`
 * apparaît dans exactement une journée. Exporté pour être testé sans appel réseau.
 */
export function normalizeJournees(
  raw: unknown,
  totalPages: number,
): DayExtraction[] {
  const rawList = arr<Record<string, unknown>>(
    raw && typeof raw === "object" ? (raw as { journees?: unknown }).journees : undefined,
  );

  const allPages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const claimed = new Set<number>();
  const days: DayExtraction[] = [];

  for (const d of rawList) {
    const pages = arr<number>(d.pages)
      .map((p) => Math.trunc(Number(p)))
      .filter(
        (p, idx, self) =>
          p >= 1 && p <= totalPages && !claimed.has(p) && self.indexOf(p) === idx,
      );
    // Une journée sans page valide n'a rien à rattacher : on l'ignore, ses
    // champs éventuels ne référencent aucune photo exploitable.
    if (!pages.length) continue;
    pages.forEach((p) => claimed.add(p));
    days.push({
      date: (d.date as string) ?? null,
      enfant: (d.enfant as string) ?? null,
      repas: arr<DayExtraction["repas"][number]>(d.repas),
      siestes: arr<DayExtraction["siestes"][number]>(d.siestes),
      humeur: (d.humeur as string) ?? null,
      activites: arr<string>(d.activites),
      sante: (d.sante as string) ?? null,
      anecdotes: arr<string>(d.anecdotes),
      transcription_integrale: (d.transcription_integrale as string) ?? null,
      titre: (d.titre as string) ?? null,
      recit: (d.recit as string) ?? null,
      temps_fort: (d.temps_fort as string) ?? null,
      incertitudes: normalizeUncertainties(d.incertitudes),
      illisible: Boolean(d.illisible),
      pages,
    });
  }

  const leftover = allPages.filter((p) => !claimed.has(p));
  if (leftover.length) {
    // Pages qu'aucune journée n'a réclamées (modèle incomplet) : plutôt que de
    // perdre silencieusement des photos, on les rattache à la dernière journée
    // connue, ou on crée une journée illisible dédiée s'il n'y en a aucune.
    if (days.length) days[days.length - 1].pages.push(...leftover);
    else
      days.push({
        date: null,
        enfant: null,
        repas: [],
        siestes: [],
        humeur: null,
        activites: [],
        sante: null,
        anecdotes: [],
        transcription_integrale: null,
        titre: null,
        recit: null,
        temps_fort: null,
        incertitudes: [],
        illisible: true,
        pages: leftover,
      });
  }

  return days;
}

/**
 * Envoie les pages (JPEG) au modèle vision et renvoie une journée par date
 * distincte détectée dans le lot (une seule si tout le lot ne couvre qu'un
 * jour). `apiKey` est la clé Anthropic de l'utilisateur au nom duquel on lit
 * le carnet. `glossary` : corrections déjà validées pour cet enfant,
 * réinjectées pour améliorer la lecture de l'écriture au fil des relectures.
 */
export async function extractFromImages(
  jpegs: Buffer[],
  apiKey: string,
  glossary: GlossaryEntry[] = [],
): Promise<DayExtraction[]> {
  const anthropic = clientFor(apiKey);
  // Modèle piloté par les réglages d'instance (défaut : VLM_MODEL de l'env).
  const { vlmModel } = await getSettings();

  const imageBlocks: Anthropic.ImageBlockParam[] = jpegs.map((buf) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/jpeg",
      data: buf.toString("base64"),
    },
  }));

  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create({
      model: vlmModel,
      max_tokens: 4096,
      system: SYSTEM_PROMPT + glossaryBlock(glossary),
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: "Voici les pages du carnet, dans l'ordre (page 1, page 2…). Découpe-les en journées et extrais/structure chacune.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    // Détail brut du fournisseur pour l'opérateur (jamais montré à l'utilisateur).
    console.error(
      "Extraction VLM — échec de l'appel Anthropic :",
      err instanceof Error ? err.message : err,
    );
    throw new VlmError(vlmUserMessage(err));
  }

  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Le modèle n'a pas renvoyé d'extraction structurée.");
  }

  return normalizeJournees(toolUse.input, jpegs.length);
}
