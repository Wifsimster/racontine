import { useEffect, useState } from "react";
import {
  Save,
  Check,
  ShieldAlert,
  Link2,
  CloudOff,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { AppSettings, SettingsMeta } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import {
  PageShell,
  PageHeader,
  PageState,
  PageSkeleton,
  InlineError,
} from "@/components/PageState";

function Row({
  title,
  hint,
  htmlFor,
  children,
}: {
  title: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
        <Label htmlFor={htmlFor} className="text-ui font-bold">
          {title}
        </Label>
        {hint && (
          <p className="max-w-[52ch] text-meta text-pretty text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="min-w-0 text-meta">{label}</dt>
      <dd
        className={`flex shrink-0 items-center gap-2 text-meta font-bold ${ok ? "text-success" : "text-muted-foreground"}`}
      >
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${ok ? "bg-success" : "bg-muted-foreground"}`}
        />
        {ok ? "configuré" : "absent"}
      </dd>
    </div>
  );
}

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 py-6 first:pt-0">
      <h2 className="font-serif text-title font-semibold">{title}</h2>
      {intro && (
        <p className="max-w-[52ch] text-meta text-pretty text-muted-foreground">
          {intro}
        </p>
      )}
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [initial, setInitial] = useState<AppSettings | null>(null);
  const [meta, setMeta] = useState<SettingsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((res) => {
        setSettings(res.settings);
        setInitial(res.settings);
        setMeta(res.meta);
      })
      .catch((e) => {
        if (e instanceof Error && /propriétaire|403/.test(e.message))
          setForbidden(true);
        else setError(e instanceof Error ? e.message : "Échec du chargement");
      })
      .finally(() => setLoading(false));
  }, []);

  function patch<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    setSaved(false);
  }

  const dirty =
    settings && initial
      ? (Object.keys(settings) as (keyof AppSettings)[]).filter(
          (k) => settings[k] !== initial[k],
        )
      : [];

  function cancel() {
    setSettings(initial);
    setError(null);
  }

  async function save() {
    if (!settings || !dirty.length) return;
    setSaving(true);
    setError(null);
    try {
      const changed: Partial<AppSettings> = {};
      const assign = <K extends keyof AppSettings>(k: K) => {
        changed[k] = settings[k];
      };
      dirty.forEach(assign);
      const res = await api.updateSettings(changed);
      setSettings(res.settings);
      setInitial(res.settings);
      setMeta(res.meta);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <PageHeader
      title="Réglages"
        tone="nap"
      lede="Ils s'appliquent tout de suite à toute l'instance."
    />
  );

  if (loading)
    return (
      <PageShell className="lg:max-w-[64rem] lg:px-10 lg:pt-8">
        {header}
        <PageSkeleton label="Racontine ouvre les réglages" rows={3} />
      </PageShell>
    );

  if (forbidden)
    return (
      <PageShell className="lg:max-w-[64rem] lg:px-10 lg:pt-8">
        {header}
        <PageState
          icon={ShieldAlert}
          tone="locked"
          title="Réglages réservés au propriétaire"
        >
          Seul le propriétaire de l'instance — le premier compte créé — peut
          modifier les réglages de l'application. Vos propres réglages, eux, sont
          dans « Mon compte ».
        </PageState>
      </PageShell>
    );

  if (!settings || !meta)
    return (
      <PageShell className="lg:max-w-[64rem] lg:px-10 lg:pt-8">
        {header}
        <PageState
          icon={CloudOff}
          tone="error"
          title="Les réglages ne répondent pas"
          actions={
            <Button onClick={() => window.location.reload()}>Réessayer</Button>
          }
        >
          {error ??
            "La connexion au serveur a échoué. Rien n'a été modifié : réessayez dans un instant."}
        </PageState>
      </PageShell>
    );

  const models = Array.from(
    new Set([...meta.knownVlmModels, settings.vlmModel]),
  );

  return (
    <PageShell className="pb-8 lg:max-w-[64rem] lg:px-10 lg:pt-8">
      {header}

      <div className="flex max-w-3xl flex-col divide-y">
        <Section title="L'instance">
          <Row
            title="Nom de l'instance"
            hint="Affiché dans l'en-tête et sur l'écran de connexion."
            htmlFor="appName"
          >
            <Input
              id="appName"
              value={settings.appName}
              maxLength={60}
              onChange={(e) => patch("appName", e.target.value)}
              className="w-full sm:w-56"
            />
          </Row>
        </Section>

        <Section title="Accès et partage">
          <Row
            title="Inscriptions ouvertes"
            hint="À fermer une fois le foyer créé. Les invités par lien restent acceptés."
            htmlFor="signupEnabled"
          >
            <Toggle
              id="signupEnabled"
              checked={settings.signupEnabled}
              onChange={(v) => patch("signupEnabled", v)}
            />
          </Row>
          <Row
            title="Validité des invitations"
            hint="Durée avant expiration d'un lien d'invitation."
            htmlFor="invitationTtlDays"
          >
            <div className="flex items-center gap-2">
              <Input
                id="invitationTtlDays"
                type="number"
                min={1}
                max={365}
                value={settings.invitationTtlDays}
                onChange={(e) =>
                  patch(
                    "invitationTtlDays",
                    Math.max(1, Math.min(365, Number(e.target.value) || 1)),
                  )
                }
                className="w-20"
              />
              <span className="text-meta text-muted-foreground">jours</span>
            </div>
          </Row>
        </Section>

        <Section title="Notifications">
          <Row
            title="E-mails de notification"
            hint={
              meta.mailConfigured
                ? "Un e-mail aux abonnés à chaque journée publiée."
                : "Serveur e-mail absent : seules les notifications dans l'app partent."
            }
            htmlFor="emailNotificationsEnabled"
          >
            <Toggle
              id="emailNotificationsEnabled"
              checked={settings.emailNotificationsEnabled}
              disabled={!meta.mailConfigured}
              onChange={(v) => patch("emailNotificationsEnabled", v)}
            />
          </Row>
        </Section>

        <Section title="Lecture des carnets">
          <Row
            title="Modèle d'extraction"
            hint="Modèle Claude qui lit les carnets, avec la clé de chaque contributeur."
            htmlFor="vlmModel"
          >
            <Select
              id="vlmModel"
              value={settings.vlmModel}
              onChange={(e) => patch("vlmModel", e.target.value)}
              className="w-full sm:w-auto"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Row>
        </Section>

        <Section
          title="Infrastructure"
          intro="Lu depuis les variables d'environnement du serveur, non modifiable ici."
        >
          <dl className="flex flex-col divide-y">
            <StatusLine ok={meta.mailConfigured} label="Serveur e-mail (SMTP)" />
            <StatusLine
              ok={meta.webPushConfigured}
              label="Notifications navigateur (Web Push)"
            />
            <StatusLine
              ok={meta.notifyWebhookConfigured}
              label="Webhook de notification"
            />
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="flex shrink-0 items-center gap-2 text-meta">
                <Link2
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                URL publique
              </dt>
              <dd className="min-w-0 truncate text-meta text-muted-foreground">
                {meta.webBaseUrl}
              </dd>
            </div>
          </dl>
        </Section>
      </div>

      {error && (
        <InlineError>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </InlineError>
      )}

      <p aria-live="polite" className="sr-only">
        {dirty.length
          ? "Des modifications ne sont pas encore enregistrées."
          : saved
            ? "Réglages enregistrés."
            : ""}
      </p>
      {saved && !dirty.length && (
        <p
          aria-hidden="true"
          className="flex items-center gap-1.5 text-meta font-bold text-success"
        >
          <Check className="size-4" /> Enregistré
        </p>
      )}
      {dirty.length > 0 && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-surface-bar px-4 pt-3 pb-safe-4 backdrop-blur-md lg:-mx-10 lg:px-10">
          <p className="mr-auto text-meta text-muted-foreground">
            {dirty.length > 1
              ? `${dirty.length} modifications non enregistrées`
              : "1 modification non enregistrée"}
          </p>
          <Button variant="ghost" onClick={cancel} disabled={saving}>
            <Undo2 aria-hidden="true" />
            Annuler
          </Button>
          <Button onClick={save} loading={saving}>
            {!saving && <Save aria-hidden="true" />}
            Enregistrer
          </Button>
        </div>
      )}
    </PageShell>
  );
}
