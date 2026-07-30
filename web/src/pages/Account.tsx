import { useEffect, useState } from "react";
import { CircleUser } from "lucide-react";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";
import LlmKey from "@/components/LlmKey";
import McpTokens from "@/components/McpTokens";
import { PageShell, PageHeader } from "@/components/PageState";

/**
 * « Mon compte » — réglages propres à l'utilisateur connecté, accessibles à
 * tout compte (et pas seulement au propriétaire de l'instance) : sa clé API
 * d'extraction et ses jetons MCP. Les réglages d'instance restent dans
 * « Réglages » (réservé au propriétaire).
 */
export default function Account() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch(() => {
        /* L'identité est un ORNEMENT ici : les deux encarts ci-dessous portent
           leur propre chargement et leur propre erreur. Un échec sur /me ne doit
           pas masquer la clé API ni les jetons — on retombe simplement sur la
           phrase générique. */
      });
  }, []);

  return (
    <PageShell>
      <PageHeader
        title="Mon compte"
        lede="Vos réglages personnels : la clé qui lit vos carnets et vos connexions Claude."
      />

      {/* Qui est connecté·e. La ligne ne remplace pas le bandeau : elle
          l'ancre, au cran de la légende, avec sa propre tuile d'icône. */}
      <p className="flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-4 text-meta shadow-card">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
        >
          <CircleUser className="size-5" />
        </span>
        {me ? (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-ui font-bold">{me.name}</span>
            <span className="truncate text-muted-foreground">{me.email}</span>
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className="skeleton h-4 w-32"
              role="status"
              aria-label="On ouvre votre compte"
            />
            <span aria-hidden="true" className="skeleton h-3 w-44" />
          </span>
        )}
      </p>

      {/* Clé API Anthropic propre à cet utilisateur (facturée sur son compte). */}
      <LlmKey />

      {/* Jetons MCP personnels (portent les droits de cet utilisateur). */}
      <McpTokens />
    </PageShell>
  );
}
