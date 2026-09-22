import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Camera } from "lucide-react";
import { api } from "@/lib/api";
import { canWrite, roleMap } from "@/lib/access";
import { useBilling } from "@/lib/billing";
import { BillingCallout } from "@/features/billing/parts";
import {
  type AttachmentRef,
  type Child,
  type Entry,
  type JournalMonth,
  type MemberRole,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EntryCard } from "@/features/journal/EntryCard";
import { EntryRow } from "@/features/journal/EntryRow";
import {
  ChildFilter,
  ModeToggle,
  MonthJump,
  MonthJumpVeil,
} from "@/features/journal/browse";
import { PageViewer } from "@/features/journal/pages";
import {
  JournalEmpty,
  JournalError,
  JournalFiltered,
  JournalSkeleton,
  Receipt,
  readFlash,
  type Flash,
} from "@/features/journal/states";
import { capitalize, lastDayOfMonth, monthYear } from "@/lib/format";
import {
  enfantMemorise,
  filMemorise,
  memoriserEnfant,
  memoriserFil,
  memoriserMode,
  modeMemorise,
  oublierFil,
  type JournalMode,
} from "@/lib/journal-view";
import { useDefilementDescendant } from "@/lib/scroll";

/** Journées par page. Vingt cartes = 12,6 écrans : c'est déjà beaucoup. */
const PAGE = 20;

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

  /* ── LE CADRAGE : quel carnet, depuis quel mois ────────────────────────────
     Les deux se mémorisent, mais pas de la même façon et c'est voulu : le
     CARNET est une habitude de lecture (elle survit à la fermeture de l'app),
     le MOIS est un geste de recherche (il meurt avec l'écran — personne ne veut
     rouvrir son journal en mars 2026 le lendemain soir). */
  const [childId, setChildId] = useState<string | null>(() => enfantMemorise());
  const [from, setFrom] = useState<string | null>(null);
  const [mode, setMode] = useState<JournalMode>(() => modeMemorise());
  const [children, setChildren] = useState<Child[]>([]);
  const [months, setMonths] = useState<JournalMonth[]>([]);
  const [moisOuvert, setMoisOuvert] = useState<string | null>(null);

  /* Le fil déjà chargé, repris à l'identique quand on revient d'une journée.
     Lu UNE fois, au premier rendu : la page a sa hauteur d'avant dès la
     première frame, ce sans quoi `<ScrollRestoration>` (App.tsx) rendrait la
     position à une page trop courte, qui se recalerait aussitôt en haut. */
  const [repris] = useState(() => filMemorise(enfantMemorise()));
  const [entries, setEntries] = useState<Entry[]>(repris?.entries ?? []);
  const [cursor, setCursor] = useState<string | null>(repris?.nextCursor ?? null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(
    repris ? "ready" : "loading",
  );
  const [error, setError] = useState<string>("");
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [viewer, setViewer] = useState<Viewer | null>(null);
  /* ── LE RÔLE, PAR ENFANT ──────────────────────────────────────────────────
     `null` = « on ne sait pas encore » (ou `/api/children` a échoué), et ce
     troisième état est le point important : il ne se lit pas comme « lecteur »
     partout.
       · pour la PORTE de correction d'une carte → on ne dessine rien. Un
         contributeur retrouve sa journée 200 ms plus tard ; un lecteur, lui, ne
         doit jamais voir la porte, même une frame.
       · pour l'APPEL à photographier → on le laisse. L'écran de capture porte
         désormais le même garde-fou et sait, lui, l'expliquer ; le supprimer
         par prudence retirerait le geste central du produit à un parent dont la
         seule requête ayant échoué est la liste des enfants. */
  const [roleByChild, setRoleByChild] = useState<Map<string, MemberRole> | null>(
    null,
  );
  const openerRef = useRef<HTMLElement | null>(null);
  /* Le reçu laissé par l'écran d'où l'on vient (publication, adhésion). Lu UNE
     fois, à l'initialisation : ensuite l'état d'historique est effacé, sinon un
     rechargement rejouerait « Journée publiée » indéfiniment. */
  const [flash, setFlash] = useState<Flash | null>(() => {
    const recu = readFlash(location.state);
    // On revient d'une publication : le fil gardé en mémoire précède ce qu'on
    // vient d'écrire, donc il ment. On le jette avant même le premier rendu.
    if (recu) oublierFil();
    return recu;
  });
  useEffect(() => {
    if (!location.state) return;
    // `usr` est la case où react-router range l'état utilisateur ; on la vide
    // sans toucher à sa clé d'index, pour ne pas casser l'historique.
    const h = window.history.state as Record<string, unknown> | null;
    window.history.replaceState({ ...(h ?? {}), usr: null }, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Les enfants (et le rôle sur chacun) : une poignée de lignes, demandée une
     seule fois. Le fil ne l'attend pas — cf. `roleByChild`. */
  useEffect(() => {
    void api.listChildren().then(
      (list) => {
        setChildren(list);
        setRoleByChild(roleMap(list));
      },
      () => setRoleByChild(null),
    );
  }, []);

  /* La table des matières. Elle suit le carnet choisi : les mois d'Anouk ne
     sont pas ceux de Lou. Un échec est silencieux — sans index, le journal se
     déroule comme avant, il ne tombe pas. */
  useEffect(() => {
    let ignore = false;
    void api.timelineMonths(childId).then(
      (res) => !ignore && setMonths(res.months),
      () => !ignore && setMonths([]),
    );
    return () => {
      ignore = true;
    };
  }, [childId]);

  /* LE CADRAGE COURANT, numéroté. Chaque changement de carnet ou de mois (et
     chaque rechargement) en ouvre un nouveau ; une réponse partie sous un
     ancien cadrage est jetée à l'arrivée. Sans ce numéro, passer d'Anouk à Lou
     pendant que la page d'Anouk chargeait affichait — puis mémorisait — les
     journées d'Anouk sous le nom de Lou, si sa réponse arrivait en dernier. */
  const cadrage = useRef(0);

  /** La première page d'un cadrage donné. */
  const ouvrir = useCallback(
    async (child: string | null, depuis: string | null) => {
      const mine = cadrage.current;
      const res = await api.timeline({
        childId: child,
        from: depuis,
        limit: PAGE,
      });
      if (mine !== cadrage.current) return;
      setEntries(res.entries);
      setCursor(res.nextCursor);
      setPhase("ready");
    },
    [],
  );

  /**
   * Le fil, RAFRAÎCHI SANS SE PERDRE : la première page revient, les journées
   * connues sont mises à jour sur place, les nouvelles se posent en tête, et
   * tout ce qu'on avait déjà déroulé reste. C'est ce qui permet à la fois de
   * suivre une lecture en cours et de reprendre où l'on était sans que la page
   * ne rétrécisse sous le doigt.
   */
  const rafraichir = useCallback(async () => {
    const mine = cadrage.current;
    const res = await api.timeline({ childId, from, limit: PAGE });
    if (mine !== cadrage.current) return;
    setEntries((prev) => {
      if (!prev.length) {
        setCursor(res.nextCursor);
        return res.entries;
      }
      const fresh = new Map(res.entries.map((e) => [e.id, e]));
      const merged = prev.map((e) => fresh.get(e.id) ?? e);
      const known = new Set(prev.map((e) => e.id));
      const added = res.entries.filter((e) => !known.has(e.id));
      return added.length ? [...added, ...merged] : merged;
    });
  }, [childId, from]);

  /* ── CE QUI DÉCLENCHE UNE NOUVELLE PREMIÈRE PAGE ──────────────────────────
     Changer de carnet ou sauter à un mois. Si l'on a déjà ce cadrage en
     mémoire, on le REMONTRE tout de suite et on le rafraîchit derrière : au
     retour d'une journée, l'écran ne clignote pas et ne perd pas sa place. */
  useEffect(() => {
    cadrage.current += 1;
    const cache = filMemorise(childId);

    /* Ce cadrage est déjà en mémoire : on le REMONTRE tel quel — toutes les
       pages déjà déroulées comprises — puis on le rafraîchit derrière. Cet
       effet est volontairement IDEMPOTENT : rejoué (React en mode strict le
       fait deux fois au montage), il retombe sur la même branche. Une version
       antérieure gardait un drapeau « premier montage » et repassait donc par
       le chargement neuf au second appel : le fil rendait ses vingt premières
       journées et perdait les suivantes, exactement le bug qu'on corrige. */
    if (cache && cache.from === from && cache.entries.length > 0) {
      setEntries(cache.entries);
      setCursor(cache.nextCursor);
      setPhase("ready");
      // Silencieux : une panne de réseau ne doit pas effacer un fil valide.
      void rafraichir().catch(() => {});
      return;
    }

    let ignore = false;
    setEntries([]);
    setCursor(null);
    setPhase("loading");
    setMoreError("");
    ouvrir(childId, from).catch((e) => {
      if (ignore) return;
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("error");
    });
    return () => {
      ignore = true;
    };
  }, [childId, from, ouvrir, rafraichir]);

  /* Ce qui est à l'écran est ce qu'on retrouvera en revenant. Écrit à chaque
     changement du fil, jamais lu ailleurs qu'au montage. */
  useEffect(() => {
    if (phase !== "ready") return;
    memoriserFil(childId, { entries, nextCursor: cursor, from });
  }, [phase, childId, entries, cursor, from]);

  const reload = useCallback(() => {
    cadrage.current += 1;
    setError("");
    setPhase("loading");
    setEntries([]);
    setCursor(null);
    oublierFil();
    ouvrir(childId, from).catch((e) => {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("error");
    });
  }, [childId, from, ouvrir]);

  /* ── LE FIL SUIT LA LECTURE EN COURS ──────────────────────────────────────
     L'écran d'attente de la relecture propose « Revenir au journal » — et c'est
     la bonne offre : une lecture peut prendre trente secondes, personne ne doit
     rester à regarder une barre. Sauf que le journal, lui, ne sondait rien : la
     carte restait « Lecture en cours » pour toujours.
       · 4 s : plus lent que les 2,5 s de la relecture (qui, elle, regarde UNE
         journée), assez rapide pour qu'on ne se demande pas si c'est bloqué ;
       · onglet caché → on ne demande rien, mais on repart au retour ;
       · échec réseau → SILENCE : le fil affiché reste vrai, et faire surgir une
         erreur pendant un sondage de fond punirait l'utilisateur d'avoir
         attendu. La panne se dira au prochain geste explicite. */
  const reading = entries.some((e) => e.status === "processing");

  useEffect(() => {
    if (phase !== "ready" || !reading) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (!document.hidden) {
        try {
          await rafraichir();
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
  }, [phase, reading, rafraichir]);

  /**
   * La suite du fil. Le curseur est l'ancre de la dernière journée rendue :
   * publier pendant qu'on lit ne décale plus rien.
   *
   * Un garde-fou : si une page n'apporte AUCUNE journée nouvelle (l'ancre a
   * disparu, le serveur a resservi le début), on arrête là plutôt que de
   * tourner en rond sur la même page.
   */
  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const mine = cadrage.current;
    setMore(true);
    setMoreError("");
    try {
      const res = await api.timeline({ childId, from, cursor, limit: PAGE });
      if (mine !== cadrage.current) return;
      let ajoutees = 0;
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const nouvelles = res.entries.filter((e) => !seen.has(e.id));
        ajoutees = nouvelles.length;
        return nouvelles.length ? [...prev, ...nouvelles] : prev;
      });
      setCursor(ajoutees === 0 ? null : res.nextCursor);
    } catch (e) {
      if (mine !== cadrage.current) return;
      setMoreError(
        e instanceof Error
          ? e.message
          : "Les journées précédentes n'ont pas pu être chargées.",
      );
    } finally {
      setMore(false);
    }
  }, [childId, from, cursor]);

  /* LA SUITE ARRIVE AVANT LE BAS. Le bouton reste — il est la sortie au
     clavier, et le filet quand l'observation échoue — mais on ne devrait
     presque jamais avoir à l'atteindre : 600 px avant la fin du fil, la page
     suivante part toute seule. */
  const sentinelle = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelle.current;
    if (!el || !cursor || more || phase !== "ready") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, more, phase, loadMore]);

  /** Changer de carnet : on repart du présent, en haut. */
  function choisirEnfant(id: string | null) {
    if (id === childId) return;
    memoriserEnfant(id);
    setChildId(id);
    setFrom(null);
    setMoisOuvert(null);
    window.scrollTo({ top: 0 });
  }

  function choisirMode(m: JournalMode) {
    memoriserMode(m);
    setMode(m);
  }

  /** Sauter à un mois (ou revenir au présent avec `null`). */
  function sauterAuMois(month: string | null) {
    setMoisOuvert(null);
    setFrom(month ? lastDayOfMonth(month) : null);
    window.scrollTo({ top: 0 });
  }

  function openPages(entry: Entry, index: number, depuis: HTMLElement) {
    openerRef.current = depuis;
    setViewer({ pages: entry.attachments, index, date: entry.date });
  }

  function closeViewer() {
    setViewer(null);
    openerRef.current?.focus();
    openerRef.current = null;
  }

  /** Les journées regroupées par mois : la colonne vertébrale des dates. */
  const groupes = useMemo(() => {
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

  /** Le mois d'où l'on est reparti, s'il y a eu un saut. */
  const moisActif = from ? from.slice(0, 7) : null;

  /**
   * Le cadrage en toutes lettres, ou null quand on regarde tout le carnet.
   * Il sert à deux choses et à rien d'autre : nommer le vide, et dire ce que
   * « revoir tout le carnet » va défaire.
   */
  const cadre = (() => {
    const enfant = childId
      ? (children.find((c) => c.id === childId)?.name ?? null)
      : null;
    const mois = moisActif ? capitalize(monthYear(`${moisActif}-01`)) : null;
    if (enfant && mois) return `${enfant}, ${mois.toLowerCase()}`;
    if (enfant) return `le carnet de ${enfant}`;
    if (mois) return mois.toLowerCase();
    return null;
  })();

  function toutRevoir() {
    choisirEnfant(null);
    setFrom(null);
  }

  /* Le bouton flottant s'efface au défilement descendant : voir `lib/scroll.ts`
     et le commentaire de son rendu, plus bas. */
  const descend = useDefilementDescendant();

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

      {/* LES COMMANDES DU FIL — une seule ligne, et seulement ce qui sert.
          Le choix du carnet n'apparaît qu'à partir de deux enfants (un foyer
          d'un enfant n'a rien à filtrer) ; « parcourir » n'apparaît que s'il y
          a quelque chose à parcourir. Le saut de mois, lui, est porté par le
          bandeau de mois plus bas : c'est là qu'on se demande où l'on est. */}
      {phase === "ready" && (children.length > 1 || hasJournal) && (
        <div className="flex items-center justify-between gap-3">
          <ChildFilter
            children={children}
            value={childId}
            onChange={choisirEnfant}
          />
          {hasJournal && (
            <div className="shrink-0">
              <ModeToggle value={mode} onChange={choisirMode} />
            </div>
          )}
        </div>
      )}

      {phase === "loading" && <JournalSkeleton />}

      {phase === "error" && (
        <JournalError
          message={error}
          canCapture={canCapture}
          onRetry={reload}
        />
      )}

      {/* `carnetOuvert` autant que `canCapture` : le vide propose la photo
          seulement quand elle est encore possible — sinon il propose ce qui la
          rend possible. La carte d'appel au-dessus dit déjà ce qui s'arrête et
          ce qui continue. */}
      {phase === "ready" && entries.length === 0 && !cadre && (
        <JournalEmpty canCapture={canCapture} carnetOuvert={carnetOuvert} />
      )}

      {/* Un cadrage sans réponse n'est pas un carnet vide : on ne revend pas la
          première photo à quelqu'un qui vient de filtrer sur mars. */}
      {phase === "ready" && entries.length === 0 && cadre && (
        <JournalFiltered label={cadre} onReset={toutRevoir} />
      )}

      {/* Les mois ne s’affichent QUE dans l’état prêt : une nouvelle tentative
          qui échoue ne doit pas laisser un journal périmé sous le message
          d’erreur. */}
      {phase === "ready" &&
        groupes.map((m) => (
          <section key={m.key} aria-label={m.label}>
            {/* Le bandeau de mois reste collé sous l’en-tête : où qu’on soit dans
                le défilement, on sait quel mois on lit — ET on peut en changer.
                Il était jusqu’ici un panneau indicateur : atteindre la rentrée
                de l’an dernier se payait en une douzaine d’appuis sur « voir les
                journées précédentes ». C’est devenu une porte.

                Le rang du bandeau MONTE quand son panneau est ouvert : posé en
                `z-10`, il crée son propre plan, et la liste des mois passait
                alors sous le bouton flottant (`z-20`). */}
            <div
              className={cn(
                "sticky top-header -mx-4 bg-surface-bar px-4 backdrop-blur-md",
                moisOuvert === m.key ? "z-40" : "z-10",
              )}
            >
              <div className="relative flex h-11 items-stretch justify-between gap-3 border-b">
                <MonthJump
                  id={`mois-${m.key}`}
                  months={months}
                  current={m.key}
                  active={moisActif}
                  open={moisOuvert === m.key}
                  onOpen={() => setMoisOuvert(m.key)}
                  onClose={() => setMoisOuvert(null)}
                  onJump={sauterAuMois}
                />
                <p
                  className="surtitre self-end pb-2 text-muted-foreground"
                  data-tabular
                >
                  {m.entries.length} journée{m.entries.length > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            {/* Deux densités, un seul fil : la carte pour lire hier, la ligne
                pour retrouver un jour de juillet. */}
            <ol
              className={cn(
                "mt-4 flex flex-col",
                mode === "lire" ? "gap-4" : "gap-1.5",
              )}
            >
              {m.entries.map((e) => (
                <li key={e.id}>
                  {mode === "lire" ? (
                    <EntryCard
                      entry={e}
                      canEdit={canWrite(roleByChild?.get(e.childId))}
                      onOpenPages={openPages}
                    />
                  ) : (
                    <EntryRow entry={e} />
                  )}
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

      {hasJournal && cursor !== null && (
        <>
          {/* La sentinelle : invisible, elle demande la suite 600 px avant que
              l’on n’atteigne le bas. Le bouton reste pour le clavier et pour le
              jour où l’observation ne se déclenche pas. */}
          <div ref={sentinelle} aria-hidden="true" className="h-px" />
          <Button variant="outline" loading={more} onClick={() => void loadMore()}>
            Voir les journées précédentes
          </Button>
        </>
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
        /* IL S’EFFACE QUAND ON DESCEND. Mesuré : ce bouton occupe en
           permanence les 104 derniers pixels de l’écran — 12 % d’un téléphone,
           posés sur la journée suivante. Il glisse donc hors champ dès qu’on
           déroule le carnet (on lit, on ne photographie pas) et revient au
           premier pouce vers le haut, qui est justement le geste de qui cherche
           une action. Il revient aussi au FOCUS clavier (`focus-within`) :
           sorti de l’écran, il reste atteignable à la tabulation. */
        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-background via-surface-bar to-transparent px-4 pt-8 pb-safe-6",
            "transition-transform dur-slow ease-page focus-within:translate-y-0",
            descend && "translate-y-[130%]",
          )}
        >
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

      {moisOuvert && <MonthJumpVeil onClose={() => setMoisOuvert(null)} />}

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
