import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpenText,
  Camera,
  CalendarSearch,
  CheckCheck,
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

export function JournalSkeleton() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-11 items-center gap-2">
        <p role="status" className="text-meta text-muted-foreground">
          {slow ? "Le carnet met du temps à venir" : "Racontine ouvre le carnet"}
        </p>
        <span aria-hidden="true" className="skeleton size-2 rounded-full" />
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="rounded-xl border bg-card px-5 py-4"
        >
          <div className="skeleton h-3 w-32" />
          <div className="skeleton mt-4 h-6 w-4/5" />
          <div className="mt-3 flex gap-3">
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-4 w-16" />
          </div>
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
          <div className="mt-4 flex items-center gap-3">
            <div className="skeleton h-4 w-20" />
            <div className="skeleton ml-auto h-4 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function JournalEmpty({
  canCapture,
  carnetOuvert = true,
}: {
  canCapture: boolean;
  carnetOuvert?: boolean;
}) {
  if (!canCapture)
    return (
      <section className="rise-enter flex flex-col items-center gap-6 pt-2">
        <div
          aria-hidden="true"
          className="w-full rounded-xl border border-dashed bg-card px-5 py-4"
        >
          <p className="text-meta text-muted-foreground">
            La première journée · Nounou
          </p>
          <p className="mt-4 font-serif text-title font-semibold text-muted-foreground">
            Le titre de sa journée
          </p>
          <p className="carnet-story mt-3 text-muted-foreground">
            Ce qu’il a mangé, comment il a dormi, ce qui l’a fait rire : le
            carnet du jour, recopié et mis en récit.
          </p>
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
        className="w-full rounded-xl border border-dashed bg-card px-5 py-4"
      >
        <p className="text-meta text-muted-foreground">Aujourd’hui · Nounou</p>
        <p className="mt-4 font-serif text-title font-semibold text-muted-foreground">
          Le titre que Racontine trouvera
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-meta font-bold">
          <span className="flex items-center gap-1 text-meal">
            <Soup className="size-4" />3 repas
          </span>
          <span className="font-normal text-muted-foreground">·</span>
          <span className="flex items-center gap-1 text-nap">
            <Moon className="size-4" />
            sieste 2{NBSP}h{NBSP}05
          </span>
          <span className="font-normal text-muted-foreground">·</span>
          <span className="flex items-center gap-1 text-foreground">
            <Smile className="size-4" />
            joyeuse
          </span>
        </p>
        <p className="carnet-story mt-3 text-muted-foreground">
          Le récit de la journée, écrit à partir de votre photo : ce qu’il a
          mangé, comment il a dormi, ce qui l’a fait rire.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
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

export function JournalFiltered({
  onReset,
  label,
}: {
  onReset: () => void;
  label: string;
}) {
  return (
    <section className="rise-enter flex flex-col items-center gap-5 py-10 text-center">
      <CalendarSearch
        aria-hidden="true"
        className="size-8 text-muted-foreground"
      />
      <div className="flex flex-col items-center gap-2">
        <h2 className="font-serif text-title font-semibold text-balance">
          Rien à lire pour {label}
        </h2>
        <p className="max-w-[34ch] text-ui text-pretty text-muted-foreground">
          Le reste du carnet est intact : seul ce cadrage ne rend aucune
          journée.
        </p>
      </div>
      <Button variant="outline" onClick={onReset}>
        <RotateCcw aria-hidden="true" />
        Revoir tout le carnet
      </Button>
    </section>
  );
}

export function QueueCleared({
  label,
  onReset,
}: {
  label: string | null;
  onReset: () => void;
}) {
  return (
    <section className="rise-enter flex flex-col items-center gap-5 py-10 text-center">
      <CheckCheck aria-hidden="true" className="size-8 text-success" />
      <div className="flex flex-col items-center gap-2">
        <h2 className="font-serif text-title font-semibold text-balance">
          Plus rien à vérifier{label ? ` pour ${label}` : ""}
        </h2>
        <p className="max-w-[34ch] text-ui text-pretty text-muted-foreground">
          Chaque mot sur lequel la lecture hésitait a été tranché.
        </p>
      </div>
      <Button variant="outline" onClick={onReset}>
        <RotateCcw aria-hidden="true" />
        Revoir tout le journal
      </Button>
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
    <li className="flex items-start gap-3">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="text-meta text-muted-foreground">{children}</span>
    </li>
  );
}

export function technicalCode(message: string): string {
  const http = message.match(/\b([45]\d{2})\b/);
  if (http) return `HTTP ${http[1]}`;
  if (/connexion|réseau|fetch/i.test(message)) return "réseau";
  return "GET /api/entries";
}

export function JournalError({
  message,
  canCapture,
  onRetry,
}: {
  message: string;
  canCapture: boolean;
  onRetry: () => void;
}) {
  const [detail, setDetail] = useState(false);
  return (
    <section
      className="rise-enter flex min-h-[calc(100svh-11rem)] flex-col items-center justify-center gap-5 text-center"
    >
      <CloudOff className="size-8 text-destructive" aria-hidden="true" />
      <div className="flex flex-col items-center gap-2">
        <h2 className="font-serif text-title font-semibold text-balance">
          Le journal ne répond pas
        </h2>
        <p className="max-w-[34ch] text-ui text-pretty text-muted-foreground">
          Vos journées sont intactes : seule la connexion au carnet a échoué,
          réessayez dans un instant.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3">
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
            className="shrink-0 text-meta text-muted-foreground"
            data-tabular
          >
            {technicalCode(message)}
          </span>
        </summary>
        <p className="mt-1 border-l-2 pl-3 text-meta text-muted-foreground">
          {message}
        </p>
      </details>
    </section>
  );
}

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
      className="rise-enter flex items-start gap-3 rounded-xl border border-success bg-success-bg px-4 py-3"
    >
      {published ? (
        <Send aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" />
      ) : (
        <BookOpenText
          aria-hidden="true"
          className="mt-1 size-4 shrink-0 text-success"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-ui font-bold text-success">{title}</p>
        <p className="mt-0.5 text-meta text-success">{body}</p>
        {published && (
          <Button
            variant="link"
            size="sm"
            className="-ml-3 mt-1 text-success"
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
