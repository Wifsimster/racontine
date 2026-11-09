import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { signOut } from "@/lib/auth-client";
import type { Me } from "@/lib/types";
import { Button } from "@/components/ui/button";
import CaptureReminders from "@/components/CaptureReminders";
import LlmKey from "@/components/LlmKey";
import McpTokens from "@/components/McpTokens";
import MesDonnees from "@/components/MesDonnees";
import { PageShell, PageHeader } from "@/components/PageState";

export default function Account() {
  const [me, setMe] = useState<Me | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch(() => {
      });
  }, []);

  return (
    <PageShell className="lg:max-w-[48rem] lg:px-10 lg:pt-8 lg:pb-12">
      <PageHeader
        title="Mon compte"
        tone="anecdote"
        lede="Votre rappel du carnet, votre clé de lecture, vos connexions Claude et vos données."
      />

      <div className="-mt-2 flex min-w-0 flex-col text-meta">
        {me ? (
          <>
            <span className="truncate text-ui font-bold">{me.name}</span>
            <span className="truncate text-muted-foreground">{me.email}</span>
          </>
        ) : (
          <span className="flex min-w-0 flex-col gap-1.5">
            <span
              className="skeleton h-4 w-32"
              role="status"
              aria-label="On ouvre votre compte"
            />
            <span aria-hidden="true" className="skeleton h-3 w-44" />
          </span>
        )}
      </div>

      <div className="flex flex-col divide-y border-t">
        <CaptureReminders />
        <LlmKey />
        <McpTokens />
        <MesDonnees email={me?.email} />
        <section className="flex flex-col gap-2 py-6">
          <h2 className="font-serif text-title font-semibold">Session</h2>
          <Button
            variant="outline"
            className="self-start"
            loading={leaving}
            onClick={() => {
              setLeaving(true);
              signOut().then(() => (window.location.href = "/login"));
            }}
          >
            {!leaving && <LogOut aria-hidden="true" />}
            Se déconnecter
          </Button>
        </section>
      </div>
    </PageShell>
  );
}
