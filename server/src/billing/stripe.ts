import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.stripe.com/v1";

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "StripeError";
  }
}

export function formEncode(
  params: Record<string, unknown>,
  prefix = "",
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === "object")
          parts.push(formEncode(item as Record<string, unknown>, `${name}[${i}]`));
        else parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === "object") {
      parts.push(formEncode(value as Record<string, unknown>, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

type StripeObject = Record<string, unknown>;

async function call(
  apiKey: string,
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
  fetchImpl: typeof fetch = fetch,
): Promise<StripeObject> {
  const url = `${API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  let body: string | undefined;
  if (init.method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = formEncode(init.body ?? {});
  }

  let res: Response;
  try {
    res = await fetchImpl(url, { method: init.method, headers, body });
  } catch (err) {
    throw new StripeError(
      `Stripe est injoignable (${err instanceof Error ? err.message : "réseau"}).`,
      0,
    );
  }

  const payload = (await res.json().catch(() => ({}))) as StripeObject;
  if (!res.ok) {
    const error = (payload.error ?? {}) as StripeObject;
    throw new StripeError(
      typeof error.message === "string"
        ? error.message
        : `Stripe a répondu ${res.status}.`,
      res.status,
      typeof error.code === "string" ? error.code : undefined,
    );
  }
  return payload;
}

export type PlanPrice = {
  unitAmount: number;
  currency: string;
  interval: string;
  intervalCount: number;
};

export type SubscriptionSnapshot = {
  id: string;
  customerId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

function asDate(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : null;
}

export function periodEndOf(sub: StripeObject): Date | null {
  const direct = asDate(sub.current_period_end);
  const items = ((sub.items as StripeObject | undefined)?.data ?? []) as StripeObject[];
  const fromItems = items
    .map((item) => asDate(item.current_period_end))
    .filter((d): d is Date => d !== null);
  const all = [direct, ...fromItems].filter((d): d is Date => d !== null);
  if (!all.length) return null;
  return new Date(Math.max(...all.map((d) => d.getTime())));
}

export function snapshotOf(sub: StripeObject): SubscriptionSnapshot {
  const customer = sub.customer;
  return {
    id: String(sub.id ?? ""),
    customerId:
      typeof customer === "string"
        ? customer
        : typeof (customer as StripeObject | null)?.id === "string"
          ? String((customer as StripeObject).id)
          : null,
    status: String(sub.status ?? ""),
    currentPeriodEnd: periodEndOf(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
  };
}

export type StripeClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
};

export class StripeClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ apiKey, fetchImpl }: StripeClientOptions) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async getPrice(priceId: string): Promise<PlanPrice> {
    const price = await call(
      this.apiKey,
      `/prices/${encodeURIComponent(priceId)}`,
      { method: "GET" },
      this.fetchImpl,
    );
    const recurring = (price.recurring ?? {}) as StripeObject;
    return {
      unitAmount: Number(price.unit_amount ?? 0),
      currency: String(price.currency ?? "eur"),
      interval: String(recurring.interval ?? "month"),
      intervalCount: Number(recurring.interval_count ?? 1),
    };
  }

  async getSubscription(id: string): Promise<SubscriptionSnapshot> {
    const sub = await call(
      this.apiKey,
      `/subscriptions/${encodeURIComponent(id)}`,
      { method: "GET" },
      this.fetchImpl,
    );
    return snapshotOf(sub);
  }

  async createCheckoutSession(params: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    customerId?: string | null;
    customerEmail?: string | null;
    reference?: string;
  }): Promise<{ id: string; url: string }> {
    const session = await call(
      this.apiKey,
      "/checkout/sessions",
      {
        method: "POST",
        body: {
          mode: "subscription",
          line_items: [{ price: params.priceId, quantity: 1 }],
          success_url: params.successUrl,
          cancel_url: params.cancelUrl,
          client_reference_id: params.reference,
          customer: params.customerId ?? undefined,
          customer_email: params.customerId ? undefined : (params.customerEmail ?? undefined),
          allow_promotion_codes: true,
          locale: "fr",
        },
      },
      this.fetchImpl,
    );
    const url = session.url;
    if (typeof url !== "string")
      throw new StripeError("Stripe n'a pas renvoyé d'adresse de paiement.", 502);
    return { id: String(session.id ?? ""), url };
  }

  async createPortalSession(params: {
    customerId: string;
    returnUrl: string;
    configurationId?: string;
  }): Promise<{ url: string }> {
    const session = await call(
      this.apiKey,
      "/billing_portal/sessions",
      {
        method: "POST",
        body: {
          customer: params.customerId,
          return_url: params.returnUrl,
          locale: "fr",
          ...(params.configurationId
            ? { configuration: params.configurationId }
            : {}),
        },
      },
      this.fetchImpl,
    );
    const url = session.url;
    if (typeof url !== "string")
      throw new StripeError("Stripe n'a pas renvoyé d'adresse de portail.", 502);
    return { url };
  }

  async getCheckoutSession(
    id: string,
  ): Promise<{
    customerId: string | null;
    subscriptionId: string | null;
    reference: string | null;
  }> {
    const session = await call(
      this.apiKey,
      `/checkout/sessions/${encodeURIComponent(id)}`,
      { method: "GET" },
      this.fetchImpl,
    );
    const idOf = (value: unknown): string | null =>
      typeof value === "string"
        ? value
        : typeof (value as StripeObject | null)?.id === "string"
          ? String((value as StripeObject).id)
          : null;
    return {
      customerId: idOf(session.customer),
      subscriptionId: idOf(session.subscription),
      reference:
        typeof session.client_reference_id === "string"
          ? session.client_reference_id
          : null,
    };
  }
}

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

export const WEBHOOK_TOLERANCE_SECONDS = 300;

export function constructEvent(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
  now: Date = new Date(),
  toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS,
): { id: string; type: string; data: StripeObject } {
  if (!signatureHeader)
    throw new WebhookSignatureError("Signature Stripe absente.");

  const parts = new Map<string, string[]>();
  for (const item of signatureHeader.split(",")) {
    const [key, value] = item.split("=", 2);
    if (!key || value === undefined) continue;
    const list = parts.get(key.trim()) ?? [];
    list.push(value.trim());
    parts.set(key.trim(), list);
  }

  const timestamp = parts.get("t")?.[0];
  const signatures = parts.get("v1") ?? [];
  if (!timestamp || !signatures.length)
    throw new WebhookSignatureError("Signature Stripe illisible.");

  const age = Math.abs(now.getTime() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds)
    throw new WebhookSignatureError(
      "Signature Stripe périmée (horloge décalée, ou rejeu).",
    );

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  const matches = signatures.some((candidate) => {
    const buf = Buffer.from(candidate, "utf8");
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
  });
  if (!matches) throw new WebhookSignatureError("Signature Stripe invalide.");

  let event: StripeObject;
  try {
    event = JSON.parse(payload) as StripeObject;
  } catch {
    throw new WebhookSignatureError("Corps d'événement Stripe illisible.");
  }

  return {
    id: String(event.id ?? ""),
    type: String(event.type ?? ""),
    data: ((event.data as StripeObject | undefined)?.object ?? {}) as StripeObject,
  };
}
