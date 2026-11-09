import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpenText,
  Clock,
  CloudOff,
  Mail,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  ROLE_LABELS,
  type AdminConsole,
  type AdminPerson,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChildMark } from "@/components/ChildMark";
import { ageLabel } from "@/lib/child";
import {
  PageShell,
  PageHeader,
  PageState,
  PageSkeleton,
  InlineError,
} from "@/components/PageState";
import { Avatar, MemberRow, RemoveButton, RoleControl } from "@/components/MemberRow";

function fmtDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function ChildCard({
  child,
  onDeleted,
}: {
  child: AdminConsole["children"][number];
  onDeleted: () => void;
}) {
  const age = ageLabel(child.birthdate);
  const last = fmtDay(child.lastPublishedAt);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function erase() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteChild(child.id, typed);
      setOpen(false);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l’effacement");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2">
        <ChildMark name={child.name} size="md" />
        <div className="flex min-w-0 flex-1 basis-40 flex-col">
          <span className="truncate text-ui font-bold">{child.name}</span>
          <span className="text-meta text-muted-foreground">
            {[
              age,
              `${child.members} ${child.members > 1 ? "proches" : "proche"}`,
              `${child.entries.published} publiée${child.entries.published > 1 ? "s" : ""}`,
              child.entries.processing > 0
                ? `${child.entries.processing} en lecture`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
          onClick={() => {
            setTyped("");
            setError(null);
            setOpen(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          Effacer ce carnet
        </Button>
      </div>
      {(child.entries.draft > 0 || child.entries.failed > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {child.entries.draft > 0 && (
            <Badge variant="warning">
              <Clock aria-hidden="true" />
              {child.entries.draft} à relire
            </Badge>
          )}
          {child.entries.failed > 0 && (
            <Badge variant="destructive">
              <TriangleAlert aria-hidden="true" />
              {child.entries.failed} en échec
            </Badge>
          )}
        </div>
      )}
      <p className="text-meta text-muted-foreground">
        {last ? `Dernière journée publiée le ${last}.` : "Aucune journée publiée pour l’instant."}
      </p>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Effacer le carnet de {child.name} ?</AlertDialogTitle>
            <AlertDialogDescription>
              {child.entries.total > 0
                ? `Ses ${child.entries.total} journée${child.entries.total > 1 ? "s" : ""} et toutes les photos du carnet disparaissent, pour ${child.members > 1 ? "tout le cercle" : "vous"}. Sans corbeille, et sans retour.`
                : "Le carnet et son cercle disparaissent. Sans corbeille, et sans retour."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`effacer-${child.id}`}>
              Recopiez « {child.name} » pour confirmer
            </Label>
            <Input
              id={`effacer-${child.id}`}
              value={typed}
              autoComplete="off"
              placeholder={child.name}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>

          {error && (
            <InlineError>
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </InlineError>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={erase}
              loading={busy}
              disabled={!sameName(typed, child.name)}
            >
              Effacer définitivement
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function sameName(typed: string, expected: string): boolean {
  const fold = (v: string) =>
    v
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  return fold(expected).length > 0 && fold(typed) === fold(expected);
}

function PersonCard({
  person,
  onChange,
  onError,
}: {
  person: AdminPerson;
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(childId: string, geste: () => Promise<unknown>) {
    setBusy(childId);
    try {
      await geste();
      await onChange();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Échec de l’opération");
    } finally {
      setBusy(null);
    }
  }

  const status = [person.isSelf && "vous", person.isOwner && "propriétaire"]
    .filter(Boolean)
    .join(", ");

  return (
    <li className="flex flex-col gap-1 py-4">
      <div className="flex min-h-11 items-center gap-3">
        <Avatar name={person.name} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="min-w-0 text-ui">
            <span className="font-bold break-words">{person.name}</span>
            {status && (
              <span className="text-meta text-muted-foreground">
                {" "}
                — {status}
              </span>
            )}
          </p>
          <p className="truncate text-meta text-muted-foreground">
            {person.email}
          </p>
        </div>
      </div>

      <ul className="flex flex-col divide-y">
        {person.roles.map(({ childId, childName, role }) => {
          const sole = person.soleAdminOf.includes(childId);
          const locked = person.isSelf || sole;
          return (
            <MemberRow
              key={childId}
              className="py-1"
              leading={<ChildMark name={childName} />}
              name={childName}
              trailing={
                <>
                  <RoleControl
                    role={role}
                    locked={locked}
                    disabled={busy === childId}
                    aria-label={`Rôle de ${person.name} sur le carnet de ${childName}`}
                    onChange={(r) =>
                      run(childId, () =>
                        api.setMemberRole(childId, person.userId, r),
                      )
                    }
                  />
                  {!locked && (
                    <RemoveButton
                      label={`Retirer ${person.name} du carnet de ${childName}`}
                      disabled={busy === childId}
                      onClick={() =>
                        run(childId, () =>
                          api.removeMember(childId, person.userId),
                        )
                      }
                    />
                  )}
                </>
              }
            >
              {sole && !person.isSelf && (
                <p className="text-meta text-muted-foreground">
                  Seul administrateur de ce carnet : nommez d’abord quelqu’un
                  d’autre.
                </p>
              )}
            </MemberRow>
          );
        })}
      </ul>
    </li>
  );
}

export default function Administration() {
  const [data, setData] = useState<AdminConsole | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.adminConsole();
    setData(res);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => {
        if (e instanceof Error && /administrateur|403/.test(e.message))
          setForbidden(true);
        else setError(e instanceof Error ? e.message : "Échec du chargement");
      })
      .finally(() => setLoading(false));
  }, [load]);

  const refresh = useCallback(async () => {
    setError(null);
    await load();
  }, [load]);

  const header = (
    <PageHeader
      title="Administration"
        tone="nap"
      lede="Vos carnets, leurs proches et ce qui attend une réponse."
    />
  );

  if (loading)
    return (
      <PageShell className="lg:max-w-[48rem] lg:px-10 lg:pt-8 lg:pb-12">
        {header}
        <PageSkeleton label="Racontine rassemble les cercles" rows={3} />
      </PageShell>
    );

  if (forbidden)
    return (
      <PageShell className="lg:max-w-[48rem] lg:px-10 lg:pt-8 lg:pb-12">
        {header}
        <PageState
          icon={ShieldAlert}
          tone="locked"
          title="Réservé aux administrateurs"
          actions={
            <Button asChild variant="outline">
              <Link to="/">
                <BookOpenText aria-hidden="true" />
                Revenir au journal
              </Link>
            </Button>
          }
        >
          Seul l’administrateur d’un carnet — le parent qui l’a créé, ou
          quelqu’un qu’il a nommé — peut ouvrir cette page.
        </PageState>
      </PageShell>
    );

  if (!data)
    return (
      <PageShell className="lg:max-w-[48rem] lg:px-10 lg:pt-8 lg:pb-12">
        {header}
        <PageState
          icon={CloudOff}
          tone="error"
          title="L’administration ne répond pas"
          actions={
            <Button onClick={() => window.location.reload()}>Réessayer</Button>
          }
        >
          {error ??
            "La connexion au serveur a échoué. Rien n’a été modifié : réessayez dans un instant."}
        </PageState>
      </PageShell>
    );

  return (
    <PageShell className="lg:max-w-[48rem] lg:px-10 lg:pt-8 lg:pb-12">
      {header}

      {error && (
        <InlineError>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </InlineError>
      )}

      <dl className="-mt-2 flex flex-wrap gap-x-2 text-meta text-muted-foreground">
        {[
          [data.totals.children, "carnet", "carnets"],
          [data.totals.people, "proche", "proches"],
          [data.totals.published, "journée publiée", "journées publiées"],
          [
            data.totals.pendingInvitations,
            "invitation en attente",
            "invitations en attente",
          ],
        ].map(([n, one, many], i) => (
          <div
            key={String(one)}
            className={
              i > 0
                ? "flex flex-row-reverse justify-end gap-1 before:content-['·'] before:order-last before:pr-1"
                : "flex flex-row-reverse justify-end gap-1"
            }
          >
            <dt>{Number(n) > 1 ? many : one}</dt>
            <dd className="font-bold text-foreground" data-tabular>
              {n}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col divide-y">
        <section className="flex flex-col gap-2 py-6 first:pt-0">
          <h2 className="font-serif text-title font-semibold">
            Les carnets ({data.children.length})
          </h2>
          <ul className="flex flex-col divide-y">
            {data.children.map((c) => (
              <ChildCard
                key={c.id}
                child={c}
                onDeleted={() => {
                  void refresh().catch(() => {});
                }}
              />
            ))}
          </ul>
        </section>

        {data.invitations.length > 0 && (
          <section className="flex flex-col gap-2 py-6 first:pt-0">
            <h2 className="font-serif text-title font-semibold">
              En attente ({data.invitations.length})
            </h2>
            <ul className="flex flex-col divide-y">
              {data.invitations.map((inv) => (
                <MemberRow
                  key={inv.id}
                  name={inv.email}
                  detail={
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                      {ROLE_LABELS[inv.role]} · {inv.childName}
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
                      <RemoveButton
                        label={`Révoquer l’invitation de ${inv.email}`}
                        onClick={async () => {
                          try {
                            await api.revokeInvitation(inv.id);
                            await refresh();
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-title font-semibold">
              Les proches ({data.people.length})
            </h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/partage">
                <UserPlus aria-hidden="true" />
                Inviter un proche
              </Link>
            </Button>
          </div>
          {data.people.length === 0 ? (
            <p className="text-meta text-muted-foreground">
              Aucun proche n’a encore de rôle sur ces carnets.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {data.people.map((p) => (
                <PersonCard
                  key={p.userId}
                  person={p}
                  onChange={refresh}
                  onError={setError}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
