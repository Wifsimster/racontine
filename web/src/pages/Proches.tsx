import { useEffect, useState } from "react";
import { Bell, BellOff, Mail, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { Child, Subscriber, SubscriptionStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";

type ChildState = {
  status: SubscriptionStatus;
  subscribers: Subscriber[];
};

function ChildCard({ child }: { child: Child }) {
  const [state, setState] = useState<ChildState | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [status, subs] = await Promise.all([
      api.getSubscription(child.id),
      api.listSubscribers(child.id),
    ]);
    setState({ status, subscribers: subs.subscribers });
  }

  useEffect(() => {
    load().catch(() => setState({ status: { subscribed: false, emailEnabled: true }, subscribers: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child.id]);

  async function toggleSubscribe() {
    if (!state) return;
    setBusy(true);
    try {
      if (state.status.subscribed) {
        await api.unsubscribe(child.id);
      } else {
        await api.subscribe(child.id, state.status.emailEnabled);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleEmail() {
    if (!state || !state.status.subscribed) return;
    setBusy(true);
    try {
      await api.subscribe(child.id, !state.status.emailEnabled);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{child.name}</span>
        <Button
          variant={state?.status.subscribed ? "default" : "outline"}
          size="sm"
          disabled={busy || !state}
          onClick={toggleSubscribe}
        >
          {state?.status.subscribed ? <Bell /> : <BellOff />}
          {state?.status.subscribed ? "Suivi" : "Suivre"}
        </Button>
      </div>

      {state?.status.subscribed && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={state.status.emailEnabled}
            disabled={busy}
            onChange={toggleEmail}
          />
          <Mail className="size-4 text-muted-foreground" />
          Recevoir aussi un e-mail à chaque nouvelle journée
        </label>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users className="size-3.5" />
          Proches abonnés ({state?.subscribers.length ?? 0})
        </div>
        {state && state.subscribers.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {state.subscribers.map((s) => (
              <li
                key={s.userId}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>
                  {s.name}{" "}
                  <span className="text-muted-foreground">({s.email})</span>
                </span>
                {s.emailEnabled && (
                  <Mail
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-label="reçoit les e-mails"
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Personne ne suit encore cette timeline.
          </p>
        )}
      </div>
    </div>
  );
}

export default function Proches() {
  const [children, setChildren] = useState<Child[] | null>(null);

  useEffect(() => {
    api
      .listChildren()
      .then(setChildren)
      .catch(() => setChildren([]));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-4 pb-16">
      <div>
        <h1 className="text-xl font-semibold">Proches & notifications</h1>
        <p className="text-sm text-muted-foreground">
          Suivez la timeline d'un enfant pour être notifié — dans l'app et par
          e-mail — à chaque journée publiée.
        </p>
      </div>

      {children === null ? (
        <p className="py-12 text-center text-muted-foreground">Chargement…</p>
      ) : children.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          Aucun enfant pour l'instant.
        </p>
      ) : (
        children.map((c) => <ChildCard key={c.id} child={c} />)
      )}
    </div>
  );
}
