import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpenText,
  CreditCard,
  Heart,
  Hourglass,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  formatAmount,
  formatDay,
  formatInterval,
  formatPrice,
} from "@/lib/billing";
import type { Billing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/PageState";

const INCLUS: { icon: typeof Heart; text: string }[] = [
  {
    icon: BookOpenText,
    text: "Toutes vos journées, sans compteur : photographiez chaque soir, toute l'année.",
  },
  {
    icon: Users,
    text: "Vos enfants et vos proches sans limite — mamie n'a jamais de carte à sortir.",
  },
  {
    icon: Sparkles,
    text: "La lecture du carnet manuscrit, la relecture avant publication, les notifications.",
  },
  {
    icon: ShieldCheck,
    text: "Vos photos et vos journées restent hébergées en France, et ne nourrissent personne.",
  },
];

export function PayButton({
  billing,
  label,
  className,
  variant,
}: {
  billing: Billing;
  label?: string;
  className?: string;
  variant?: "default" | "outline";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const price = billing.price;
  const text =
    label ??
    (price ? `S'abonner — ${formatPrice(price)}` : "S'abonner");

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const { url } = await api.startCheckout();
      window.location.assign(url);
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof Error
          ? e.message
          : "La page de paiement n'a pas pu s'ouvrir. Réessayez.",
      );
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button
        size="lg"
        variant={variant}
        loading={busy}
        onClick={pay}
        className="action-width"
      >
        <CreditCard aria-hidden="true" />
        {busy ? "Ouverture du paiement…" : text}
      </Button>
      {error && <InlineError>{error}</InlineError>}
    </div>
  );
}

export function ManageButton({ label = "Gérer l'abonnement" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setBusy(true);
    setError("");
    try {
      const { url } = await api.openBillingPortal();
      window.location.assign(url);
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof Error ? e.message : "Le portail n'a pas pu s'ouvrir.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" loading={busy} onClick={open}>
        <CreditCard aria-hidden="true" />
        {label}
      </Button>
      {error && <InlineError>{error}</InlineError>}
    </div>
  );
}

export function BilledToNote({ billing }: { billing: Billing }) {
  if (!billing.billedTo) return null;
  return (
    <p className="text-meta text-muted-foreground">
      L'abonnement de ce carnet se règle depuis le compte de{" "}
      <span className="font-bold text-foreground">{billing.billedTo.name}</span>{" "}
      ({billing.billedTo.email}).
    </p>
  );
}

export function OfferIncludes({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {INCLUS.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-md bg-primary-soft text-primary"
          >
            <Icon className="size-4" />
          </span>
          <span className="text-meta text-muted-foreground">{text}</span>
        </li>
      ))}
    </ul>
  );
}

export function OfferCard({ billing }: { billing: Billing }) {
  const price = billing.price;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card">
      <p className="surtitre text-muted-foreground">l'offre, il n'y en a qu'une</p>
      <h2 className="mt-2 font-serif text-title font-semibold">
        Racontine Famille
      </h2>

      <p className="mt-4 flex items-baseline gap-2">
        {price ? (
          <>
            <span className="font-serif text-display font-semibold" data-tabular>
              {formatAmount(price)}
            </span>
            <span className="text-ui text-muted-foreground">
              {formatInterval(price)}
            </span>
          </>
        ) : (
          <span className="text-ui text-muted-foreground">
            Le tarif n'a pas pu être récupéré à l'instant — il s'affichera sur la
            page de paiement, avant tout engagement.
          </span>
        )}
      </p>
      <p className="mt-1 text-meta text-muted-foreground">
        Pour tout le foyer · sans engagement, résiliable en deux clics.
      </p>

      <OfferIncludes className="mt-5" />

      <div className="mt-5">
        {billing.canManage ? (
          <PayButton billing={billing} />
        ) : (
          <BilledToNote billing={billing} />
        )}
      </div>

      <p className="mt-4 flex items-start gap-2 text-meta text-muted-foreground">
        <BookOpenText className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Si vous arrêtez un jour, votre journal reste lisible et partagé : on ne
          referme jamais des souvenirs d'enfance.
        </span>
      </p>
    </section>
  );
}

export function BillingCallout({ billing }: { billing: Billing }) {
  const { access, price } = billing;

  if (!billing.enabled) return null;

  if (access.reason === "trial") {
    const jours = access.daysLeft ?? 0;
    const fin = formatDay(access.until);
    return (
      <section className="rise-enter flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:flex-row sm:items-center">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
        >
          <Hourglass className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ui font-bold">
            Essai gratuit — il reste {jours} jour{jours > 1 ? "s" : ""}
          </p>
          <p className="mt-0.5 text-meta text-muted-foreground">
            {price
              ? `Ensuite ${formatPrice(price)} pour continuer à ajouter des journées${fin ? `, à partir du ${fin}` : ""}.`
              : "Ensuite, l'abonnement prend le relais pour continuer à ajouter des journées."}
          </p>
        </div>
        <Button asChild className="shrink-0">
          <Link to="/abonnement">
            {price ? `S'abonner — ${formatPrice(price)}` : "Voir l'offre"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
    );
  }

  if (access.reason === "payment-late")
    return (
      <section className="rise-enter flex flex-col gap-3 rounded-2xl border border-warning bg-warning-bg p-4 sm:flex-row sm:items-center">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning text-background"
        >
          <CreditCard className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ui font-bold text-warning">
            Le dernier paiement n'est pas passé
          </p>
          <p className="mt-0.5 text-meta text-warning">
            Le carnet reste ouvert — on ne coupe pas pour une carte expirée. Mettez-la
            à jour pour que rien ne s'interrompe.
          </p>
        </div>
        {billing.canManage ? (
          <div className="shrink-0">
            <ManageButton label="Mettre la carte à jour" />
          </div>
        ) : null}
      </section>
    );

  if (!access.open) {
    const encore = access.reason === "subscription-over";
    return (
      <section className="rise-enter rounded-2xl border border-primary bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
          >
            <Lock className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-title font-semibold text-balance">
              Le carnet est en pause
            </h2>
            <p className="mt-1 text-ui text-pretty text-muted-foreground">
              {encore
                ? "L'abonnement est terminé : on ne peut plus ajouter de nouvelles journées."
                : "Votre essai gratuit est terminé : on ne peut plus ajouter de nouvelles journées."}{" "}
              <span className="font-bold text-foreground">
                Tout ce qui est déjà écrit reste là, lisible et partagé.
              </span>
            </p>
          </div>
        </div>

        <div className="mt-4">
          {billing.canManage ? (
            <PayButton
              billing={billing}
              label={
                price
                  ? `${encore ? "Reprendre" : "Continuer"} — ${formatPrice(price)}`
                  : undefined
              }
            />
          ) : (
            <BilledToNote billing={billing} />
          )}
        </div>

        <Button asChild variant="link" size="sm" className="-ml-3 mt-1">
          <Link to="/abonnement">
            Ce que comprend l'abonnement
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </section>
    );
  }

  return null;
}

export function CapturePaused({ billing }: { billing: Billing }) {
  return (
    <div className="shell-width flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center gap-5 px-4 py-8 text-center">
      <span
        aria-hidden="true"
        className="grid size-16 place-items-center rounded-3xl bg-primary-soft text-primary"
      >
        <Lock className="size-7" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-serif text-title font-semibold text-balance">
          Le carnet est en pause
        </h1>
        <p className="max-w-[34ch] text-ui text-pretty text-muted-foreground">
          {billing.access.reason === "subscription-over"
            ? "L'abonnement est terminé."
            : "Votre essai gratuit est terminé."}{" "}
          Les journées déjà publiées restent lisibles par tous vos proches — c'est
          l'ajout d'une nouvelle journée qui attend l'abonnement.
        </p>
      </div>
      <div className="flex w-full flex-col items-center gap-3">
        {billing.canManage ? (
          <PayButton
            billing={billing}
            label={
              billing.price
                ? `S'abonner — ${formatPrice(billing.price)}`
                : undefined
            }
          />
        ) : (
          <BilledToNote billing={billing} />
        )}
        <Button asChild variant="outline" className="action-width">
          <Link to="/">
            <BookOpenText aria-hidden="true" />
            Ouvrir le journal
          </Link>
        </Button>
      </div>
    </div>
  );
}
