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

/* ===========================================================================
   L'OFFRE — une seule, et les écrans qui en parlent.

   UNE offre, UN prix, UN bouton. Pas de grille à trois colonnes, pas de
   « Basic / Pro / Famille+ » : un carnet de nounou n'a pas de plan Entreprise,
   et une famille qui compare trois colonnes à 22 h ne s'abonne pas — elle
   remet à plus tard. Le tarif est affiché en toutes lettres SUR le bouton :
   personne ne devrait avoir à cliquer pour connaître le prix.

   Ce qu'on répète partout, parce que c'est vrai et que c'est la seule chose qui
   compte quand on demande de l'argent pour des souvenirs d'enfance :
   LE JOURNAL DÉJÀ ÉCRIT RESTE LISIBLE, abonné ou non, pour toujours. Seul
   l'ajout de nouvelles journées est concerné.
   =========================================================================== */

/** Ce que l'abonnement contient. Quatre lignes, écrites du point de vue du foyer. */
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

/**
 * LE BOUTON QUI PAIE. Il appelle le serveur, qui fabrique la page Stripe, puis
 * on y va. Racontine ne voit jamais un numéro de carte.
 *
 * `window.location.assign` et non un `<a>` : l'adresse de paiement est à usage
 * unique et n'existe pas avant le clic. Le bouton garde donc sa couleur et son
 * focus pendant l'attente (`aria-busy`), comme partout ailleurs dans l'app.
 */
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

/** Le portail Stripe : changer de carte, prendre une facture, résilier. */
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

/**
 * Ce que voit quelqu'un qui n'est pas le payeur. Ce n'est PAS un mur : c'est un
 * renseignement. Le co-parent n'a rien à régler, il a quelqu'un à qui en parler,
 * et cette phrase lui donne son nom plutôt que de le laisser devant un bouton
 * qui le refuserait.
 */
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

/**
 * CE QUE L'ABONNEMENT COMPREND, en quatre lignes. Sorti de `OfferCard` parce
 * que l'écran d'accueil public le montre AVANT toute idée de compte : la même
 * liste, écrite une fois, ne peut pas diverger d'un écran à l'autre.
 */
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

/** L'offre, en entier : le prix, ce qu'il comprend, et le bouton. */
export function OfferCard({ billing }: { billing: Billing }) {
  const price = billing.price;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card">
      <p className="surtitre text-muted-foreground">l'offre, il n'y en a qu'une</p>
      <h2 className="mt-2 font-serif text-title font-semibold">
        Racontine Famille
      </h2>

      {/* LE PRIX, au plus gros cran de l'écran. Il ne se cherche pas. */}
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
          /* Stripe n'a pas répondu : on n'invente JAMAIS un montant de secours.
             Mieux vaut une phrase honnête qu'un prix faux au-dessus d'un bouton
             de paiement. */
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

      {/* La promesse qui doit tenir même après une résiliation, écrite là où
          l'on décide de payer — et pas seulement dans les CGV. */}
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

/* ==========================================================================
   L'APPEL SUR L'ACCUEIL — la seule chose que ce travail doit vraiment réussir.

   Trois formes, une par situation, et AUCUNE quand il n'y a rien à dire (foyer
   abonné, instance auto-hébergée) : une app payée ne continue pas à se vendre.

   · pendant l'essai : une BANDE. Elle compte les jours, écrit le prix, et mène
     à l'offre. Elle ne recouvre rien, elle ne clignote pas, elle ne se ferme
     pas non plus — un compte à rebours qu'on peut masquer est un compte à
     rebours qui surprendra son monde le dernier jour.
   · prélèvement en échec : la même bande, en ambre, avec le geste utile.
   · carnet fermé : une CARTE, en haut du journal, qui dit ce qui s'arrête, ce
     qui continue, et porte le seul bouton groseille de l'écran.
   ========================================================================== */

export function BillingCallout({ billing }: { billing: Billing }) {
  const { access, price } = billing;

  if (!billing.enabled) return null;

  /* ── L'essai qui court ─────────────────────────────────────────────────── */
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

  /* ── La carte est passée en échec ──────────────────────────────────────── */
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

  /* ── Le carnet est fermé à l'écriture ──────────────────────────────────── */
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

/**
 * L'écran de capture quand le carnet est fermé. On n'y arrive pas par un bouton
 * (l'accueil ne le propose plus), mais par un signet, un brouillon retrouvé ou
 * le bouton « précédent » — et un cul-de-sac muet serait la pire réponse au
 * geste central du produit.
 */
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
