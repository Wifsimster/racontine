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

export type Extraction = {
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
};

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "enregistrer_journee",
  description:
    "Enregistre la journée de l'enfant extraite d'une ou plusieurs pages du carnet de liaison manuscrit.",
  input_schema: {
    type: "object",
    properties: {
      date: {
        type: ["string", "null"],
        description: "Date de la journée au format ISO YYYY-MM-DD si lisible.",
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
        description: "transcription fidèle et intégrale du texte manuscrit",
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
      incertitudes: {
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
              description:
                "1 à 3 lectures alternatives plausibles, classées de la plus probable à la moins probable",
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
          "mots ou passages dont la lecture est incertaine, chacun avec 1 à 3 suggestions de correction, à faire valider par un humain",
      },
      illisible: {
        type: "boolean",
        description:
          "true si la/les photo(s) ne montrent aucun contenu de carnet exploitable",
      },
    },
    required: ["repas", "siestes", "activites", "anecdotes", "incertitudes", "illisible"],
  },
};

const SYSTEM_PROMPT = `Tu es l'assistant d'extraction de Racontine. On te fournit une ou plusieurs photos d'une page manuscrite d'un carnet de liaison d'enfant (nounou, MAM ou crèche), en français.

Lis attentivement l'écriture manuscrite, structure la journée, puis **valorise-la** : transforme des notes brutes en un joli souvenir que les proches auront plaisir à lire. C'est le cœur du produit.

Consignes :
- N'invente jamais : si une information est absente, laisse le champ vide (liste vide ou null). Le récit ne doit contenir que des faits présents dans le carnet.
- "titre", "recit" et "temps_fort" sont la valorisation : rédige-les avec chaleur, dans un français soigné et vivant, à partir des repas, siestes, activités, humeur et anecdotes réels.
- Signale dans "incertitudes" tout mot ou champ dont la lecture n'est pas sûre, avec 1 à 3 suggestions de correction plausibles classées par probabilité.
- Si un « vocabulaire déjà confirmé » est fourni ci-dessous, utilise-le en priorité pour interpréter une écriture ambiguë (mêmes mots d'enfant, mêmes surnoms, même main) : s'il permet de lever le doute, retiens directement la lecture confirmée sans la signaler en incertitude.
- "transcription_integrale" doit reproduire fidèlement le texte manuscrit.
- Si l'image ne contient pas de carnet lisible, mets "illisible" à true.
- Plusieurs images correspondent à la même journée (recto/verso ou pages multiples) : fusionne-les en une seule journée.
Appelle toujours l'outil enregistrer_journee.`;

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

/**
 * Envoie les pages (JPEG) au modèle vision et renvoie l'extraction structurée.
 * `apiKey` est la clé Anthropic de l'utilisateur au nom duquel on lit le carnet.
 * `glossary` : corrections déjà validées pour cet enfant, réinjectées pour
 * améliorer la lecture de l'écriture au fil des relectures.
 */
export async function extractFromImages(
  jpegs: Buffer[],
  apiKey: string,
  glossary: GlossaryEntry[] = [],
): Promise<Extraction> {
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
      max_tokens: 2048,
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
              text: "Voici la ou les pages du carnet de cette journée. Extrais et structure-les.",
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

  const raw = toolUse.input as Partial<Extraction>;
  // Le SDK n'impose pas le input_schema à l'exécution : un champ « tableau »
  // pourrait arriver sous une autre forme (string, number…). On force donc un
  // vrai tableau, sinon `?? []` laisserait passer une string itérée caractère
  // par caractère ou un nombre qui ferait planter l'aval.
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const CHAMPS = ["titre", "recit", "temps_fort", "transcription_integrale"];
  const uncertainties = arr<Partial<VlmUncertainty>>(raw.incertitudes)
    .filter((u) => typeof u?.original === "string" && u.original.trim())
    .map((u) => ({
      original: u.original as string,
      contexte: typeof u.contexte === "string" ? u.contexte : "",
      suggestions: arr<string>(u.suggestions).filter(
        (s) => typeof s === "string" && s.trim(),
      ),
      champ: CHAMPS.includes(u.champ as string)
        ? (u.champ as VlmUncertainty["champ"])
        : null,
    }));
  return {
    date: raw.date ?? null,
    enfant: raw.enfant ?? null,
    repas: arr<Extraction["repas"][number]>(raw.repas),
    siestes: arr<Extraction["siestes"][number]>(raw.siestes),
    humeur: raw.humeur ?? null,
    activites: arr<string>(raw.activites),
    sante: raw.sante ?? null,
    anecdotes: arr<string>(raw.anecdotes),
    transcription_integrale: raw.transcription_integrale ?? null,
    titre: raw.titre ?? null,
    recit: raw.recit ?? null,
    temps_fort: raw.temps_fort ?? null,
    incertitudes: uncertainties,
    illisible: raw.illisible ?? false,
  };
}
