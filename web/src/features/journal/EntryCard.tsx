import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  ScanLine,
  PenLine,
  Smile,
  Star,
  TriangleAlert,
} from "lucide-react";
import {
  type Entry,
  SOURCE_LABELS,
} from "@/lib/types";
import {
  dayLabel,
  fr,
  fullDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChildMark } from "@/components/ChildMark";
import { GlanceStrip, ItemLine, glanceOf, pickGlance } from "./glance";
import { PageStrip } from "./pages";

/* LA CARTE D'UNE JOURNÉE — l'objet du journal. */

export function pendingCount(entry: Entry): number {
  if (!Array.isArray(entry.uncertainties)) return 0;
  return entry.uncertainties.filter((u) =>
    typeof u === "string" ? true : !u.resolved,
  ).length;
}

export function StatusBadge({
  entry,
  canEdit,
}: {
  entry: Entry;
  /** Peut-on TRANCHER une lecture douteuse sur cette journée ? Cf. `access.ts`. */
  canEdit: boolean;
}) {
  if (entry.status === "draft")
    return (
      <Badge variant="warning">
        <PenLine aria-hidden="true" />À relire
      </Badge>
    );
  if (entry.status === "processing")
    return (
      <Badge variant="soft">
        <ScanLine aria-hidden="true" />
        Lecture en cours
      </Badge>
    );
  if (entry.status === "failed")
    return (
      <Badge variant="destructive">
        <TriangleAlert aria-hidden="true" />
        Échec
      </Badge>
    );
  /* UNE JOURNÉE PUBLIÉE PEUT RESTER FAUSSE, et le journal ne le disait pas.
     Une lecture non tranchée reste une lecture non tranchée après publication —
     c’est même le cas le plus fréquent : on publie vite le soir, on s’aperçoit
     de l’erreur en relisant. La pastille ambre est la MÊME que sur un brouillon
     (même teinte, même icône, même mot) parce qu’elle dit la même chose ; ce qui
     change, c’est la sortie au bas de la carte.

     ELLE NE S’ADRESSE QU’À QUI PEUT LA FAIRE DISPARAÎTRE. Sur le journal d’un
     LECTEUR, « 1 à vérifier » était une alarme sans interrupteur : mamie voit
     qu’un mot de la journée de sa petite-fille est douteux, ne peut pas
     l’arbitrer, et la pastille ambre reste là tous les soirs. Un avertissement
     qu’on ne peut pas lever n’est pas une information, c’est du bruit — et il
     annonçait une porte qui, pour elle, se refermait sur un 403. */
  if (entry.status === "published" && canEdit) {
    const n = pendingCount(entry);
    if (n > 0)
      return (
        <Badge variant="warning">
          <TriangleAlert aria-hidden="true" />
          {n} à vérifier
        </Badge>
      );
  }
  return null;
}

export function EntryCard({
  entry,
  canEdit,
  onOpenPages,
}: {
  entry: Entry;
  /** Rôle contributeur ou administrateur sur CET enfant. Cf. `lib/access.ts`. */
  canEdit: boolean;
  onOpenPages: (entry: Entry, index: number, from: HTMLElement) => void;
}) {
  const dateText = fullDate(entry.date);
  const label = dayLabel(entry.date);
  const hasStory = Boolean(entry.story);
  const pending = pendingCount(entry);
  /* ── LA SORTIE DE LA CARTE — le cul-de-sac le plus coûteux de l’app ────────
     Mesuré : une journée PUBLIÉE n’avait AUCUN lien vers `/entries/:id`. Pour
     corriger un mot mal lu, il fallait passer par la cloche des notifications
     (et donc espérer que la notification soit encore dans les trente dernières),
     soit 2 taps + 1 panneau avant même de commencer à corriger — et zéro chemin
     du tout une fois la notification tombée hors de la liste. Le parcours C
     n’était pas cher : il était IMPOSSIBLE depuis l’écran où l’on repère
     l’erreur.
     Toutes les cartes portent maintenant la même sortie, au même endroit, dans
     le même objet. L’emphase, elle, suit l’urgence — et rien d’autre :
       échec / brouillon        → `secondary`, il y a un travail à finir ;
       publiée AVEC un doute    → `secondary`, il y a un mot à trancher ;
       publiée et confirmée     → `ghost`, la porte est là sans réclamer.

     ── ET ELLE N’EXISTE QUE POUR QUI PEUT LA FRANCHIR ──────────────────────
     Cette sortie était posée sur TOUTES les cartes, sans regarder le rôle. Un
     LECTEUR (la moitié des comptes d’un carnet partagé : mamie, le parrain)
     lisait « Corriger la lecture », arrivait dans l’éditeur complet, choisissait
     une suggestion, VOYAIT le texte changer, tapait « Republier la journée » —
     et recevait « accès refusé · rien n’est perdu : vos corrections sont
     toujours à l’écran », une promesse fausse pour elle à jamais. 2 taps perdus
     et un cul-de-sac, à chaque carte, tous les soirs.
     Le rôle vient de `/api/children` (`role` par enfant), pas de `/api/entries`
     qui ne renvoie que la ligne brute de l’enfant. Tant qu’il n’est pas connu,
     la porte n’est pas dessinée : on préfère la faire attendre 200 ms que
     l’ouvrir sur un refus. */
  const action = !canEdit
    ? null
    : entry.status === "failed"
      ? { label: "Reprendre cette journée", quiet: false }
      : entry.status === "draft"
        ? { label: "Relire et publier", quiet: false }
        : entry.status === "published"
          ? pending > 0
            ? { label: "Corriger la lecture", quiet: false }
            : { label: "Corriger la journée", quiet: true }
          : null;
  const shown = pickGlance(glanceOf(entry));

  /* ── Le récit tient sur TROIS lignes du cahier dans le fil ────────────────
     Mesuré avant : le récit faisait 10 lignes × 28 = 280 px, soit 35 % d’une
     carte de 803 px, et le premier écran (635 px de contenu sous 209 px de
     chrome) ne montrait donc rien d’autre : ni les pages photographiées, ni la
     ligne de dépli, ni le début de la journée suivante. Le fil coupe à 3 × 28 =
     84 px — un compte ENTIER d’interlignes, pour que la réglure du fond reste
     en phase avec le texte — et l’écran porte alors une pensée complète (jour,
     titre, feutres, trois lignes, temps fort, pages, dépli) PLUS 36 px de la
     journée suivante.

     La coupe a une sortie, et c’est la sortie qui existait déjà : le dépli. En
     l’ouvrant, le récit se déplie ET les moments apparaissent — un seul geste,
     un seul contrôle. Le texte coupé n’est caché qu’à l’ŒIL : `line-clamp` ne
     retire rien de l’arbre d’accessibilité, un lecteur d’écran lit la journée
     entière sans rien ouvrir. */
  const [open, setOpen] = useState(false);
  const storyRef = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const el = storyRef.current;
    if (!el || open) return;
    let alive = true;
    const measure = () => {
      if (alive) setClipped(el.scrollHeight - el.clientHeight > 1);
    };
    measure();
    // La mesure dépend de la fonte : si Nunito arrive après le premier rendu,
    // le nombre de lignes change et le libellé du dépli doit suivre.
    void document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [entry.story, open]);

  const storyId = `recit-${entry.id}`;
  const detailId = `jour-${entry.id}`;

  return (
    <article
      // Cible du lien « Voir la journée » du reçu de publication : on republie
      // souvent une journée ancienne, donc plusieurs cartes plus bas.
      id={`carte-${entry.id}`}
      className="relative scroll-mt-28 overflow-hidden rounded-2xl border bg-card shadow-card"
    >
      {/* Le trait de marge du cahier, sur toute la hauteur de la feuille. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-5 w-[1.5px] bg-[var(--rule-margin)]"
      />

      <div className="relative flex flex-col gap-4 py-4 pr-5 pl-7">
        {/* En-tête : à qui, quand, d’où — un seul objet typographique, une
            seule ligne. La pastille d’état prend SON propre rang plutôt que de
            pousser la provenance à la ligne : une carte à relire ne doit pas
            avoir un en-tête d’une hauteur différente d’une carte publiée par
            accident de retour à la ligne. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            {/* `flex-wrap` : sur un écran de 320 px, un prénom long fait passer
                la date à la ligne au lieu de recouvrir la provenance. */}
            <p className="surtitre flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
              {entry.child && (
                <>
                  {/* LA PASTILLE DE L'ENFANT. Un foyer à deux enfants voyait
                      jusqu'ici deux journées différentes produire deux cartes
                      strictement identiques : le prénom était un mot de plus
                      dans une ligne de métadonnées.

                      CE QU'ELLE COÛTE, dit franchement : 20 px contre les 16 px
                      d'interligne du surtitre, donc +4 px par carte — un pas
                      de la grille, pas un demi. Sur une carte de journée de
                      609 px, c'est 0,7 %, et le pli mesuré ne bouge pas d'un
                      cran. C'est le prix du seul signe qui distingue deux
                      enfants dans le fil.

                      ACHROMATIQUE : les cinq feutres ont déjà pris les
                      couleurs, et une teinte ne peut pas dire deux choses. */}
                  <ChildMark name={entry.child.name} />
                  <span className="text-foreground">{entry.child.name}</span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                </>
              )}
              {/* `gap-1.5` (6 px) : l’écart optique entre un prénom, un point
                  médian et une date, pas un pas de mise en page. */}
              <time dateTime={entry.date} className="text-muted-foreground">
                {label}
              </time>
            </p>
            <p className="surtitre shrink-0 text-muted-foreground">
              {SOURCE_LABELS[entry.source]}
            </p>
          </div>
          <StatusBadge entry={entry} canEdit={canEdit} />
        </div>

        {entry.title && (
          // `text-balance` : un titre de deux lignes se répartit au lieu de
          // laisser un mot seul en seconde ligne.
          <h3 className="font-serif text-title font-semibold text-balance">
            {fr(entry.title)}
          </h3>
        )}

        <GlanceStrip stats={shown} />

        {/* Le récit : la seule chose posée sur les lignes du cahier. Le fond
            réglé déborde jusqu’aux bords de la feuille (marges négatives) pour
            que les lignes traversent la page comme sur un vrai cahier, tandis
            que le texte garde sa mesure de lecture.

            `measure` ne change rien à 390 px — la feuille est plus étroite —
            mais empêche le récit de traverser un écran de bureau. Le dernier
            palier de la colonne (39 rem, au-delà de 1 024 px) vaut exactement
            cette mesure plus les marges : le récit remplit alors la feuille au
            lieu de s’arrêter au milieu (voir `--measure` dans `index.css`).
            `hyphens-auto` + `text-pretty` : à 308 px de colonne, la césure et
            l’équilibrage des dernières lignes sont ce qui reste pour resserrer
            un drapeau que la mesure ne peut pas élargir (mesuré : Nunito est
            déjà la fonte la plus étroite embarquée). Sur un bureau, la colonne
            passe à ~68 ch et la césure n’a presque plus rien à rattraper — elle
            reste, parce qu’une fenêtre peut être étroite à tout moment. */}
        {entry.story && (
          <div className="paper-ruled paper-ruled--plain -mr-5 -ml-7 pr-5 pl-7">
            <p
              id={storyId}
              ref={storyRef}
              className={cn(
                "carnet-story measure hyphens-auto text-pretty",
                !open && "line-clamp-3",
              )}
            >
              {fr(entry.story)}
            </p>
          </div>
        )}

        {entry.status === "processing" && (
          <div>
            {/* L’ATTENTE DIT CE QUI SE PASSE **ET CE QUI ARRIVE ENSUITE**.
                La phrase promettait déjà la première moitié ; la seconde était
                fausse jusqu’ici — le fil ne se rafraîchissait jamais, et la
                carte restait « Lecture en cours » jusqu’à un rechargement à la
                main (mesuré : +1 tap, et un tap qui n’existe même pas dans une
                PWA installée). Le journal sonde maintenant tant qu’une journée
                est en lecture (voir `refreshWhileReading`), donc la promesse est
                tenue et on peut l’écrire. */}
            <p role="status" className="text-ui text-muted-foreground">
              Racontine relit la page et écrit la journée. Cette carte se
              remplira toute seule — vous pouvez fermer l’app.
            </p>
            {/* La forme de la réponse qui arrive : un titre, trois lignes —
                exactement ce que la carte affichera. */}
            <div aria-hidden="true" className="mt-3">
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton mt-4 h-4 w-full" />
              <div className="skeleton mt-3 h-4 w-full" />
              <div className="skeleton mt-3 h-4 w-2/3" />
            </div>
          </div>
        )}

        {entry.highlight && (
          // Marqué comme dans un vrai carnet : un trait groseille en marge du
          // passage. C’est le MÊME jeton que le trait de marge de la feuille
          // (`--rule-margin`), pas le groseille plein de l’action — la règle
          // « une couleur = un sens » tient, et le temps fort cesse d’être un
          // encart gris parmi d’autres.
          <div className="rounded-lg border-l-2 border-l-[var(--rule-margin)] bg-accent px-4 py-3">
            <p className="surtitre flex items-center gap-1.5 text-muted-foreground">
              <Star className="size-3 fill-current" aria-hidden="true" />
              Le temps fort
            </p>
            <p className="mt-1 text-body text-pretty">{fr(entry.highlight)}</p>
          </div>
        )}

        {entry.status === "failed" && entry.failureReason && (
          <div className="flex items-start gap-3 rounded-lg bg-destructive-soft px-4 py-3 text-destructive">
            {/* `mt-0.5` = 2 px : le seul demi-pas de la carte, et c’est un
                centrage optique — une icône de 16 px sur une ligne de 20 px. */}
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <p className="text-ui">{fr(entry.failureReason)}</p>
          </div>
        )}

        {/* Le dépli : la sortie de la coupe du récit ET la liste des moments.
            Il reste un `<details>` natif — clavier, recherche dans la page,
            « ouvrir tout » d’un outil de test — et c’est son basculement qui
            déplie le récit au-dessus. Un seul contrôle, deux effets, un libellé
            qui dit lequel : « Toute la journée » quand le récit est coupé,
            « Le détail du jour » quand il tient déjà. Les trois libellés sont
            COURTS par mesure : à 320 px la ligne dispose de 254 px et doit
            porter le libellé, le compteur (85 px) et le chevron sans passer à
            deux lignes — « Lire la journée entière » faisait 160 px et cassait. */}
        {hasStory ? (
          <details
            className="border-t"
            onToggle={(e) => setOpen(e.currentTarget.open)}
          >
            <summary
              aria-controls={
                entry.items.length > 0 ? `${storyId} ${detailId}` : storyId
              }
              className="flex min-h-11 cursor-pointer list-none items-center gap-3 pt-1 text-ui text-muted-foreground transition-colors dur-fast hover:text-foreground [&::-webkit-details-marker]:hidden"
            >
              <span className="flex-1">
                {open
                  ? "Replier"
                  : clipped
                    ? "Toute la journée"
                    : "Le détail du jour"}
              </span>
              {entry.items.length > 0 && (
                <span className="surtitre" data-tabular>
                  {entry.items.length} moment{entry.items.length > 1 ? "s" : ""}
                </span>
              )}
              {/* La rotation est pilotée par l’ÉTAT, pas par `group-open:` :
                  mesuré dans la feuille compilée, `group-open:rotate-180` ne
                  produit aucune règle CSS ici (Tailwind v4 ne compose pas le
                  variant `open` avec `group-*`), donc le chevron ne tournait
                  jamais — la seule chose qui disait « ouvert » était le
                  libellé. */}
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 transition-transform dur-base ease-carnet",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
            </summary>
            {entry.items.length > 0 ? (
              <ul id={detailId} className="flex flex-col gap-3 pt-1 pb-2">
                {entry.items.map((it) => (
                  <ItemLine key={it.id} item={it} />
                ))}
                {entry.mood && <MoodLine mood={entry.mood} />}
              </ul>
            ) : (
              // Un dépli ne s’ouvre jamais sur rien : quand la page n’a livré
              // qu’un récit, il le dit.
              <p className="pt-1 pb-2 text-meta text-muted-foreground">
                Rien d’autre n’a été noté ce jour-là : la page ne portait que ce
                récit.
              </p>
            )}
          </details>
        ) : (
          entry.items.length > 0 && (
            <ul className="flex flex-col gap-3 border-t pt-4">
              {entry.items.map((it) => (
                <ItemLine key={it.id} item={it} />
              ))}
              {entry.mood && <MoodLine mood={entry.mood} />}
            </ul>
          )
        )}
        {/* Les pages photographiées FERMENT la carte, après le dépli — et
            l’ordre est mesuré, pas esthétique. Le CTA flottant occupe les 104
            derniers pixels de l’écran ; quand la bande de pages était la
            dernière, la ligne de dépli tombait dessous (740 contre 750) et la
            seule sortie de la carte se lisait à travers un dégradé. Renversés,
            c’est le BAS D’UNE IMAGE qui passe sous le fondu — où il n’y a aucun
            texte à voiler — et la sortie reste franche. La logique suit :
            au-dessus la journée recopiée, en dessous la page d’origine. */}
        {entry.attachments.length > 0 && (
          <PageStrip
            pages={entry.attachments}
            dateText={dateText}
            onOpen={(i, from) => onOpenPages(entry, i, from)}
          />
        )}
      </div>

      {action && (
        <div className="border-t px-5 py-3 pl-7">
          <Button
            asChild
            variant={action.quiet ? "ghost" : "secondary"}
            className={cn(
              "w-full",
              // La sortie discrète est au fer à gauche et pousse la flèche au
              // bord : elle se lit comme la dernière ligne de la page, pas comme
              // un second bouton d'appel.
              action.quiet && "justify-between text-muted-foreground",
            )}
          >
            <Link to={`/entries/${entry.id}`}>
              {action.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </article>
  );
}

export function MoodLine({ mood }: { mood: string }) {
  return (
    <li className="flex items-start gap-3 text-ui">
      <span
        aria-hidden="true"
        className="-mt-1 grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
      >
        <Smile className="size-4" />
      </span>
      <span>
        <span className="font-bold">Humeur</span> — {fr(mood)}
      </span>
    </li>
  );
}
