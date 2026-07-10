import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

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
  incertitudes: string[];
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
        items: { type: "string" },
        description:
          "champs ou mots dont la lecture est incertaine, à faire relire par un humain",
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
- Signale dans "incertitudes" tout mot ou champ dont la lecture n'est pas sûre.
- "transcription_integrale" doit reproduire fidèlement le texte manuscrit.
- Si l'image ne contient pas de carnet lisible, mets "illisible" à true.
- Plusieurs images correspondent à la même journée (recto/verso ou pages multiples) : fusionne-les en une seule journée.
Appelle toujours l'outil enregistrer_journee.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY manquant : extraction VLM impossible.");
  }
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

/** Envoie les pages (JPEG) au modèle vision et renvoie l'extraction structurée. */
export async function extractFromImages(
  jpegs: Buffer[],
): Promise<Extraction> {
  const anthropic = getClient();

  const imageBlocks: Anthropic.ImageBlockParam[] = jpegs.map((buf) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/jpeg",
      data: buf.toString("base64"),
    },
  }));

  const message = await anthropic.messages.create({
    model: config.vlmModel,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
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

  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Le modèle n'a pas renvoyé d'extraction structurée.");
  }

  const raw = toolUse.input as Partial<Extraction>;
  return {
    date: raw.date ?? null,
    enfant: raw.enfant ?? null,
    repas: raw.repas ?? [],
    siestes: raw.siestes ?? [],
    humeur: raw.humeur ?? null,
    activites: raw.activites ?? [],
    sante: raw.sante ?? null,
    anecdotes: raw.anecdotes ?? [],
    transcription_integrale: raw.transcription_integrale ?? null,
    titre: raw.titre ?? null,
    recit: raw.recit ?? null,
    temps_fort: raw.temps_fort ?? null,
    incertitudes: raw.incertitudes ?? [],
    illisible: raw.illisible ?? false,
  };
}
