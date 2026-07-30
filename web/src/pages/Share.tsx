import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  UserPlus,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  MailPlus,
  Clock,
  Camera,
  TriangleAlert,
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
  SectionLabel,
  InlineError,
} from "@/components/PageState";

const ROLES: MemberRole[] = ["reader", "contributor", "admin"];

function RoleSelect({
  value,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: MemberRole;
  onChange: (r: MemberRole) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
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

/**
 * Copie du lien d'invitation. Le retour est un CHANGEMENT D'ICÔNE tenu 1,5 s
 * (coche groseille) : le geste est silencieux, il lui faut un accusé visible.
 */
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
          /* presse-papiers indisponible (contexte non sécurisé) */
        }
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
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

  // Charge le cercle de l'enfant sélectionné. Le drapeau `ignore` évite qu'une
  // réponse tardive (enfant précédent) n'écrase l'affichage de l'enfant courant
  // si l'on change de sélection plus vite que le réseau ne répond.
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
      lede="Invitez un proche à lire le carnet — ou à écrire dedans."
    />
  );

  if (loading)
    return (
      <PageShell>
        {header}
        <PageSkeleton label="Racontine ouvre le cercle" rows={2} />
      </PageShell>
    );

  /* Pas d'enfant dont on est administrateur : la porte n'existe pas, et on dit
     pourquoi plutôt que d'afficher un formulaire qui refuserait à l'envoi. */
  if (!children.length)
    return (
      <PageShell>
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
    <PageShell>
      {header}

      {/* Plusieurs carnets : on choisit celui qu'on partage. */}
      {children.length > 1 && (
        <div className="flex flex-col gap-1">
          <SectionLabel className="px-1">Le carnet</SectionLabel>
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
        </div>
      )}

      {/* ── Inviter un proche ────────────────────────────────────────────── */}
      <form
        onSubmit={invite}
        className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-card"
      >
        <h2 className="flex items-center gap-2 font-serif text-title font-semibold">
          <MailPlus className="size-5 shrink-0 text-primary" aria-hidden="true" />
          Inviter un proche
        </h2>
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
          <RoleSelect value={role} onChange={setRole} />
          <p className="text-meta text-muted-foreground">{ROLE_HINTS[role]}</p>
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
        <Button type="submit" loading={inviting}>
          {!inviting && <UserPlus aria-hidden="true" />}
          Envoyer l'invitation
        </Button>
      </form>

      {/* ── Invitations en attente ───────────────────────────────────────── */}
      {invitations.length > 0 && (
        <section className="flex flex-col gap-1">
          <SectionLabel className="px-1">
            En attente ({invitations.length})
          </SectionLabel>
          <ul className="flex flex-col gap-2">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-2 rounded-2xl border bg-card p-3 pl-4 shadow-card"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-ui font-bold">{inv.email}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-meta text-muted-foreground">
                    <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                    {ROLE_LABELS[inv.role]}
                    {inv.expired && (
                      <Badge variant="warning">
                        <TriangleAlert aria-hidden="true" />
                        expirée
                      </Badge>
                    )}
                  </span>
                </div>
                <CopyButton url={inv.url} />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Révoquer l'invitation de ${inv.email}`}
                  className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                  onClick={async () => {
                    try {
                      await api.revokeInvitation(inv.id);
                      if (selected) await refresh(selected);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Échec");
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Membres ──────────────────────────────────────────────────────────
          CHAQUE MEMBRE EST UNE FEUILLE EMPILÉE, et c'est la correction qui
          compte. En une seule ligne (nom + e-mail + rôle + corbeille), le
          `<select>` « Administrateur » imposait sa largeur et le nom se coupait
          au milieu d'un mot : « Mamie Jacque », « marc@battiste… ». Le nom et
          l'adresse prennent maintenant toute la largeur, le rôle et la
          suppression sont sur la ligne du dessous. Plus rien n'est tronqué. */}
      <section className="flex flex-col gap-1">
        <SectionLabel className="px-1">
          Le cercle de {child?.name ?? "l'enfant"} ({members.length})
        </SectionLabel>
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const isSelf = m.userId === session?.user.id;
            return (
              <li
                key={m.userId}
                className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-center gap-1.5 text-ui font-bold">
                    <span className="truncate">{m.name}</span>
                    {m.role === "admin" && (
                      <ShieldCheck
                        className="size-4 shrink-0 text-primary"
                        aria-label="administrateur"
                      />
                    )}
                    {isSelf && <Badge variant="soft">vous</Badge>}
                  </span>
                  <span className="truncate text-meta text-muted-foreground">
                    {m.email}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <RoleSelect
                    value={m.role}
                    disabled={isSelf}
                    className="min-w-0 flex-1"
                    aria-label={`Rôle de ${m.name}`}
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
                      aria-label={`Retirer ${m.name} du cercle`}
                      className="text-destructive hover:bg-destructive-soft hover:text-destructive"
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
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </PageShell>
  );
}
