import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpenText,
  Clock,
  CloudOff,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  ROLE_LABELS,
  type AdminConsole,
  type AdminPerson,
  type MemberRole,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
  SectionLabel,
  InlineError,
} from "@/components/PageState";

/* ===========================================================================
   LA CONSOLE D'ADMINISTRATION — les gens d'abord, les carnets ensuite.

   « Partager » regarde UN carnet à la fois : pour savoir si Mamie est lectrice
   sur Lou et contributrice sur Anouk, il fallait changer d'enfant et recompter
   de tête. Cet écran retourne la question — une personne, une carte, tous ses
   rôles — et ajoute ce qu'aucun écran ne disait : combien de journées sont
   publiées, lesquelles attendent une relecture, laquelle a échoué.

   Rien d'INSTANCE ici : la console ne montre que les carnets dont on est
   administrateur, et le serveur redemande ce périmètre à chaque lecture. Les
   gestes, eux, sont ceux du partage — mêmes routes, mêmes refus (on ne retire
   pas le dernier administrateur d'un enfant).
   =========================================================================== */

const ROLES: MemberRole[] = ["reader", "contributor", "admin"];

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

/**
 * Un chiffre de la console. Le nombre est en sérif au cran du titre : c'est ce
 * qu'on vient lire, la légende ne fait que le nommer.
 */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border bg-card px-4 py-3 shadow-card">
      <span className="font-serif text-title font-semibold">{value}</span>
      <span className="text-meta text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Un carnet administré : qui le suit, où en sont ses journées, quand remonte
 * la dernière publication. Les états qui APPELLENT UN GESTE (brouillons à
 * relire, lectures en échec) portent une pastille ; le reste est du texte.
 *
 * C'est aussi le SEUL endroit d'où l'on peut effacer un carnet. Ce geste
 * n'est pas un réglage : il emporte des mois de journées, leurs photos, et le
 * fil que des proches suivent. Il vit donc ici, dans la console, derrière le
 * prénom de l'enfant recopié — pas dans un menu contextuel à côté de
 * « renommer ».
 */
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
      setError(e instanceof Error ? e.message : "Échec de l'effacement");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <ChildMark name={child.name} size="md" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ui font-bold">{child.name}</span>
          <span className="truncate text-meta text-muted-foreground">
            {age ? `${age} · ` : ""}
            {child.members} {child.members > 1 ? "proches" : "proche"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="soft">
          {child.entries.published} publiée
          {child.entries.published > 1 ? "s" : ""}
        </Badge>
        {child.entries.draft > 0 && (
          <Badge variant="warning">
            <Clock aria-hidden="true" />
            {child.entries.draft} à relire
          </Badge>
        )}
        {child.entries.processing > 0 && (
          <Badge variant="soft">{child.entries.processing} en lecture</Badge>
        )}
        {child.entries.failed > 0 && (
          <Badge variant="destructive">
            <TriangleAlert aria-hidden="true" />
            {child.entries.failed} en échec
          </Badge>
        )}
      </div>
      <p className="text-meta text-muted-foreground">
        {last ? `Dernière journée publiée le ${last}.` : "Aucune journée publiée pour l'instant."}
      </p>

      <div className="flex justify-end border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
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

/**
 * Le prénom recopié, côté écran : il allume le bouton, il n'autorise rien. La
 * comparaison qui fait foi est celle du serveur (`confirms`, dans
 * `domain/erasure.ts`) ; on en reprend ici la tolérance — espaces, casse,
 * accents — pour ne pas garder le bouton éteint devant une saisie qu'il
 * accepterait.
 */
function sameName(typed: string, expected: string): boolean {
  const fold = (v: string) =>
    v
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  return fold(expected).length > 0 && fold(typed) === fold(expected);
}

/**
 * Une personne, et TOUS ses rôles. Une ligne par carnet : le rôle s'y change,
 * et la personne s'y retire du cercle.
 *
 * Le geste est GRISÉ là où le serveur le refuserait — sur soi-même, et sur un
 * carnet dont la personne est le seul administrateur. Proposer un bouton qui
 * répond « il doit rester au moins un administrateur » serait mentir deux fois :
 * une fois en le proposant, une fois en l'expliquant après coup.
 */
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
      onError(e instanceof Error ? e.message : "Échec de l'opération");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex min-w-0 flex-col">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-ui font-bold">
          <span className="truncate">{person.name}</span>
          {person.isSelf && <Badge variant="soft">vous</Badge>}
          {person.isOwner && (
            <Badge variant="secondary">
              <ShieldCheck aria-hidden="true" />
              propriétaire
            </Badge>
          )}
        </span>
        <span className="truncate text-meta text-muted-foreground">
          {person.email}
        </span>
      </div>

      <ul className="flex flex-col divide-y border-t">
        {person.roles.map(({ childId, childName, role }) => {
          const sole = person.soleAdminOf.includes(childId);
          const locked = person.isSelf || sole;
          return (
            <li key={childId} className="flex flex-col gap-2 pt-3 pb-1">
              <div className="flex items-center gap-2">
                <ChildMark name={childName} />
                <span className="min-w-0 flex-1 truncate text-meta font-bold">
                  {childName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={role}
                  disabled={locked || busy === childId}
                  aria-label={`Rôle de ${person.name} sur le carnet de ${childName}`}
                  className="min-w-0 flex-1"
                  onChange={(e) =>
                    run(childId, () =>
                      api.setMemberRole(
                        childId,
                        person.userId,
                        e.target.value as MemberRole,
                      ),
                    )
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={locked || busy === childId}
                  aria-label={`Retirer ${person.name} du carnet de ${childName}`}
                  className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                  onClick={() =>
                    run(childId, () => api.removeMember(childId, person.userId))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              {sole && !person.isSelf && (
                <p className="text-meta text-muted-foreground">
                  Seul administrateur de ce carnet : nommez d'abord quelqu'un
                  d'autre.
                </p>
              )}
            </li>
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

  // Un geste échoué ne fait pas tomber l'écran : il pose sa phrase, et la
  // console se recharge pour que ce qui s'affiche reste ce qui est vrai.
  const refresh = useCallback(async () => {
    setError(null);
    await load();
  }, [load]);

  const header = (
    <PageHeader
      title="Administration"
      lede="Les carnets que vous administrez, les proches qui y tiennent un rôle, et ce qui attend une réponse."
    />
  );

  if (loading)
    return (
      <PageShell>
        {header}
        <PageSkeleton label="Racontine rassemble les cercles" rows={3} />
      </PageShell>
    );

  if (forbidden)
    return (
      <PageShell>
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
          Seul l'administrateur d'un carnet — le parent qui l'a créé, ou
          quelqu'un qu'il a nommé — peut ouvrir cette page.
        </PageState>
      </PageShell>
    );

  if (!data)
    return (
      <PageShell>
        {header}
        <PageState
          icon={CloudOff}
          tone="error"
          title="L'administration ne répond pas"
          actions={
            <Button onClick={() => window.location.reload()}>Réessayer</Button>
          }
        >
          {error ??
            "La connexion au serveur a échoué. Rien n'a été modifié : réessayez dans un instant."}
        </PageState>
      </PageShell>
    );

  return (
    <PageShell>
      {header}

      {error && (
        <InlineError>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </InlineError>
      )}

      {/* ── Les chiffres ─────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={data.totals.children} label="carnets" />
        <Stat value={data.totals.people} label="proches" />
        <Stat value={data.totals.published} label="journées publiées" />
        <Stat
          value={data.totals.pendingInvitations}
          label="invitations en attente"
        />
      </section>

      {/* ── Les carnets ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-1">
        <SectionLabel className="px-1">
          Les carnets ({data.children.length})
        </SectionLabel>
        <ul className="flex flex-col gap-2">
          {data.children.map((c) => (
            <ChildCard
              key={c.id}
              child={c}
              /* Le carnet effacé emporte aussi des rôles et des invitations :
                 on relit la console entière plutôt que de retirer une carte
                 de la liste et laisser le reste de l'écran parler d'un carnet
                 qui n'existe plus. */
              onDeleted={() => {
                void refresh().catch(() => {});
              }}
            />
          ))}
        </ul>
      </section>

      {/* ── Les invitations en attente ───────────────────────────────────── */}
      {data.invitations.length > 0 && (
        <section className="flex flex-col gap-1">
          <SectionLabel className="px-1">
            En attente ({data.invitations.length})
          </SectionLabel>
          <ul className="flex flex-col gap-2">
            {data.invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-2 rounded-2xl border bg-card p-3 pl-4 shadow-card"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-ui font-bold">{inv.email}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-meta text-muted-foreground">
                    <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                    {ROLE_LABELS[inv.role]} · {inv.childName}
                    {inv.expired && (
                      <Badge variant="warning">
                        <TriangleAlert aria-hidden="true" />
                        expirée
                      </Badge>
                    )}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Révoquer l'invitation de ${inv.email}`}
                  className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                  onClick={async () => {
                    try {
                      await api.revokeInvitation(inv.id);
                      await refresh();
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

      {/* ── Les proches ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-1">
        <SectionLabel className="px-1">
          Les proches ({data.people.length})
        </SectionLabel>
        {/* La liste porte au moins l'administrateur qui regarde : elle n'est
            vide que si le serveur a répondu un cercle vide, ce qui vaut d'être
            dit plutôt que rendu par une section muette. */}
        {data.people.length === 0 ? (
          <p className="rounded-2xl border bg-card p-5 text-meta text-muted-foreground shadow-card">
            Aucun proche n'a encore de rôle sur ces carnets.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
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

      <div className="flex">
        <Button asChild variant="outline">
          <Link to="/partage">
            <UserPlus aria-hidden="true" />
            Inviter un proche
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}
