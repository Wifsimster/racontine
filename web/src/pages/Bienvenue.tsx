import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRight, BookOpenText, Hourglass, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { mesure } from "@/lib/mesure";
import { formatAmount, formatInterval, formatPrice } from "@/lib/billing";
import type { BillingOffer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { LoginBackground } from "@/components/LoginBackground";
import { MarqueSignature } from "@/components/Marque";
import { StudioCard } from "@/components/Studio";
import { MargeRule, SHEET } from "@/features/login/parts";
import { OfferIncludes } from "@/features/billing/parts";

export default function Bienvenue() {
  const [offer, setOffer] = useState<BillingOffer | null | undefined>(undefined);
  const [appName, setAppName] = useState("Racontine");
  const [signupEnabled, setSignupEnabled] = useState(true);

  useEffect(() => {
    let alive = true;
    api
      .publicSettings()
      .then((s) => {
        if (!alive) return;
        setAppName(s.appName);
        setSignupEnabled(s.signupEnabled);
      })
      .catch(() => {});
    api
      .billingOffer()
      .then((o) => alive && setOffer(o))
      .catch(() => alive && setOffer(null));
    return () => {
      alive = false;
    };
  }, []);

  const vue = useRef(false);
  useEffect(() => {
    if (vue.current || !offer?.enabled) return;
    vue.current = true;
    mesure("accueil_offre_vue");
  }, [offer]);

  if (offer === null || (offer && !offer.enabled))
    return <Navigate to="/login" replace />;

  return (
    <div className="relative isolate min-h-svh overflow-hidden pt-safe pb-safe">
      <LoginBackground />

      <div className="rise-enter mx-auto flex w-full max-w-[26rem] flex-col pt-[5.25rem] pr-5 pb-6 pl-10">
        <p className="surtitre text-muted-foreground">Carnet de liaison</p>
        <h1 className="mt-4 font-serif text-display font-semibold text-foreground">
          {appName}
        </h1>
        <p className="carnet-story mt-4 text-foreground">
          {"Photographiez le carnet : la journée s’écrit, les proches la lisent."}
        </p>

        {offer === undefined ? (
          <OffreSquelette />
        ) : (
          <Offre
            offer={offer}
            signupEnabled={signupEnabled}
          />
        )}

        <p className="mt-4 flex items-start gap-2 text-meta text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {"Ni publicité, ni revente : Racontine est payé par les familles, pas par leurs données."}
          </span>
        </p>

        <MarqueSignature className="mt-6" />
      </div>
    </div>
  );
}

function Offre({
  offer,
  signupEnabled,
}: {
  offer: BillingOffer;
  signupEnabled: boolean;
}) {
  const { price, trialDays } = offer;

  return (
    <>
      <section className={SHEET} aria-labelledby="offre-titre">
        <MargeRule />

        <div>
          <p className="surtitre text-muted-foreground">
            l'offre, il n'y en a qu'une
          </p>
          <h2
            id="offre-titre"
            className="mt-2 font-serif text-title font-semibold"
          >
            Racontine Famille
          </h2>

          <p className="mt-4 flex items-baseline gap-2">
            {price ? (
              <>
                <span
                  className="font-serif text-display font-semibold"
                  data-tabular
                >
                  {formatAmount(price)}
                </span>
                <span className="text-ui text-muted-foreground">
                  {formatInterval(price)}
                </span>
              </>
            ) : (
              <span className="text-ui text-muted-foreground">
                Le tarif n'a pas pu être récupéré à l'instant — il s'affichera
                avant tout engagement, et aucune carte n'est demandée pour
                essayer.
              </span>
            )}
          </p>
          <p className="mt-1 text-meta text-muted-foreground">
            Pour tout le foyer · sans engagement, résiliable en deux clics.
          </p>
        </div>

        {trialDays > 0 && (
          <p className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
            >
              <Hourglass className="size-5" />
            </span>
            <span className="min-w-0 flex-1 text-meta text-muted-foreground">
              <span className="block text-ui font-bold text-foreground">
                {trialDays} jours d'essai gratuit
              </span>
              Aucun prélèvement, et aucune carte bancaire à donner pour
              commencer.
            </span>
          </p>
        )}

        <OfferIncludes />

        <div className="flex flex-col gap-2">
          {signupEnabled ? (
            <>
              <Button asChild size="lg" className="action-width">
                <Link
                  to="/login?porte=inscription"
                  onClick={() => mesure("accueil_commencer")}
                >
                  <BookOpenText aria-hidden="true" />
                  Commencer l'essai gratuit
                </Link>
              </Button>
              {price && (
                <p className="text-meta text-muted-foreground">
                  Ensuite {formatPrice(price)} pour continuer à ajouter des
                  journées. Le journal déjà écrit, lui, reste lisible pour
                  toujours.
                </p>
              )}
            </>
          ) : (
            <>
              <Button asChild size="lg" className="action-width">
                <Link to="/login" onClick={() => mesure("accueil_commencer")}>
                  <BookOpenText aria-hidden="true" />
                  Ouvrir mon carnet
                </Link>
              </Button>
              <p className="text-meta text-muted-foreground">
                {"Les inscriptions sont fermées sur cette instance : les proches invités arrivent par le lien reçu par e-mail."}
              </p>
            </>
          )}
        </div>
      </section>

      {signupEnabled && (
        <div className="mt-2 flex min-h-11 items-center">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="justify-start px-0 font-normal underline decoration-input decoration-1 underline-offset-4 hover:bg-transparent hover:decoration-foreground"
          >
            <Link to="/login" onClick={() => mesure("accueil_connexion")}>
              J'ai déjà un carnet — me connecter
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}

      <StudioCard className="mt-6" />
    </>
  );
}

function OffreSquelette() {
  return (
    <>
      <div className={SHEET} aria-hidden="true">
        <MargeRule />
        <div>
          <div className="skeleton h-3 w-32" />
          <div className="skeleton mt-3 h-6 w-48" />
          <div className="skeleton mt-4 h-9 w-36" />
          <div className="skeleton mt-3 h-3 w-52" />
        </div>
        <div className="skeleton h-12 w-full" />
        <div className="skeleton h-12 w-full" />
      </div>
      <p role="status" className="sr-only">
        On ouvre l'offre…
      </p>
    </>
  );
}
