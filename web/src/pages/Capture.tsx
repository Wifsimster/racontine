import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Camera,
  CloudOff,
  Images,
  Info,
  Layers,
  RotateCcw,
  ScanLine,
} from "lucide-react";
import { api } from "@/lib/api";
import { writableChildren } from "@/lib/access";
import { useBilling } from "@/lib/billing";
import { CapturePaused } from "@/features/billing/parts";
import { compressImage } from "@/lib/image";
import { type Child, type EntrySource } from "@/lib/types";
import {
  addPhotos,
  clearPhotos,
  getDraftMeta,
  getPhotos,
  removePhoto,
  saveDraftMeta,
} from "@/lib/photo-store";
import { Button } from "@/components/ui/button";
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
import {
  localDate,
  pageCount,
  type Phase,
  type Shot,
  type Stage,
} from "@/features/capture/model";
import { DayRow, PageGrid } from "@/features/capture/inputs";
import { SendError, SendingPanel } from "@/features/capture/panels";
import { CaptureDenied, CaptureEmpty } from "@/features/capture/empty";
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

export default function Capture() {
  const nav = useNavigate();
  /* On n'arrive plus ici par un bouton quand le carnet est fermé (l'accueil ne
     le propose plus), mais on peut y arriver par un signet, un brouillon
     retrouvé ou la touche « précédent » : l'écran doit savoir le dire. */
  const { billing } = useBilling();
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

  /* Le péage, ensuite — et dans cet ordre : à un LECTEUR, on explique son rôle,
     pas un abonnement qu'il n'a pas à payer. Le doute profite ici aussi au
     parent (`billing` null = ouvert) ; c'est le serveur qui refusera pour de
     bon, avec sa propre phrase, et l'écran d'envoi sait l'afficher. */
  if (billing?.enabled && !billing.access.open)
    return <CapturePaused billing={billing} />;

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
          <div className="action-width pointer-events-auto flex flex-col gap-2">
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
