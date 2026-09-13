import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import {
  BookOpenText,
  Check,
  ChevronDown,
  FileText,
  Images,
  Send,
  Star,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { canWrite } from "@/lib/access";
import { preloadImage } from "@/lib/image";
import {
  type EntrySource,
  type Uncertainty,
  type UncertaintyField,
  SOURCE_LABELS,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useReviewEntry } from "@/features/review/useReviewEntry";
import { capitalize, longDate } from "@/lib/format";
import { phraseAround, wordMatcher } from "@/lib/reading-text";
import { normalizeUncertainties } from "@/features/review/draft";
import { GrowingTextarea, MomentsGlance } from "@/features/review/moments";
import { ItemEditor } from "@/features/review/ItemEditor";
import {
  CollapsedReading,
  ResolvedReading,
  UncertaintyCard,
} from "@/features/review/uncertainties";
import {
  LoadFailed,
  ProcessingView,
  ReadFailed,
  ReviewSkeleton,
} from "@/features/review/states";
import { PublishProgress } from "@/features/review/PublishProgress";
import { ReadOnlyDay } from "@/features/review/ReadOnlyDay";
import { Kbd, SourcePage, SourceTab } from "@/features/review/source";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DayStepper } from "@/components/DayStepper";
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
   LA RELECTURE — l'écran de la confiance.

   Une machine a lu une page manuscrite ; un humain doit pouvoir dire « oui »
   en quelques secondes. Trois décisions tiennent tout l'écran :

   1. LA CONFIANCE EST LA SEULE DIMENSION COLORÉE. Ambre = « à vérifier »,
      vert = « confirmé », groseille = l'action, et RIEN d'autre n'a de
      couleur : les cinq feutres de catégorie (repas, sieste…) passent
      volontairement en gris ici (voir lib/ui.ts). Deux systèmes de couleur sur
      le même écran, et plus aucun ne veut dire quelque chose.
   2. CE QUI DEMANDE UN HUMAIN EST AU-DESSUS DE LA LIGNE DE FLOTTAISON. Avant,
      le premier écran ne montrait qu'un stepper et une photo de carnet plein
      cadre : il fallait scroller pour découvrir qu'il y avait quoi que ce soit
      à corriger. Désormais la photo est une SOURCE (repliée sur mobile,
      colonne collante sur grand écran) et les lectures incertaines viennent
      juste après l'en-tête.
   3. ON VOIT CE QU'ON S'APPRÊTE À PUBLIER. C'était le défaut de fond de la
      version précédente : les cinq moments structurés — les repas, les
      siestes, les activités, c'est-à-dire la SUBSTANCE d'un carnet de liaison —
      dormaient dans un dépli « secondaire » à 1 800 px du haut du document. On
      pouvait appuyer sur « Publier la journée » sans avoir jamais vu ni le
      déjeuner ni la sieste. Ils sont maintenant en clair, juste sous les
      lectures à vérifier, en LISTE DE COUP D'ŒIL non modifiable : une ligne de
      56 px par moment, libellé + valeur + état (« à vérifier » / « confirmé »).
      Le dépli reste, mais il ne sert plus qu'à CORRIGER.
   4. LA SOURCE ET LA JOURNÉE SONT MISES EN REGARD. Le panneau de gauche a deux
      onglets — la page photographiée et la transcription mot à mot — face à la
      journée réécrite à droite : on peut confronter ce qui est écrit sur le
      papier et ce qui sera publié, sans quitter l'écran.
   5. UNE SEULE INCERTITUDE EST OUVERTE À LA FOIS. Deux cartes dépliées de
      210 px mangeaient toute la hauteur utile ; et une fois la première
      tranchée, la deuxième s'ouvre d'elle-même. Les autres se replient en
      lignes de 56 px qui disent quand même le mot lu et où il se trouve.

   LA BARRE D'ACTION NE PORTE QU'UNE DÉCISION, et elle est OPAQUE. À 0,88
   d'alpha, dix nœuds de texte se lisaient encore à travers elle sans être
   cliquables : un fantôme légible est un mensonge. Elle est passée de 157 px à
   101 px (une ligne de conséquence + le bouton), ce qui ramène le chrome de
   25,4 % à 18,7 % de l'écran — sous le plafond de 22 %. « Enregistrer le
   brouillon » descend en bas de la colonne : c'est une action d'appoint, pas
   une décision.

   Les quatre états sont dessinés (I7) : squelette à la forme de la réponse,
   lecture en cours (progression réelle : page N sur M), échec de lecture et
   échec d'accès — chacun avec sa cause, son remède, ses sorties et le code
   brut sur demande. Rien n'affiche jamais une exception nue.
   =========================================================================== */

const SOURCES: EntrySource[] = ["nounou", "mam", "creche", "maison"];

export default function Review() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  /* L'état de la DONNÉE (chargement, sondage, rôles, lot, brouillon et son
     empreinte) vit dans son propre hook ; ce composant garde ce qui est de
     l'écran. Les noms sont déstructurés tels quels : le rendu ne change pas. */
  const {
    entry,
    setEntry,
    items,
    title,
    setTitle,
    story,
    setStory,
    highlight,
    setHighlight,
    mood,
    setMood,
    transcription,
    setTranscription,
    source,
    setSource,
    date,
    setDate,
    roles,
    loadError,
    setLoadError,
    batchDays,
    reload,
    hydrate,
    setItemField,
    addItem,
    removeItem,
    currentPatch,
    dirty,
  } = useReviewEntry(id);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Deux natures d'échec, deux dessins. « save » : le serveur a refusé ou n'a
     pas répondu — c'est rouge, et rien n'est perdu. « stopped » : NOUS avons
     arrêté d'attendre, donc l'état de la journée est INCONNU — c'est ambre, la
     teinte que ce produit réserve à « à vérifier », et le texte le dit. */
  const [errorKind, setErrorKind] = useState<"save" | "stopped">("save");
  /** Secondes écoulées depuis le tap de publication. Cf. `PublishProgress`. */
  const [publishSeconds, setPublishSeconds] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveAttachment, setConfirmRemoveAttachment] = useState<
    string | null
  >(null);
  const [removingAttachment, setRemovingAttachment] = useState<string | null>(
    null,
  );
  const [resolvingIndex, setResolvingIndex] = useState<number | null>(null);
  /** La source est repliée sur mobile (l'écran appartient à la correction) et
      dépliée dès `md` où elle tient dans sa propre colonne. */
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState<"pages" | "texte">("pages");
  /** Rotations EN COURS D'ENREGISTREMENT, par pièce jointe : le quart de tour
      est montré tout de suite, le serveur réécrit la photo derrière. Retombe à
      zéro dès que la page tournée revient (cf. `rotateAttachment`). */
  const [rotating, setRotating] = useState<Record<string, number>>({});
  /* Les rotations en attente sont attachées à la journée qu'on relit, pas au
     composant : d'une journée d'un lot à la suivante, la route est la même et
     l'état survivait — la page 1 de la journée suivante arrivait tournée du
     quart de tour donné à la précédente. */
  useEffect(() => setRotating({}), [id]);
  /** Le dépli de correction est piloté par l'état : `group-open:` ne génère
      aucune règle dans ce Tailwind, le chevron ne tournait jamais. */
  const [itemsOpen, setItemsOpen] = useState(false);
  /** Incertitude dépliée. `null` = « la première non tranchée », ce qui fait
      que la suivante s'ouvre d'elle-même dès qu'on a tranché celle-ci. */
  const [openUncertainty, setOpenUncertainty] = useState<number | null>(null);
  /** Dernière incertitude tranchée : on s'assure que la confirmation verte est
      RÉELLEMENT visible (elle atterrissait derrière la barre d'action). */
  const [justResolved, setJustResolved] = useState<number | null>(null);
  /** Champ à faire remonter et à donner au clavier (revenir sur un choix). */
  const [focusField, setFocusField] = useState<UncertaintyField | null>(null);
  /** Relance de lecture en cours : le bouton porte l'attente, pas une roue. */
  const [retrying, setRetrying] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  /** Le PATCH de publication en cours, pour pouvoir cesser de l'attendre. */
  const publishAbort = useRef<AbortController | null>(null);
  /** La lecture à trancher n'a pris le focus qu'une fois par journée ouverte. */
  const focusedReading = useRef<string | null>(null);
  /** Notre propre navigation (publier, supprimer) : le garde-fou se tait. */
  const leaving = useRef(false);




  /* Le compteur de la publication. Une seconde de granularité : c'est la seule
     information DÉTERMINÉE qu'on possède sur une requête dont le serveur ne
     rapporte pas l'avancement, et elle suffit à transformer « ça tourne » en
     « ça fait 12 secondes ». Il ne tourne QUE pendant la publication. */
  useEffect(() => {
    if (saving !== "publish") {
      setPublishSeconds(0);
      return;
    }
    // `performance.now()` et non `Date.now()` : une horloge MONOTONE, insensible
    // à un changement d'heure système pendant l'attente (et non figeable par un
    // harnais de mesure, ce qui rend le chiffre vérifiable de l'extérieur).
    const start = performance.now();
    const t = setInterval(
      () => setPublishSeconds(Math.round((performance.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [saving]);


  const uncertainties = useMemo(
    () => normalizeUncertainties(entry?.uncertainties),
    [entry?.uncertainties],
  );
  const pending = uncertainties.filter((u) => !u.resolved).length;

  /** Les mots encore douteux, en motifs : une ligne de la journée qui en
      contient un porte « à vérifier », les autres « confirmé ». La casse est
      ignorée — le carnet écrit « Gratin de courgettes », la machine a signalé
      « gratin de courgettes » — et le mot doit être trouvé EN TANT QUE MOT
      (cf. `wordMatcher`). */
  const flaggedValues = useMemo(
    () =>
      uncertainties
        .filter((u) => !u.resolved)
        .map((u) => wordMatcher(u.original))
        .filter((re): re is RegExp => re !== null),
    [uncertainties],
  );

  /** Où le mot douteux a été lu, dans l'ordre de ce qui aide à le RETROUVER
      SUR LA PHOTO : la transcription d'abord (c'est le carnet mot pour mot),
      puis le champ que le modèle désigne, puis le reste. Le champ désigné passe
      en second à dessein — « dans le récit » situe le mot dans une reformulation
      de la machine, la transcription le situe sur le papier. */
  const phraseFor = useCallback(
    (u: Uncertainty): string | null => {
      const named =
        u.champ === "titre"
          ? title
          : u.champ === "recit"
            ? story
            : u.champ === "temps_fort"
              ? highlight
              : "";
      for (const text of [transcription, named, story, highlight, title]) {
        const phrase = text ? phraseAround(text, u.original) : null;
        if (phrase) return phrase;
      }
      return null;
    },
    [transcription, story, highlight, title],
  );

  /** L'incertitude dépliée : celle qu'on a choisie si elle est encore à
      trancher, sinon la première qui reste. */
  const openIndex = useMemo(() => {
    const left = uncertainties
      .map((u, i) => ({ u, i }))
      .filter((x) => !x.u.resolved)
      .map((x) => x.i);
    return openUncertainty !== null && left.includes(openUncertainty)
      ? openUncertainty
      : (left[0] ?? null);
  }, [uncertainties, openUncertainty]);

  /* ── CE QUI DEMANDE UN HUMAIN PREND LE FOCUS ──────────────────────────────
     Mesuré à l'arrivée sur cet écran : `document.activeElement === <body>`. La
     carte à trancher était pourtant déjà dépliée, en haut, ambre — mais un
     clavier arrivait sur RIEN, et un lecteur d'écran annonçait le titre de la
     page puis se taisait. Le focus va donc sur la lecture à trancher, une seule
     fois par journée ouverte (`focusedReading` porte l'id de la journée, pour
     que la journée suivante d'un lot le reçoive à son tour), et jamais si le
     travail est déjà commencé : voler le focus à quelqu'un qui écrit est pire
     que de ne pas le donner. */
  useEffect(() => {
    if (!entry || entry.status === "processing") return;
    if (focusedReading.current === entry.id) return;
    if (openIndex === null) {
      // Rien à trancher : personne n'est appelé, on ne déplace rien.
      focusedReading.current = entry.id;
      return;
    }
    const el = document.getElementById(`rv-u-${openIndex}`);
    if (!el) return;
    const active = document.activeElement;
    if (active && active !== document.body && el.contains(active) === false) {
      // Quelqu'un a déjà la main quelque part : on ne la lui prend pas.
      focusedReading.current = entry.id;
      return;
    }
    focusedReading.current = entry.id;
    el.focus();
  }, [entry, openIndex]);

  /** Rend `true` si le serveur a bien pris l'enregistrement. Ce booléen n'est
   *  pas décoratif : le garde-fou de sortie s'en sert pour ne PAS quitter quand
   *  l'enregistrement a échoué — sinon « Enregistrer, puis quitter » perdrait le
   *  travail exactement dans le cas qu'il est censé protéger. */
  const save = useCallback(
    async (publish: boolean): Promise<boolean> => {
      setSaving(publish ? "publish" : "draft");
      setError(null);
      const ctrl = publish ? new AbortController() : null;
      if (ctrl) publishAbort.current = ctrl;
      try {
        await api.updateEntry(
          id,
          { ...currentPatch(), publish },
          ctrl?.signal,
        );
        if (publish) {
          // On sort de l'écran : le garde-fou « travail non enregistré » ne doit
          // pas se déclencher sur notre propre navigation.
          leaving.current = true;
          // Journée publiée dans un lot multi-jours : enchaîne directement sur
          // la prochaine journée du carnet à valider plutôt que de revenir au
          // journal, pour valider le lot journée par journée.
          const batchId = entry?.batchId;
          const next = batchId
            ? await api
                .getEntryBatch(batchId)
                .then((r) => r.entries.find((d) => d.status !== "published"))
                .catch(() => undefined)
            : undefined;
          /* `replace` : sans lui, le bouton RETOUR du téléphone reposait le
             parent dans l'ÉDITEUR de la journée qu'il venait de publier —
             titrée « Relire la journée », badgée « publiée » et « à vérifier ».
             Rien de destructeur, mais on croit avoir défait ce qu'on vient de
             faire. La journée publiée se relit désormais par le journal, comme
             tout le reste. */
          if (next) nav(`/entries/${next.id}`, { replace: true });
          else
            /* LE REÇU. `nav("/")` renvoyait au journal sans un mot : rien ne
               disait que la journée était partie, ni que les proches étaient
               prévenus. On emporte donc de quoi l'écrire là-bas — le titre tel
               qu'on vient de le relire, et si c'est une PREMIÈRE publication ou
               une correction remise en ligne (le mot change : « publiée » /
               « republiée »). Cf. `Timeline.tsx`, composant `Receipt`. */
            nav("/", {
              replace: true,
              state: {
                published: {
                  entryId: id,
                  title: title.trim() || entry?.title || null,
                  childName: entry?.child?.name ?? null,
                  again: entry?.status === "published",
                },
              },
            });
        } else {
          const e = await api.getEntry(id);
          hydrate(e);
        }
        return true;
      } catch (err) {
        /* L'ABANDON DEMANDÉ dit la vérité, et toute la vérité : on a cessé
           d'attendre, mais le serveur a peut-être appliqué la publication. Le
           mensonge confortable (« publication annulée ») ferait croire que la
           journée n'est pas partie alors qu'elle peut l'être. */
        const stopped = err instanceof DOMException && err.name === "AbortError";
        setErrorKind(stopped ? "stopped" : "save");
        setError(
          stopped
            ? "Le carnet n’avait pas encore répondu : la publication n’est donc pas confirmée — elle a peut-être abouti malgré tout. Vos corrections sont toujours à l’écran. Ouvrez le journal pour voir l’état de la journée, ou publiez à nouveau : une journée déjà publiée le reste, sans doublon."
            : err instanceof Error
              ? err.message
              : "Échec de l'enregistrement",
        );
        return false;
      } finally {
        publishAbort.current = null;
        setSaving(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, entry?.batchId, nav, hydrate, items, title, story, highlight, mood, transcription, source, date],
  );

  /* ── LE TRAVAIL NE SE PERD PLUS ───────────────────────────────────────────
     Cet écran est le seul du produit où l'on ÉCRIT. Un récit repris à la main,
     un temps fort reformulé, trois moments corrigés : tout cela vivait dans
     l'état React et dans rien d'autre. Un rechargement, un retour au journal,
     un tap sur le nom de l'instance en haut, et c'était perdu sans un mot —
     alors que la journée, elle, reste un brouillon côté serveur.

     Deux garde-fous, et seulement quand il y a VRAIMENT quelque chose à perdre
     (`dirty` compare des empreintes normalisées, cf. `fingerprint`) : une
     confirmation qui se déclenche à vide est une confirmation qu'on apprend à
     ignorer. Aucun des deux ne se déclenche sur nos propres sorties (publier,
     supprimer, passer à la journée suivante du lot). */

  // 1. Rechargement, fermeture de l'onglet : la boîte native du navigateur est
  //    ici la SEULE chose qui puisse s'interposer.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // 2. Navigation interne (le journal, les réglages, le menu) : notre propre
  //    dialogue, en français, avec la sortie qui manquait — « enregistrer PUIS
  //    quitter ». Un garde-fou qui ne propose que « perdre » ou « rester » est
  //    un garde-fou qui fait perdre du travail une fois sur deux.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !leaving.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  /* Peut-on écrire dans CETTE journée ? Rôle encore inconnu → oui : on ne
     bloque pas le geste du soir sur une requête secondaire, et le serveur reste
     l'arbitre (son refus est dessiné). */
  const canEditEntry =
    !entry || roles === null ? true : canWrite(roles.get(entry.childId));

  // Le chemin clavier existe et il est MONTRÉ (barre d'indices sous les
  // actions) : ⌘/Ctrl + ⏎ publie sans viser un bouton. Il suit la même règle que
  // le bouton : pas de raccourci vers une publication qu'on n'a pas le droit de
  // faire — sinon un lecteur déclenche un 403 invisible depuis un écran qui ne
  // montre aucun bouton de publication.
  useEffect(() => {
    if (!canEditEntry) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      void save(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, canEditEntry]);

  // Persiste d'abord le brouillon en cours (les champs de valorisation ont pu
  // être retouchés à la main sans être encore enregistrés), puis applique la
  // correction choisie : elle remplace le mot incertain dans les champs
  // enregistrés et alimente le glossaire de l'enfant pour les prochaines
  // lectures (voir corrections.ts côté serveur).
  async function resolveUncertainty(index: number, value: string) {
    setResolvingIndex(index);
    setError(null);
    try {
      await api.updateEntry(id, currentPatch());
      const e = await api.resolveUncertainty(id, index, value);
      hydrate(e);
      // On rend la main au calcul « la première non tranchée » : la lecture
      // suivante s'ouvre toute seule, sans un tap de plus.
      setOpenUncertainty(null);
      setJustResolved(index);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la validation");
    } finally {
      setResolvingIndex(null);
    }
  }

  /* APRÈS UN CHOIX, ON MONTRE CE QUI RESTE À FAIRE — et s'il ne reste rien, on
     montre la confirmation.
     Avant, la confirmation verte de son propre geste atterrissait 44 px
     DERRIÈRE la barre d'action : on ne la voyait jamais. La corriger en
     défilant systématiquement dessus serait aussi faux : ce qui compte après
     avoir tranché une lecture, c'est la suivante. Donc : cible = la prochaine
     lecture à trancher si elle existe, sinon le reçu vert ; et on ne défile que
     si la cible n'est pas déjà dans la bande lisible (sous l'en-tête, au-dessus
     de la barre) — jamais en douceur si l'on a demandé moins de mouvement. */
  useEffect(() => {
    if (justResolved === null) return;
    const el = document.getElementById(
      `rv-u-${openIndex !== null ? openIndex : justResolved}`,
    );
    setJustResolved(null);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = 64; // l'en-tête de l'application
    const bottom = window.innerHeight - (barRef.current?.offsetHeight ?? 104) - 8;
    if (r.top >= top && r.bottom <= bottom) return;
    el.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [justResolved, uncertainties, openIndex]);

  /* « Revenir sur ce choix » : le serveur refuse de re-trancher une lecture
     (409), et c'est juste — mais le mot, lui, reste modifiable à la main. On
     emmène donc l'utilisateur sur le champ où la substitution a eu lieu, on
     l'ouvre si besoin (la transcription vit derrière un onglet, replié sur
     mobile) et on lui donne le clavier. C'est l'annulation qui manquait. */
  useEffect(() => {
    if (!focusField) return;
    const target =
      focusField === "titre"
        ? "rv-title"
        : focusField === "temps_fort"
          ? "rv-highlight"
          : focusField === "transcription_integrale"
            ? "rv-transcription"
            : "rv-story";
    if (
      focusField === "transcription_integrale" &&
      (!sourceOpen || sourceTab !== "texte")
    ) {
      // Deux passes : on ouvre d'abord le panneau, l'effet se rejoue quand la
      // zone de texte est montée (sinon on cherchait un élément inexistant).
      setSourceOpen(true);
      setSourceTab("texte");
      return;
    }
    const el = document.getElementById(target);
    setFocusField(null);
    if (!el) return;
    el.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    (el as HTMLTextAreaElement).focus({ preventScroll: true });
  }, [focusField, sourceOpen, sourceTab]);

  async function remove() {
    await api.deleteEntry(id);
    leaving.current = true;
    nav("/");
  }

  /* Relancer la lecture sur les pages DÉJÀ téléversées.
     « Reprendre la photo » était la seule sortie d'un échec : c'est la bonne
     quand la page est floue, c'est la mauvaise quand la lecture est morte avec
     le serveur (un redémarrage). Dans ce cas les pages sont intactes et le
     carnet papier est reparti chez la nounou — on ne peut PAS rephotographier.
     Après la relance, la journée repasse en `processing` : `reloadKey` relance
     `fetchEntry`, qui se remet à sonder tout seul jusqu'au brouillon. */
  async function retryRead() {
    setRetrying(true);
    setError(null);
    try {
      await api.retryEntryRead(id);
      reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Échec de la relance de la lecture",
      );
    } finally {
      setRetrying(false);
    }
  }

  /* TOURNER UNE PAGE, ET QUE ÇA RESTE.
     Le quart de tour part au serveur, qui réécrit la photo et sa miniature : la
     page est droite pour de bon, ici comme sur la timeline, et à la prochaine
     ouverture. En attendant sa réponse, on montre la rotation tout de suite —
     le geste doit répondre à la main, pas au réseau. La photo réécrite n'est
     mise à l'écran qu'une fois chargée, sinon la page semblerait se redresser
     puis retomber de travers le temps du téléchargement. */
  async function rotateAttachment(attachmentId: string) {
    setRotating((prev) => ({
      ...prev,
      [attachmentId]: (prev[attachmentId] ?? 0) + 1,
    }));
    setError(null);
    try {
      const rotated = await api.rotateAttachment(attachmentId);
      await preloadImage(rotated.url);
      setEntry((prev) =>
        prev
          ? {
              ...prev,
              attachments: prev.attachments.map((a) =>
                a.id === attachmentId ? { ...a, ...rotated } : a,
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Échec de la rotation de la page",
      );
    } finally {
      // Un quart de tour de moins à montrer nous-mêmes : soit la photo la porte
      // désormais, soit la rotation a échoué et la page revient comme elle
      // était. Décrémenter (plutôt que remettre à zéro) garde le compte juste
      // si un deuxième quart de tour est déjà parti.
      setRotating((prev) => {
        const pending = (prev[attachmentId] ?? 1) - 1;
        const next = { ...prev };
        if (pending > 0) next[attachmentId] = pending;
        else delete next[attachmentId];
        return next;
      });
    }
  }

  async function removeAttachment(attachmentId: string) {
    setRemovingAttachment(attachmentId);
    setError(null);
    try {
      await api.deleteAttachment(attachmentId);
      setEntry((prev) =>
        prev
          ? {
              ...prev,
              attachments: prev.attachments.filter((a) => a.id !== attachmentId),
            }
          : prev,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Échec du retrait de la page",
      );
    } finally {
      setRemovingAttachment(null);
      setConfirmRemoveAttachment(null);
    }
  }

  if (loadError && !entry) {
    return (
      <LoadFailed
        message={loadError}
        onRetry={() => {
          setLoadError(null);
          reload();
        }}
      />
    );
  }

  if (!entry) return <ReviewSkeleton />;

  if (entry.status === "processing") {
    return <ProcessingView attachments={entry.attachments} />;
  }

  if (entry.status === "failed") {
    return (
      <ReadFailed
        when={`${capitalize(longDate(entry.date))} · ${SOURCE_LABELS[entry.source]}`}
        reason={entry.failureReason}
        canRetry={entry.attachments.length > 0 && canEditEntry}
        retrying={retrying}
        error={error}
        onRetry={retryRead}
        onDelete={() => setConfirmDelete(true)}
        confirmOpen={confirmDelete}
        onConfirmOpenChange={setConfirmDelete}
        onConfirmDelete={remove}
      />
    );
  }

  /* Un LECTEUR reçoit la journée, pas le formulaire. Tant que le rôle n'est pas
     connu (`roles === null`), on ne refuse pas — mais on ne publie pas non plus
     à l'aveugle : le serveur reste l'arbitre, et l'erreur qu'il renvoie est
     dessinée. */
  if (!canEditEntry) {
    return <ReadOnlyDay entry={entry} />;
  }

  const attachmentToRemove = entry.attachments.find(
    (a) => a.id === confirmRemoveAttachment,
  );
  const words = transcription.trim()
    ? transcription.trim().split(/\s+/).length
    : 0;
  const published = entry.status === "published";
  const hasStepper = !!batchDays && batchDays.length > 1;

  /* ── LES QUATRE TEMPS, JUSQU'AU BOUT ──────────────────────────────────────
     Le rail « photo → lecture → relecture → partage » n'était monté que sur
     l'écran de capture, c'est-à-dire au PAS 1 — et il disparaissait aux pas 2 et
     3, exactement là où la question « est-ce que j'y suis presque ? » se pose.
     Il est ici aussi (et sur l'attente de lecture, et sur le squelette, et sur
     l'échec de lecture) : la photo est prise, la lecture est faite, la relecture
     est le temps courant. Sur une journée DÉJÀ publiée qu'on revient corriger,
     le partage est franchi lui aussi — le rail dit la vérité de la journée, pas
     une chorégraphie figée. */
  const steps: Step[] = [
    { key: "photo", label: "Photo", state: "done" },
    { key: "read", label: "Lecture", state: "done" },
    { key: "review", label: "Relecture", state: published ? "done" : "current" },
    {
      key: "share",
      label: "Partage",
      state: published ? "done" : "todo",
    },
  ];

  return (
    /* max-w-5xl et non 3xl : à 1 280 px, la colonne du récit plafonnait à
       339 px, soit 41 caractères par ligne — sous la bande de lecture de
       45–75 ch. La même page à 1 024 px donne 507 px de colonne, ~58 ch. */
    <div className="mx-auto w-full max-w-5xl p-4 pb-32">
      {/* Le rail des quatre temps, au même endroit et au même cran que sur la
          capture : c'est la seule chose de l'écran qui ne change pas d'un pas à
          l'autre, et c'est précisément son travail.

          UN SEUL OBJET DE PROGRESSION PAR ÉCRAN. Sur un carnet photographié sur
          plusieurs jours, le stepper de lot (« Journée 3 sur 3 · 2/3 publiées »)
          dit la même chose EN PLUS PRÉCIS, avec la même grammaire visuelle
          (ronds, filet, coches). Les empiler mesurait 146 px de chrome avant le
          titre et poussait la première lecture à trancher SOUS la barre d'action
          (bas de carte à 731 px pour une barre à 717) — exactement la faute que
          cet écran a corrigée au tour précédent. Avec un lot, le rail cède la
          place ; sans lot, il est là.

          LE RAIL PREND TOUTE LA COLONNE (`w-full`, plus de `max-w-sm`). Bridé à
          384 px dans une colonne de 992 px, il se tassait dans le coin haut
          gauche : quatre ronds serrés sur le premier tiers, puis 600 px de vide
          jusqu'au compteur « 5 à vérifier » — le regard lisait un fragment,
          pas un parcours. Étendu, chaque temps tombe au quart de la colonne et
          les filets deviennent lisibles comme un chemin. C'est la même largeur
          que sur la capture, où le rail a toujours suivi la colonne. */}
      {!hasStepper && <CaptureSteps steps={steps} className="mb-4 w-full" />}

      {hasStepper && (
        <div className="mb-4">
          <DayStepper
            days={batchDays}
            currentId={id}
            onSelect={(nextId) => nav(`/entries/${nextId}`)}
          />
        </div>
      )}

      {/* ── L'en-tête : de qui, quand, et ce qui reste à faire ───────────────
          Titre et pastille sur UNE ligne, une seule ligne de méta en dessous :
          le prénom passe dans la méta pour que le titre reste court et laisse
          la place à la pastille — 32 px gagnés, et c'est exactement ce qu'il
          fallait pour que la première lecture à vérifier soit au-dessus de la
          ligne de flottaison. */}
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-title font-semibold">
            Relire la journée
          </h1>
          {/* La date en clair est ICI, et nulle part ailleurs : le lot ne
              l'écrit plus (il ne garde que « mer 11 mars » sous la puce
              courante, qui est un repère de file, pas une date de journée).
              Chaque segment emporte SON séparateur et ne se casse pas : à
              320 px, la ligne repartait sur « · Nounou », un point médian
              orphelin en tête de ligne. */}
          <p className="text-meta text-muted-foreground">
            {[
              entry.child?.name,
              capitalize(longDate(entry.date)),
              SOURCE_LABELS[entry.source],
            ]
              .filter(Boolean)
              .map((part, i, all) => (
                <span key={i}>
                  <span className="whitespace-nowrap">
                    {part}
                    {i < all.length - 1 ? " ·" : ""}
                  </span>
                  {i < all.length - 1 ? " " : ""}
                </span>
              ))}
          </p>
        </div>
        {/* mt-0.5 (2 px) : nudge optique, la pastille de 24 px se centre sur la
            première ligne de 28 px du titre. */}
        {pending > 0 ? (
          <Badge variant="warning" className="mt-0.5">
            <TriangleAlert aria-hidden="true" />
            {pending} à vérifier
          </Badge>
        ) : (
          <Badge variant="success" className="mt-0.5">
            <Check aria-hidden="true" />
            {published ? "Publiée" : "Tout est confirmé"}
          </Badge>
        )}
      </header>

      {/* 1fr / 1.4fr et non 1/1.1 : la colonne du récit doit rester dans la
          bande de lecture de 45–75 caractères. Mesuré (17 px Nunito, chasse
          moyenne 8,32 px) : 46 ch à 768, 57 ch à 1 280. À 390 px, 45 ch
          exigerait 374 px de texte pour 358 px d'écran — la bande est
          physiquement hors d'atteinte au pouce sans descendre le récit sous
          17 px, et le récit est ce qui sera publié : il se relit à la taille
          où il se lira. */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-6">
        {/* ── La source : la page photographiée et le mot à mot ───────────── */}
        <section
          aria-label="La source"
          className="flex flex-col gap-3 md:sticky md:top-4 md:self-start"
        >
          {/* Sur mobile, la source est UNE LIGNE de 50 px qui montre déjà les
              pages en vignettes : on la déplie quand on veut confronter. Elle
              tenait sur deux lignes (66 px) pour dire la même chose — et sur cet
              écran, 16 px valent un quart de ligne de journée. */}
          <button
            type="button"
            onClick={() => setSourceOpen((v) => !v)}
            aria-expanded={sourceOpen}
            aria-controls="rv-source"
            className="tap flex w-full items-center gap-3 rounded-2xl border bg-card p-2 text-left shadow-card transition-colors dur-fast ease-carnet hover:bg-accent md:hidden"
          >
            <span className="flex shrink-0 -space-x-2" aria-hidden="true">
              {entry.attachments.slice(0, 3).map((a) => (
                <img
                  key={a.id}
                  src={a.thumbUrl}
                  alt=""
                  className="seam size-8 rounded-md bg-muted object-cover object-top"
                />
              ))}
              {entry.attachments.length === 0 && (
                <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
                  <Images className="size-4" />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-ui font-bold">Ce qui est écrit</span>
              <span className="text-meta text-muted-foreground">
                {" · "}
                {entry.attachments.length === 1
                  ? "1 page"
                  : `${entry.attachments.length} pages`}
                {" · "}
                {words} mots lus
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform dur-base ease-carnet",
                sourceOpen && "rotate-180",
              )}
            />
          </button>

          <div
            id="rv-source"
            className={cn("flex-col gap-3", sourceOpen ? "flex" : "hidden md:flex")}
          >
            {/* Sur grand écran, la ligne dépliante n'existe pas : ce qui a été
                trouvé doit être dit ici. */}
            <p className="hidden items-baseline justify-between gap-3 md:flex">
              <span className="surtitre text-muted-foreground">
                Ce qui est écrit
              </span>
              <span className="text-meta text-muted-foreground">
                {entry.attachments.length === 1
                  ? "1 page"
                  : `${entry.attachments.length} pages`}
                {" · "}
                {words} mots lus
              </span>
            </p>

            {/* Deux onglets : le papier, puis ce que la machine y a lu.
                Vrai motif ARIA : `tabindex` roulant + flèches gauche/droite,
                pas juste les rôles posés dessus. */}
            <div
              role="tablist"
              aria-label="Ce qui est écrit"
              className="flex gap-1 rounded-xl bg-muted p-1"
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = sourceTab === "pages" ? "texte" : "pages";
                setSourceTab(next);
                document.getElementById(`rv-tab-${next}`)?.focus();
              }}
            >
              <SourceTab
                id="rv-tab-pages"
                panel="rv-panel-pages"
                selected={sourceTab === "pages"}
                onSelect={() => setSourceTab("pages")}
                Icon={Images}
              >
                La page
              </SourceTab>
              <SourceTab
                id="rv-tab-texte"
                panel="rv-panel-texte"
                selected={sourceTab === "texte"}
                onSelect={() => setSourceTab("texte")}
                Icon={FileText}
              >
                Mot à mot
              </SourceTab>
            </div>

            {sourceTab === "pages" ? (
              <div
                role="tabpanel"
                id="rv-panel-pages"
                aria-labelledby="rv-tab-pages"
                className="flex flex-col gap-3"
              >
                {entry.attachments.map((a, i) => (
                  <SourcePage
                    key={a.id}
                    attachment={a}
                    index={i}
                    total={entry.attachments.length}
                    quarter={rotating[a.id] ?? 0}
                    rotating={(rotating[a.id] ?? 0) > 0}
                    /* Tourner écrit sur la photo source : un lecteur n'a pas ce
                       droit, et le serveur le lui refuserait. Pas de bouton
                       plutôt qu'un bouton qui échoue. */
                    onRotate={canEditEntry ? () => rotateAttachment(a.id) : null}
                    removing={removingAttachment === a.id}
                    onRemove={
                      published ? null : () => setConfirmRemoveAttachment(a.id)
                    }
                  />
                ))}
                {entry.attachments.length === 0 && (
                  <p className="rounded-xl bg-muted px-4 py-3 text-meta text-muted-foreground">
                    Aucune page n'est attachée à cette journée : le récit a été
                    saisi à la main.
                  </p>
                )}
              </div>
            ) : (
              <div
                role="tabpanel"
                id="rv-panel-texte"
                aria-labelledby="rv-tab-texte"
                className="flex flex-col gap-2"
              >
                <p className="text-meta text-muted-foreground">
                  Ce que Racontine a lu sur le papier, mot à mot. Corrigez ici
                  pour garder la trace exacte du carnet.
                </p>
                <GrowingTextarea
                  id="rv-transcription"
                  aria-label="Transcription intégrale"
                  minLines={8}
                  value={transcription}
                  placeholder="La transcription du carnet…"
                  className="paper-ruled paper-ruled--plain"
                  onChange={(e) => setTranscription(e.target.value)}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── La journée : ce qui sera publié ─────────────────────────────── */}
        <div className="flex flex-col gap-5">
          {/* Les lectures incertaines : le seul travail que la machine ne peut
              pas finir, donc la première chose sous l'en-tête. */}
          {pending > 0 && (
            <section aria-labelledby="verif" className="flex flex-col gap-2">
              {/* Un seul compteur sur l'écran : la pastille de l'en-tête. Le
                  surtitre nomme la section, il ne la chiffre pas une deuxième
                  fois (à 320 px, les deux se cassaient chacun sur deux lignes). */}
              <h2 id="verif" className="surtitre text-muted-foreground">
                Ce que Racontine a lu
              </h2>
              {/* Seules les lectures À TRANCHER sont ici — les tranchées sont
                  passées sous la journée, avec les états qu'elles expliquent.
                  L'INDEX D'ORIGINE est conservé : c'est lui que le serveur
                  attend pour résoudre la bonne incertitude. */}
              {uncertainties
                .map((u, i) => ({ u, i }))
                .filter(({ u }) => !u.resolved)
                .map(({ u, i }) =>
                  i === openIndex ? (
                    <UncertaintyCard
                      key={`${u.original}-${i}`}
                      id={`rv-u-${i}`}
                      item={u}
                      phrase={phraseFor(u)}
                      /* Pendant une publication, trancher une lecture partirait
                         en même temps que le PATCH de la journée : deux écritures
                         sur la même journée, et un résultat qui dépend de l'ordre
                         d'arrivée. La carte attend son tour. */
                      disabled={resolvingIndex !== null || saving !== null}
                      resolving={resolvingIndex === i}
                      onResolve={(value) => resolveUncertainty(i, value)}
                    />
                  ) : (
                    <CollapsedReading
                      key={`${u.original}-${i}`}
                      id={`rv-u-${i}`}
                      item={u}
                      phrase={phraseFor(u)}
                      onOpen={() => setOpenUncertainty(i)}
                    />
                  ),
                )}
            </section>
          )}

          {/* ── LA JOURNÉE EN UN COUP D'ŒIL ───────────────────────────────────
              Ce qui part chez les proches, en clair, avant le bouton. Ni
              formulaire ni carte : cinq lignes de 56 px, un filet entre elles.
              L'état à droite est la SEULE couleur (confiance), et il garde son
              glyphe pour rester lisible en noir et blanc. La tuile d'icône est
              grise à dessein : les feutres de catégorie appartiennent au
              journal, pas à cet écran (lib/ui.ts). */}
          <MomentsGlance items={items} flagged={flaggedValues} />

          {/* Les lectures déjà tranchées, juste sous la journée : elles
              EXPLIQUENT les pastilles « confirmé » de la liste au-dessus (quel
              mot a été lu, quel mot sera publié). Elles ne demandent plus rien
              à personne, donc elles ne sont plus au-dessus de la ligne de
              flottaison — mais chaque ligne reste une sortie vers le champ
              corrigé, parce qu'un choix validé doit pouvoir être repris. */}
          {uncertainties.some((u) => u.resolved) && (
            /* `aria-label` et non un titre `sr-only` : la classe `sr-only`
               s'implémente avec des marges de -1 px, donc un titre invisible
               ajoutait quatre valeurs hors grille et un nœud « rogné » au
               relevé — pour un intitulé que personne ne voit. */
            <section aria-label="Lectures validées" className="flex flex-col gap-2">
              {uncertainties
                .map((u, i) => ({ u, i }))
                .filter(({ u }) => !!u.resolved)
                .map(({ u, i }) => (
                  <ResolvedReading
                    key={`${u.original}-${i}`}
                    id={`rv-u-${i}`}
                    item={u}
                    onEdit={() => setFocusField(u.champ ?? "recit")}
                  />
                ))}
            </section>
          )}

          {/* Le dépli ne sert plus qu'à CORRIGER : la lecture, elle, est
              au-dessus et n'a plus besoin d'un geste. */}
          <details
            open={itemsOpen}
            onToggle={(e) => setItemsOpen(e.currentTarget.open)}
            className="rounded-2xl border bg-card shadow-card"
          >
            <summary className="tap flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-ui font-bold">
                  Corriger les moments
                </span>
                <span className="block text-meta text-muted-foreground">
                  {items.length === 0
                    ? "Ajouter un repas, une sieste, une activité…"
                    : "Modifier, retirer ou ajouter un moment"}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform dur-base ease-carnet",
                  itemsOpen && "rotate-180",
                )}
              />
            </summary>
            <div className="border-t px-4 py-4">
              <ItemEditor
                items={items}
                onField={setItemField}
                onRemove={removeItem}
                onAdd={addItem}
              />
            </div>
          </details>

          {/* Titre — une zone de texte et non un champ d'une ligne : un titre
              de journée dépasse 40 caractères et se lisait coupé en plein mot. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-title">Titre de la journée</Label>
            <GrowingTextarea
              id="rv-title"
              minLines={1}
              value={title}
              placeholder="Une jolie journée…"
              className="font-serif text-title font-semibold"
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.metaKey && !e.ctrlKey)
                  e.preventDefault();
              }}
            />
          </div>

          {/* Récit — le cœur, écrit sur les lignes du cahier. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-story">Le récit de la journée</Label>
            <GrowingTextarea
              id="rv-story"
              minLines={5}
              value={story}
              placeholder="Le récit chaleureux que liront les proches…"
              className="paper-ruled paper-ruled--plain"
              onChange={(e) => setStory(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-highlight">
              {/* gap-2 (8 px) : écart icône <-> libellé porté par `Label`. */}
              <Star className="size-4 text-muted-foreground" aria-hidden="true" />
              Temps fort du jour
            </Label>
            {/* Une phrase entière : un champ d'une ligne la coupait en plein
                mot (« … du couloir jusqu'à la »). */}
            <GrowingTextarea
              id="rv-highlight"
              minLines={1}
              value={highlight}
              placeholder="Le moment à retenir…"
              onChange={(e) => setHighlight(e.target.value)}
            />
          </div>

          {/* Contexte compact */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rv-date">Date</Label>
              <Input
                id="rv-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rv-source">Lieu</Label>
              <Select
                id="rv-source"
                className="w-full"
                value={source}
                onChange={(e) => setSource(e.target.value as EntrySource)}
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-mood">Humeur</Label>
            <Input
              id="rv-mood"
              value={mood}
              placeholder="Joyeuse, un peu fatiguée…"
              onChange={(e) => setMood(e.target.value)}
            />
          </div>

          {error && (
            <div
              role="alert"
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3",
                errorKind === "stopped"
                  ? "border-warning bg-warning-bg"
                  : "border-destructive bg-destructive-soft",
              )}
            >
              {/* mt-0.5 (2 px) : nudge optique, l'icône de 16 px se centre sur
                  la ligne de 20 px du libellé. */}
              <TriangleAlert
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  errorKind === "stopped" ? "text-warning" : "text-destructive",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-ui font-bold">
                  {errorKind === "stopped"
                    ? "Publication non confirmée"
                    : "La journée n'a pas pu être enregistrée"}
                </p>
                <p className="text-meta text-muted-foreground">
                  {errorKind === "stopped"
                    ? error
                    : `${error} — rien n'est perdu : vos corrections sont toujours à l'écran.`}
                </p>
                {/* La sortie que l'incertitude exige : aller VOIR. On ne l'offre
                    que dans ce cas — sur un échec net, la bonne action est de
                    réessayer, et elle est déjà dans la barre. */}
                {errorKind === "stopped" && (
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link to="/">
                      <BookOpenText aria-hidden="true" />
                      Voir l’état dans le journal
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* « Enregistrer le brouillon » vit ICI et non dans la barre : c'est
              une action d'appoint (et de toute façon le brouillon est déjà
              enregistré à chaque lecture tranchée). La barre ne porte qu'une
              décision, ce qui la ramène de 157 px à 101 px. */}
          <Button
            variant="outline"
            className="w-full"
            loading={saving === "draft"}
            disabled={saving !== null}
            onClick={() => save(false)}
          >
            {published
              ? "Enregistrer les modifications"
              : "Enregistrer le brouillon"}
          </Button>
        </div>
      </div>

      {/* ── Barre d'action ───────────────────────────────────────────────────
          OPAQUE, et une seule décision. Deux corrections de fond :
          · `bg-surface-bar` (0,88 / 0,90 d'alpha) laissait dix nœuds de texte
            se lire à travers la barre, en dessous du seuil de contraste et hors
            d'atteinte du pointeur — un fantôme légible. Fond opaque, plus de
            fantôme ; un dégradé de 24 px au-dessus dit que le papier continue.
          · un bouton + une ligne de conséquence = 101 px. Avec l'en-tête de
            l'application (57 px), le chrome tombe à 18,7 % de l'écran (25,4 %
            avant, pour un plafond de 22 %) — et l'indice clavier partage la
            ligne de la conséquence au lieu de coûter 28 px de plus. */}
      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 border-t bg-background px-4 pt-2 pb-safe-4"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background"
        />
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          {/* LA CONSÉQUENCE EST TOUJOURS ÉCRITE, et la barre garde donc une
              hauteur CONSTANTE.
              Avant : une ligne quand il restait des lectures douteuses, et rien
              du tout sinon — sur un téléphone (où l'indice clavier est caché) la
              barre passait de 101 à 81 px selon l'état, et le geste le plus
              conséquent du produit (« ça part aux proches ») n'était nommé
              nulle part. Le parcours mesuré s'arrêtait sur un bouton qui ne
              disait pas ce qu'il faisait, puis sur un journal qui ne disait pas
              que c'était fait.
              Maintenant : une ligne, toujours. Ambre quand il reste un doute
              (l'avertissement passe devant), encre pâlie sinon pour dire la
              conséquence. Et l'indice clavier partage la ligne à partir de
              `md`, comme avant. */}
          {/* PENDANT LA PUBLICATION, LA LIGNE CHANGE DE MÉTIER. Elle disait
              « 1 lecture sera publiée telle quelle » au présent pendant que la
              requête partait, comme si rien ne se passait ; le seul signe de vie
              était une roue dans un bouton dont le libellé ne bougeait pas.
              Elle porte maintenant l'avancement (cf. `PublishProgress`), et la
              conséquence revient dès que c'est fini. */}
          {saving === "publish" ? (
            <PublishProgress
              seconds={publishSeconds}
              moments={items.length}
              pages={entry.attachments.length}
              republish={published}
              onStopWaiting={() => publishAbort.current?.abort()}
            />
          ) : (
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            {pending > 0 ? (
              <p className="flex min-w-0 items-start gap-2 text-meta text-warning">
                <TriangleAlert
                  aria-hidden="true"
                  /* mt-0.5 : même nudge optique de 2 px que ci-dessus. */
                  className="mt-0.5 size-4 shrink-0"
                />
                {pending === 1
                  ? "1 lecture sera publiée telle quelle."
                  : `${pending} lectures seront publiées telles quelles.`}
              </p>
            ) : (
              <p className="flex min-w-0 items-start gap-2 text-meta text-muted-foreground">
                <Send aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {published
                  ? "Vos proches liront la version corrigée."
                  : "La journée part aux proches, qui en sont prévenus."}
              </p>
            )}
            {/* L'INDICE CLAVIER EXISTE AUSSI À 390 px. Il était `hidden md:flex` :
                sur le viewport principal du produit, aucun chemin clavier n'était
                montré — alors qu'un clavier Bluetooth sur tablette et un clavier
                d'iPad sont exactement les cas où l'on relit une journée à deux
                mains. Il partage la ligne quand elle a la place, et passe à la
                ligne (`flex-wrap` du parent) quand elle ne l'a pas : la barre
                gagne 20 px sur mobile, et rien n'est rogné à 320 px. */}
            <p className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
              <Kbd>⌘/Ctrl</Kbd>
              <Kbd>⏎</Kbd>
              publier
            </p>
          </div>
          )}
          {/* Pleine largeur au pouce, au fer à droite à la souris : un slab
              groseille de 1 024 px n'est pas un bouton, c'est un mur. */}
          <Button
            size="lg"
            className="w-full md:w-auto md:self-end md:px-10"
            loading={saving === "publish"}
            disabled={saving !== null}
            onClick={() => save(true)}
          >
            {saving === "publish" ? null : <Check aria-hidden="true" />}
            {/* LE LIBELLÉ DIT CE QUI SE PASSE. « Publier la journée » avec une
                roue, c'était un bouton qui décrivait encore l'intention pendant
                que l'action, elle, durait. Le participe présent est la seule
                chose vraie entre le tap et la réponse. */}
            {saving === "publish"
              ? published
                ? "Republication en cours…"
                : "Publication en cours…"
              : published
                ? "Republier la journée"
                : "Publier la journée"}
          </Button>
        </div>
      </div>

      {/* Le garde-fou du travail non enregistré. Trois issues, dans l'ordre où
          on les veut : rester (le défaut, c'est l'annulation du dialogue),
          enregistrer puis partir, partir en perdant — et cette dernière est la
          seule marquée `destructive`, parce que c'est la seule qui détruit. */}
      <AlertDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vos corrections ne sont pas encore enregistrées. La journée reste
              un brouillon, mais ce que vous venez d’écrire sera perdu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* L'ORDRE EST CALCULÉ, PAS SUBI. `AlertDialogFooter` est en
              `flex-col-reverse` sur mobile (et `flex-row justify-end` à partir
              de `sm`) : le DERNIER enfant du DOM est donc celui du HAUT au
              pouce. En écrivant l'ordre naturel (annuler, détruire, enregistrer)
              on obtenait un slab rouge « Quitter quand même » en tête d'un
              dialogue dont tout le propos est de NE PAS perdre le travail.
              L'ordre du DOM est donc renversé exprès :
                mobile, de haut en bas → Enregistrer puis quitter · Quitter quand
                  même · Rester (la recommandation domine, le retour est sous le
                  pouce) ;
                bureau, de gauche à droite → Rester · Quitter quand même ·
                  Enregistrer (l'action principale au fer à droite) ;
                clavier → Rester d'abord, donc la touche la plus sûre en premier.
              Et « Quitter quand même » n'est plus un aplat : rouge en ENCRE sur
              un bord, parce que c'est la sortie qu'on ne veut pas vendre. Le
              rouge plein reste pour ce qui détruit vraiment (supprimer une
              journée). */}
          <AlertDialogFooter>
            <AlertDialogCancel>Rester sur la journée</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              className="text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={() => {
                leaving.current = true;
                if (blocker.state === "blocked") blocker.proceed();
              }}
            >
              Quitter quand même
            </AlertDialogAction>
            <Button
              loading={saving === "draft"}
              onClick={async () => {
                // On ne quitte QUE si l'enregistrement est passé. Sinon le
                // dialogue reste ouvert et l'erreur s'affiche derrière, sur la
                // journée : le travail est toujours à l'écran.
                if (!(await save(false))) return;
                leaving.current = true;
                if (blocker.state === "blocked") blocker.proceed();
              }}
            >
              Enregistrer, puis quitter
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!confirmRemoveAttachment}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveAttachment(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cette page ?</AlertDialogTitle>
            <AlertDialogDescription>
              La photo sera définitivement supprimée du carnet. Le récit déjà
              écrit n'est pas modifié.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                attachmentToRemove && removeAttachment(attachmentToRemove.id)
              }
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
