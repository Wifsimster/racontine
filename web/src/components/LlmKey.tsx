import { useEffect, useState } from "react";
import {
  Sparkles,
  KeyRound,
  Save,
  Trash2,
  Check,
  Loader2,
  ShieldCheck,
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
    <section className="flex flex-col rounded-2xl border bg-card px-5 shadow-sm">
      <div className="flex items-center gap-2 border-b py-4 text-sm font-medium">
        <Sparkles className="size-4 text-primary" />
        Clé API d'extraction (Anthropic)
      </div>

      <div className="flex flex-col gap-4 py-4">
        <p className="text-sm text-muted-foreground">
          La lecture automatique des carnets utilise <strong>votre</strong> clé
          API Anthropic : les appels sont facturés sur votre compte. Créez-en une
          sur{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            console.anthropic.com
          </a>
          . Elle est stockée chiffrée et n'est jamais réaffichée.
        </p>

        {/* État actuel */}
        {state?.configured ? (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <ShieldCheck className="size-4 shrink-0 text-primary" />
            <span className="flex-1">
              Clé configurée{" "}
              <code className="text-muted-foreground">
                sk-ant-…{state.hint}
              </code>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmClear(true)}
              aria-label="Supprimer la clé API"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ) : state ? (
          <div className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
            Aucune clé configurée — l'import de carnets est indisponible tant
            qu'une clé n'est pas enregistrée.
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        )}

        {/* Saisie / remplacement */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="anthropicKey" className="text-xs text-muted-foreground">
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
            <Button onClick={save} disabled={!value.trim() || saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : saved ? (
                <Check className="size-4" />
              ) : (
                <Save className="size-4" />
              )}
              {saved ? "Enregistré" : "Enregistrer"}
            </Button>
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <KeyRound className="size-3" />
            La clé reste sur ce serveur, chiffrée ; elle sert uniquement à lire
            vos carnets.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
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
