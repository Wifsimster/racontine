import { useState } from "react";
import {
  Check,
  ChevronDown,
  PenLine,
  TriangleAlert,
} from "lucide-react";
import {
  type Uncertainty,
  type UncertaintyField,
} from "@/lib/types";
import { highlightToken, unquoted } from "@/lib/reading-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Où se trouve le mot incertain : dit à l'œil où regarder. */
const FIELD_ORIGIN: Record<UncertaintyField, string> = {
  titre: "dans le titre",
  recit: "dans le récit",
  temps_fort: "dans le temps fort",
  transcription_integrale: "dans la transcription",
};

/* LES LECTURES À TRANCHER — le cœur de l'écran : une carte dépliée, les
   autres repliées, et ce qu'on voit une fois la lecture confirmée. */

/**
 * Une lecture douteuse, et la façon de la trancher en un geste.
 *
 * · AMBRE tant que ce n'est pas tranché, VERT dès que c'est fait : la couleur
 *   dit l'état de confiance, jamais la catégorie. Elle est toujours doublée
 *   d'un glyphe (`TriangleAlert` / `Check`) — l'état reste lisible en noir et
 *   blanc.
 * · Le mot lu est en sérif, comme sur le papier ; le contexte est en encre
 *   pâlie, parce que ce n'est pas lui qu'on corrige.
 * · Toutes les encres sont à pleine opacité. `text-warning/70` sur
 *   `--warning-bg` donnait 3,1:1 : un modificateur d'opacité sur une COULEUR
 *   DE TEXTE est un échec de contraste silencieux.
 */
/**
 * Une lecture tranchée. Le diff est explicite (« Ninon » → Manon) et il reste
 * une sortie : le serveur refuse de re-trancher (409, et c'est juste), mais le
 * mot est toujours modifiable à la main — « Revenir sur ce choix » emmène le
 * clavier sur le champ où la substitution a eu lieu.
 */
export function ResolvedReading({
  id,
  item,
  onEdit,
}: {
  id: string;
  item: Uncertainty;
  onEdit: () => void;
}) {
  /* « Gardé tel quel » se compare sur le MOT, pas sur sa citation : une vieille
     journée porte un `original` guillemeté que le bouton « Garder » n'a jamais
     renvoyé tel quel — la ligne annonçait alors une correction « « mot » → mot »
     qui n'a jamais eu lieu. */
  const kept = unquoted(item.resolved ?? "") === unquoted(item.original);
  /* TOUTE LA LIGNE est la cible : un petit « Revenir dessus » de 44 px à droite
     rajoutait un objet et 8 px de hauteur pour la même action. */
  return (
    <button
      id={id}
      type="button"
      onClick={onEdit}
      aria-label={`Revenir sur la lecture « ${unquoted(item.original)} »${
        item.champ ? ` (${FIELD_ORIGIN[item.champ]})` : ""
      }`}
      className="tap flex min-h-11 w-full items-center gap-2 rounded-xl bg-success-bg px-3 text-left text-success transition-colors dur-fast ease-carnet hover:bg-card"
    >
      <Check aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-meta">
        {kept ? (
          <>
            <span className="font-serif">« {unquoted(item.original)} »</span>{" "}
            gardé tel quel
          </>
        ) : (
          <>
            <span className="font-serif line-through">
              « {unquoted(item.original)} »
            </span>{" "}
            <span aria-hidden="true">→</span>{" "}
            <span className="font-bold">{item.resolved}</span>
          </>
        )}
      </span>
      <PenLine aria-hidden="true" className="size-4 shrink-0" />
    </button>
  );
}

/**
 * Une lecture à trancher, repliée : on n'ouvre qu'une carte à la fois pour que
 * les moments de la journée tiennent dans le même écran. La ligne dit quand
 * même le mot lu, où il se trouve, et qu'elle attend quelque chose.
 *
 * LA CITATION EST LÀ AUSSI, SUR UNE SEULE LIGNE. Quatre lectures repliées, c'est
 * quatre mots nus (« écrite », « nu jeu d'eau »…) qu'il fallait déplier un par
 * un pour savoir de quelle ligne du carnet chacun venait : le geste de tri se
 * payait quatre allers-retours. La phrase tronquée à une ligne coûte 16 px par
 * carte et rend la file TRIABLE À L'ŒIL — on ouvre la bonne du premier coup.
 * `truncate` et non deux lignes : la file reste une liste, pas quatre pavés.
 */
export function CollapsedReading({
  id,
  item,
  phrase,
  onOpen,
}: {
  id: string;
  item: Uncertainty;
  /** La phrase du carnet où ce mot a été lu, `null` si on ne l'y retrouve pas. */
  phrase: string | null;
  onOpen: () => void;
}) {
  const word = unquoted(item.original);
  return (
    <button
      id={id}
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      aria-label={`Trancher la lecture « ${word} »${
        phrase ? `, dans « ${phrase} »` : ""
      }`}
      className="tap flex min-h-14 w-full items-center gap-3 rounded-xl border border-warning bg-warning-bg px-3 py-2 text-left transition-colors dur-fast ease-carnet hover:bg-card"
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1">
        <span className="surtitre block truncate text-warning">
          À vérifier{item.champ ? ` · ${FIELD_ORIGIN[item.champ]}` : ""}
        </span>
        <span className="block truncate font-serif text-ui text-foreground">
          « {word} »
        </span>
        {phrase && (
          /* Sérif comme la page dépliée : c'est le même objet — ce qui est
             écrit sur le papier — au même endroit d'une carte à l'autre. Le mot
             y reste en gras, sinon la ligne n'est qu'une bande grise de plus. */
          <span className="block truncate font-serif text-xs text-muted-foreground">
            {highlightToken(phrase, word)}
          </span>
        )}
      </span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-warning" />
    </button>
  );
}

export function UncertaintyCard({
  id,
  item,
  phrase,
  disabled,
  resolving,
  onResolve,
}: {
  id: string;
  item: Uncertainty;
  /** La phrase du carnet où ce mot a été lu, `null` si on ne l'y retrouve pas. */
  phrase: string | null;
  disabled: boolean;
  resolving: boolean;
  onResolve: (value: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const [choice, setChoice] = useState<string | null>(null);

  /** Le mot lu, sans la citation que le modèle met parfois autour. */
  const word = unquoted(item.original);

  // Le mot lu figure parfois déjà dans les suggestions : on ne propose pas deux
  // fois la même réponse, « Garder » porte déjà ce choix. La comparaison est
  // faite hors casse et hors guillemets, sinon « Gratin » et « gratin »
  // s'affichaient tous les deux à côté de « Garder « gratin » ».
  const suggestions = item.suggestions
    .map((sug) => unquoted(sug))
    .filter(
      (sug, i, self) =>
        sug &&
        sug.toLowerCase() !== word.toLowerCase() &&
        self.findIndex((o) => o.toLowerCase() === sug.toLowerCase()) === i,
    );

  /** La saisie libre est derrière une pastille : elle coûtait 52 px de hauteur
      en permanence pour un usage rare, et ces 52 px sont exactement ce qui
      manquait pour voir la journée.
      SAUF QUAND IL N'Y A RIEN D'AUTRE. Sans suggestion, la carte ne proposait
      que « Garder » et une pastille « Autre… » : le seul geste utile — écrire ce
      qui est sur le papier — demandait un tap de plus, et rien ne disait que la
      machine n'avait AUCUNE autre lecture à offrir. Le champ est alors ouvert
      d'emblée, et la carte le dit. */
  const [customOpen, setCustomOpen] = useState(suggestions.length === 0);
  /** Ouvert PAR UN GESTE, et non parce qu'il n'y avait rien d'autre à montrer :
      seul le premier cas mérite le clavier. Sans cette distinction, l'`autoFocus`
      du champ et le focus donné à la carte à l'arrivée sur l'écran se
      disputaient le curseur, et la carte gagnait — le champ perdait le caret
      qu'il venait de prendre. */
  const [customAsked, setCustomAsked] = useState(false);

  function pick(value: string) {
    setChoice(value);
    onResolve(value);
  }

  return (
    <div
      id={id}
      /* `tabIndex={-1}` : la carte n'entre pas dans l'ordre de tabulation (elle
         n'est pas un contrôle), mais elle peut RECEVOIR le focus à l'arrivée sur
         l'écran — c'est la chose qui demande un humain, et c'est donc elle qu'on
         annonce et depuis laquelle la première tabulation tombe sur les
         suggestions. Le groupe porte son nom : « Lecture à vérifier : gratin ». */
      tabIndex={-1}
      role="group"
      /* La citation entre AUSSI dans le nom du groupe : au lecteur d'écran, la
         carte annonçait « Lecture à vérifier : écrite » — un mot hors de toute
         phrase, c'est-à-dire la difficulté même qu'on corrige à l'œil. */
      aria-label={`Lecture à vérifier : ${word}${phrase ? `, dans « ${phrase} »` : ""}`}
      className="flex flex-col gap-2 rounded-xl border border-warning bg-warning-bg p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
    >
      <p className="surtitre flex items-center gap-2 text-warning">
        <TriangleAlert aria-hidden="true" className="size-4" />
        À vérifier
        {item.champ ? ` · ${FIELD_ORIGIN[item.champ]}` : ""}
      </p>

      {/* Souligné ondulé ambre : l'idiome universel du mot douteux. La forme
          double la couleur — sans l'ambre, le trait dit encore « incertain ». */}
      <p className="font-serif text-body text-foreground">
        «{" "}
        <span className="underline decoration-warning decoration-wavy underline-offset-4">
          {word}
        </span>{" "}
        »
      </p>
      {/* LA PHRASE DU CARNET, PAS UNE PÉRIPHRASE. « mot incertain après
          «Nounour» dans la ligne du matin » demande de chercher un repère pour
          chercher un mot ; « Nott. **Befant.** pour le relais, premier atelier
          musique » se retrouve d'un balayage sur la photo, parce que c'est
          littéralement ce qui y est écrit. Sérif comme la page, encre pleine sur
          le mot, encre pâlie autour : la phrase situe, elle ne se corrige pas.
          Le filet à gauche la donne pour une CITATION — sans lui, elle se lisait
          comme une suggestion de plus. */}
      {phrase && (
        <p className="border-l-2 border-warning pl-3 font-serif text-meta text-muted-foreground">
          {highlightToken(phrase, word)}
        </p>
      )}
      {/* La glose du modèle reste SOUS la citation : elle dit pourquoi la
          machine doute (« abréviation », « peut-être Note : bébé/enfant »), ce
          que la phrase ne dit pas. La citation situe, la glose explique. */}
      {item.contexte && (
        <p className="text-meta text-muted-foreground">
          {highlightToken(item.contexte, word)}
        </p>
      )}
      {/* L'ABSENCE DE SUGGESTION EST UNE INFORMATION. La carte montrait alors un
          mot et deux boutons sans jamais dire pourquoi elle ne proposait rien :
          on ne pouvait pas distinguer « la machine n'a aucune autre lecture » de
          « la carte est cassée ». */}
      {suggestions.length === 0 && (
        <p className="text-meta text-muted-foreground">
          Aucune autre lecture proposée : gardez ce mot, ou écrivez ce qui est
          sur le papier.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* La suggestion est une pastille POSÉE sur le champ ambre : c'est son
            LISERÉ ambre qui l'identifie, pas son fond — le fond est la feuille,
            donc la pastille reste nette le jour comme la nuit, et l'encre reste
            l'ambre à pleine opacité (6,4:1 le jour, 9:1 la nuit). « Garder »
            n'a pas de liseré : c'est un choix, pas une correction. */}
        {suggestions.map((s) => (
          <Button
            key={s}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto max-w-full min-h-11 rounded-full border-warning py-2 text-left whitespace-normal text-warning hover:bg-card"
            loading={resolving && choice === s}
            disabled={disabled}
            onClick={() => pick(s)}
          >
            {s}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto max-w-full min-h-11 rounded-full py-2 text-left whitespace-normal text-warning hover:bg-card"
          loading={resolving && choice === word}
          disabled={disabled}
          /* Le MOT, pas la citation : « Garder » écrit sa valeur dans le récit
             publié — y renvoyer « « Roueil » » y poserait les guillemets. */
          onClick={() => pick(word)}
        >
          Garder « {word} »
        </Button>
        {!customOpen && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto max-w-full min-h-11 rounded-full py-2 text-left whitespace-normal text-warning hover:bg-card"
            disabled={disabled}
            onClick={() => {
              setCustomOpen(true);
              setCustomAsked(true);
            }}
            aria-label={`Saisir une autre lecture pour « ${word} »`}
          >
            <PenLine aria-hidden="true" />
            Autre…
          </Button>
        )}
      </div>

      {customOpen && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus={customAsked}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) {
                e.preventDefault();
                pick(custom.trim());
              }
              if (e.key === "Escape" && !custom) setCustomOpen(false);
            }}
            placeholder="Ce qui est écrit sur le papier…"
            aria-label={`Autre lecture pour « ${word} »`}
            disabled={disabled}
          />
          {/* Le bouton n'existe que quand il a quelque chose à valider : au
              repos, un rond gris désactivé n'était qu'un trou dans la carte. */}
          {custom.trim() && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="border-warning text-warning"
              loading={resolving && choice === custom.trim()}
              disabled={disabled}
              onClick={() => pick(custom.trim())}
              aria-label="Valider cette lecture"
            >
              {resolving && choice === custom.trim() ? null : (
                <Check aria-hidden="true" />
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Éditeur d'items --------------------------- */

