import { useEffect, useState } from "react";
import { CircleUser } from "lucide-react";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";
import LlmKey from "@/components/LlmKey";
import McpTokens from "@/components/McpTokens";

/**
 * « Mon compte » — réglages propres à l'utilisateur connecté, accessibles à
 * tout compte (et pas seulement au propriétaire de l'instance) : sa clé API
 * d'extraction et ses jetons MCP. Les réglages d'instance restent dans
 * « Réglages » (réservé au propriétaire).
 */
export default function Account() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => {});
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4 pb-24">
      <div className="flex items-center gap-2">
        <CircleUser className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">Mon compte</h1>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        {me
          ? `Connecté·e en tant que ${me.name} · ${me.email}`
          : "Vos réglages personnels — clé API d'extraction et connexions Claude."}
      </p>

      {/* Clé API Anthropic propre à cet utilisateur (facturée sur son compte). */}
      <LlmKey />

      {/* Jetons MCP personnels (portent les droits de cet utilisateur). */}
      <McpTokens />
    </div>
  );
}
