import { Baby, Moon, Smile, Soup, Sparkles } from "lucide-react";

export const NBSP = " ";

export type Shot = { id: string; file: File; url: string };

export type Stage = "prep" | "upload";

export type Phase = "idle" | "sending" | "error";

export const PREP_SHARE = 55;

export const MOMENT_SHAPES = [
  { key: "meal", label: "Repas", Icon: Soup, width: "w-3/4" },
  { key: "nap", label: "Sieste", Icon: Moon, width: "w-1/2" },
  { key: "mood", label: "Humeur", Icon: Smile, width: "w-2/3" },
  { key: "activity", label: "Activité", Icon: Sparkles, width: "w-4/5" },
  { key: "anecdote", label: "Anecdote", Icon: Baby, width: "w-3/5" },
] as const;

export function localDate(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}${NBSP}o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}${NBSP}Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")}${NBSP}Mo`;
}

export function pageCount(n: number): string {
  return `${n}${NBSP}page${n > 1 ? "s" : ""}`;
}
