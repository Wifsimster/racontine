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

/* ===========================================================================
   L'ACCUEIL PUBLIC — le premier écran de l'app, avant tout compte.

   Ce qu'il remplace : ouvrir Racontine sans session menait DIRECTEMENT au
   formulaire de connexion. On demandait donc une adresse et un mot de passe à
   quelqu'un qui ne savait ni ce qu'on lui propose, ni ce que ça coûte, ni
   combien de temps il peut essayer. Le tarif était derrière le compte, et le
   compte était derrière rien du tout.

   Désormais l'offre est LA PAGE PAR DÉFAUT : le prix en toutes lettres, ce
   qu'il comprend, l'essai gratuit, et UN bouton — « Commencer ». La connexion
   ne disparaît pas pour autant, elle passe au rang qui est le sien : une porte
   pour ceux qui ont déjà un carnet, pas le péage de l'accueil.

   Trois règles tiennent cet écran :

   · IL NE MENT PAS SUR LE PRIX. Le montant vient du serveur, qui le tient de
     Stripe. Si Stripe ne répond pas, on écrit qu'on ne l'a pas — on n'invente
     jamais un tarif de secours au-dessus d'un bouton.
   · IL NE DEMANDE PAS DE CARTE. L'essai est une date, pas un abonnement à zéro
     euro : la première chose qu'on promet ici, c'est qu'on ne demande rien.
   · SUR UNE INSTANCE AUTO-HÉBERGÉE, IL N'EXISTE PAS. Pas de Stripe, pas de
     caisse, donc pas de vitrine : on retombe sur la connexion, comme avant.
     Un homelab qui afficherait une page de vente mentirait à son propriétaire.

   Il emprunte le décor de la connexion (le papier réglé, le trait de marge, la
   feuille posée dessus) : les deux portes du produit sont la même maison.
   =========================================================================== */

export default function Bienvenue() {
  /* `undefined` = on ne sait pas encore, `null` = la demande a échoué. La
     distinction compte : tant qu'on ne sait pas, on ne montre RIEN (un écran
     qui saute d'une forme à l'autre en 80 ms a l'air cassé) ; quand la demande
     échoue, on ne bloque personne devant une vitrine vide — on rend la main à
     la connexion, qui est le comportement d'avant. */
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

  /* L'OFFRE A ÉTÉ VUE : le dénominateur de l'entonnoir. Posé ici et pas au
     montage, parce qu'un écran qui redirige aussitôt (instance auto-hébergée,
     offre illisible) n'a rien montré du tout — le compter fausserait les trois
     autres chiffres. Le repère `vue` empêche le double comptage du double
     rendu de développement. */
  const vue = useRef(false);
  useEffect(() => {
    if (vue.current || !offer?.enabled) return;
    vue.current = true;
    mesure("accueil_offre_vue");
  }, [offer]);

  /* Pas de caisse ici (auto-hébergé), ou l'offre n'a pas pu être lue : la porte
     reste la connexion. `replace` — cet écran n'a pas à encombrer l'historique
     d'un aller-retour que personne n'a demandé. */
  if (offer === null || (offer && !offer.enabled))
    return <Navigate to="/login" replace />;

  return (
    <div className="relative isolate min-h-svh overflow-hidden pt-safe pb-safe">
      <LoginBackground />

      {/* La même colonne que la connexion : 26 rem au plus, l'axe de texte à
          40 px du bord (24 px de marge + 16 px de gouttière). */}
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

        {/* La promesse de bas de page ne répète pas la liste de la feuille
            (l'hébergement y est déjà) : elle dit d'où vient l'argent, ce qui
            est la question qu'on se pose devant un carnet d'enfance. */}
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

/**
 * L'OFFRE, SUR LA FEUILLE. Le prix au plus gros cran, ce qu'il comprend, puis
 * le seul bouton groseille de l'écran — et, sous lui, la porte de ceux qui ont
 * déjà un carnet.
 */
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

          {/* LE PRIX. Il ne se cherche pas, et il ne s'invente pas non plus :
              sans réponse de Stripe, on le dit plutôt que d'écrire un montant
              faux juste au-dessus du bouton. */}
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

        {/* L'ESSAI, au-dessus de l'action : c'est lui qu'on vient chercher
            quand on découvre l'app, et il ne coûte pas un numéro de carte. */}
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

        {/* L'ACTION. On ne peut pas payer sans compte : ce bouton mène à la
            création du carnet, et le paiement attend qu'il y ait un foyer à
            qui le rattacher. Le prix reste écrit dessous, jamais caché. */}
        <div className="flex flex-col gap-2">
          {signupEnabled ? (
            <>
              <Button asChild size="lg" className="action-width">
                <Link
                  to="/login?porte=inscription"
                  onClick={() => mesure("accueil_commencer")}
                >
                  <BookOpenText aria-hidden="true" />
                  Commencer — c'est gratuit {trialDays} jours
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
            /* Inscriptions fermées : promettre « Commencer » mènerait à une
               porte close. On dit ce qui est, et on montre la seule entrée. */
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
            /* `px-0` : le bord gauche de la boîte tombe sur l'axe de texte de
               l'écran, comme l'affordance jumelle de la connexion. Le survol
               fonce le soulignement, il n'allume pas un fond. */
            className="justify-start px-0 font-normal underline decoration-input decoration-1 underline-offset-4 hover:bg-transparent hover:decoration-foreground"
          >
            <Link to="/login" onClick={() => mesure("accueil_connexion")}>
              J'ai déjà un carnet — me connecter
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}

      {/* QUI ÉDITE, ET LES DOCUMENTS QUI ENGAGENT — la même règle que l'écran
          de l'abonnement, appliquée à l'écran qui affiche maintenant le prix.

          C'est tout l'objet de la distinction posée dans `Studio.tsx` : la
          SIGNATURE (une ligne, « Édité par… ») suffit au pied d'une porte, mais
          dès qu'un écran montre un tarif et mène à un engagement, il doit
          nommer l'éditeur, sa forme juridique, sa ville, son e-mail, et donner
          les conditions de vente, la résiliation et la confidentialité. Cet
          écran-ci les doit d'autant plus qu'il s'adresse à quelqu'un qui n'a
          pas encore de compte : avant, ces documents n'apparaissaient qu'après
          l'inscription, c'est-à-dire après la décision.

          L'encart REMPLACE la ligne de signature du pied de page — il la
          contient déjà, et nommer deux fois l'éditeur sur le même écran ne le
          rend pas plus clair. */}
      <StudioCard className="mt-6" />
    </>
  );
}

/**
 * L'attente. On ne montre pas « Chargement… », on montre la FORME de la feuille
 * qui arrive — et le message réel part aux lecteurs d'écran.
 */
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
