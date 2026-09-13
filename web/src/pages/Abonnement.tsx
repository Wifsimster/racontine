import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Heart,
  Hourglass,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDay, formatPrice, setBilling, useBilling } from "@/lib/billing";
import type { Billing } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { PageShell, PageHeader, PageSkeleton } from "@/components/PageState";
import { StudioCard } from "@/components/Studio";
import {
  BilledToNote,
  ManageButton,
  OfferCard,
} from "@/features/billing/parts";

/* ===========================================================================
   L'ABONNEMENT — l'écran où l'on décide, et le seul qui parle d'argent.

   Il porte quatre situations, et une seule à la fois :

     essai en cours   → l'offre, avec le nombre de jours restants au-dessus.
     carnet fermé     → l'offre, précédée de ce qui s'est arrêté.
     abonné           → le REÇU, pas une vitrine : ce qui est en cours, jusqu'à
                        quand, et le portail pour la carte, les factures, la
                        résiliation. On ne revend jamais à qui a déjà payé.
     auto-hébergé     → il n'y a pas de caisse ici, et on le dit franchement.

   Le retour de Stripe atterrit sur cet écran (`?paiement=ok&session=cs_…`) : on
   rattrape l'abonnement AUSSITÔT, sans attendre le webhook. Personne ne doit
   lire « essai terminé » trois secondes après avoir payé.
   =========================================================================== */

export default function Abonnement() {
  const { billing, loading, reload } = useBilling();
  const [params, setParams] = useSearchParams();
  const paiement = params.get("paiement");
  const session = params.get("session");
  const [syncing, setSyncing] = useState(paiement === "ok");

  /* Le rattrapage. Il ne tourne qu'une fois : l'identifiant de session est
     retiré de l'URL dans la foulée, sinon un rechargement rejouerait l'appel
     (et le reçu) indéfiniment. */
  useEffect(() => {
    if (paiement !== "ok") return;
    let alive = true;
    const done = () => {
      if (!alive) return;
      setSyncing(false);
      // On garde `paiement=ok` (c'est lui qui affiche le reçu) et on efface la
      // session, qui n'a plus rien à faire dans une barre d'adresse.
      if (session) {
        params.delete("session");
        setParams(params, { replace: true });
      }
    };
    (session ? api.syncBilling(session).then(setBilling) : reload())
      .catch(() => {
        /* Le webhook fera le travail : on n'affiche pas d'erreur à quelqu'un
           dont le paiement vient d'aboutir. */
      })
      .finally(done);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell>
      <PageHeader
        title="L'abonnement"
        lede="Une seule offre, pour tout le foyer. Lire le journal reste gratuit, toujours."
      />

      {paiement === "ok" && <Receipt syncing={syncing} />}
      {paiement === "annule" && (
        <p className="rounded-2xl border bg-card px-4 py-3 text-meta text-muted-foreground shadow-card">
          Paiement abandonné — rien n'a été débité. Vous pouvez y revenir quand
          vous voulez.
        </p>
      )}

      {loading && !billing ? (
        <PageSkeleton label="On ouvre l'abonnement" rows={1} />
      ) : !billing ? (
        <p className="rounded-2xl border bg-card px-4 py-3 text-ui text-muted-foreground shadow-card">
          L'état de l'abonnement n'a pas pu être lu. Votre journal, lui, est
          intact : réessayez dans un instant.
        </p>
      ) : !billing.enabled ? (
        <SelfHosted />
      ) : (
        <Etat billing={billing} />
      )}

      {/* Qui édite, où, et les documents qui engagent — au-dessus de la
          décision, jamais après. */}
      {billing?.enabled && <StudioCard />}
    </PageShell>
  );
}

/** Le reçu de paiement : il confirme, et il dit la suite. */
function Receipt({ syncing }: { syncing: boolean }) {
  return (
    <div
      role="status"
      className="rise-enter flex items-start gap-3 rounded-2xl border border-success bg-success-bg px-4 py-3"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-success text-background"
      >
        <CheckCircle2 className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ui font-bold text-success">
          {syncing ? "On enregistre votre abonnement…" : "Merci — le carnet est rouvert"}
        </p>
        <p className="mt-0.5 text-meta text-success">
          {syncing
            ? "Quelques secondes, le temps que Stripe nous confirme le paiement."
            : "Vous pouvez photographier la page du soir, comme avant. Votre facture vous attend dans le portail."}
        </p>
      </div>
    </div>
  );
}

/** Une instance auto-hébergée n'a pas de caisse, et ça se dit sans détour. */
function SelfHosted() {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card">
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"
      >
        <Heart className="size-5" />
      </span>
      <h2 className="mt-3 font-serif text-title font-semibold">
        Ici, Racontine est gratuit
      </h2>
      <p className="mt-1 text-ui text-pretty text-muted-foreground">
        Cette instance est auto-hébergée : elle n'encaisse rien et ne demandera
        jamais de carte. L'abonnement ne concerne que l'offre hébergée par le
        studio, pour les familles qui ne veulent pas tenir un serveur.
      </p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/">
          <BookOpenText aria-hidden="true" />
          Revenir au journal
        </Link>
      </Button>
    </section>
  );
}

/** L'état courant : abonné (reçu) ou non (l'offre). */
function Etat({ billing }: { billing: Billing }) {
  const { access, price } = billing;
  const abonne = access.reason === "subscribed" || access.reason === "payment-late";

  if (abonne) {
    const fin = formatDay(access.endingAt ?? access.until);
    return (
      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <p className="surtitre text-muted-foreground">votre abonnement</p>
        <h2 className="mt-2 flex flex-wrap items-baseline gap-x-2 font-serif text-title font-semibold">
          Racontine Famille
          {price && (
            <span className="text-ui font-normal text-muted-foreground" data-tabular>
              {formatPrice(price)}
            </span>
          )}
        </h2>

        <p className="mt-3 flex items-start gap-2 text-ui text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span>
            {access.endingAt
              ? `Résilié : le carnet reste ouvert à l'écriture jusqu'au ${fin}. Rien n'est perdu ensuite, vous ne pourrez simplement plus ajouter de journée.`
              : fin
                ? `En cours — prochain renouvellement le ${fin}.`
                : "En cours."}
          </span>
        </p>

        <div className="mt-5">
          {billing.canManage ? (
            <ManageButton label="Carte, factures, résiliation" />
          ) : (
            <BilledToNote billing={billing} />
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      {access.reason === "trial" && (
        <p className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-card">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
          >
            <Hourglass className="size-5" />
          </span>
          <span className="min-w-0 flex-1 text-meta text-muted-foreground">
            <span className="block text-ui font-bold text-foreground">
              Essai gratuit — il reste {access.daysLeft ?? 0} jour
              {(access.daysLeft ?? 0) > 1 ? "s" : ""}
            </span>
            Aucun prélèvement n'a eu lieu, et aucune carte ne vous a été demandée.
          </span>
        </p>
      )}

      {!access.open && (
        <p className="rounded-2xl border border-primary bg-card px-4 py-3 text-ui text-pretty shadow-card">
          {access.reason === "subscription-over"
            ? "L'abonnement est terminé : le carnet n'accepte plus de nouvelle journée."
            : "Votre essai gratuit est terminé : le carnet n'accepte plus de nouvelle journée."}{" "}
          <span className="font-bold">
            Tout ce qui est déjà écrit reste lisible et partagé.
          </span>
        </p>
      )}

      <OfferCard billing={billing} />

      <Button asChild variant="link" size="sm" className="-ml-3">
        <Link to="/">
          Revenir au journal
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </>
  );
}
