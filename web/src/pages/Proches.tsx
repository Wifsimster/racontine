import { useEffect, useState } from "react";
import { Users, CloudOff, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import type { Child, Subscriber, SubscriptionStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChildMark } from "@/components/ChildMark";
import { ageLabel } from "@/lib/child";
import { Toggle } from "@/components/ui/toggle";
import {
  getPushState,
  enablePush,
  disablePush,
  type PushState,
} from "@/lib/push";
import {
  PageShell,
  PageHeader,
  PageState,
  PageSkeleton,
  InlineError,
} from "@/components/PageState";
import { MemberRow } from "@/components/MemberRow";

const SHELL = "lg:max-w-[64rem] lg:px-10 lg:pt-8 lg:pb-12";

type ChildState = {
  status: SubscriptionStatus;
  subscribers: Subscriber[] | null;
};

function PushCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (state === "subscribed") {
        await disablePush();
      } else {
        await enablePush();
      }
      setState(await getPushState());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec.");
    } finally {
      setBusy(false);
    }
  }

  if (state === null || state === "unsupported" || state === "unavailable")
    return null;

  const on = state === "subscribed";
  const blocked = state === "denied";

  return (
    <section className="flex flex-col gap-2 py-6 first:pt-0">
      <h2 className="font-serif text-title font-semibold">Cet appareil</h2>
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <label htmlFor="push-device" className="text-ui font-bold">
            Notifications sur cet appareil
          </label>
          <p
            id="push-device-hint"
            className="max-w-[52ch] text-meta text-pretty text-muted-foreground"
          >
            {blocked
              ? "Bloquées par le navigateur : autorisez-les dans les réglages du site."
              : "Une alerte à chaque journée publiée, même l'application fermée."}
          </p>
        </div>
        <Toggle
          id="push-device"
          checked={on}
          disabled={blocked || busy}
          aria-describedby="push-device-hint"
          onChange={() => void toggle()}
        />
      </div>
      {error && (
        <InlineError>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </InlineError>
      )}
    </section>
  );
}

function ChildCard({ child }: { child: Child }) {
  const [state, setState] = useState<ChildState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = child.role === "admin";

  async function load() {
    const [status, subs] = await Promise.all([
      api.getSubscription(child.id),
      isAdmin ? api.listSubscribers(child.id) : Promise.resolve(null),
    ]);
    setState({ status, subscribers: subs?.subscribers ?? null });
  }

  useEffect(() => {
    load().catch((e) =>
      setError(e instanceof Error ? e.message : "Suivi indisponible"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child.id]);

  async function toggleSubscribe() {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      if (state.status.subscribed) {
        await api.unsubscribe(child.id);
      } else {
        await api.subscribe(child.id, state.status.emailEnabled);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEmail() {
    if (!state || !state.status.subscribed) return;
    setBusy(true);
    setError(null);
    try {
      await api.subscribe(child.id, !state.status.emailEnabled);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  }

  const subscribed = state?.status.subscribed ?? false;
  const age = ageLabel(child.birthdate);

  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <ChildMark name={child.name} size="md" />
          <div className="flex min-w-0 flex-col">
            <h3 className="truncate font-serif text-title font-semibold">
              {child.name}
            </h3>
            {age && <p className="text-meta text-muted-foreground">{age}</p>}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 py-1">
        <label htmlFor={`suivi-${child.id}`} className="text-ui font-bold">
          Être prévenu
        </label>
        <Toggle
          id={`suivi-${child.id}`}
          checked={subscribed}
          disabled={!state || busy}
          onChange={() => void toggleSubscribe()}
        />
      </div>

      {state && state.status.subscribed && (
        <div className="flex items-center justify-between gap-4 py-1">
          <label
            htmlFor={`mail-${child.id}`}
            className="min-w-0 text-ui font-bold"
          >
            Aussi par e-mail
          </label>
          <Toggle
            id={`mail-${child.id}`}
            checked={state.status.emailEnabled}
            disabled={busy}
            onChange={() => void toggleEmail()}
          />
        </div>
      )}

      {error && (
        <InlineError>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </InlineError>
      )}

      {isAdmin && (
        <div className="flex flex-col gap-1 pt-2">
          <h4 className="text-meta font-bold text-muted-foreground">
            Proches abonnés ({state?.subscribers?.length ?? 0})
          </h4>
          {state?.subscribers && state.subscribers.length > 0 ? (
            <ul className="flex flex-col divide-y">
              {state.subscribers.map((s) => (
                <MemberRow
                  key={s.userId}
                  name={s.name}
                  meta={s.emailEnabled ? "reçoit les e-mails" : undefined}
                  detail={s.email}
                />
              ))}
            </ul>
          ) : (
            <p className="text-meta text-muted-foreground">
              Personne ne suit encore ce carnet.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function Proches() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listChildren()
      .then(setChildren)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Échec du chargement"),
      );
  }, []);

  const header = (
    <PageHeader
      title="Les proches"
      lede="Choisissez les carnets dont chaque nouvelle journée vous est signalée."
    />
  );

  if (error)
    return (
      <PageShell className={SHELL}>
        {header}
        <PageState
          icon={CloudOff}
          tone="error"
          title="Les proches ne répondent pas"
          actions={
            <Button onClick={() => window.location.reload()}>Réessayer</Button>
          }
        >
          {error}
        </PageState>
      </PageShell>
    );

  if (children === null)
    return (
      <PageShell className={SHELL}>
        {header}
        <PageSkeleton label="Racontine ouvre le cercle" rows={2} />
      </PageShell>
    );

  return (
    <PageShell className={SHELL}>
      {header}

      {children.length === 0 ? (
        <>
          <PushCard />
          <PageState icon={Users} title="Aucun carnet à suivre">
            Dès qu'un carnet est partagé avec vous, il apparaît ici et vous
            pouvez choisir d'en être prévenu·e.
          </PageState>
        </>
      ) : (
        <div className="flex max-w-3xl flex-col divide-y">
          <section className="flex flex-col gap-2 py-6 first:pt-0">
            <h2 className="font-serif text-title font-semibold">
              Les carnets ({children.length})
            </h2>
            <ul className="flex flex-col divide-y">
              {children.map((c) => (
                <ChildCard key={c.id} child={c} />
              ))}
            </ul>
          </section>
          <PushCard />
        </div>
      )}
    </PageShell>
  );
}
