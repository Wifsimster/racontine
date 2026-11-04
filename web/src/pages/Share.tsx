import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  UserPlus,
  Copy,
  Check,
  Clock,
  Camera,
  TriangleAlert,
  PenLine,
} from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import {
  ROLE_LABELS,
  ROLE_HINTS,
  type Child,
  type Member,
  type MemberRole,
  type PendingInvitation,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  PageShell,
  PageHeader,
  PageState,
  PageSkeleton,
  InlineError,
} from "@/components/PageState";
import { MemberRow, RemoveButton, RoleControl } from "@/components/MemberRow";

const ROLES: MemberRole[] = ["reader", "contributor", "admin"];

const SHELL = "lg:max-w-[64rem] lg:px-10 lg:pt-8 lg:pb-12";

function RoleSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: MemberRole;
  onChange: (r: MemberRole) => void;
}) {
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as MemberRole)}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </Select>
  );
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? "Lien copié" : "Copier le lien"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
        }
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

function NameMember({
  email,
  onSave,
}: {
  email: string;
  onSave: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open)
    return (
      <Button
        variant="link"
        size="xs"
        className="-my-2.5 -ml-3 self-start"
        onClick={() => setOpen(true)}
      >
        <PenLine aria-hidden="true" />
        Ajouter son nom
      </Button>
    );

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setSaving(true);
        try {
          await onSave(name);
        } finally {
          setSaving(false);
        }
      }}
    >
      <Input
        autoFocus
        aria-label={`Nom de ${email}`}
        placeholder="Mamie Jacqueline"
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      <Button type="submit" loading={saving} disabled={!name.trim()}>
        {!saving && <Check aria-hidden="true" />}
        Enregistrer
      </Button>
    </form>
  );
}

export default function Share() {
  const { data: session } = useSession();
  const [children, setChildren] = useState<Child[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("reader");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listChildren()
      .then((kids) => {
        const admin = kids.filter((k) => k.role === "admin");
        setChildren(admin);
        setSelected(admin[0]?.id ?? null);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Échec du chargement"),
      )
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(async (childId: string) => {
    const res = await api.listMembers(childId);
    setMembers(res.members);
    setInvitations(res.invitations);
  }, []);

  useEffect(() => {
    if (!selected) return;
    let ignore = false;
    api
      .listMembers(selected)
      .then((res) => {
        if (ignore) return;
        setMembers(res.members);
        setInvitations(res.invitations);
      })
      .catch((e) => {
        if (!ignore) setError(e instanceof Error ? e.message : "Échec");
      });
    return () => {
      ignore = true;
    };
  }, [selected]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setInviting(true);
    setError(null);
    try {
      await api.invite(selected, email, role);
      setEmail("");
      setRole("reader");
      await refresh(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'invitation");
    } finally {
      setInviting(false);
    }
  }

  const header = (
    <PageHeader
      title="Partager"
        tone="activity"
      lede="Invitez un proche à lire le carnet — ou à écrire dedans."
    />
  );

  if (loading)
    return (
      <PageShell className={SHELL}>
        {header}
        <PageSkeleton label="Racontine ouvre le cercle" rows={2} />
      </PageShell>
    );

  if (!children.length)
    return (
      <PageShell className={SHELL}>
        {header}
        <PageState
          icon={Users}
          tone="locked"
          title="Aucun carnet à partager"
          actions={
            error ? undefined : (
              <Button asChild variant="outline">
                <Link to="/capture">
                  <Camera aria-hidden="true" />
                  Photographier un carnet
                </Link>
              </Button>
            )
          }
        >
          {error ??
            "Seul l'administrateur d'un carnet peut inviter des proches. Créez un enfant depuis l'écran de capture pour commencer."}
        </PageState>
      </PageShell>
    );

  const child = children.find((c) => c.id === selected);

  return (
    <PageShell className={SHELL}>
      {header}

      <div className="flex max-w-3xl flex-col divide-y">
        {children.length > 1 && (
          <section className="flex flex-col gap-2 py-6 first:pt-0">
            <h2 className="font-serif text-title font-semibold">Le carnet</h2>
            <div className="flex flex-wrap gap-2">
              {children.map((c) => (
                <Button
                  key={c.id}
                  variant={c.id === selected ? "default" : "outline"}
                  size="sm"
                  aria-pressed={c.id === selected}
                  onClick={() => setSelected(c.id)}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-4 py-6 first:pt-0">
          <h2 className="font-serif text-title font-semibold">
            Inviter un proche
          </h2>
          <form onSubmit={invite} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Son adresse e-mail</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="email"
                placeholder="mamie@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Ce qu'elle pourra faire</Label>
              <RoleSelect id="invite-role" value={role} onChange={setRole} />
              <p className="text-meta text-muted-foreground">
                {ROLE_HINTS[role]}
              </p>
            </div>
            {error && (
              <InlineError>
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                {error}
              </InlineError>
            )}
            <Button type="submit" loading={inviting} className="self-start">
              {!inviting && <UserPlus aria-hidden="true" />}
              Envoyer l'invitation
            </Button>
          </form>
        </section>

        {invitations.length > 0 && (
          <section className="flex flex-col gap-2 py-6 first:pt-0">
            <h2 className="font-serif text-title font-semibold">
              En attente ({invitations.length})
            </h2>
            <ul className="flex flex-col divide-y">
              {invitations.map((inv) => (
                <MemberRow
                  key={inv.id}
                  name={inv.email}
                  detail={
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                      {ROLE_LABELS[inv.role]}
                    </span>
                  }
                  trailing={
                    <>
                      {inv.expired && (
                        <Badge variant="warning">
                          <TriangleAlert aria-hidden="true" />
                          expirée
                        </Badge>
                      )}
                      <CopyButton url={inv.url} />
                      <RemoveButton
                        label={`Révoquer l'invitation de ${inv.email}`}
                        onClick={async () => {
                          try {
                            await api.revokeInvitation(inv.id);
                            if (selected) await refresh(selected);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Échec");
                          }
                        }}
                      />
                    </>
                  }
                />
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2 py-6 first:pt-0">
          <h2 className="font-serif text-title font-semibold">
            Le cercle de {child?.name ?? "l'enfant"} ({members.length})
          </h2>
          <ul className="flex flex-col divide-y">
            {members.map((m) => {
              const isSelf = m.userId === session?.user.id;
              const name = m.name?.trim();
              const label = name || m.email;
              return (
                <MemberRow
                  key={m.userId}
                  name={label}
                  meta={isSelf ? "vous" : undefined}
                  detail={name ? m.email : undefined}
                  trailing={
                    <>
                      <RoleControl
                        role={m.role}
                        locked={isSelf}
                        aria-label={`Rôle de ${label}`}
                        onChange={async (r) => {
                          if (!selected) return;
                          try {
                            await api.setMemberRole(selected, m.userId, r);
                            await refresh(selected);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Échec");
                          }
                        }}
                      />
                      {!isSelf && (
                        <RemoveButton
                          label={`Retirer ${label}`}
                          onClick={async () => {
                            if (!selected) return;
                            try {
                              await api.removeMember(selected, m.userId);
                              await refresh(selected);
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Échec");
                            }
                          }}
                        />
                      )}
                    </>
                  }
                >
                  {!name && !isSelf && (
                    <NameMember
                      email={m.email}
                      onSave={async (n) => {
                        if (!selected) return;
                        try {
                          setError(null);
                          await api.setMemberName(selected, m.userId, n);
                          await refresh(selected);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Échec");
                        }
                      }}
                    />
                  )}
                </MemberRow>
              );
            })}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
