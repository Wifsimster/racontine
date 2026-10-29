import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Billing, PlanPrice } from "./types";

let cache: Billing | null = null;
let inflight: Promise<Billing> | null = null;
const listeners = new Set<(value: Billing | null) => void>();

function publish(value: Billing | null) {
  cache = value;
  for (const listener of listeners) listener(value);
}

function load(force = false): Promise<Billing> {
  if (!force && cache) return Promise.resolve(cache);
  inflight ??= api
    .billing()
    .then((value) => {
      publish(value);
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function refreshBilling(): Promise<Billing> {
  return load(true);
}

export function setBilling(value: Billing) {
  publish(value);
}

export function useBilling(enabled = true): {
  billing: Billing | null;
  loading: boolean;
  reload: () => Promise<Billing>;
} {
  const [billing, setLocal] = useState<Billing | null>(cache);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    if (!enabled) return;
    listeners.add(setLocal);
    let alive = true;
    load()
      .catch(() => {
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      listeners.delete(setLocal);
    };
  }, [enabled]);

  const reload = useCallback(() => refreshBilling(), []);
  return { billing, loading, reload };
}

const INTERVALS: Record<string, string> = {
  day: "jour",
  week: "semaine",
  month: "mois",
  year: "an",
};

export function formatAmount(price: PlanPrice): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: price.unitAmount % 100 === 0 ? 0 : 2,
  }).format(price.unitAmount / 100);
}

export function formatInterval(price: PlanPrice): string {
  const unit = INTERVALS[price.interval] ?? price.interval;
  return price.intervalCount > 1
    ? `tous les ${price.intervalCount} ${unit}`
    : `par ${unit}`;
}

export function formatPrice(price: PlanPrice): string {
  const unit = INTERVALS[price.interval] ?? price.interval;
  return price.intervalCount > 1
    ? `${formatAmount(price)} / ${price.intervalCount} ${unit}`
    : `${formatAmount(price)}/${unit}`;
}

export function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function shouldPrompt(billing: Billing | null): boolean {
  if (!billing?.enabled) return false;
  const { reason } = billing.access;
  return reason !== "self-hosted" && reason !== "subscribed";
}
