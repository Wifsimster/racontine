import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  Check,
  ShieldAlert,
  Mail,
  Sparkles,
  UserPlus,
  Clock,
  Bell,
  ServerCog,
} from "lucide-react";
import { api } from "@/lib/api";
import type { AppSettings, SettingsMeta } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import McpTokens from "@/components/McpTokens";
import LlmKey from "@/components/LlmKey";

/** Interrupteur on/off accessible (pas de composant Switch dans le repo). */
function Toggle({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-input"
      }`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-background shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Row({
  icon,
  title,
  hint,
  htmlFor,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={htmlFor} className="flex items-center gap-2 font-medium">
          <span className="text-primary">{icon}</span>
          {title}
        </Label>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
      <span
        className={`size-2 shrink-0 rounded-full ${ok ? "bg-primary" : "bg-muted-foreground/40"}`}
      />
      <span className="flex-1">{label}</span>
      <span className="text-xs text-muted-foreground">
        {ok ? "configuré" : "absent"}
      </span>
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // Instantané des réglages chargés : on ne PATCHe que les champs réellement
  // modifiés, sinon on figerait en base les valeurs héritées de l'environnement
  // (elles cesseraient de suivre les variables d'env). Voir settings.ts.
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

  async function save() {
    if (!settings || !dirty.length) return;
    setSaving(true);
    setError(null);
    try {
      // N'envoyer que les champs modifiés : un champ laissé tel quel reste nul
      // en base et continue de suivre le défaut d'environnement.
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

  if (loading)
    return (
      <p className="py-16 text-center text-muted-foreground">Chargement…</p>
    );

  if (forbidden)
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-16 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <ShieldAlert className="size-7 text-primary" />
        </div>
        <p className="font-medium">Réglages réservés au propriétaire</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Seul le propriétaire de l'instance (le premier compte créé) peut gérer
          les réglages de l'application.
        </p>
      </div>
    );

  if (!settings || !meta)
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-destructive">
          {error ?? "Réglages indisponibles."}
        </p>
      </div>
    );

  const models = Array.from(
    new Set([...meta.knownVlmModels, settings.vlmModel]),
  );

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4 pb-24">
      <div className="flex items-center gap-2">
        <SettingsIcon className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">Réglages de l'application</h1>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        Ces réglages s'appliquent immédiatement à toute l'instance, sans
        redéploiement.
      </p>

      {/* Général */}
      <section className="rounded-2xl border bg-card px-5 shadow-sm">
        <Row
          icon={<SettingsIcon className="size-4" />}
          title="Nom de l'instance"
          hint="Affiché dans l'en-tête et sur l'écran de connexion."
          htmlFor="appName"
        >
          <Input
            id="appName"
            value={settings.appName}
            maxLength={60}
            onChange={(e) => patch("appName", e.target.value)}
            className="w-48"
          />
        </Row>
      </section>

      {/* Accès */}
      <section className="flex flex-col rounded-2xl border bg-card px-5 shadow-sm">
        <div className="border-b pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Accès & partage
        </div>
        <div className="divide-y">
          <Row
            icon={<UserPlus className="size-4" />}
            title="Inscriptions ouvertes"
            hint="Autorise la création de comptes email/mot de passe. À fermer une fois le foyer créé — les proches invités par lien restent acceptés."
            htmlFor="signupEnabled"
          >
            <Toggle
              id="signupEnabled"
              checked={settings.signupEnabled}
              onChange={(v) => patch("signupEnabled", v)}
            />
          </Row>
          <Row
            icon={<Clock className="size-4" />}
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
              <span className="text-sm text-muted-foreground">jours</span>
            </div>
          </Row>
        </div>
      </section>

      {/* Notifications */}
      <section className="flex flex-col rounded-2xl border bg-card px-5 shadow-sm">
        <div className="border-b pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notifications
        </div>
        <Row
          icon={<Bell className="size-4" />}
          title="E-mails de notification"
          hint={
            meta.mailConfigured
              ? "Envoie un e-mail aux abonnés à chaque journée publiée."
              : "SMTP non configuré : les e-mails sont désactivés quoi qu'il arrive (notifications in-app seules)."
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
      </section>

      {/* Clé API LLM propre à l'utilisateur courant */}
      <LlmKey />

      {/* Extraction */}
      <section className="rounded-2xl border bg-card px-5 shadow-sm">
        <Row
          icon={<Sparkles className="size-4" />}
          title="Modèle d'extraction (VLM)"
          hint="Modèle Claude vision utilisé pour lire les carnets, avec la clé API de chaque contributeur."
          htmlFor="vlmModel"
        >
          <select
            id="vlmModel"
            value={settings.vlmModel}
            onChange={(e) => patch("vlmModel", e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Row>
      </section>

      {/* Connexion MCP (sessions Claude) */}
      <McpTokens webBaseUrl={meta.webBaseUrl} />

      {/* Infra (lecture seule) */}
      <section className="flex flex-col gap-2 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ServerCog className="size-4 text-primary" />
          Infrastructure
        </div>
        <p className="text-xs text-muted-foreground">
          Piloté par les variables d'environnement du serveur (lecture seule).
        </p>
        <div className="mt-1 flex flex-col gap-2">
          <StatusPill ok={meta.mailConfigured} label="Serveur e-mail (SMTP)" />
          <StatusPill
            ok={meta.notifyWebhookConfigured}
            label="Webhook de notification"
          />
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
            <Mail className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{meta.webBaseUrl}</span>
            <span className="text-xs text-muted-foreground">URL publique</span>
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Barre d'enregistrement */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
        {saved && (
          <span className="flex items-center gap-1 text-sm text-primary">
            <Check className="size-4" /> Enregistré
          </span>
        )}
        <Button onClick={save} disabled={saving || !dirty.length}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
