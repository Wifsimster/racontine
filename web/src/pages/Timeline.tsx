import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Camera } from "lucide-react";
import { api } from "@/lib/api";
import { canWrite, roleMap } from "@/lib/access";
import { useBilling } from "@/lib/billing";
import { BillingCallout } from "@/features/billing/parts";
import { type AttachmentRef, type Entry, type MemberRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EntryCard } from "@/features/journal/EntryCard";
import { PageViewer } from "@/features/journal/pages";
import {
  JournalEmpty,
  JournalError,
  JournalSkeleton,
  Receipt,
  readFlash,
  type Flash,
} from "@/features/journal/states";
import { monthYear } from "@/lib/format";

/* ===========================================================================
   LE JOURNAL — l’écran qu’on ouvre chaque soir.

   Il doit se lire à DEUX VITESSES, et la carte est dessinée pour ça :

     1. en deux secondes, sans lire  : le prénom, le jour, le titre, puis la
        BANDE DE FEUTRES — trois pastilles chiffrées (a-t-il mangé, a-t-il
        dormi, comment était-il) dans les couleurs du carnet. C’est de
        l’information, pas de la décoration : la même teinte veut dire la même
        chose ici, dans le détail replié et sur l’écran de relecture.
     2. quand on ralentit : le récit, posé sur les lignes du cahier, le temps
        fort, les pages photographiées, puis le détail des moments.

   Trois décisions de fond, prises contre les versions précédentes :

   · LE RÉCIT NE PREND PLUS TOUTE LA CARTE. Dans le fil, il est coupé à TROIS
     lignes du cahier (3 × 28 = 84 px, un compte entier d’interlignes) : la
     carte passe de 803 à 609 px, le premier écran porte enfin une journée
     complète — jour, titre, feutres, récit, temps fort, sortie, pages — et
     montre 34 px de la journée suivante. La coupe se déplie sur place.

   · LA RÉGLURE NE PORTE QUE LE RÉCIT. Avant, tout le carton était réglé : les
     lignes du cahier (pas de 28 px) traversaient le titre en 22/20 et
     passaient derrière les photos et les encarts, ce qui donnait un fond de
     papier accidenté. Désormais le trait de marge groseille court sur toute la
     feuille (c’est lui qui dit « carnet »), mais les lignes ne sont dessinées
     que derrière le texte transcrit — celui qui est en 17/28, donc exactement
     sur les lignes. La réglure devient un signe : ici, c’est la page recopiée.
   · LA CARTE N’EST PLUS UN LIEN GÉANT. Une journée à relire portait un `<a>`
     autour de tout, y compris autour du `<summary>` et des photos (interactif
     dans de l’interactif). L’action est maintenant une ligne de pied de carte
     de 44 px, ce qui rend aussi le clavier lisible.

   Les trois états sont dessinés (I7) : squelette à la FORME de la réponse,
   vide qui montre ce que l’app fabrique, erreur qui nomme la cause, le remède
   et deux sorties — plus jamais « Le journal est encore vide » quand c’est le
   serveur qui est tombé.
   =========================================================================== */


/**
 * L’humeur en un mot pour la bande de feutres — « joyeuse et très bavarde »
 * devient « joyeuse », la phrase entière restant dans le détail et pour les
 * lecteurs d’écran. Trois règles :
 *   · la coupe est explicite (« … » écrit dans le texte) et jamais faite en
 *     CSS : un `truncate` produit un nœud de texte rogné, que l’audit compte
 *     comme un défaut — et à juste titre, on ne peut plus le lire ;
 *   · on ne coupe JAMAIS au milieu d’un mot (« extraordinaireme… ») ;
 *   · si le premier mot ne tient pas à lui seul, la pastille disparaît : une
 *     humeur de quarante caractères ne se lit pas en deux secondes, sa place
 *     est dans le détail.
 */

/* --------------------------------------------------------------------------
   Les pages du carnet : la photo est un souvenir, pas une pièce jointe.
   Ratio déclaré, rayon accordé à la carte, liseré de 1 px pour qu’une page
   crème garde son bord sur du papier crème — et jamais d’ombre portée sur une
   image (l’ombre appartient à la carte).
   -------------------------------------------------------------------------- */


/* --------------------------------------------------------------------------
   La carte d’une journée.
   -------------------------------------------------------------------------- */

/** Lectures encore douteuses d’une journée : ce qui reste à corriger. */

/* --------------------------------------------------------------------------
   Les trois états : chargement, vide, erreur.
   -------------------------------------------------------------------------- */

/**
 * Squelette : la forme exacte d’une journée, pas une roue qui tourne.
 *
 * Deux choses ont changé après mesure :
 *   · il ne fabrique plus un faux bandeau — le vrai est au-dessus, il est
 *     toujours là, et un squelette ne doit jamais mimer ce qui existe déjà ;
 *   · à la place du faux bandeau de mois, la LIGNE D’ÉTAT, au même endroit et
 *     au même cran (surtitre) que le mois qui viendra s’y écrire : le
 *     chargement dit ce qu’il fait, et au bout de trois secondes il dit qu’il
 *     est long — c’est la seule chose honnête à annoncer quand on ne connaît ni
 *     total ni progression (on ne chiffre pas ce qu’on ne sait pas).
 *   · le récit fantôme fait TROIS lignes, comme la carte réelle : avant il en
 *     annonçait quatre pour dix, donc la page sautait à l’arrivée des données.
 */

/* -------------------------------------------------------------------------- */

type Viewer = { pages: AttachmentRef[]; index: number; date: string };

export default function Timeline() {
  const location = useLocation();
  /* L'ABONNEMENT SUR L'ACCUEIL. Il ne conditionne PAS l'affichage du journal :
     `billing` peut rester null (requête en vol, ou tombée) et le carnet
     s'affiche quand même. Le serveur refuse pour de bon s'il le faut — un
     écran ne ferme jamais un carnet à la place du serveur. */
  const { billing } = useBilling();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [viewer, setViewer] = useState<Viewer | null>(null);
  /* ── LE RÔLE, PAR ENFANT ──────────────────────────────────────────────────
     `null` = « on ne sait pas encore » (ou `/api/children` a échoué), et ce
     troisième état est le point important : il ne se lit pas comme « lecteur »
     partout.
       · pour la PORTE de correction d’une carte → on ne dessine rien. Un
         contributeur retrouve sa journée 200 ms plus tard ; un lecteur, lui, ne
         doit jamais voir la porte, même une frame.
       · pour l’APPEL à photographier → on le laisse. L’écran de capture porte
         désormais le même garde-fou et sait, lui, l’expliquer ; le supprimer
         par prudence retirerait le geste central du produit à un parent dont la
         seule requête ayant échoué est la liste des enfants. */
  const [roleByChild, setRoleByChild] = useState<Map<string, MemberRole> | null>(
    null,
  );
  const openerRef = useRef<HTMLElement | null>(null);
  /* Le reçu laissé par l’écran d’où l’on vient (publication, adhésion). Lu UNE
     fois, à l’initialisation : ensuite l’état d’historique est effacé, sinon un
     rechargement rejouerait « Journée publiée » indéfiniment. */
  const [flash, setFlash] = useState<Flash | null>(() =>
    readFlash(location.state),
  );
  useEffect(() => {
    if (!location.state) return;
    // `usr` est la case où react-router range l’état utilisateur ; on la vide
    // sans toucher à sa clé d’index, pour ne pas casser l’historique.
    const h = window.history.state as Record<string, unknown> | null;
    window.history.replaceState({ ...(h ?? {}), usr: null }, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (offset: number) => {
    const res = await api.timeline({ offset, limit: 20 });
    setEntries((prev) => {
      if (offset === 0) return res.entries;
      // Pagination par offset : si une entrée a été publiée entre deux
      // chargements, la fenêtre glisse et peut renvoyer une entrée déjà
      // affichée. On dédoublonne par id pour éviter cartes en double et clés
      // React dupliquées.
      const seen = new Set(prev.map((e) => e.id));
      return [...prev, ...res.entries.filter((e) => !seen.has(e.id))];
    });
    setNextOffset(res.nextOffset);
  }, []);

  const reload = useCallback(async () => {
    setPhase((p) => (p === "error" ? "loading" : p));
    try {
      /* Les deux requêtes partent ENSEMBLE (pas l’une après l’autre : ce serait
         deux allers-retours avant le premier pixel), et le fil n’attend pas les
         rôles pour s’afficher — mais les rôles, eux, arrivent presque toujours
         avant, la réponse étant une poignée de lignes. Un échec sur
         `/api/children` ne casse PAS le journal : on garde `null`, cf. ci-dessus. */
      void api.listChildren().then(
        (list) => setRoleByChild(roleMap(list)),
        () => setRoleByChild(null),
      );
      await load(0);
      setPhase("ready");
    } catch (e) {
      // L’erreur est CONSERVÉE : elle est la cause qu’on affichera.
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("error");
    }
  }, [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* ── LE FIL SUIT LA LECTURE EN COURS ──────────────────────────────────────
     L’écran d’attente de la relecture propose « Revenir au journal » — et c’est
     la bonne offre : une lecture peut prendre trente secondes, personne ne doit
     rester à regarder une barre. Sauf que le journal, lui, ne sondait rien : la
     carte restait « Lecture en cours » pour toujours. Mesuré : la seule sortie
     était de recharger la page (+1 tap, et un geste qui n’existe pas dans une
     PWA installée en plein écran).
     On sonde donc tant qu’une journée est en lecture, et seulement à ce
     moment-là : pas de trafic quand il n’y a rien à attendre.
       · 4 s : plus lent que les 2,5 s de la relecture (qui, elle, regarde UNE
         journée), assez rapide pour qu’on ne se demande pas si c’est bloqué ;
       · onglet caché → on ne demande rien, mais on repart au retour ;
       · échec réseau → SILENCE : le fil affiché reste vrai, et faire surgir une
         erreur pendant un sondage de fond punirait l’utilisateur d’avoir
         attendu. La panne se dira au prochain geste explicite.
     La fusion préserve la pagination : `load(0)` remplace la liste entière et
     ferait disparaître les « journées précédentes » déjà chargées. */
  const refreshWhileReading = useCallback(async () => {
    const res = await api.timeline({ offset: 0, limit: 20 });
    setEntries((prev) => {
      const fresh = new Map(res.entries.map((e) => [e.id, e]));
      const merged = prev.map((e) => fresh.get(e.id) ?? e);
      const known = new Set(prev.map((e) => e.id));
      const added = res.entries.filter((e) => !known.has(e.id));
      return added.length ? [...added, ...merged] : merged;
    });
  }, []);

  const reading = entries.some((e) => e.status === "processing");

  useEffect(() => {
    if (phase !== "ready" || !reading) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (!document.hidden) {
        try {
          await refreshWhileReading();
        } catch {
          /* silencieux, cf. la note ci-dessus */
        }
      }
      if (alive) timer = setTimeout(tick, 4000);
    };
    timer = setTimeout(tick, 4000);
    const wake = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [phase, reading, refreshWhileReading]);

  async function loadMore(offset: number) {
    setMore(true);
    setMoreError("");
    try {
      await load(offset);
    } catch (e) {
      setMoreError(
        e instanceof Error
          ? e.message
          : "Les journées précédentes n’ont pas pu être chargées.",
      );
    } finally {
      setMore(false);
    }
  }

  function openPages(entry: Entry, index: number, from: HTMLElement) {
    openerRef.current = from;
    setViewer({ pages: entry.attachments, index, date: entry.date });
  }

  function closeViewer() {
    setViewer(null);
    openerRef.current?.focus();
    openerRef.current = null;
  }

  /** Les journées regroupées par mois : la colonne vertébrale des dates. */
  const months = useMemo(() => {
    const groups: { key: string; label: string; entries: Entry[] }[] = [];
    for (const e of entries) {
      const key = e.date.slice(0, 7);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.entries.push(e);
      else
        groups.push({
          key,
          label: monthYear(e.date),
          entries: [e],
        });
    }
    return groups;
  }, [entries]);

  const hasJournal = phase === "ready" && entries.length > 0;

  /** Tient-on au moins un carnet ? Rôle inconnu → oui, cf. `roleByChild`. */
  const canCapture =
    roleByChild === null ||
    [...roleByChild.values()].some((r) => canWrite(r)) ||
    roleByChild.size === 0;

  /* Le carnet accepte-t-il une NOUVELLE journée ? Inconnu (`billing` null, ou
     requête tombée) = OUI : comme pour le rôle, on n'enlève pas le geste
     central du produit à quelqu'un dont la seule requête ayant échoué est
     celle de l'abonnement. */
  const carnetOuvert = billing?.access.open !== false;

  /* À QUI L'ON PARLE D'ARGENT. Plus strict que `canCapture`, et c'est
     délibéré : tant que les rôles ne sont pas revenus, on ne montre RIEN. Un
     appel à s'abonner qui clignote une frame devant une mamie venue lire le
     journal de sa petite-fille est exactement ce qu'on ne veut pas — alors
     qu'un parent, lui, verra l'appel 200 ms plus tard sans rien perdre. */
  const sellable =
    roleByChild !== null &&
    (roleByChild.size === 0 ||
      [...roleByChild.values()].some((r) => canWrite(r)));

  return (
    <div className="shell-width flex flex-col gap-4 px-4 pt-4 pb-8">
      {/* Le bandeau : la coquille porte le nom de l’INSTANCE, cette ligne porte
          le nom de l’ÉCRAN, au seul cran 30/36 de la page.

          DEUX CORRECTIONS, toutes deux mesurées :

          · PLUS DE SOUS-TITRE. « Louise et Gaspard » redisait le « LOUISE · »
            que porte déjà le surtitre de chaque carte, et c’était le seul nœud
            en 15/20 d’un bloc de 60 px. Sans lui, le bandeau fait 36 px et le
            chrome au-dessus de la première carte tombe de 209 à 185 px, soit
            21,9 % de l’écran — sous le plafond de 22 %.
          · IL NE DISPARAÎT PLUS. Il était conditionné à `hasJournal` : l’écran
            perdait son titre exactement dans les trois moments où l’on est le
            plus perdu (chargement, vide, erreur), et la page passait de 6 à 4
            crans typographiques. Le titre d’un écran ne dépend pas de ses
            données. */}
      <header>
        <h1 className="font-serif text-display font-semibold">Le journal</h1>
      </header>

      {/* Le reçu est SOUS le titre et AU-DESSUS du fil : c’est la première chose
          qu’on lit en arrivant, et il ne recouvre rien. Il s’affiche même quand
          le journal charge encore — la confirmation ne dépend pas du réseau. */}
      {flash && <Receipt flash={flash} onClose={() => setFlash(null)} />}

      {/* L'APPEL. Il est SOUS le titre et AU-DESSUS du fil, à l'endroit exact
          où l'œil arrive — jamais en pop-up, jamais par-dessus une journée.
          Il ne s'affiche pas du tout pour un foyer abonné ni sur une instance
          auto-hébergée : une app payée ne continue pas à se vendre. Et il ne
          s'affiche pas à un LECTEUR : mamie n'a rien à acheter, elle vient
          lire — `canCapture` est ce qui distingue les deux. */}
      {billing && sellable && <BillingCallout billing={billing} />}

      {phase === "loading" && <JournalSkeleton />}

      {phase === "error" && (
        <JournalError
          message={error}
          canCapture={canCapture}
          onRetry={reload}
        />
      )}

      {phase === "ready" && entries.length === 0 && (
        <JournalEmpty canCapture={canCapture} />
      )}

      {/* Les mois ne s’affichent QUE dans l’état prêt : une nouvelle tentative
          qui échoue ne doit pas laisser un journal périmé sous le message
          d’erreur. */}
      {phase === "ready" &&
        months.map((m) => (
          <section key={m.key} aria-labelledby={`mois-${m.key}`}>
            {/* Le bandeau de mois reste collé sous l’en-tête : où qu’on soit dans
              le défilement, on sait quel mois on lit. */}
            <div className="sticky top-header z-10 -mx-4 bg-surface-bar px-4 backdrop-blur-md">
              <div className="flex h-11 items-end justify-between gap-3 border-b pb-2">
                <h2
                  id={`mois-${m.key}`}
                  className="surtitre text-muted-foreground"
                >
                  {m.label}
                </h2>
                <p className="surtitre text-muted-foreground" data-tabular>
                  {m.entries.length} journée{m.entries.length > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <ol className="mt-4 flex flex-col gap-4">
              {m.entries.map((e) => (
                <li key={e.id}>
                  <EntryCard
                    entry={e}
                    canEdit={canWrite(roleByChild?.get(e.childId))}
                    onOpenPages={openPages}
                  />
                </li>
              ))}
            </ol>
          </section>
        ))}

      {moreError && (
        <p className="rounded-lg bg-destructive-soft px-4 py-3 text-meta text-destructive">
          {moreError}
        </p>
      )}

      {hasJournal && nextOffset !== null && (
        <Button
          variant="outline"
          loading={more}
          onClick={() => loadMore(nextOffset)}
        >
          Voir les journées précédentes
        </Button>
      )}

      {/* Le carnet ne s’arrête pas net : il s’efface. */}
      {hasJournal && (
        /* `pb-32` réserve la place du bouton flottant. Sans bouton (lecteur), la
           réserve deviendrait 128 px de papier vide sous la dernière ligne. */
        <p
          className={cn(
            "surtitre pt-2 text-center text-muted-foreground",
            canCapture && carnetOuvert ? "pb-32" : "pb-2",
          )}
        >
          {entries.length} journée{entries.length > 1 ? "s" : ""} dans le carnet
        </p>
      )}

      {/* CTA flottant sur un fondu vers le papier : le contenu s’efface
          doucement dessous au lieu de buter contre le bouton. Il ne s’affiche
          qu’avec un journal : dans le vide et dans l’erreur, l’action est déjà
          au centre de l’écran, et deux boutons primaires n’en font aucun.
          ET il ne s’affiche pas pour un LECTEUR : le seul bouton groseille de
          l’écran ne peut pas être celui d’un écran qui la refuse. */}
      {/* Le bouton flottant disparaît quand le carnet est fermé à l'écriture :
          un bouton groseille qui mène à un refus est une promesse rompue, et
          l'appel ci-dessus porte déjà la seule action possible. */}
      {hasJournal && canCapture && carnetOuvert && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-background via-surface-bar to-transparent px-4 pt-8 pb-safe-6">
          <Button
            asChild
            size="lg"
            className="action-width pointer-events-auto shadow-lift"
          >
            <Link to="/capture">
              <Camera aria-hidden="true" />
              Photographier le carnet
            </Link>
          </Button>
        </div>
      )}

      {viewer && (
        <PageViewer
          pages={viewer.pages}
          index={viewer.index}
          date={viewer.date}
          onIndex={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}
