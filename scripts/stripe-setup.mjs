#!/usr/bin/env node
/* ===========================================================================
   PROVISIONNER STRIPE POUR RACONTINE — une commande, une fois.

   Le code du paiement est dans l'app ; ce qu'il lui manque, ce sont trois
   objets dans VOTRE compte Stripe : un produit, un prix, un point de webhook.
   Les créer à la main dans le tableau de bord marche très bien — et se rate
   très bien aussi : un prix « one-off » au lieu de récurrent, un webhook
   abonné à trois événements sur sept, un secret de signature qu'on ne revoit
   jamais. Ce script les crée dans le bon ordre, avec les bonnes options, et
   rend les lignes à coller dans `.env`.

   IDEMPOTENT : relancez-le autant de fois que vous voulez. Il reconnaît ce
   qu'il a déjà créé (métadonnée « racontine ») et ne fabrique jamais un
   doublon — un deuxième prix actif sur le même produit est exactement le genre
   de chose qui se découvre sur un relevé bancaire.

     # ce qui existe déjà, sans rien écrire
     STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs --check \
       --url https://racontine.exemple.fr

     # créer ce qui manque
     STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs \
       --url https://racontine.exemple.fr

     # une offre annuelle plutôt que mensuelle
     ... --amount 3900 --interval year

   COMMENCEZ EN MODE TEST (sk_test_...). Le script refuse une clé sk_live_
   sans --live : on ne provisionne pas une caisse réelle par inadvertance.
   =========================================================================== */

const DEFAULTS = {
  name: "Racontine Famille",
  description:
    "Toutes vos journées de carnet, vos enfants et vos proches sans limite. Lire le journal reste gratuit, pour toujours.",
  amount: 499, // en centimes — 4,99 €
  currency: "eur",
  interval: "month",
  apiBase: "https://api.stripe.com/v1",
};

/** Les événements dont le serveur a besoin, et aucun autre. */
const EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

/** Marque nos objets, pour les retrouver au lieu d'en créer un deuxième. */
const MARK = "racontine";
const MARK_VALUE = "famille";

/* ------------------------------- Arguments ------------------------------- */

function parseArgs(argv) {
  const args = { ...DEFAULTS, check: false, dryRun: false, live: false, url: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--check") args.check = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--live") args.live = true;
    else if (arg === "--url") args.url = next();
    else if (arg === "--name") args.name = next();
    else if (arg === "--amount") args.amount = Number(next());
    else if (arg === "--currency") args.currency = String(next()).toLowerCase();
    else if (arg === "--interval") args.interval = next();
    else if (arg === "--key") args.key = next();
    else if (arg === "--api-base") args.apiBase = next(); // bac à sable / tests
    else if (arg === "--help" || arg === "-h") args.help = true;
    else {
      console.error(`Option inconnue : ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

const HELP = `
Provisionne Stripe pour Racontine (produit, prix, webhook, portail).

  node scripts/stripe-setup.mjs --url https://racontine.exemple.fr

  --url <base>      URL PUBLIQUE de l'instance (sans elle, le webhook est ignoré)
  --check           n'écrit rien : dit ce qui existe et ce qui manque
  --dry-run         montre ce qui serait créé, sans le créer
  --amount <cts>    montant en centimes (défaut : 499)
  --currency <iso>  devise (défaut : eur)
  --interval <p>    month | year (défaut : month)
  --name <nom>      nom du produit (défaut : « Racontine Famille »)
  --live            autorise une clé sk_live_ (sinon refusée)

La clé vient de STRIPE_SECRET_KEY, ou de --key.
`;

/* --------------------------------- Stripe -------------------------------- */

/**
 * Encodage imbriqué attendu par Stripe (`recurring[interval]=month`). C'est une
 * copie de ce que fait `server/src/billing/stripe.ts` — quinze lignes, plutôt
 * que de faire dépendre un script d'exploitation de la compilation TypeScript
 * du serveur.
 */
function formEncode(params, prefix = "") {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value))
      value.forEach((item, i) =>
        parts.push(
          item !== null && typeof item === "object"
            ? formEncode(item, `${name}[${i}]`)
            : `${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`,
        ),
      );
    else if (typeof value === "object") parts.push(formEncode(value, name));
    else parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return parts.filter(Boolean).join("&");
}

function makeStripe(key, apiBase) {
  return async function call(method, path, body) {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: body ? formEncode(body) : undefined,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(
        `${method} ${path} → ${payload?.error?.message ?? `Stripe a répondu ${res.status}`}`,
      );
    return payload;
  };
}

/* --------------------------------- Sortie -------------------------------- */

const OK = "[ok]";
const ADD = "[+] ";
const WARN = "[!] ";
const say = (...a) => console.log(...a);

/* ------------------------------- Le travail ------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return say(HELP);

  const key = args.key ?? process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error(
      "Aucune clé : passez STRIPE_SECRET_KEY dans l'environnement, ou --key sk_test_...",
    );
    process.exit(2);
  }
  if (key.startsWith("sk_live_") && !args.live) {
    console.error(
      "Clé de PRODUCTION détectée. Déroulez d'abord le parcours en sk_test_... ;\n" +
        "quand c'est vert, relancez avec --live pour l'assumer explicitement.",
    );
    process.exit(2);
  }
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    console.error("--amount doit être un entier de centimes (ex. 499).");
    process.exit(2);
  }

  const stripe = makeStripe(key, args.apiBase);
  const write = !args.check && !args.dryRun;

  const account = await stripe("GET", "/account");
  say(
    `${OK} compte Stripe : ${account.settings?.dashboard?.display_name ?? account.id}` +
      ` (${account.livemode ? "PRODUCTION" : "mode test"})`,
  );

  /* 1. Le produit --------------------------------------------------------- */
  const products = await stripe("GET", "/products?limit=100&active=true");
  let product = (products.data ?? []).find((p) => p.metadata?.[MARK] === MARK_VALUE);
  if (product) say(`${OK} produit « ${product.name} » (${product.id})`);
  else if (!write) say(`${ADD}produit « ${args.name} » — à créer`);
  else {
    product = await stripe("POST", "/products", {
      name: args.name,
      description: args.description,
      metadata: { [MARK]: MARK_VALUE },
    });
    say(`${ADD}produit créé : ${product.id}`);
  }

  /* 2. Le prix ------------------------------------------------------------ */
  const montant = (args.amount / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: args.amount % 100 ? 2 : 0,
  });
  const cible = `${montant} ${args.currency.toUpperCase()} / ${args.interval === "year" ? "an" : "mois"}`;

  let price = null;
  if (product?.id) {
    const prices = await stripe(
      "GET",
      `/prices?product=${encodeURIComponent(product.id)}&active=true&limit=100`,
    );
    price = (prices.data ?? []).find(
      (p) =>
        p.unit_amount === args.amount &&
        p.currency === args.currency &&
        p.recurring?.interval === args.interval &&
        (p.recurring?.interval_count ?? 1) === 1,
    );
    const autres = (prices.data ?? []).filter((p) => p !== price);
    if (autres.length)
      say(
        `${WARN}${autres.length} autre(s) prix actif(s) sur ce produit : ` +
          `${autres.map((p) => p.id).join(", ")}.\n` +
          `    Racontine n'en utilise qu'UN, celui de STRIPE_PRICE_ID.`,
      );
  }

  if (price) say(`${OK} prix ${cible} (${price.id})`);
  else if (!write) say(`${ADD}prix ${cible} — à créer`);
  else {
    price = await stripe("POST", "/prices", {
      product: product.id,
      unit_amount: args.amount,
      currency: args.currency,
      recurring: { interval: args.interval },
      metadata: { [MARK]: MARK_VALUE },
    });
    say(`${ADD}prix créé : ${price.id} (${cible})`);
  }

  /* 3. Le webhook --------------------------------------------------------- */
  let secret = null;
  if (args.url) {
    const hook = `${String(args.url).replace(/\/$/, "")}/api/billing/webhook`;
    const hooks = await stripe("GET", "/webhook_endpoints?limit=100");
    let endpoint = (hooks.data ?? []).find((h) => h.url === hook);

    if (endpoint) {
      const connus = endpoint.enabled_events ?? [];
      const manquants = connus.includes("*")
        ? []
        : EVENTS.filter((e) => !connus.includes(e));
      if (manquants.length && write) {
        endpoint = await stripe("POST", `/webhook_endpoints/${endpoint.id}`, {
          enabled_events: [...new Set([...connus, ...EVENTS])],
        });
        say(`${ADD}webhook complété (${manquants.length} événement(s)) : ${endpoint.id}`);
      } else if (manquants.length) {
        say(`${WARN}webhook ${endpoint.id} : événements manquants — ${manquants.join(", ")}`);
      } else {
        say(`${OK} webhook ${hook} (${endpoint.id})`);
      }
      if (endpoint.status === "disabled")
        say(`${WARN}ce webhook est DÉSACTIVÉ chez Stripe : rien ne remontera tant qu'il l'est.`);
      say(
        `${WARN}le secret d'un webhook existant n'est plus réaffichable : révélez-le dans\n` +
          `    le tableau de bord, ou supprimez ce point pour que le script le recrée.`,
      );
    } else if (!write) {
      say(`${ADD}webhook ${hook} — à créer`);
    } else {
      endpoint = await stripe("POST", "/webhook_endpoints", {
        url: hook,
        enabled_events: EVENTS,
        description: "Racontine — abonnement du foyer",
        metadata: { [MARK]: MARK_VALUE },
      });
      secret = endpoint.secret ?? null;
      say(`${ADD}webhook créé : ${endpoint.id}`);
    }
  } else {
    say(
      `${WARN}pas de --url : le webhook n'est ni vérifié ni créé.\n` +
        `    Sans lui, un paiement est encore rattrapé au retour du client, mais une\n` +
        `    résiliation, un impayé ou un renouvellement ne remonteront JAMAIS.`,
    );
  }

  /* 4. Le portail client --------------------------------------------------- */
  try {
    const confs = await stripe("GET", "/billing_portal/configurations?limit=10");
    const active = (confs.data ?? []).find((c) => c.active);
    if (active) say(`${OK} portail client actif (${active.id})`);
    else
      say(
        `${WARN}aucune configuration de portail client active. C'est LUI qui porte la carte,\n` +
          `    les factures et la RÉSILIATION : activez-le dans Stripe > Portail client.`,
      );
  } catch (err) {
    say(`${WARN}portail client non vérifié : ${err.message}`);
  }

  /* 5. Ce qu'il reste à coller --------------------------------------------- */
  if (!write)
    say(
      `\n(${args.check ? "--check" : "--dry-run"} : rien n'a été écrit dans votre compte Stripe.)`,
    );

  if (price?.id || secret) {
    say("\n-- à coller dans .env ---------------------------------------------");
    say(`STRIPE_SECRET_KEY=${key.slice(0, 11)}...   # celle que vous venez d'utiliser`);
    if (price?.id) say(`STRIPE_PRICE_ID=${price.id}`);
    if (secret) say(`STRIPE_WEBHOOK_SECRET=${secret}`);
    else if (args.url) say(`STRIPE_WEBHOOK_SECRET=whsec_...   # à révéler dans le tableau de bord`);
    say("--------------------------------------------------------------------");
    say(
      "\nRappel : sans ces variables, l'instance n'a AUCUN péage — Racontine y reste\n" +
        "gratuit et sans limite. C'est le cas par défaut, et celui de tout homelab.",
    );
  }
}

main().catch((err) => {
  console.error(`\n[échec] ${err.message}`);
  process.exit(1);
});
