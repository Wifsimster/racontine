import { useState } from "react";
import { Download, ShieldX, TriangleAlert, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { CarnetRef, ErasurePreview } from "@/lib/types";
import { signOut } from "@/lib/auth-client";
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
import { InlineError } from "@/components/PageState";

export default function MesDonnees({ email }: { email?: string }) {
  const [busy, setBusy] = useState<"preview" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<ErasurePreview | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  async function askToLeave() {
    setBusy("preview");
    setError(null);
    setTyped("");
    setPlan(null);
    setBlocked(null);
    try {
      setPlan(await api.erasurePreview());
    } catch (e) {
      setBlocked(e instanceof Error ? e.message : "Effacement impossible");
    } finally {
      setBusy(null);
      setOpen(true);
    }
  }

  async function leave() {
    setBusy("delete");
    setError(null);
    try {
      await api.deleteMyAccount(typed);
      await signOut().catch(() => {});
      window.location.href = "/login";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'effacement");
      setBusy(null);
      setOpen(false);
    }
  }

  const ready = matches(typed, email);

  return (
    <section className="flex flex-col rounded-2xl border bg-card px-5 shadow-card">
      <h2 className="flex items-center gap-2 border-b py-4 text-ui font-bold">
        <Download className="size-4 shrink-0 text-primary" aria-hidden="true" />
        Mes données
      </h2>

      <div className="flex flex-col gap-4 py-4">
        <p className="text-meta text-pretty text-muted-foreground">
          Le carnet est à vous. Vous pouvez en emporter une copie complète à tout
          moment, et fermer votre compte quand vous le souhaitez.
        </p>

        <div className="flex flex-col gap-1.5">
          <Button variant="outline" asChild className="self-start">
            <a href={api.exportUrl} download>
              <Download aria-hidden="true" />
              Télécharger mes données
            </a>
          </Button>
          <p className="text-meta text-muted-foreground">
            Une archive zip : vos carnets, toutes les journées que vous pouvez
            lire, leurs moments, et les photos des pages du carnet. Ni mot de
            passe ni jeton n'y figurent — ce sont des clés, pas des souvenirs.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 border-t pt-4">
          <Button
            variant="ghost"
            onClick={askToLeave}
            loading={busy === "preview"}
            className="self-start text-destructive hover:bg-destructive-soft hover:text-destructive"
          >
            {busy !== "preview" && <Trash2 aria-hidden="true" />}
            Effacer mon compte
          </Button>
          <p className="text-meta text-muted-foreground">
            Définitif, et sans corbeille. On vous montre d'abord ce qui
            disparaîtrait.
          </p>
        </div>

        {error && (
          <InlineError>
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </InlineError>
        )}
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blocked ? "Pas encore possible" : "Effacer votre compte ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blocked ??
                "Votre compte, vos réglages et vos jetons disparaissent définitivement. Voici ce que cela emporte."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {blocked ? (
            <p className="flex items-start gap-2 rounded-xl bg-warning-bg p-3 text-meta text-warning">
              <ShieldX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Revenez ici une fois que ce sera fait : rien n'a été effacé.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <CarnetList
                tone="danger"
                title="Effacés avec votre compte"
                empty="Aucun carnet ne disparaît : vous n'êtes seul sur aucun."
                carnets={plan?.deletes ?? []}
                note="Personne d'autre ne les suit — journées et photos comprises."
              />
              {(plan?.leaves.length ?? 0) > 0 && (
                <CarnetList
                  tone="calm"
                  title="Conservés par les autres"
                  carnets={plan?.leaves ?? []}
                  note="Vous en sortez simplement ; ils restent à leur cercle."
                />
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="effacerCompte">
                  Recopiez votre adresse pour confirmer
                </Label>
                <Input
                  id="effacerCompte"
                  value={typed}
                  autoComplete="off"
                  placeholder={email ?? "votre adresse e-mail"}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>
              {blocked ? "Fermer" : "Annuler"}
            </AlertDialogCancel>
            {!blocked && (
              <Button
                variant="destructive"
                onClick={leave}
                loading={busy === "delete"}
                disabled={!ready}
              >
                Effacer définitivement
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function CarnetList({
  title,
  carnets,
  note,
  empty,
  tone,
}: {
  title: string;
  carnets: CarnetRef[];
  note: string;
  empty?: string;
  tone: "danger" | "calm";
}) {
  if (carnets.length === 0)
    return empty ? (
      <p className="rounded-xl border border-dashed px-3 py-2 text-meta text-muted-foreground">
        {empty}
      </p>
    ) : null;
  return (
    <div
      className={
        tone === "danger"
          ? "flex flex-col gap-1 rounded-xl bg-destructive-soft p-3"
          : "flex flex-col gap-1 rounded-xl border p-3"
      }
    >
      <p
        className={
          tone === "danger"
            ? "text-meta font-bold text-destructive"
            : "text-meta font-bold"
        }
      >
        {title}
      </p>
      <p className="text-meta text-muted-foreground">
        {carnets.map((c) => c.name).join(", ")} — {note}
      </p>
    </div>
  );
}

function matches(typed: string, expected?: string): boolean {
  if (!expected) return false;
  const fold = (s: string) =>
    s
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  return fold(typed) === fold(expected) && fold(expected).length > 0;
}
