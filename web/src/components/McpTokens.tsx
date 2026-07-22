import { useEffect, useState } from "react";
import {
  Plug,
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import type { McpToken } from "@/lib/types";
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

/** Petit bouton « copier » avec accusé de copie temporaire. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* le presse-papier peut être indisponible (contexte non sécurisé) */
        }
      }}
      aria-label={label}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copié" : "Copier"}
    </Button>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "jamais";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Gestion des jetons MCP : créer un jeton pour connecter une session Claude
 * (cloud, Desktop, Claude Code) qui pourra téléverser des photos de carnet.
 */
export default function McpTokens({ webBaseUrl }: { webBaseUrl?: string }) {
  const [tokens, setTokens] = useState<McpToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  // Secret en clair, affiché une seule fois juste après création.
  const [secret, setSecret] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<McpToken | null>(null);

  // Base publique fournie par les réglages (propriétaire) ou, à défaut,
  // l'origine courante — l'app est servie depuis la même URL que l'API.
  const base = webBaseUrl ?? window.location.origin;
  const endpoint = `${base.replace(/\/$/, "")}/api/mcp`;

  useEffect(() => {
    api
      .listMcpTokens()
      .then((r) => setTokens(r.tokens))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Échec du chargement"),
      );
  }, []);

  async function create() {
    const label = name.trim();
    if (!label || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await api.createMcpToken(label);
      setSecret(res.secret);
      setTokens((t) => [res.token, ...(t ?? [])]);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la création");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(token: McpToken) {
    setError(null);
    try {
      await api.revokeMcpToken(token.id);
      setTokens((t) => (t ?? []).filter((x) => x.id !== token.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la révocation");
    } finally {
      setToRevoke(null);
    }
  }

  return (
    <section className="flex flex-col rounded-2xl border bg-card px-5 shadow-sm">
      <div className="flex items-center gap-2 border-b py-4 text-sm font-medium">
        <Plug className="size-4 text-primary" />
        Connexion MCP (session Claude)
      </div>

      <div className="flex flex-col gap-4 py-4">
        <p className="text-sm text-muted-foreground">
          Connectez une session Claude (cloud, Desktop ou Claude Code) à cette
          instance pour téléverser des photos de carnet à la voix ou par
          glisser-déposer. Créez un jeton, puis ajoutez ce serveur MCP à Claude.
        </p>

        {/* Adresse du serveur MCP */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">
            Adresse du serveur MCP
          </Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border bg-background px-3 py-2 text-sm">
              {endpoint}
            </code>
            <CopyButton value={endpoint} label="Copier l'adresse MCP" />
          </div>
          <p className="text-xs text-muted-foreground">
            Transport « HTTP », en-tête{" "}
            <code>Authorization: Bearer &lt;jeton&gt;</code>. Outils exposés :{" "}
            <code>list_children</code>, <code>upload_daily_note</code>.
          </p>
        </div>

        {/* Secret fraîchement créé */}
        {secret && (
          <div className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <TriangleAlert className="size-4" />
              Copiez ce jeton maintenant
            </div>
            <p className="text-xs text-muted-foreground">
              Il ne sera plus jamais affiché. Conservez-le comme un mot de passe.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border bg-background px-3 py-2 font-mono text-sm">
                {secret}
              </code>
              <CopyButton value={secret} label="Copier le jeton" />
            </div>
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSecret(null)}
                className="text-muted-foreground"
              >
                J'ai copié le jeton
              </Button>
            </div>
          </div>
        )}

        {/* Création d'un jeton */}
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="mcpTokenName" className="text-xs text-muted-foreground">
              Nouveau jeton
            </Label>
            <Input
              id="mcpTokenName"
              value={name}
              maxLength={60}
              placeholder="ex. Session Claude cloud"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
          </div>
          <Button onClick={create} disabled={!name.trim() || creating}>
            {creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Créer
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Liste des jetons */}
        {tokens === null ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun jeton pour le moment.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
              >
                <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    <code>{t.tokenPrefix}…</code> · créé le{" "}
                    {fmtDate(t.createdAt)} · dernier usage{" "}
                    {fmtDate(t.lastUsedAt)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setToRevoke(t)}
                  aria-label={`Révoquer le jeton ${t.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog
        open={!!toRevoke}
        onOpenChange={(o) => !o && setToRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Révoquer ce jeton ?</AlertDialogTitle>
            <AlertDialogDescription>
              Toute session Claude utilisant « {toRevoke?.name} » perdra
              immédiatement l'accès. Cette action est définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => toRevoke && revoke(toRevoke)}
            >
              Révoquer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
