import { createHmac, timingSafeEqual } from "node:crypto";

/* ===========================================================================
   STRIPE, EN TROIS CENTS LIGNES ET SANS SDK.

   Pourquoi pas `npm i stripe` : une instance auto-hébergée qui n'encaisse rien
   — c'est-à-dire la plupart d'entre elles — embarquerait quand même quatre Mo
   de SDK et une version d'API épinglée par quelqu'un d'autre. Ce dont on a
   besoin tient en quatre appels (créer un paiement, ouvrir le portail, lire un
   prix, relire un abonnement) et une vérification de signature. Tout est ici,
   testable sans réseau, et le jour où ça ne suffit plus, le port ne change pas.

   Ce fichier ne connaît RIEN de Racontine : ni foyer, ni carnet, ni base. Il
   parle HTTP à Stripe, et c'est tout — la politique vit dans `domain/paywall.ts`,
   l'orchestration dans `billing/index.ts`.
   =========================================================================== */

const API = "https://api.stripe.com/v1";

/** Erreur d'appel à Stripe, avec le message renvoyé par l'API si on l'a. */
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

/**
 * Encodage `application/x-www-form-urlencoded` **imbriqué**, celui que Stripe
 * attend : `line_items[0][price]=price_123`. Les valeurs `undefined` et `null`
 * sont omises — envoyer `customer=` (vide) à Stripe est une erreur 400, pas un
 * champ absent.
 */
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

/** Appel brut à l'API Stripe. `fetchImpl` n'existe que pour les tests. */
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
    // Réseau coupé, DNS, TLS : Stripe n'a rien vu, l'appelant doit pouvoir le
    // dire autrement qu'avec « [object Object] ».
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

/* --------------------------------------------------------------------------
   Ce qu'on lit chez Stripe, réduit à ce dont le produit a besoin.
   -------------------------------------------------------------------------- */

/** Le prix affiché, tel que Stripe le détient (jamais recopié dans le code). */
export type PlanPrice = {
  /** Montant en plus petite unité (centimes). */
  unitAmount: number;
  /** Code ISO, minuscule (« eur »). */
  currency: string;
  /** « month » | « year » … — l'unité de la période. */
  interval: string;
  /** Nombre d'unités par période (1 mois, 3 mois…). */
  intervalCount: number;
};

/** L'état d'un abonnement, réduit à ce que la règle du péage consulte. */
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

/**
 * Fin de période d'un abonnement. Stripe a déplacé `current_period_end` de
 * l'abonnement vers ses LIGNES dans les versions récentes de l'API : on lit les
 * deux, et on garde la plus lointaine. Sans ça, la date serait silencieusement
 * nulle selon la version d'API du compte — et une période payée paraîtrait
 * consommée.
 */
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

/** Abonnement Stripe (objet brut) → instantané utile au produit. */
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

/* --------------------------------------------------------------------------
   Le client.
   -------------------------------------------------------------------------- */

export type StripeClientOptions = {
  apiKey: string;
  /** Injecté par les tests ; la production utilise `fetch`. */
  fetchImpl?: typeof fetch;
};

export class StripeClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ apiKey, fetchImpl }: StripeClientOptions) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /**
   * LE PRIX N'EST PAS ÉCRIT DANS LE CODE. Il est lu chez Stripe, qui est le
   * seul endroit où il est vrai : un tarif recopié dans un composant React est
   * un tarif qui mentira le jour où on le changera dans le tableau de bord —
   * au pire endroit possible, juste au-dessus du bouton de paiement.
   */
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

  /** Page de paiement hébergée par Stripe : on ne touche jamais une carte. */
  async createCheckoutSession(params: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    /** Client Stripe déjà connu du foyer (réabonnement), sinon son e-mail. */
    customerId?: string | null;
    customerEmail?: string | null;
    /** Repère du foyer, renvoyé tel quel dans le webhook. */
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
          // L'un OU l'autre : Stripe refuse les deux ensemble.
          customer: params.customerId ?? undefined,
          customer_email: params.customerId ? undefined : (params.customerEmail ?? undefined),
          // Un code promo est le seul levier d'acquisition d'un studio d'une
          // personne : la case doit exister sans redéploiement.
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

  /**
   * Portail client Stripe : changer de carte, télécharger une facture,
   * RÉSILIER. On ne réimplémente aucun de ces trois écrans — et surtout pas le
   * troisième : une résiliation qu'on doit demander par e-mail est une
   * résiliation qu'on retient de force.
   */
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
          // Sans `configuration`, Stripe habille la session avec la config PAR
          // DÉFAUT DU COMPTE — celle d'un autre produit quand le compte en
          // porte plusieurs, titre compris. On la passe donc explicitement dès
          // qu'on en a une, plutôt que de dépendre d'un réglage de tableau de
          // bord qu'un autre produit peut déplacer sans nous prévenir.
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

  /** Session de paiement relue après le retour du client (customer + abonnement). */
  async getCheckoutSession(
    id: string,
  ): Promise<{ customerId: string | null; subscriptionId: string | null }> {
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
    };
  }
}

/* --------------------------------------------------------------------------
   La signature des webhooks : la seule chose qui distingue Stripe d'un inconnu
   qui poste `{"status":"active"}` sur une URL publique.
   -------------------------------------------------------------------------- */

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

/** Tolérance d'horloge par défaut : cinq minutes, comme le SDK officiel. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Vérifie l'en-tête `Stripe-Signature` sur le corps BRUT de la requête, et rend
 * l'événement analysé.
 *
 * Trois pièges, tous mortels, tous couverts ici :
 *  · le corps doit être les OCTETS REÇUS — un `JSON.stringify(req.body)` change
 *    l'ordre ou les espaces et la signature ne correspond plus jamais ;
 *  · la comparaison est à temps constant (`timingSafeEqual`) : un `===` sur une
 *    chaîne fuit, caractère par caractère, la signature attendue ;
 *  · l'horodatage est vérifié, sinon une requête légitime capturée aujourd'hui
 *    peut être rejouée dans six mois pour rouvrir un abonnement résilié.
 */
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
