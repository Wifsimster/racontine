import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Save,
  Check,
  ShieldAlert,
  Link2,
  Sparkles,
  UserPlus,
  Clock,
  Bell,
  CloudOff,
  TriangleAlert,
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
  SectionLabel,
  InlineError,
} from "@/components/PageState";

/**
 * Une ligne de réglage : le libellé et son aide, puis le contrôle.
 *
 * ELLE S'EMPILE SOUS 480 px, et c'est la correction qui compte. En côte à côte,
 * un `Select` portant « claude-sonnet-4-5-20250929 » impose sa largeur
 * intrinsèque et écrase la colonne de gauche : l'aide « Modèle Claude vision
 * utilisé pour lire les carnets… » tombait sur NEUF lignes d'un ou deux mots, et
 * « Nom de l'instance » se coupait en « Nom de / l'instance ». Sur un téléphone,
 * le contrôle passe donc SOUS son libellé et prend toute la largeur ; le côte à
 * côte revient à partir de `sm`, où il y a la place.
 */
function Row({
  icon: Icon,
  title,
  hint,
  htmlFor,
  inline = false,
  children,
}: {
  icon: React.ElementType;
  title: string;
  hint?: string;
  htmlFor?: string;
  /** Contrôle étroit (un interrupteur) : il reste à droite, même sur téléphone. */
  inline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        inline
          ? "flex items-start justify-between gap-4 py-4"
          : "flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
      }
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Label
          htmlFor={htmlFor}
          className="flex items-center gap-2 text-ui font-bold"
        >
          <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {title}
        </Label>
        {hint && (
          <p className="max-w-[46ch] text-meta text-pretty text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <div className={inline ? "shrink-0" : "shrink-0 sm:pt-1"}>{children}</div>
    </div>
  );
}

/**
 * Un service d'infrastructure, piloté par l'environnement (lecture seule).
 * L'état double la couleur par un MOT (« configuré » / « absent ») : il reste
 * lisible en niveaux de gris.
 */
function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-3">
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${ok ? "bg-success" : "bg-muted-foreground"}`}
      />
      <span className="min-w-0 flex-1 text-meta">{label}</span>
      <span
        className={`shrink-0 text-meta font-bold ${ok ? "text-success" : "text-muted-foreground"}`}
      >
        {ok ? "configuré" : "absent"}
      </span>
    </div>
  );
}

/** Une feuille de réglages : un intertitre, puis des lignes séparées par un filet. */
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <SectionLabel className="px-1">{label}</SectionLabel>
      <div className="flex flex-col divide-y rounded-2xl border bg-card px-5 shadow-card">
        {children}
      </div>
    </section>
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

  /* Le bandeau reste dans les quatre états : le titre d'un écran ne dépend pas
     de ses données. */
  const header = (
    <PageHeader
      title="Réglages"
      lede="Ces réglages s'appliquent immédiatement à toute l'instance, sans redéploiement."
    />
  );

  if (loading)
    return (
      <PageShell>
        {header}
        <PageSkeleton label="Racontine ouvre les réglages" rows={3} />
      </PageShell>
    );

  if (forbidden)
    return (
      <PageShell>
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
      <PageShell>
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
    <PageShell className="pb-8">
      {header}

      <Section label="L'instance">
        <Row
          icon={SettingsIcon}
          title="Nom de l'instance"
          hint="Affiché dans l'en-tête et sur l'écran de connexion."
          htmlFor="appName"
        >
          <Input
            id="appName"
            value={settings.appName}
            maxLength={60}
            onChange={(e) => patch("appName", e.target.value)}
            className="w-full sm:w-48"
          />
        </Row>
      </Section>

      <Section label="Accès & partage">
        <Row
          icon={UserPlus}
          title="Inscriptions ouvertes"
          hint="Autorise la création de comptes email/mot de passe. À fermer une fois le foyer créé — les proches invités par lien restent acceptés."
          htmlFor="signupEnabled"
          inline
        >
          <Toggle
            id="signupEnabled"
            checked={settings.signupEnabled}
            onChange={(v) => patch("signupEnabled", v)}
          />
        </Row>
        <Row
          icon={Clock}
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

      <Section label="Notifications">
        <Row
          icon={Bell}
          title="E-mails de notification"
          hint={
            meta.mailConfigured
              ? "Envoie un e-mail aux abonnés à chaque journée publiée."
              : "SMTP non configuré : les e-mails sont désactivés quoi qu'il arrive (notifications dans l'app seules)."
          }
          htmlFor="emailNotificationsEnabled"
          inline
        >
          <Toggle
            id="emailNotificationsEnabled"
            checked={settings.emailNotificationsEnabled}
            disabled={!meta.mailConfigured}
            onChange={(v) => patch("emailNotificationsEnabled", v)}
          />
        </Row>
      </Section>

      <Section label="Lecture des carnets">
        <Row
          icon={Sparkles}
          title="Modèle d'extraction"
          hint="Modèle Claude vision utilisé pour lire les carnets, avec la clé API de chaque contributeur."
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

      {/* Infrastructure : lecture seule, pilotée par l'environnement. */}
      <section className="flex flex-col gap-1">
        <SectionLabel className="px-1">Infrastructure</SectionLabel>
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card">
          <p className="text-meta text-muted-foreground">
            Piloté par les variables d'environnement du serveur : ces lignes se
            lisent, elles ne se modifient pas ici.
          </p>
          <div className="flex flex-col gap-2">
            <StatusPill ok={meta.mailConfigured} label="Serveur e-mail (SMTP)" />
            <StatusPill
              ok={meta.webPushConfigured}
              label="Notifications navigateur (Web Push)"
            />
            <StatusPill
              ok={meta.notifyWebhookConfigured}
              label="Webhook de notification"
            />
            <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-3">
              <Link2
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-meta">
                {meta.webBaseUrl}
              </span>
              <span className="shrink-0 text-meta text-muted-foreground">
                URL publique
              </span>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <InlineError>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </InlineError>
      )}

      {/* La barre d'enregistrement : papier translucide (`bg-surface-bar`, alpha
          déjà composé en sRGB — jamais `bg-background/95`), et sa marge basse
          absorbe la barre gestuelle iOS. */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t bg-surface-bar px-4 pt-3 pb-safe-4 backdrop-blur-md">
        {/* `role="status"` : l'accusé de réception s'entend aussi. */}
        {saved && (
          <p
            role="status"
            className="flex items-center gap-1.5 text-meta font-bold text-success"
          >
            <Check className="size-4" aria-hidden="true" /> Enregistré
          </p>
        )}
        <Button onClick={save} loading={saving} disabled={!dirty.length}>
          {!saving && <Save aria-hidden="true" />}
          {dirty.length ? "Enregistrer" : "Rien à enregistrer"}
        </Button>
      </div>
    </PageShell>
  );
}
