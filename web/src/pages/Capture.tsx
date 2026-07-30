import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Baby,
  Bell,
  BookOpenText,
  Camera,
  Check,
  ChevronDown,
  CloudOff,
  Crop,
  Images,
  Info,
  Layers,
  Moon,
  RotateCcw,
  ScanLine,
  Smile,
  Soup,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { writableChildren } from "@/lib/access";
import { compressImage } from "@/lib/image";
import { type Child, type EntrySource, SOURCE_LABELS } from "@/lib/types";
import {
  addPhotos,
  clearPhotos,
  getDraftMeta,
  getPhotos,
  removePhoto,
  saveDraftMeta,
} from "@/lib/photo-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CaptureSteps, type Step } from "@/components/CaptureSteps";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* ===========================================================================
   PHOTOGRAPHIER LE CARNET — le geste du soir, celui dont tout dépend.

   Si ce geste coûte trois écrans et six taps, le parent le fait deux semaines
   puis arrête. L'écran est donc construit autour d'UNE cible : le déclencheur.
   Ouvrir l'app → carnet photographié → « Raconter la journée » = 3 taps.

   Trois décisions de fond, prises contre la version précédente :

   · LE FORMULAIRE N'EST PLUS SUR LE CHEMIN. L'enfant et le lieu étaient deux
     champs empilés AU-DESSUS du bouton photo : la moitié de l'écran, à remplir
     chaque soir, alors que la réponse est la même que la veille (elle est
     mémorisée). Ils deviennent une ligne de contexte qui AFFICHE le réglage
     (« Louise · Nounou ») et se déplie si — et seulement si — il faut le
     changer. L'information reste visible, le contrôle est rangé.
   · L'ATTENTE EST DESSINÉE. « Envoi… » sur un bouton gris ne dit ni où on en
     est, ni ce qui se passe, ni si les photos survivront. Désormais : les pas
     avancent, une barre porte la préparation page par page (mesurée), puis
     l'envoi (déclaré indéterminé, pas un pourcentage inventé), et la FORME DE
     LA RÉPONSE est à l'écran — repas, sieste, humeur, activité, anecdote.
   · L'ÉCHEC A UNE SORTIE. Une phrase rouge devient un état : la cause (le
     message du serveur, en français), la preuve que les pages sont conservées,
     deux remèdes, le détail technique sur demande, et deux issues — réessayer
     ou revenir au journal. Jamais de cul-de-sac : le carnet de papier, lui, est
     déjà rangé.

   UNE SEULE DIMENSION EST COLORÉE ICI : l'état de l'envoi. Et depuis cette
   révision, les valeurs sont VRAIMENT quatre teintes différentes :
     encre      = le chemin (les pas franchis, le pas courant, le filet)
     vert       = acquis (les pages sont gardées)
     or         = en attente (hors ligne, brouillon retrouvé)
     rouge      = échoué
     groseille  = L'ACTION, et rien d'autre : le bouton de la barre.
   Avant, le chemin ET l'échec étaient tous deux groseille/rouge — deux teintes
   de même clarté OKLCH, mesurées à 1,08:1 l'une de l'autre en clair et 1,00:1 en
   sombre. Cinq marques de l'écran (rond franchi, anneau courant, filet,
   pastille, bouton « Réessayer ») ne disaient donc que trois choses. Le rail est
   passé à l'encre du carnet : l'échec est maintenant la seule teinte saturée
   au-dessus de la ligne de flottaison, et groseille ne désigne plus que la
   prochaine action.
   Les cinq feutres du carnet (repas, sieste…) restent GRIS sur cet écran :
   ils appartiennent au journal et à la relecture. Deux systèmes de couleur sur
   un même écran, et plus aucun ne veut rien dire.
   =========================================================================== */

const SOURCES: EntrySource[] = ["nounou", "mam", "creche", "maison"];

/** Espace insécable : « 1,4 Mo », « 2 pages » — typographie française. */
const NBSP = " ";

/** `id` référence l'enregistrement persisté ; `file` sert à l'envoi. */
type Shot = { id: string; file: File; url: string };

/** Où en est l'envoi. `prep` est mesurable, `upload` ne l'est pas — on le dit. */
type Stage = "prep" | "upload";

type Phase = "idle" | "sending" | "error";

/**
 * Part de la barre de progression réservée à la préparation des pages.
 * Le reste (45 %) est l'envoi : `fetch` ne rapporte aucune progression, donc
 * ce segment est un balayage DÉCLARÉ (la boucle de 1200 ms de `.skeleton`) et
 * non un pourcentage inventé qui grimpe tout seul.
 */
const PREP_SHARE = 55;

/** La forme de la réponse qui arrive : ce que Racontine cherche sur la page. */
const MOMENT_SHAPES = [
  { key: "meal", label: "Repas", Icon: Soup, width: "w-3/4" },
  { key: "nap", label: "Sieste", Icon: Moon, width: "w-1/2" },
  { key: "mood", label: "Humeur", Icon: Smile, width: "w-2/3" },
  { key: "activity", label: "Activité", Icon: Sparkles, width: "w-4/5" },
  { key: "anecdote", label: "Anecdote", Icon: Baby, width: "w-3/5" },
] as const;

/** Date locale du téléphone au format AAAA-MM-JJ (le carnet est photographié le soir). */
function localDate(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

/** « 840 Ko », « 1,4 Mo » — virgule décimale et espace insécable. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n}${NBSP}o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}${NBSP}Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")}${NBSP}Mo`;
}

function pageCount(n: number): string {
  return `${n}${NBSP}page${n > 1 ? "s" : ""}`;
}

/* --------------------------------------------------------------------------
   Un conseil de prise de vue : la même ligne que sur le journal (tuile de
   28 px, encre pâlie), pour que les deux écrans se ressemblent.
   -------------------------------------------------------------------------- */

function Tip({
  Icon,
  children,
}: {
  Icon: typeof Camera;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-card px-4 py-3 text-left shadow-card">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="text-meta text-muted-foreground">{children}</span>
    </li>
  );
}

/* --------------------------------------------------------------------------
   La ligne de contexte : QUI, et OÙ. Repliée par défaut, jamais cachée.
   -------------------------------------------------------------------------- */

function DayRow({
  kids,
  childId,
  onChildId,
  source,
  onSource,
}: {
  kids: Child[];
  childId: string;
  onChildId: (id: string) => void;
  source: EntrySource;
  onSource: (s: EntrySource) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = kids.find((c) => c.id === childId)?.name;

  return (
    <section className="rounded-2xl border bg-card shadow-card">
      {/* Un `<button aria-expanded>` plutôt qu'un `<details>` : la hauteur de
          44 px est alors garantie (un `<summary>` en `display: flex` se mesure
          mal) et l'état déplié est annoncé. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="journee-reglages"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left transition-colors dur-fast ease-carnet hover:bg-accent",
          // Déplié, la teinte de survol ne doit pas arrondir ses coins bas
          // au-dessus du filet de séparation.
          open ? "rounded-t-2xl" : "rounded-2xl",
        )}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Baby className="size-4" aria-hidden="true" />
        </span>
        {/* `gap-x-1.5` (6 px) : l'écart optique entre un prénom, un point médian
            et un lieu — pas un pas de mise en page. */}
        {/* Le cran « interface » (15/20) et non le surtitre : c'est une phrase
            (« qui, et où »), pas un intertitre. En capitales espacées, la ligne
            se lisait comme un en-tête de section et le prénom de l'enfant
            perdait son statut de contenu. */}
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-ui">
          <span className="font-bold text-foreground">
            {name ?? "Votre enfant"}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span className="text-muted-foreground">{SOURCE_LABELS[source]}</span>
        </span>
        <span className="text-meta text-muted-foreground">Modifier</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform dur-base ease-carnet",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id="journee-reglages"
          className="flex flex-col gap-4 border-t px-4 py-4"
        >
          {kids.length > 1 && (
            <div className="flex flex-col gap-1.5">
              {/* `gap-1.5` (6 px) : demi-pas libellé <-> champ. */}
              <Label htmlFor="capture-enfant">Enfant</Label>
              <Select
                id="capture-enfant"
                value={childId}
                onChange={(e) => onChildId(e.target.value)}
              >
                {kids.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {kids.length === 0 && (
            <p className="text-meta text-muted-foreground">
              Un profil sera créé au premier envoi ; vous le renommerez ensuite.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label id="capture-lieu">Lieu de la journée</Label>
            {/* Un groupe de bascules, pas quatre boutons indépendants :
                `aria-pressed` dit lequel est choisi sans compter sur la
                couleur. */}
            <div
              role="group"
              aria-labelledby="capture-lieu"
              className="flex flex-wrap gap-2"
            >
              {SOURCES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={source === s ? "default" : "outline"}
                  size="sm"
                  aria-pressed={source === s}
                  onClick={() => onSource(s)}
                >
                  {source === s && <Check aria-hidden="true" />}
                  {SOURCE_LABELS[s]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------------------
   Les pages photographiées. La photo est le sujet de l'écran, pas une pièce
   jointe : rayon accordé à la carte, liseré de 1 px pour qu'une page crème garde
   son bord sur du papier crème — et jamais d'ombre portée sur l'image (l'ombre
   appartient à la carte). Le numéro et le retrait vivent sur une ligne OPAQUE de
   44 px sous l'image : un voile posé sur une photo inconnue n'est jamais un
   contraste mesuré, et une croix de 22 px n'est pas une cible.

   DEUX CORRECTIONS MESURÉES, toutes deux visibles à 320, 390 et 1280 :

   · LE RATIO EST CELUI DE LA PAGE, PAS UN ARRONDI. La vignette déclarait 4/5
     (0,800) alors qu'une page de carnet stockée par le produit fait 900×1010,
     soit 0,891 : `object-contain` laissait donc 10,9 px de vide EN HAUT ET EN BAS
     de chaque vignette (21,8 px sur une tuile de 213,8 — 10 % de l'image). Le
     ratio déclaré est maintenant 9/10 (0,900) : l'écart tombe à 1,7 px de côté,
     et un vide latéral se lit comme « une page posée sur un plateau », alors
     qu'un vide haut/bas se lit comme un trou.
   · LE PLATEAU A SA PROPRE SURFACE. Ce champ était `bg-card` — exactement la
     couleur de la ligne de légende juste dessous, au pixel près : la bande ne
     ressemblait donc pas à un plateau de scanner mais à un décalage accidentel,
     et le seul séparateur était un filet de 1 px. Le champ passe sur `--muted`
     (encre froide pâle), la feuille reste `--card` (crème) : les deux surfaces se
     distinguent, quel que soit le cadrage de la photo qu'on y pose.

   COLONNES : une page seule — et deux pages, le cas d'un carnet ouvert — prennent
   TOUTE la largeur. À deux colonnes, deux pages ne consommaient que 236 px de
   hauteur et laissaient 117 px de papier mort avant le bouton (14 % du viewport,
   dans l'état où le parent a fait le travail) : la ligne de flottaison montrait
   qu'il y avait MOINS, pas plus. En pleine largeur, la page est réellement
   lisible — c'est la fonction de la vignette — et la seconde page dépasse sous le
   fondu, ce qui dit « il y en a d'autres ». À partir de trois pages, deux
   colonnes redeviennent la bonne réponse : la grille remplit alors l'écran seule.
   -------------------------------------------------------------------------- */

function PageGrid({
  shots,
  onRemove,
}: {
  shots: Shot[];
  onRemove: (index: number) => void;
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3 border-b pb-2">
        <h2 className="surtitre text-muted-foreground">Pages du carnet</h2>
        <p className="surtitre text-muted-foreground" data-tabular>
          {pageCount(shots.length)}
        </p>
      </div>
      {/* Le nombre de colonnes suit le nombre de pages ET la largeur réelle de
          la colonne de lecture (32 rem au maximum) :
            1 page   → pleine largeur, toujours ;
            2 pages  → pleine largeur sur un téléphone, deux colonnes dès que la
                       colonne dépasse ~500 px (là, deux vignettes de 250 px
                       restent lisibles et l'écran se remplit d'un coup) ;
            3 et plus→ deux colonnes : la grille remplit alors l'écran seule. */}
      <ul
        className={cn(
          "mt-3 grid gap-3",
          shots.length === 1
            ? "grid-cols-1"
            : shots.length === 2
              ? "grid-cols-1 min-[560px]:grid-cols-2"
              : "grid-cols-2",
        )}
      >
        {shots.map((s, i) => (
          <li
            key={s.id}
            className="flex flex-col rounded-2xl border bg-card shadow-card"
          >
            {/* `object-contain`, et c'est un choix FONCTIONNEL : la vignette
                sert à vérifier que la page entière est dans le cadre. Un
                `object-cover` recadrait la page et tranchait ses propres mots
                sur les deux bords — joli, mais il cachait précisément le défaut
                qu'on demande au parent de repérer. Le champ `--muted` est le
                plateau du scanner, distinct de la feuille `--card` ; le ratio
                9/10 est celui d'une page de carnet (900×1010). */}
            <div className="seam overflow-hidden rounded-t-2xl bg-muted">
              <img
                src={s.url}
                alt={`page ${i + 1}`}
                className="aspect-[9/10] w-full object-contain"
              />
            </div>
            <div className="flex h-11 items-center gap-1 border-t pr-1 pl-3">
              <span
                className="surtitre flex-1 text-muted-foreground"
                data-tabular
              >
                Page {i + 1}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Retirer la page ${i + 1}`}
                onClick={() => onRemove(i)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------------------------
   L'attente : où on en est, ce qui arrive, et que rien ne se perd.
   -------------------------------------------------------------------------- */

function SendingPanel({
  shots,
  stage,
  prepDone,
  onCancel,
}: {
  shots: Shot[];
  stage: Stage;
  prepDone: number;
  onCancel: () => void;
}) {
  const total = shots.length;
  const bytes = shots.reduce((n, s) => n + s.file.size, 0);
  const solid =
    stage === "prep"
      ? Math.round(total ? (prepDone / total) * PREP_SHARE : 0)
      : PREP_SHARE;
  const text =
    stage === "prep"
      ? `Préparation de la page ${Math.min(prepDone + 1, total)} sur ${total}…`
      : `Envoi de ${pageCount(total)} vers Racontine…`;

  return (
    <section className="rise-enter flex flex-col gap-4">
      <div className="rounded-2xl border bg-card p-4 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="surtitre text-muted-foreground">Envoi du carnet</h2>
          {/* 13/20 et pas le surtitre : `text-transform: uppercase` écrivait
              « 1,1 MO » — l'unité du système est « Mo ». Les deux crans
              s'alignent sur la même ligne de base. */}
          <p className="text-meta text-muted-foreground" data-tabular>
            {pageCount(total)} · {formatBytes(bytes)}
          </p>
        </div>

        {/* Deux segments, et c'est volontaire : le premier est MESURÉ (page par
            page), le second est un balayage déclaré — on ne fait pas grimper un
            faux pourcentage pendant que le réseau travaille. */}
        <div
          role="progressbar"
          aria-label="Envoi du carnet"
          aria-valuetext={text}
          aria-valuemin={stage === "prep" ? 0 : undefined}
          aria-valuemax={stage === "prep" ? total : undefined}
          aria-valuenow={stage === "prep" ? prepDone : undefined}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          {/* LA BARRE PARLE LE VOCABULAIRE DE L'ÉCRAN, pas la couleur de marque.
              Elle portait deux groseilles (pleine + pâle) : le chemin est passé à
              l'encre dans les pas, mais la barre restait groseille — deux objets
              qui disent la même chose de deux couleurs, et groseille qui reprend
              un second métier. Ses deux segments ont pourtant chacun un sens déjà
              nommé par le système :
                VERT = acquis   — ces pages sont prêtes, c'est derrière nous ;
                OR   = en attente — cette part est en vol, et elle n'est PAS
                       mesurable (`fetch` ne rapporte aucune progression), donc
                       elle est déclarée, pâle et IMMOBILE : sur une capture figée
                       et sous « moins de mouvement », un balayage ne dit rien.
              Aucun faux pourcentage ne grimpe, et rien ici n'est décoratif. */}
          <div className="flex h-full">
            <div
              className="h-full rounded-full bg-success transition-[width] dur-slow ease-page"
              style={{ width: `${solid}%` }}
            />
            {stage === "upload" && (
              <div className="h-full flex-1 rounded-full bg-warning-bg" />
            )}
          </div>
        </div>

        <p role="status" className="mt-3 text-meta text-muted-foreground">
          {text}
        </p>

        {/* Les pages en vol, en petit : on voit CE QUI part. */}
        <ul className="mt-3 flex gap-2">
          {/* Même traitement que les vignettes de la grille (plateau `--muted`,
              page entière, liseré) : une page se montre en entier partout. */}
          {shots.slice(0, 6).map((s) => (
            <li key={s.id} className="seam overflow-hidden rounded-sm bg-muted">
              <img src={s.url} alt="" className="h-12 w-11 object-contain" />
            </li>
          ))}
          {shots.length > 6 && (
            <li className="surtitre grid h-12 w-11 place-items-center rounded-sm bg-muted text-muted-foreground">
              +{shots.length - 6}
            </li>
          )}
        </ul>

        {/* LA SORTIE PENDANT L'ATTENTE, et elle est HONNÊTE sur les deux moments.
            La référence affiche « Annuler la lecture » ; nous ne l'avions pas.
            · PENDANT LA PRÉPARATION, rien n'a quitté le téléphone : la boucle de
              compression est séquentielle, elle s'arrête au tour suivant et les
              pages restent en place. Le bouton marche vraiment.
            · PENDANT L'ENVOI, `lib/api.ts` appelle `fetch` sans `AbortSignal` —
              fichier hors de cet écran. Proposer « Annuler » là serait promettre
              d'arrêter quelque chose qui continue : le serveur créerait la journée
              quand même. Le bouton reste donc EN PLACE (une commande qui
              disparaît laisse un parent chercher) mais devient désactivé — surface
              `muted`, libellé mesuré à 5,1:1, jamais un `opacity-50` — et la ligne
              dessous dit exactement pourquoi. C'est le point de non-retour, nommé.
            Petit et centré, pas pleine largeur : ce n'est pas l'action de l'écran,
            c'est sa sortie de secours. */}
        <div className="mt-4 flex flex-col items-center gap-2 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={stage === "upload"}
            onClick={onCancel}
          >
            <X aria-hidden="true" />
            Annuler la lecture
          </Button>
          <p className="text-center text-meta text-muted-foreground">
            {stage === "prep"
              ? "Rien n’a encore quitté le téléphone."
              : "Les pages sont parties, et restent enregistrées ici : rien ne se perd."}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-card">
        <h2 className="surtitre text-muted-foreground">
          Ce que Racontine cherche
        </h2>
        <ul className="mt-1 flex flex-col">
          {MOMENT_SHAPES.map(({ key, label, Icon, width }) => (
            <li
              key={key}
              className="flex items-center gap-3 border-t py-3 first:border-t-0"
            >
              {/* Les tuiles sont GRISES : sur cet écran la couleur dit l'état de
                  l'envoi, pas le type de moment. */}
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
              >
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="surtitre text-muted-foreground">{label}</span>
                <span
                  aria-hidden="true"
                  className={cn("skeleton h-4", width)}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------
   L'échec : la cause, la preuve, le remède, la sortie.
   -------------------------------------------------------------------------- */

function SendError({
  message,
  shots,
  childName,
  source,
}: {
  message: string;
  shots: Shot[];
  childName: string;
  source: EntrySource;
}) {
  const bytes = shots.reduce((n, s) => n + s.file.size, 0);
  return (
    <section className="rise-enter flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card">
      <span
        aria-hidden="true"
        className="grid size-16 place-items-center rounded-3xl bg-destructive-soft text-destructive"
      >
        <CloudOff className="size-7" />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-title font-semibold">
          L’envoi n’est pas passé
        </h2>
        {/* La CAUSE, telle que le serveur la nomme — en français, jamais une
            exception brute. Les apostrophes droites du message sont redressées
            à l'AFFICHAGE : sinon la même carte mélange « l'envoi » (serveur) et
            « l’appareil » (écran), et la couture se voit. */}
        <p className="max-w-[34ch] text-ui text-muted-foreground">
          {message.replace(/'/g, "\u2019")}
        </p>
      </div>

      {/* La preuve, pas la promesse : c'est ce qui décide un parent à réessayer
          demain plutôt qu'à abandonner l'app. */}
      <p className="flex items-start gap-2 rounded-lg bg-success-bg px-4 py-3 text-meta font-bold text-success">
        {/* `mt-0.5` (2 px) : centrage optique d'une icône de 16 px sur une ligne
            de 20 px. */}
        <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {pageCount(shots.length)} gardée{shots.length > 1 ? "s" : ""} sur
        l’appareil.
      </p>

      <ul className="flex flex-col gap-3">
        <Tip Icon={RotateCcw}>
          Vérifiez votre réseau, puis réessayez : l’envoi repart de zéro, sans
          doublon.
        </Tip>
        <Tip Icon={Layers}>
          Vous pouvez aussi fermer l’app et revenir plus tard — les pages vous
          attendront ici.
        </Tip>
      </ul>

      <details>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-meta text-muted-foreground transition-colors dur-fast ease-carnet hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          Détail technique
        </summary>
        <p
          className="rounded-lg bg-muted px-4 py-3 text-meta text-muted-foreground"
          data-tabular
        >
          POST /api/entries/ingest · {pageCount(shots.length)} ·{" "}
          {formatBytes(bytes)} · {childName} · {SOURCE_LABELS[source]}
        </p>
      </details>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export default function Capture() {
  const nav = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  /** Les enfants dont on TIENT le carnet — un lecteur n'en a aucun. */
  const [children, setChildren] = useState<Child[]>([]);
  /** `null` tant que la liste n'est pas revenue : ni ouverte, ni refusée. */
  const [access, setAccess] = useState<"open" | "reader" | null>(null);
  const [childId, setChildId] = useState<string>("");
  const [source, setSource] = useState<EntrySource>("nounou");
  const [shots, setShots] = useState<Shot[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState<Stage>("prep");
  const [prepDone, setPrepDone] = useState(0);
  const [error, setError] = useState<string>("");
  const [restored, setRestored] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // `navigator.onLine` ne ment que dans un sens : `false` est fiable, `true`
  // veut seulement dire « une interface est branchée ». On ne se sert donc du
  // signal que pour prévenir, jamais pour promettre.
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );
  const restoredMeta = useRef(getDraftMeta());
  /* Drapeau d'abandon de la préparation. Un `ref` et non un état : la boucle de
     compression le relit à chaque tour, et un état ne serait pas à jour dedans. */
  const cancelled = useRef(false);

  /* ── LE GARDE-FOU DE L'ÉCRAN ──────────────────────────────────────────────
     `/api/entries/ingest` exige `roleAtLeast(role, "contributor")`. Un LECTEUR
     arrivait pourtant sur la totalité de cet écran : l'appareil s'ouvrait tout
     seul, il cadrait la page, il tapait « Raconter la journée » — et le refus
     tombait après la compression et l'envoi de ses photos. On ne filtre donc
     plus seulement l'affichage : la liste des enfants est réduite à ceux dont on
     tient le carnet, et s'il n'en reste aucun l'écran se remplace par une
     explication avec des sorties (`CaptureDenied`).
     Un compte NEUF (zéro enfant) reste ouvert : le premier envoi crée l'enfant,
     et l'auteur en est administrateur. */
  useEffect(() => {
    api
      .listChildren()
      .then((kids) => {
        const mine = writableChildren(kids);
        setChildren(mine);
        setAccess(mine.length || kids.length === 0 ? "open" : "reader");
        // Restaure l'enfant sélectionné s'il est toujours accessible.
        const savedChild = restoredMeta.current?.childId;
        if (savedChild && mine.some((k) => k.id === savedChild))
          setChildId(savedChild);
        else if (mine.length) setChildId(mine[0].id);
      })
      .catch(() => {
        // La liste n'a pas répondu : on ne REFUSE pas pour autant (le geste du
        // soir ne doit pas dépendre d'une requête secondaire). Le compte est
        // traité comme neuf ; le serveur reste l'autorité à l'envoi.
        setChildren([]);
        setAccess("open");
      });
  }, []);

  // Recharge les photos d'un brouillon non envoyé (échec précédent ou refresh).
  useEffect(() => {
    let alive = true;
    const meta = restoredMeta.current;
    if (meta?.source && SOURCES.includes(meta.source as EntrySource))
      setSource(meta.source as EntrySource);
    getPhotos().then((saved) => {
      if (!alive || !saved.length) return;
      const restoredShots = saved.map((s) => ({
        id: s.id,
        file: new File([s.blob], s.name, { type: s.type }),
        url: URL.createObjectURL(s.blob),
      }));
      setShots(restoredShots);
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* I10 — LE TAP QU'ON PEUT VRAIMENT RENDRE.
     Le parcours mesuré coûtait 6 taps de l'ouverture de l'app à la journée
     publiée, contre 5 pour la référence, et l'un des deux excédents était cet
     écran-relais : le parent tape « Photographier le carnet » sur le journal,
     arrive ici, et doit taper « Photographier le carnet » une seconde fois.
     On ne peut PAS ouvrir un `input[type=file][capture]` par programme sans
     geste utilisateur — mais le geste du journal est encore vivant à l'arrivée :
     l'activation transitoire dure ~5 s et une navigation côté client ne la
     consomme pas. Si elle est là, on ouvre l'appareil tout de suite ; le bouton
     du journal dit littéralement « photographier », donc c'est ce qu'il fait.
     C'est une AMÉLIORATION PROGRESSIVE, jamais un prérequis :
       · pas d'activation (rechargement, retour arrière, lien direct, navigateur
         sans `userActivation`) → rien ne se passe, l'écran est celui d'avant ;
       · des pages déjà là (brouillon retrouvé) → on ne vole pas la main ;
       · appareil annulé → on retombe sur l'écran, avec ses deux boutons.
     On revérifie l'activation après la lecture d'IndexedDB : la fenêtre a pu
     se refermer entre-temps.
     ET ON ATTEND LE RÔLE : ouvrir l'appareil photo au nez d'un lecteur, sur un
     écran qui va le refuser, est le pire des accueils. L'activation transitoire
     dure ~5 s, `/api/children` répond en quelques dizaines de ms : la fenêtre
     est encore là quand la réponse arrive. */
  useEffect(() => {
    if (access !== "open") return;
    let alive = true;
    const active = () =>
      (navigator as Navigator & { userActivation?: { isActive: boolean } })
        .userActivation?.isActive === true;
    if (!active()) return;
    getPhotos().then((saved) => {
      if (!alive || saved.length || !active()) return;
      cameraRef.current?.click();
    });
    return () => {
      alive = false;
    };
  }, [access]);

  // Libère les aperçus (object URLs) au démontage.
  useEffect(() => {
    return () => {
      setShots((prev) => {
        prev.forEach((s) => URL.revokeObjectURL(s.url));
        return prev;
      });
    };
  }, []);

  // Mémorise les réglages de la journée pour les restaurer avec les photos.
  useEffect(() => {
    saveDraftMeta({ childId: childId || undefined, source });
  }, [childId, source]);

  // Le réseau qui part et qui revient : l'écran le dit avant que l'envoi rate.
  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    e.target.value = ""; // permet de re-sélectionner le même fichier
    // Persiste d'abord : on ne perd rien même si l'app est fermée aussitôt.
    const records = await addPhotos(files);
    const added = records.map((r, i) => ({
      id: r.id,
      file: files[i],
      url: URL.createObjectURL(files[i]),
    }));
    setShots((prev) => [...prev, ...added]);
    // Le lot a changé : l'échec précédent ne le décrit plus.
    setPhase("idle");
    setRestored(false);
  }

  function removeShot(idx: number) {
    setShots((prev) => {
      const s = prev[idx];
      if (s) {
        URL.revokeObjectURL(s.url);
        void removePhoto(s.id);
      }
      return prev.filter((_, j) => j !== idx);
    });
    setPhase("idle");
  }

  async function resetAll() {
    setShots((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.url));
      return [];
    });
    setRestored(false);
    setPhase("idle");
    await clearPhotos();
  }

  /** Abandonne la PRÉPARATION. Voir la note dans `SendingPanel`. */
  function cancelSend() {
    cancelled.current = true;
  }

  async function submit() {
    setError("");
    cancelled.current = false;
    if (!shots.length) {
      setError("Ajoutez au moins une page du carnet avant l’envoi.");
      setPhase("error");
      return;
    }
    setPhase("sending");
    setStage("prep");
    setPrepDone(0);
    try {
      let cid = childId;
      if (!cid && children.length === 0) {
        // Premier usage : crée un enfant par défaut à renommer ensuite.
        const child = await api.createChild("Mon enfant");
        cid = child.id;
      }
      // Réduit chaque page avant l'envoi : évite de dépasser la limite de
      // taille du proxy (upload « Failed to fetch ») et accélère l'envoi en 4G.
      // SÉQUENTIEL, et pas `Promise.all` : c'est ce qui permet d'annoncer
      // « page 2 sur 3 » honnêtement — et six JPEG de 4 Mo décodés en même
      // temps font tomber le canvas d'un téléphone d'entrée de gamme.
      const files: File[] = [];
      for (const s of shots) {
        files.push(await compressImage(s.file));
        // Abandon demandé : la page en cours est déjà réduite, mais rien n'est
        // parti. On revient à l'écran de départ, les pages intactes.
        if (cancelled.current) {
          setPhase("idle");
          setPrepDone(0);
          return;
        }
        setPrepDone((n) => n + 1);
      }
      setStage("upload");
      const res = await api.ingest(files, {
        childId: cid || undefined,
        source,
        date: localDate(),
      });
      // Envoi réussi : le brouillon local n'a plus de raison d'être.
      await clearPhotos();
      nav(`/entries/${res.id}`);
    } catch (err) {
      // Échec : on garde les photos persistées, elles restent récupérables.
      setError(
        err instanceof Error
          ? err.message
          : "L’envoi du carnet a échoué. Vos pages sont conservées.",
      );
      setPhase("error");
    }
  }

  const childName =
    children.find((c) => c.id === childId)?.name ?? "Votre enfant";
  const hasPages = shots.length > 0;

  /* Les quatre temps. La capture n'en porte que deux : la photo, puis la
     lecture (en cours, ou échouée). La relecture et le partage appartiennent
     aux écrans suivants — les afficher « à venir » est une promesse de brièveté,
     pas un décor. */
  const steps: Step[] = [
    {
      key: "photo",
      label: "Photo",
      state: phase === "idle" ? "current" : "done",
    },
    {
      key: "read",
      label: "Lecture",
      state:
        phase === "sending" ? "current" : phase === "error" ? "failed" : "todo",
    },
    { key: "review", label: "Relecture", state: "todo" },
    { key: "share", label: "Partage", state: "todo" },
  ];

  /* La porte fermée, dès qu'on SAIT qu'elle est fermée. Tant que le rôle n'est
     pas revenu (une requête, quelques dizaines de ms) l'écran reste celui du
     parent : rien d'irréversible ne peut s'y produire — l'appareil ne s'ouvre
     plus tout seul avant la réponse, et un envoi tenté dans cette fenêtre est
     de toute façon arbitré par le serveur. */
  if (access === "reader") return <CaptureDenied />;

  return (
    <div className="shell-width flex flex-col gap-4 px-4 pt-4 pb-40">
      {/* Le titre de l'écran est porté par les pas (« Photo » est le temps
          courant) et par le titre sérif de l'état vide. Un `sr-only` coûterait
          un `margin: -1px` hors grille et un nœud de texte rogné. */}
      <h1 aria-label="Photographier le carnet" />

      <CaptureSteps steps={steps} />

      {offline && (
        <p className="flex items-start gap-3 rounded-xl bg-warning-bg px-4 py-3 text-meta text-warning">
          <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-bold">Hors ligne.</span> Les pages restent
            enregistrées sur l’appareil ; l’envoi partira dès le retour du
            réseau.
          </span>
        </p>
      )}

      {restored && hasPages && phase === "idle" && (
        <div className="flex items-start gap-3 rounded-xl bg-warning-bg px-4 py-3 text-warning">
          <Layers className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-col items-start gap-2">
            <p className="text-meta">
              <span className="font-bold">Journée non envoyée retrouvée.</span>{" "}
              Ses {pageCount(shots.length)} sont encore là. Terminez l’envoi, ou
              repartez de zéro.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmReset(true)}
            >
              Repartir de zéro
            </Button>
          </div>
        </div>
      )}

      {phase === "sending" ? (
        <SendingPanel
          shots={shots}
          stage={stage}
          prepDone={prepDone}
          onCancel={cancelSend}
        />
      ) : (
        <>
          <DayRow
            kids={children}
            childId={childId}
            onChildId={setChildId}
            source={source}
            onSource={setSource}
          />

          {phase === "error" && (
            <SendError
              message={error}
              shots={shots}
              childName={childName}
              source={source}
            />
          )}

          {hasPages ? (
            <>
              <PageGrid shots={shots} onRemove={removeShot} />

              {/* Deux entrées, deux gestes : reprendre l'appareil, ou piocher
                  une photo déjà prise. Empilées sous 360 px pour qu'aucun
                  libellé ne soit rogné. */}
              <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera aria-hidden="true" />
                  Photographier
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => albumRef.current?.click()}
                >
                  <Images aria-hidden="true" />
                  Depuis l’album
                </Button>
              </div>

              {shots.length > 1 && (
                <p className="flex items-start gap-2 text-meta text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Si ces pages couvrent plusieurs jours, chaque journée sera
                  détectée et relue séparément.
                </p>
              )}
            </>
          ) : (
            phase === "idle" && <CaptureEmpty />
          )}
        </>
      )}

      {/* Deux entrées distinctes : `capture` ouvre l'appareil photo, son
          absence laisse choisir des images déjà dans l'album (carnet
          photographié plus tôt, capture d'écran d'un message…). */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={albumRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPick}
      />

      {/* LA BARRE D'ACTION, en deux morceaux, et c'est une correction mesurée.
          Avant : un seul bloc en `from-background via-surface-bar to-transparent`.
          `--surface-bar` porte 0,88 d'alpha — sur du papier nu, ça ne se voit pas ;
          mais depuis que les pages se lisent en pleine largeur, ce qui passe SOUS
          la barre est une PHOTO de page manuscrite, et la ligne « Vous relirez la
          journée… » se retrouvait posée sur 6 à 12 % d'écriture fantôme. Du texte
          sur une image sans voile mesuré, c'est exactement ce que le BAR interdit.
          Désormais : 48 px de fondu AU-DESSUS de la barre (le contenu s'efface au
          lieu de buter contre le bouton), puis du papier OPAQUE sous les
          commandes. Le fondu se termine sur `--background`, donc la couture entre
          les deux morceaux est invisible. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
        <div
          aria-hidden="true"
          className="h-12 bg-gradient-to-t from-background to-transparent"
        />
        <div className="flex justify-center bg-background px-4 pb-safe-6">
          <div className="shell-width pointer-events-auto flex flex-col gap-2">
            {/* Désactivé et SANS roue : le seul mouvement du produit qui
              tournerait ici est une boucle de 1000 ms linéaire, hors du budget
              publié (120–260 ms + deux boucles déclarées). L'activité est portée
              par la barre (qui avance page par page), par le `role="status"` et
              par le balayage déclaré des squelettes — jamais par le mouvement
              seul. L'étiquette désactivée est mesurée à 5,1:1, pas un
              `opacity-50`.
              La ligne de réassurance qui doublait ce bouton est descendue dans la
              fiche d'envoi, sous le bouton d'annulation : elle y dit la même
              chose ET ce qu'on peut encore arrêter — et la barre d'action perd
              28 px de chrome au passage. */}
            {phase === "sending" && (
              <Button size="lg" disabled className="shadow-lift">
                {stage === "prep" ? "Préparation…" : "Envoi…"}
              </Button>
            )}

            {phase === "error" && (
              <>
                <Button size="lg" onClick={submit} className="shadow-lift">
                  <RotateCcw aria-hidden="true" />
                  Réessayer l’envoi
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">Revenir au journal</Link>
                </Button>
              </>
            )}

            {phase === "idle" && hasPages && (
              <>
                <Button
                  size="lg"
                  onClick={submit}
                  disabled={offline}
                  className="shadow-lift"
                >
                  <ScanLine aria-hidden="true" />
                  Raconter la journée
                </Button>
                <p className="text-center text-meta text-muted-foreground">
                  Vous relirez la journée avant qu’elle ne parte aux proches.
                </p>
              </>
            )}

            {phase === "idle" && !hasPages && (
              <>
                <Button
                  size="lg"
                  onClick={() => cameraRef.current?.click()}
                  className="shadow-lift"
                >
                  <Camera aria-hidden="true" />
                  Photographier le carnet
                </Button>
                <Button
                  variant="outline"
                  onClick={() => albumRef.current?.click()}
                >
                  <Images aria-hidden="true" />
                  Importer depuis l’album
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repartir de zéro ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les {pageCount(shots.length)} retrouvées seront retirées de
              l’appareil. Le carnet de papier, lui, ne bouge pas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder les pages</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={resetAll}>
              Tout retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* --------------------------------------------------------------------------
   LA PORTE FERMÉE — ce que voit un LECTEUR qui arrive sur /capture.

   Ce n'est pas une erreur : c'est une répartition des rôles, et elle doit se
   lire comme telle. Donc pas de rouge, pas de « accès refusé », pas de code
   HTTP — un aplat d'encre pâle, le rôle nommé (« Lecteur »), ce qu'il permet, et
   la seule chose à faire ensuite : ouvrir le journal. La demande d'un rôle
   d'écriture passe par la personne qui tient le carnet ; on le dit, sans
   fabriquer un bouton qui n'a pas d'API derrière lui.
   -------------------------------------------------------------------------- */

function CaptureDenied() {
  return (
    <div className="shell-width flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-5 px-4 py-8 text-center">
      <span
        aria-hidden="true"
        className="grid size-16 place-items-center rounded-3xl bg-muted text-muted-foreground"
      >
        <BookOpenText className="size-7" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-serif text-title font-semibold text-balance">
          Ce carnet, vous le lisez
        </h1>
        <p className="max-w-[34ch] text-ui text-pretty text-muted-foreground">
          Vous êtes <span className="font-bold text-foreground">Lecteur</span> :
          les journées vous arrivent une fois publiées. Photographier et relire le
          carnet revient à la famille qui le tient.
        </p>
      </div>
      <ul className="flex w-full flex-col gap-3 text-left">
        <Tip Icon={BookOpenText}>
          Toutes les journées publiées sont dans le journal, de la plus récente à
          la plus ancienne.
        </Tip>
        <Tip Icon={Sparkles}>
          Pour photographier le carnet à votre tour, demandez le rôle
          Contributeur à la personne qui l’administre.
        </Tip>
      </ul>
      <div className="flex w-full flex-col gap-2">
        <Button asChild size="lg">
          <Link to="/">
            <BookOpenText aria-hidden="true" />
            Ouvrir le journal
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/proches">
            <Bell aria-hidden="true" />
            Régler les notifications
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   L'état vide VEND le geste suivant : une vignette, une promesse en une
   phrase, trois conseils de prise de vue. Rien ici n'est un haussement
   d'épaules — c'est le premier écran du soir.
   -------------------------------------------------------------------------- */

function CaptureEmpty() {
  return (
    <section className="rise-enter flex flex-col items-center gap-5 pt-6 text-center">
      <span
        aria-hidden="true"
        className="grid size-20 place-items-center rounded-3xl bg-primary-soft text-primary"
      >
        <BookOpenText className="size-8" />
      </span>

      <div className="flex flex-col items-center gap-2">
        <h2 className="font-serif text-title font-semibold">
          Photographiez la page du jour
        </h2>
        <p className="max-w-[31ch] text-ui text-muted-foreground">
          Racontine la lit, vous la relisez, la journée part aux proches.
        </p>
      </div>

      <ul className="flex w-full flex-col gap-3">
        <Tip Icon={Sun}>
          À plat, près d’une fenêtre : la lumière du jour suffit, pas besoin du
          flash.
        </Tip>
        <Tip Icon={Crop}>
          La page entière dans le cadre — un peu de travers, un peu froissée,
          c’est très bien.
        </Tip>
        <Tip Icon={Layers}>
          Plusieurs pages ? Ajoutez-les toutes : leur ordre est conservé.
        </Tip>
      </ul>
    </section>
  );
}
