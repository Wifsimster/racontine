import { ExternalLink } from "lucide-react";
import { STUDIO } from "@/lib/studio";
import { cn } from "@/lib/utils";

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
