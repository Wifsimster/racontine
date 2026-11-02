import { useEffect, useState } from "react";
import { CircleUser } from "lucide-react";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";
import LlmKey from "@/components/LlmKey";
import McpTokens from "@/components/McpTokens";
import MesDonnees from "@/components/MesDonnees";
import { PageShell, PageHeader } from "@/components/PageState";

export default function Account() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch(() => {
      });
  }, []);

  return (
    <PageShell className="lg:max-w-[64rem] lg:px-10 lg:pt-8 lg:pb-12">
      <PageHeader
        title="Mon compte"
        lede="Vos réglages personnels : la clé qui lit vos carnets et vos connexions Claude."
      />

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="flex flex-col gap-6">
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

          <LlmKey />
        </div>

        <div className="flex flex-col gap-6">
          <McpTokens />

          <MesDonnees email={me?.email} />
        </div>
      </div>
    </PageShell>
  );
}
