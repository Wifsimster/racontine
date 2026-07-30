import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  Mail,
  Smartphone,
  Users,
  CloudOff,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Child, Subscriber, SubscriptionStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
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
  SectionLabel,
  InlineError,
} from "@/components/PageState";

type ChildState = {
  status: SubscriptionStatus;
  subscribers: Subscriber[];
};

/**
 * Active/désactive les notifications navigateur (Web Push) pour l'APPAREIL
 * courant. C'est un réglage par appareil, indépendant du suivi par enfant :
 * une fois activé, l'abonné reçoit une notification système pour chaque
 * timeline qu'il suit, même l'app fermée.
 */
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

  // Rien à afficher si le navigateur ne gère pas le push ou si le serveur n'a
  // pas de clés VAPID : le canal n'existe pas, inutile de proposer un bouton.
  if (state === null || state === "unsupported" || state === "unavailable")
    return null;

  const on = state === "subscribed";
  const blocked = state === "denied";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-ui font-bold">
          <Smartphone
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          Notifications sur cet appareil
        </h2>
        <Button
          variant={on ? "default" : "outline"}
          size="sm"
          loading={busy}
          disabled={blocked}
          onClick={toggle}
        >
          {!busy && (on ? <BellRing aria-hidden="true" /> : <BellOff aria-hidden="true" />)}
          {on ? "Activées" : "Activer"}
        </Button>
      </div>
      <p className="text-meta text-pretty text-muted-foreground">
        {blocked
          ? "Notifications bloquées par le navigateur. Autorisez-les dans les réglages du site pour les recevoir ici."
          : "Recevez une notification directement sur cet appareil à chaque nouvelle journée publiée, même l'application fermée."}
      </p>
      {error && (
        <InlineError>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </InlineError>
      )}
    </div>
  );
}

function ChildCard({ child }: { child: Child }) {
  const [state, setState] = useState<ChildState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [status, subs] = await Promise.all([
      api.getSubscription(child.id),
      api.listSubscribers(child.id),
    ]);
    setState({ status, subscribers: subs.subscribers });
  }

  useEffect(() => {
    // Un échec de chargement ne se déguise PAS en « non abonné » : on le dit.
    // Avant, le `catch` fabriquait un état crédible (`subscribed: false`), et
    // l'écran affirmait tranquillement le contraire de la vérité.
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

  return (
    <li className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 truncate font-serif text-title font-semibold">
          {child.name}
        </h3>
        <Button
          variant={subscribed ? "default" : "outline"}
          size="sm"
          loading={busy}
          disabled={!state}
          aria-pressed={subscribed}
          onClick={toggleSubscribe}
        >
          {!busy &&
            (subscribed ? <Bell aria-hidden="true" /> : <BellOff aria-hidden="true" />)}
          {subscribed ? "Suivi" : "Suivre"}
        </Button>
      </div>

      {/* Le MÊME interrupteur que dans « Réglages » : c'est le même geste (un
          booléen appliqué tout de suite), il n'a pas à changer de dessin d'un
          écran à l'autre. Avant, c'était une case à cocher native de 16 px, dont
          le libellé n'était même pas cliquable. */}
      {state && state.status.subscribed && (
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor={`mail-${child.id}`}
            className="flex min-w-0 items-center gap-2 text-meta"
          >
            <Mail
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            Recevoir aussi un e-mail à chaque nouvelle journée
          </label>
          <Toggle
            id={`mail-${child.id}`}
            checked={state.status.emailEnabled}
            disabled={busy}
            onChange={toggleEmail}
          />
        </div>
      )}

      {error && (
        <InlineError>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </InlineError>
      )}

      <div className="flex flex-col gap-2 border-t pt-4">
        <p className="surtitre flex items-center gap-1.5 text-muted-foreground">
          <Users className="size-3.5 shrink-0" aria-hidden="true" />
          Proches abonnés ({state?.subscribers.length ?? 0})
        </p>
        {state && state.subscribers.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {state.subscribers.map((s) => (
              <li
                key={s.userId}
                className="flex items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate text-meta">
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
          <p className="text-meta text-muted-foreground">
            Personne ne suit encore ce carnet.
          </p>
        )}
      </div>
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
      lede="Suivez le carnet d'un enfant pour être prévenu·e — dans l'app et par e-mail — à chaque journée publiée."
    />
  );

  if (error)
    return (
      <PageShell>
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
      <PageShell>
        {header}
        <PageSkeleton label="Racontine ouvre le cercle" rows={2} />
      </PageShell>
    );

  return (
    <PageShell>
      {header}

      <PushCard />

      {children.length === 0 ? (
        <PageState icon={Users} title="Aucun carnet à suivre">
          Dès qu'un carnet est partagé avec vous, il apparaît ici et vous pouvez
          choisir d'en être prévenu·e.
        </PageState>
      ) : (
        <section className="flex flex-col gap-1">
          <SectionLabel className="px-1">
            Les carnets ({children.length})
          </SectionLabel>
          <ul className="flex flex-col gap-3">
            {children.map((c) => (
              <ChildCard key={c.id} child={c} />
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
