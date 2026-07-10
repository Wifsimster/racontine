import { useEffect, useState, useCallback } from "react";
import {
  Users,
  UserPlus,
  Trash2,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
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

const ROLES: MemberRole[] = ["reader", "contributor", "admin"];

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: MemberRole;
  onChange: (r: MemberRole) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as MemberRole)}
      className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm disabled:opacity-50"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Copier le lien"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard indisponible */
        }
      }}
    >
      {copied ? <Check className="text-primary" /> : <Copy />}
    </Button>
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
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(async (childId: string) => {
    const res = await api.listMembers(childId);
    setMembers(res.members);
    setInvitations(res.invitations);
  }, []);

  useEffect(() => {
    if (selected) refresh(selected).catch((e) => setError(e.message));
  }, [selected, refresh]);

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

  if (loading)
    return (
      <p className="py-16 text-center text-muted-foreground">Chargement…</p>
    );

  if (!children.length)
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-16 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <Users className="size-7 text-primary" />
        </div>
        <p className="font-medium">Aucun enfant à partager</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Seul l'administrateur d'un enfant peut inviter des proches. Créez un
          enfant depuis l'écran de capture pour commencer.
        </p>
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4 pb-16">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-primary" />
        <h1 className="text-xl font-semibold">Partager le journal</h1>
      </div>

      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <Button
              key={c.id}
              variant={c.id === selected ? "default" : "outline"}
              size="sm"
              onClick={() => setSelected(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
      )}

      {/* Inviter un proche */}
      <form
        onSubmit={invite}
        className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserPlus className="size-4 text-primary" />
          Inviter un proche
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="mamie@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">Rôle</Label>
          <RoleSelect value={role} onChange={setRole} />
          <p className="text-xs text-muted-foreground">{ROLE_HINTS[role]}</p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={inviting}>
          {inviting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus />}
          Envoyer l'invitation
        </Button>
      </form>

      {/* Invitations en attente */}
      {invitations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Invitations en attente
          </h2>
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-2 rounded-xl border bg-card p-3 text-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{inv.email}</span>
                <span className="text-xs text-muted-foreground">
                  {ROLE_LABELS[inv.role]}
                  {inv.expired ? " · expirée" : ""}
                </span>
              </div>
              <CopyButton url={inv.url} />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Révoquer"
                onClick={async () => {
                  await api.revokeInvitation(inv.id);
                  if (selected) refresh(selected);
                }}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Membres */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Membres</h2>
        {members.map((m) => {
          const isSelf = m.userId === session?.user.id;
          return (
            <div
              key={m.userId}
              className="flex items-center gap-2 rounded-xl border bg-card p-3 text-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 truncate font-medium">
                  {m.name}
                  {m.role === "admin" && (
                    <ShieldCheck className="size-3.5 text-primary" />
                  )}
                  {isSelf && (
                    <Badge variant="secondary" className="text-[10px]">
                      vous
                    </Badge>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {m.email}
                </span>
              </div>
              <RoleSelect
                value={m.role}
                disabled={isSelf}
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Retirer"
                  onClick={async () => {
                    if (!selected) return;
                    try {
                      await api.removeMember(selected, m.userId);
                      await refresh(selected);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Échec");
                    }
                  }}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
