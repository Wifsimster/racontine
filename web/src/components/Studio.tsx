import { ExternalLink } from "lucide-react";
import { STUDIO } from "@/lib/studio";
import { cn } from "@/lib/utils";

/* ===========================================================================
   LA SIGNATURE DU STUDIO — discrète partout, complète au moment de payer.

   Deux objets, et la différence entre les deux est tout l'intérêt :

   · `StudioSignature` est une LIGNE. Elle va au pied des portes et du menu,
     sous « Propulsé par Racontine », et elle ne réclame rien : elle dit
     seulement qu'il y a quelqu'un derrière ce carnet.
   · `StudioCard` est un ENCART, et il n'apparaît qu'à un seul endroit : l'écran
     de l'abonnement, au-dessus du bouton de paiement. Là, on nomme l'éditeur,
     sa forme juridique, sa ville, son e-mail, et on donne les trois liens qui
     comptent vraiment — conditions de vente, résiliation, confidentialité. Ils
     ne sont pas en petit et pas en gris clair : quelqu'un qui s'apprête à
     confier son carnet et sa carte a le droit de savoir à qui.
   =========================================================================== */

/** « Édité par BATTISTELLA » — une ligne, sans emphase. */
export function StudioSignature({ className }: { className?: string }) {
  return (
    <p className={cn("text-meta text-muted-foreground", className)}>
      Édité par{" "}
      <a
        href={STUDIO.url}
        target="_blank"
        rel="noreferrer"
        className="font-bold text-foreground underline decoration-dotted underline-offset-2 transition-colors dur-fast hover:text-primary"
      >
        {STUDIO.name}
      </a>
      , {STUDIO.tagline}.
    </p>
  );
}

/** L'encart complet : qui édite, où, et les documents qui engagent. */
export function StudioCard({ className }: { className?: string }) {
  return (
    <section
      className={cn("rounded-2xl border bg-card p-5 shadow-card", className)}
      aria-labelledby="editeur"
    >
      <h2 id="editeur" className="surtitre text-muted-foreground">
        L'éditeur
      </h2>
      <p className="mt-3 text-ui">
        <a
          href={STUDIO.url}
          target="_blank"
          rel="noreferrer"
          className="font-bold underline decoration-dotted underline-offset-2 transition-colors dur-fast hover:text-primary"
        >
          {STUDIO.name}
        </a>{" "}
        conçoit, développe et héberge Racontine.
      </p>
      <p className="mt-1 text-meta text-muted-foreground">
        {STUDIO.legalName} · {STUDIO.city} ·{" "}
        <a
          href={`mailto:${STUDIO.email}`}
          className="underline decoration-dotted underline-offset-2"
        >
          {STUDIO.email}
        </a>
      </p>

      {/* Les documents qui engagent. Ils s'ouvrent dans un onglet : on ne sort
          jamais quelqu'un de son carnet pour lui faire lire des CGV. */}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {[
          ["Conditions de vente", STUDIO.links.cgv],
          ["Résiliation & remboursement", STUDIO.links.remboursement],
          ["Confidentialité", STUDIO.links.confidentialite],
          ["Mentions légales", STUDIO.links.mentions],
        ].map(([label, href]) => (
          <li key={href}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 text-meta text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors dur-fast hover:text-foreground"
            >
              {label}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
