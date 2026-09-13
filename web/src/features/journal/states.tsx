import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpenText,
  Camera,
  ChevronDown,
  CreditCard,
  CloudOff,
  Moon,
  RotateCcw,
  Send,
  Smile,
  Soup,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  NBSP,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* Les états du journal : squelette, vide, erreur, et l'accusé d'envoi. */

export function JournalSkeleton() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-11 items-end justify-between gap-3 border-b pb-2">
        <p role="status" className="surtitre text-muted-foreground">
          {slow ? "Le carnet met du temps à venir" : "Racontine ouvre le carnet"}
        </p>
        {/* Le point respire au MÊME rythme que les squelettes (la balayeuse de
            1200 ms déclarée dans index.css), au lieu d’introduire une seconde
            boucle d’animation pour dire la même chose. */}
        <span aria-hidden="true" className="skeleton size-2 rounded-full" />
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="relative overflow-hidden rounded-2xl border bg-card py-4 pr-5 pl-7 shadow-card"
        >
          <span className="pointer-events-none absolute inset-y-0 left-5 w-[1.5px] bg-[var(--rule-margin)]" />
          <div className="flex items-center justify-between gap-3">
            <div className="skeleton h-3 w-32" />
            <div className="skeleton h-3 w-14" />
          </div>
          <div className="skeleton mt-4 h-6 w-4/5" />
          <div className="mt-4 flex gap-1.5">
            <div className="skeleton h-7 w-20" />
            <div className="skeleton h-7 w-28" />
            <div className="skeleton h-7 w-20" />
          </div>
          {/* Trois lignes au pas du cahier : le récit tel qu’il arrivera. */}
          <div className="mt-4 flex flex-col gap-3">
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/5" />
          </div>
          {i === 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="skeleton aspect-square" />
              <div className="skeleton aspect-square" />
            </div>
          )}
          {/* La ligne de dépli : elle fait partie de la forme de la réponse. */}
          <div className="mt-4 flex items-center gap-3 border-t pt-4">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton ml-auto h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Le vide MONTRE ce que l’app fabrique : une journée en pointillés, avec sa
 * marge, son titre à venir et ses feutres. Un rond et deux phrases ne vendent
 * rien — et c’est le premier écran d’un nouveau compte.
 */
export function JournalEmpty({
  canCapture,
  carnetOuvert = true,
}: {
  canCapture: boolean;
  /** Le carnet accepte-t-il une nouvelle journée ? Défaut : oui — l'inconnu ne
   *  ferme rien, exactement comme dans `Timeline`. */
  carnetOuvert?: boolean;
}) {
  /* LE VIDE D’UN LECTEUR N’EST PAS LE MÊME VIDE. Mamie n’a pas de carnet de
     papier à photographier : lui vendre le geste (« Photographiez la page du
     soir », « Inviter un proche ») serait lui promettre deux écrans qui la
     refuseront. Ce qu’elle attend, elle, c’est la première journée — et la seule
     chose honnête est de le dire, avec ce qui arrivera quand elle sera là. */
  if (!canCapture)
    return (
      <section className="rise-enter flex flex-col items-center gap-6 pt-2">
        <div
          aria-hidden="true"
          className="relative w-full overflow-hidden rounded-2xl border border-dashed bg-card py-4 pr-5 pl-7"
        >
          <span className="pointer-events-none absolute inset-y-0 left-5 w-[1.5px] bg-[var(--rule-margin)]" />
          <div className="flex items-baseline justify-between gap-3">
            <p className="surtitre text-muted-foreground">la première journée</p>
            <p className="surtitre text-muted-foreground">nounou</p>
          </div>
          <p className="mt-4 font-serif text-title font-semibold text-muted-foreground">
            Le titre de sa journée
          </p>
          <div className="paper-ruled paper-ruled--plain -mr-5 -ml-7 mt-4 pr-5 pl-7">
            <p className="carnet-story text-muted-foreground">
              Ce qu’il a mangé, comment il a dormi, ce qui l’a fait rire : le
              carnet du jour, recopié et mis en récit.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="font-serif text-title font-semibold text-balance">
            Aucune journée publiée pour l’instant
          </h2>
          <p className="max-w-[31ch] text-ui text-muted-foreground">
            Vous suivez ce carnet en lecture : dès qu’une journée est publiée,
            elle apparaît ici et vous en êtes prévenu·e.
          </p>
        </div>

        <ul className="flex w-full flex-col gap-3">
          <Tip Icon={BookOpenText}>
            Rien à faire : le journal se remplit tout seul, au fil des soirs.
          </Tip>
          <Tip Icon={Sparkles}>
            Chaque journée est relue par la famille avant d’être partagée.
          </Tip>
        </ul>
      </section>
    );

  return (
    <section className="rise-enter flex flex-col items-center gap-6 pt-2">
      <div
        aria-hidden="true"
        className="relative w-full overflow-hidden rounded-2xl border border-dashed bg-card py-4 pr-5 pl-7"
      >
        <span className="pointer-events-none absolute inset-y-0 left-5 w-[1.5px] bg-[var(--rule-margin)]" />
        <div className="flex items-baseline justify-between gap-3">
          {/* Pas de prénom inventé ici : un compte neuf n’a pas de Louise. */}
          <p className="surtitre text-muted-foreground">aujourd’hui</p>
          <p className="surtitre text-muted-foreground">nounou</p>
        </div>
        <p className="mt-4 font-serif text-title font-semibold text-muted-foreground">
          Le titre que Racontine trouvera
        </p>
        <div className="mt-4 flex gap-1.5">
          <span className="flex h-7 items-center gap-1.5 rounded-md bg-meal-bg px-2 text-meta font-bold text-meal">
            <Soup className="size-4" />3 repas
          </span>
          <span className="flex h-7 items-center gap-1.5 rounded-md bg-nap-bg px-2 text-meta font-bold text-nap">
            <Moon className="size-4" />
            sieste 2{NBSP}h{NBSP}05
          </span>
          <span className="flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-meta font-bold text-foreground">
            <Smile className="size-4" />
            joyeuse
          </span>
        </div>
        {/* La zone réglée porte une vraie phrase, pas de fausses lignes de
            crayon : elle explique ce qui viendra s’écrire là, et elle montre
            en même temps le récit posé sur les lignes du cahier. */}
        <div className="paper-ruled paper-ruled--plain -mr-5 -ml-7 mt-4 pr-5 pl-7">
          <p className="carnet-story text-muted-foreground">
            Le récit de la journée, écrit à partir de votre photo : ce qu’il a
            mangé, comment il a dormi, ce qui l’a fait rire.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        {/* `h2` et non `h1` : le bandeau « Le journal » est toujours là
            au-dessus, et il ne dit plus deux fois le même mot. */}
        <h2 className="font-serif text-title font-semibold text-balance">
          Votre journal commence par une photo
        </h2>
        <p className="max-w-[31ch] text-ui text-muted-foreground">
          Photographiez la page du soir : Racontine la transcrit et en fait un
          souvenir à lire et à partager.
        </p>
      </div>

      <ul className="flex w-full flex-col gap-3">
        <Tip Icon={Camera}>
          Une photo de travers, un peu froissée, suffit. La page entière dans le
          cadre, c’est tout.
        </Tip>
        <Tip Icon={Sparkles}>
          Vous relisez avant publication : rien n’est partagé sans votre accord.
        </Tip>
      </ul>

      {/* L'ACTION DU VIDE — et elle doit ABOUTIR. Quand le carnet est fermé à
          l'écriture, « Photographier le carnet » mène tout droit à l'écran de
          pause : un bouton groseille qui conduit à un refus est une promesse
          rompue, et c'est la règle que le bouton flottant du journal applique
          déjà (`Timeline`). Le cas se rencontre pour de bon : un foyer dont
          l'essai s'achève avant la première journée voyait, sur un journal
          encore vide, l'app lui proposer le seul geste qu'elle venait de lui
          retirer. Le geste cède donc la place à ce qui le rouvre. */}
      <div className="flex w-full flex-col gap-3">
        {carnetOuvert ? (
          <Button asChild size="lg">
            <Link to="/capture">
              <Camera aria-hidden="true" />
              Photographier le carnet
            </Link>
          </Button>
        ) : (
          <Button asChild size="lg">
            <Link to="/abonnement">
              <CreditCard aria-hidden="true" />
              Reprendre l'abonnement
            </Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/partage">
            <Users aria-hidden="true" />
            Inviter un proche
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function Tip({
  Icon,
  children,
}: {
  Icon: typeof Camera;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-card px-4 py-3 shadow-card">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="text-meta text-muted-foreground">{children}</span>
    </li>
  );
}

/**
 * Le petit code posé sur la ligne « Détail technique » : ce qu’on SAIT, jamais
 * plus. Un statut HTTP s’il est dans le message (`api.ts` remonte « Erreur 500 »
 * quand le serveur ne renvoie pas de phrase), sinon la nature de la panne, sinon
 * la requête qui a échoué — c’est la seule chose vraie qui reste, et elle suffit
 * à ouvrir un journal de serveur au bon endroit.
 */
export function technicalCode(message: string): string {
  const http = message.match(/\b([45]\d{2})\b/);
  if (http) return `HTTP ${http[1]}`;
  if (/connexion|réseau|fetch/i.test(message)) return "réseau";
  return "GET /api/entries";
}

/**
 * L’erreur nomme la CAUSE, le REMÈDE, et laisse deux sorties. Elle ne dit
 * surtout pas « le journal est vide » : les journées sont là, c’est l’accès
 * qui a échoué, et confondre les deux est le pire mensonge possible ici.
 */
export function JournalError({
  message,
  canCapture,
  onRetry,
}: {
  message: string;
  /** Un lecteur n’a pas de seconde sortie « photographier » : elle le refuserait. */
  canCapture: boolean;
  onRetry: () => void;
}) {
  const [detail, setDetail] = useState(false);
  return (
    <section
      /* La hauteur retirée est celle du chrome + du bandeau (11 rem mesurés) :
         le bloc se centre dans ce qui RESTE de l’écran, au lieu de se centrer
         dans 60 % de l’écran et de laisser 280 px de papier vide dessous. */
      className="rise-enter flex min-h-[calc(100svh-11rem)] flex-col items-center justify-center gap-5 text-center"
    >
      <span className="grid size-16 place-items-center rounded-3xl bg-destructive-soft text-destructive">
        <CloudOff className="size-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <h2 className="font-serif text-title font-semibold text-balance">
          Le journal ne répond pas
        </h2>
        {/* Plus de tiret cadratin en tête de ligne : « Réessayez — si cela
            persiste » se coupait entre les deux, et une ligne qui commence par
            un cadratin se lit comme un dialogue de roman. Deux phrases. */}
        <p className="max-w-[34ch] text-ui text-pretty text-muted-foreground">
          Vos journées sont intactes : c’est la connexion au carnet qui a
          échoué. Réessayez ; si cela persiste, le serveur Racontine est
          peut-être en train de redémarrer.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3">
        {/* Pas d’état « en cours » sur ce bouton : la nouvelle tentative rend
            aussitôt le squelette, qui dit mieux que lui ce qui se passe. */}
        <Button onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          Réessayer
        </Button>
        {canCapture && (
          <Button asChild variant="outline">
            <Link to="/capture">
              <Camera aria-hidden="true" />
              Photographier le carnet
            </Link>
          </Button>
        )}
      </div>
      {/* Le code brut est ANNONCÉ sur la ligne, pas seulement derrière elle :
          un développeur reconnaît « 500 » sans ouvrir, et un parent voit qu’il
          y a une pièce technique sans avoir à la lire. La ligne reste à 44 px. */}
      <details
        className="w-full text-left"
        onToggle={(e) => setDetail(e.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-meta text-muted-foreground transition-colors dur-fast hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform dur-base ease-carnet",
              detail && "rotate-180",
            )}
            aria-hidden="true"
          />
          <span className="flex-1">Détail technique</span>
          <span
            className="flex h-5 shrink-0 items-center rounded-sm bg-muted px-1.5 text-meta text-muted-foreground"
            data-tabular
          >
            {technicalCode(message)}
          </span>
        </summary>
        <p className="mt-2 rounded-lg bg-muted px-4 py-3 text-meta text-muted-foreground">
          {message}
        </p>
      </details>
    </section>
  );
}

/* --------------------------------------------------------------------------
   LE REÇU — ce qui manquait à la fin de chaque parcours.

   Mesuré sur les trois parcours : publier une journée, la republier après
   correction, rejoindre un carnet sur invitation aboutissaient tous les trois
   au MÊME écran muet. `nav("/")`, et débrouillez-vous : rien ne disait que la
   journée était partie, que les proches étaient prévenus, ni qu’on venait
   d’entrer dans un cercle. C’est un cul-de-sac après succès — le pire endroit
   pour en mettre un, parce que c’est le moment où l’on vérifie qu’on a bien
   fait ce qu’on croyait faire.

   Le reçu est donc porté par l’écran d’arrivée, pas par une bulle flottante :
     · il est ANNONCÉ (`role="status"`), donc lu par un lecteur d’écran ;
     · il nomme la CONSÉQUENCE (les proches sont prévenus), pas seulement le
       fait ;
     · il donne la SUITE (voir la journée), jamais un simple « OK » ;
     · il se referme d’un tap de 44 px, et l’état d’historique est effacé pour
       qu’un rechargement ne le fasse pas réapparaître.
   Il ne clignote pas et ne disparaît pas tout seul : un reçu qui s’évapore au
   bout de trois secondes est un reçu qu’on n’a pas eu le temps de lire.
   -------------------------------------------------------------------------- */

/** Ce qu’un écran précédent a laissé dans l’état de navigation. */
export type Flash =
  | {
      kind: "published";
      entryId: string;
      title: string | null;
      childName: string | null;
      again: boolean;
    }
  | { kind: "joined"; childName: string; role: string };

export function readFlash(state: unknown): Flash | null {
  if (!state || typeof state !== "object") return null;
  const s = state as Record<string, unknown>;
  if (s.published && typeof s.published === "object") {
    const p = s.published as Record<string, unknown>;
    if (typeof p.entryId !== "string") return null;
    return {
      kind: "published",
      entryId: p.entryId,
      title: typeof p.title === "string" ? p.title : null,
      childName: typeof p.childName === "string" ? p.childName : null,
      again: p.again === true,
    };
  }
  if (s.joined && typeof s.joined === "object") {
    const j = s.joined as Record<string, unknown>;
    if (typeof j.childName !== "string") return null;
    return {
      kind: "joined",
      childName: j.childName,
      role: typeof j.role === "string" ? j.role : "reader",
    };
  }
  return null;
}

export function Receipt({
  flash,
  onClose,
}: {
  flash: Flash;
  onClose: () => void;
}) {
  const published = flash.kind === "published";
  const title = published
    ? flash.again
      ? "Journée republiée"
      : "Journée publiée"
    : `Bienvenue dans le carnet de ${flash.childName}`;
  const body = published
    ? flash.again
      ? "La correction est en ligne : vos proches lisent la version à jour."
      : "Vos proches sont prévenus : ils la trouveront dans leur journal."
    : "Vous y êtes. Les journées publiées apparaîtront ici, de la plus récente à la plus ancienne.";

  return (
    <div
      role="status"
      /* Vert = acquis, comme partout ailleurs dans le produit (les pages
         gardées de la capture, le pas franchi de la barre d’envoi). Le reçu
         n’invente aucune teinte. */
      className="rise-enter flex items-start gap-3 rounded-2xl border border-success bg-success-bg px-4 py-3"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-success text-background"
      >
        {published ? (
          <Send className="size-4" />
        ) : (
          <BookOpenText className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {/* PAS DE TITRE DE JOURNÉE ICI, et c'est mesuré : la première version
            reprenait « Le jour des haricots verts » en 22/28 sérif, si bien que
            le titre s'écrivait DEUX FOIS à 100 px d'écart (une fois dans le
            reçu, une fois sur la carte juste dessous) et que le reçu faisait
            390 px — il repoussait sous la ligne de flottaison la seule chose
            qu'on venait vérifier, la journée elle-même. Le reçu confirme, la
            carte nomme. 130 px, deux lignes et une suite. */}
        <p className="text-ui font-bold text-success">{title}</p>
        <p className="mt-0.5 text-meta text-success">{body}</p>
        {published && (
          <Button
            variant="link"
            size="sm"
            className="-ml-3 mt-1 text-success"
            /* Le titre part dans le libellé accessible : « Voir la journée »
               seul ne dit pas laquelle, et le reçu ne l'écrit plus en gros. */
            aria-label={
              flash.title ? `Voir la journée « ${flash.title} »` : undefined
            }
            onClick={() => {
              const el = document.getElementById(`carte-${flash.entryId}`);
              el?.scrollIntoView({
                block: "start",
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
              });
            }}
          >
            Voir la journée
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Fermer le message"
        className="-mr-2 shrink-0 text-success"
        onClick={onClose}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
