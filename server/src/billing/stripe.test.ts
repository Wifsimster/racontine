import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import {
  StripeClient,
  StripeError,
  WebhookSignatureError,
  constructEvent,
  formEncode,
  periodEndOf,
  snapshotOf,
} from "./stripe.js";

/* --------------------------------- Encodage ------------------------------ */

test("l'encodage imbriqué est celui que Stripe attend", () => {
  const encoded = formEncode({
    mode: "subscription",
    line_items: [{ price: "price_123", quantity: 1 }],
    success_url: "https://carnet.fr/abonnement?paiement=ok",
  });
  assert.equal(
    encoded,
    "mode=subscription&line_items%5B0%5D%5Bprice%5D=price_123&line_items%5B0%5D%5Bquantity%5D=1" +
      "&success_url=https%3A%2F%2Fcarnet.fr%2Fabonnement%3Fpaiement%3Dok",
  );
});

test("un champ absent est OMIS, jamais envoyé vide", () => {
  // `customer=` (vide) vaut une 400 chez Stripe : ce n'est pas « pas de client ».
  assert.equal(formEncode({ customer: undefined, customer_email: null, a: 1 }), "a=1");
});

/* ------------------------------ Appels d'API ----------------------------- */

function fakeFetch(
  handler: (url: string, init: RequestInit) => { status?: number; body: unknown },
) {
  const calls: { url: string; body: string | undefined }[] = [];
  const impl = (async (url: unknown, init: unknown) => {
    const request = init as RequestInit;
    calls.push({ url: String(url), body: request?.body as string | undefined });
    const { status = 200, body } = handler(String(url), request);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("la page de paiement est demandée avec le prix, le retour et la locale", async () => {
  const { impl, calls } = fakeFetch(() => ({
    body: { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" },
  }));
  const stripe = new StripeClient({ apiKey: "sk_test_x", fetchImpl: impl });

  const session = await stripe.createCheckoutSession({
    priceId: "price_123",
    successUrl: "https://carnet.fr/abonnement?paiement=ok",
    cancelUrl: "https://carnet.fr/abonnement",
    customerEmail: "parent@exemple.fr",
    reference: "foyer",
  });

  assert.equal(session.url, "https://checkout.stripe.com/c/pay/cs_1");
  assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
  const body = calls[0].body!;
  assert.match(body, /line_items%5B0%5D%5Bprice%5D=price_123/);
  assert.match(body, /customer_email=parent%40exemple\.fr/);
  assert.match(body, /locale=fr/);
});

test("un client Stripe déjà connu remplace l'e-mail (Stripe refuse les deux)", async () => {
  const { impl, calls } = fakeFetch(() => ({ body: { id: "cs_1", url: "https://x" } }));
  const stripe = new StripeClient({ apiKey: "sk_test_x", fetchImpl: impl });

  await stripe.createCheckoutSession({
    priceId: "price_123",
    successUrl: "https://carnet.fr/ok",
    cancelUrl: "https://carnet.fr/ko",
    customerId: "cus_42",
    customerEmail: "parent@exemple.fr",
  });

  assert.match(calls[0].body!, /customer=cus_42/);
  assert.doesNotMatch(calls[0].body!, /customer_email/);
});

test("le portail s'ouvre sur la configuration épinglée quand il y en a une", async () => {
  /* UN COMPTE STRIPE PEUT SERVIR PLUSIEURS PRODUITS. Sans `configuration`,
     Stripe applique celle par DÉFAUT du compte : la famille qui vient gérer
     son carnet lirait alors le titre d'une autre application. */
  const { impl, calls } = fakeFetch(() => ({ body: { url: "https://billing.stripe.com/p/session/x" } }));
  const stripe = new StripeClient({ apiKey: "sk_test_x", fetchImpl: impl });

  const session = await stripe.createPortalSession({
    customerId: "cus_42",
    returnUrl: "https://carnet.fr/abonnement",
    configurationId: "bpc_racontine",
  });

  assert.equal(session.url, "https://billing.stripe.com/p/session/x");
  assert.equal(calls[0].url, "https://api.stripe.com/v1/billing_portal/sessions");
  assert.match(calls[0].body!, /configuration=bpc_racontine/);
  assert.match(calls[0].body!, /customer=cus_42/);
  assert.match(calls[0].body!, /locale=fr/);
});

test("sans configuration épinglée, le champ est OMIS et non envoyé vide", async () => {
  /* Une instance dédiée n'a rien à épingler : le défaut du compte est le bon.
     Mais `configuration=` (vide) vaudrait une 400 chez Stripe — ce n'est pas
     « pas de configuration », c'est une configuration nommée par le vide. */
  const { impl, calls } = fakeFetch(() => ({ body: { url: "https://x" } }));
  const stripe = new StripeClient({ apiKey: "sk_test_x", fetchImpl: impl });

  await stripe.createPortalSession({
    customerId: "cus_42",
    returnUrl: "https://carnet.fr/abonnement",
  });
  await stripe.createPortalSession({
    customerId: "cus_42",
    returnUrl: "https://carnet.fr/abonnement",
    configurationId: null,
  });

  for (const call of calls) assert.doesNotMatch(call.body!, /configuration/);
});

test("une erreur Stripe remonte SA phrase, pas un statut nu", async () => {
  const { impl } = fakeFetch(() => ({
    status: 400,
    body: { error: { message: "No such price: 'price_absent'", code: "resource_missing" } },
  }));
  const stripe = new StripeClient({ apiKey: "sk_test_x", fetchImpl: impl });

  await assert.rejects(
    () => stripe.getPrice("price_absent"),
    (err: unknown) =>
      err instanceof StripeError &&
      err.status === 400 &&
      err.code === "resource_missing" &&
      /No such price/.test(err.message),
  );
});

test("le prix affiché est celui de Stripe, jamais une constante du code", async () => {
  const { impl } = fakeFetch(() => ({
    body: {
      unit_amount: 499,
      currency: "eur",
      recurring: { interval: "month", interval_count: 1 },
    },
  }));
  const stripe = new StripeClient({ apiKey: "sk_test_x", fetchImpl: impl });

  assert.deepEqual(await stripe.getPrice("price_123"), {
    unitAmount: 499,
    currency: "eur",
    interval: "month",
    intervalCount: 1,
  });
});

/* ------------------------- Lecture d'un abonnement ----------------------- */

test("la fin de période se lit sur l'abonnement OU sur ses lignes", () => {
  const t = 1_789_000_000;
  assert.deepEqual(periodEndOf({ current_period_end: t }), new Date(t * 1000));
  // Version d'API récente : la date a migré sur les lignes.
  assert.deepEqual(
    periodEndOf({ items: { data: [{ current_period_end: t }] } }),
    new Date(t * 1000),
  );
  assert.equal(periodEndOf({}), null);
});

test("l'instantané d'abonnement garde le client, qu'il soit id ou objet", () => {
  assert.equal(snapshotOf({ id: "sub_1", customer: "cus_1", status: "active" }).customerId, "cus_1");
  assert.equal(
    snapshotOf({ id: "sub_1", customer: { id: "cus_2" }, status: "active" }).customerId,
    "cus_2",
  );
});

/* ------------------------------- Webhooks -------------------------------- */

const SECRET = "whsec_test";

function sign(payload: string, secret = SECRET, at = new Date()) {
  const t = Math.floor(at.getTime() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

test("un événement correctement signé est accepté et analysé", () => {
  const payload = JSON.stringify({
    id: "evt_1",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_1", status: "active" } },
  });
  const event = constructEvent(payload, sign(payload), SECRET);
  assert.equal(event.type, "customer.subscription.updated");
  assert.equal(event.data.status, "active");
});

test("un corps modifié d'un octet est refusé", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "x", data: { object: {} } });
  const header = sign(payload);
  assert.throws(
    () => constructEvent(payload.replace("evt_1", "evt_2"), header, SECRET),
    WebhookSignatureError,
  );
});

test("une signature d'un autre secret est refusée", () => {
  const payload = "{}";
  assert.throws(
    () => constructEvent(payload, sign(payload, "whsec_autre"), SECRET),
    WebhookSignatureError,
  );
});

test("un événement rejoué hors tolérance est refusé", () => {
  // Sans cette vérification, une requête légitime capturée aujourd'hui rouvre
  // un abonnement résilié dans six mois.
  const payload = "{}";
  const vieux = new Date(Date.now() - 3_600_000);
  assert.throws(() => constructEvent(payload, sign(payload, SECRET, vieux), SECRET), WebhookSignatureError);
});

test("une signature absente ou illisible est refusée", () => {
  assert.throws(() => constructEvent("{}", undefined, SECRET), WebhookSignatureError);
  assert.throws(() => constructEvent("{}", "bonjour", SECRET), WebhookSignatureError);
});

test("plusieurs signatures v1 : une seule valide suffit (rotation de secret)", () => {
  const payload = "{}";
  const bonne = sign(payload).split("v1=")[1];
  const header = `t=${Math.floor(Date.now() / 1000)},v1=deadbeef,v1=${bonne}`;
  assert.doesNotThrow(() => constructEvent(payload, header, SECRET));
});
