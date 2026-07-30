import { useEffect, useState } from "react";
import {
  Sparkles,
  KeyRound,
  Save,
  Trash2,
  Check,
  ShieldCheck,
  ExternalLink,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import type { UserLlm } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InlineError } from "@/components/PageState";

/**
 * Clé API Anthropic propre à l'utilisateur : la lecture des carnets est
 * facturée sur SON compte Anthropic. La clé est chiffrée côté serveur et n'est
 * jamais réaffichée — on n'en montre que les 4 derniers caractères.
 */
export default function LlmKey() {
  const [state, setState] = useState<UserLlm | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    api
      .getLlmKey()
      .then(setState)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Échec du chargement"),
      );
  }, []);

  async function save() {
    const key = value.trim();
    if (!key || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.setLlmKey(key);
      setState(res);
      setValue("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setError(null);
    try {
      setState(await api.clearLlmKey());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la suppression");
    } finally {
      setConfirmClear(false);
    }
  }

  return (
    <section className="flex flex-col rounded-2xl border bg-card px-5 shadow-card">
      <h2 className="flex items-center gap-2 border-b py-4 text-ui font-bold">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
        Clé API d'extraction (Anthropic)
      </h2>

      <div className="flex flex-col gap-4 py-4">
        <p className="text-meta text-pretty text-muted-foreground">
          La lecture automatique des carnets utilise <strong>votre</strong> clé
          API Anthropic : les appels sont facturés sur votre compte. Elle est
          stockée chiffrée et n'est jamais réaffichée.
        </p>

        {/* « Aller chercher une clé » est une ACTION, pas une incise : en lien
            dans la phrase, la cible faisait 129 x 18 px (I2). Sortie du
            paragraphe, elle fait 44 px de haut et se voit. */}
        <Button
          asChild
          variant="outline"
          size="sm"
          /* `whitespace-normal` : le libellé du bouton est long, et à 320 px un
             `nowrap` poussait la page à 325 px de large (I5). */
          className="h-auto min-h-11 self-start py-2 text-left whitespace-normal"
        >
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink aria-hidden="true" />
            Créer une clé sur console.anthropic.com
          </a>
        </Button>

        {/* État actuel */}
        {state?.configured ? (
          <div className="flex items-center gap-2 rounded-xl bg-success-bg px-3 py-2 text-meta text-success">
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              Clé configurée{" "}
              <code data-tabular>sk-ant-…{state.hint}</code>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="-mr-2 shrink-0 text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={() => setConfirmClear(true)}
              aria-label="Supprimer la clé API"
            >
              <Trash2 />
            </Button>
          </div>
        ) : state ? (
          <div className="rounded-xl border bg-background px-3 py-2 text-meta text-muted-foreground">
            Aucune clé configurée — l'import de carnets est indisponible tant
            qu'une clé n'est pas enregistrée.
          </div>
        ) : (
          <div className="skeleton h-10 w-full" role="status" aria-label="On regarde si une clé est enregistrée" />
        )}

        {/* Saisie / remplacement */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="anthropicKey">
            {state?.configured ? "Remplacer la clé" : "Clé API Anthropic"}
          </Label>
          <div className="flex items-end gap-2">
            <Input
              id="anthropicKey"
              type="password"
              autoComplete="off"
              value={value}
              placeholder="sk-ant-…"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
            <Button onClick={save} loading={saving} disabled={!value.trim()}>
              {!saving &&
                (saved ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Save aria-hidden="true" />
                ))}
              {saved ? "Enregistré" : "Enregistrer"}
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
            <KeyRound className="size-3.5 shrink-0" aria-hidden="true" />
            La clé reste sur ce serveur, chiffrée ; elle sert uniquement à lire
            vos carnets.
          </p>
        </div>

        {error && (
          <InlineError>
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </InlineError>
        )}
      </div>

      <AlertDialog
        open={confirmClear}
        onOpenChange={(o) => !o && setConfirmClear(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer votre clé API ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'extraction automatique des carnets sera indisponible jusqu'à
              l'enregistrement d'une nouvelle clé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={clear}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
