# Le tarif, et pourquoi celui-là

> Une seule offre. **Racontine Famille — 4,99 €/mois**, pour tout le foyer,
> après **14 jours d'essai gratuit sans carte bancaire**.

Ce document dit ce qui est payant, ce qui ne l'est jamais, à quel prix, pourquoi
ce prix, et comment armer la caisse sur une instance hébergée. Il est court
exprès : une grille tarifaire qui demande deux pages d'explications est une
grille tarifaire à refaire.

---

## 1. Ce qui est payant, et ce qui ne le sera jamais

| | |
|---|---|
| **Payant** | **Ajouter une journée** au carnet : photographier une page, la faire lire, créer une journée depuis un client MCP. |
| **Gratuit, pour toujours** | **Lire** le journal, le chercher, le partager. Les proches invités, quel que soit leur nombre. Les notifications. La relecture et la publication d'un brouillon déjà commencé. |

La règle tient en une phrase, et elle est écrite en tête de
[`server/src/domain/paywall.ts`](../server/src/domain/paywall.ts) :

> **On ne prend jamais les souvenirs en otage.**

Un abonnement qui s'arrête met le carnet **en pause** ; il ne le referme pas.
Trois ans de journées restent lisibles et partagées, un an après la dernière
facture. C'est une position commerciale autant qu'une position morale : le jour
où une famille reviendra — un deuxième enfant, une nouvelle nounou — elle
retrouvera son journal intact, et c'est la meilleure raison de se réabonner.

Deux conséquences concrètes, souvent oubliées ailleurs :

- **un prélèvement en échec ne coupe rien.** Stripe relance une carte refusée
  pendant deux à trois semaines ; pendant ce temps le carnet reste ouvert et une
  bande ambre le signale. Couper au premier échec punirait une carte expirée
  pendant les vacances, pas un fraudeur ;
- **une période déjà payée reste due.** Une résiliation prend effet au terme de
  la période, jamais à l'instant du clic.

## 2. Un seul payeur : le foyer

L'abonnement appartient à l'**instance**, et se règle depuis le compte qui l'a
ouverte (le propriétaire, celui qui tient déjà l'écran Réglages). Le co-parent
contribue, les grands-parents lisent : **on ne leur demande jamais de carte**.

C'est la seule architecture qui tienne pour ce produit. Un modèle « par siège »
ferait payer mamie pour voir sa petite-fille — c'est-à-dire ferait fuir
exactement la personne dont la présence fait la valeur du carnet.

## 3. Pourquoi 4,99 €/mois

1. **C'est le prix que les parents disent accepter.** L'hypothèse H4 du
   [plan produit](../PLAN-PRODUIT.md) vise « ≥ 30 % à 3-5 €/mois » : 4,99 € est
   le haut de la fourchette validée, pas un pari au-dessus d'elle.
2. **C'est le prix de la famille chez le studio.** [Toko](https://toko.battistella.ovh/),
   l'autre produit BATTISTELLA destiné aux parents, est à 4,99 €/mois. Deux
   produits du même studio, pour le même foyer, à deux prix différents, seraient
   une incohérence que le client verrait avant nous.
3. **C'est sous le seuil d'arbitrage.** À 5 €, un abonnement familial se compare
   à un café par semaine ; à 9,99 € (Qeepsake) il se compare à Netflix, et il
   perd. Tinybeans tient 6 à 8 $ avec une équipe et de la publicité — ni l'un ni
   l'autre ne nous concerne.
4. **La marge est déjà là.** La lecture des carnets est facturée sur la clé API
   de chaque utilisateur : le coût marginal d'un foyer se limite à
   l'hébergement. Le prix ne couvre pas un coût, il fixe une valeur — et c'est
   pour ça qu'il n'a pas besoin d'être plus haut.

**Une seule offre, un seul bouton.** Pas de Basic/Pro/Famille+ : un carnet de
nounou n'a pas de plan Entreprise, et une famille qui compare trois colonnes à
22 h ne s'abonne pas, elle remet à plus tard.

**Essai de 14 jours, sans carte.** Deux semaines, c'est la durée du test qui
compte vraiment (H2 : le geste photo tient-il dans la durée ?). Demander une
carte pour photographier une page de carnet coûterait plus d'inscriptions que
l'essai n'en convertit.

> **Passer à l'annuel** ne demande aucun code : créez un second prix dans Stripe
> (par exemple 39 €/an, deux mois offerts) et remplacez `STRIPE_PRICE_ID`. Le
> montant, la période et le libellé affichés dans l'app sont **lus chez Stripe**.

**L'offre est le premier écran.** Sans session, ouvrir Racontine montre le
tarif, l'essai et ce que l'abonnement comprend ; la connexion est un lien sous
le bouton, pas le péage de l'accueil. On ne demande pas un mot de passe à
quelqu'un à qui l'on n'a encore rien proposé, et on n'enferme pas le prix
derrière un compte. Cet écran ne lit qu'une route publique et sans session —
`GET /api/billing/offer` : le péage est-il armé, le prix tel que Stripe le
donne, la durée de l'essai. Rien d'un foyer n'y passe. Sur une instance
auto-hébergée, où il n'y a pas de caisse, cet écran n'existe pas : la connexion
reste la porte, comme avant.

## 4. Armer la caisse sur une instance hébergée

```bash
# .env — le péage n'existe QUE si ces deux variables sont renseignées.
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...          # un prix récurrent, 4,99 €/mois
STRIPE_WEBHOOK_SECRET=whsec_...    # endpoint /api/billing/webhook
```

Ces trois objets se créent **dans votre compte Stripe**. Plutôt qu'à la main :

```bash
# dit ce qui existe et ce qui manque, sans rien écrire
STRIPE_SECRET_KEY=sk_test_... pnpm stripe:check --url https://racontine.exemple.fr

# crée ce qui manque, et rend les lignes à coller dans .env
STRIPE_SECRET_KEY=sk_test_... pnpm stripe:setup --url https://racontine.exemple.fr
```

Le script ([`scripts/stripe-setup.mjs`](../scripts/stripe-setup.mjs)) est
**idempotent** : il reconnaît ce qu'il a déjà créé (métadonnée `racontine`) et
ne fabrique jamais un second prix actif sur le même produit — c'est le genre de
doublon qui se découvre sur un relevé bancaire. Il crée :

1. un produit **Racontine Famille**, et un prix récurrent mensuel en EUR ;
2. un endpoint de webhook sur `https://<instance>/api/billing/webhook`, abonné
   aux sept événements que le serveur sait traiter — et il **complète** un
   endpoint existant auquel il en manquerait ;
3. il **vérifie** le portail client (carte, factures, résiliation) et le signale
   s'il n'est pas activé : Racontine n'en réécrit aucun écran, donc sans lui il
   n'y a pas de bouton « résilier ».

> **Sur un compte Stripe qui porte plusieurs produits**, renseignez aussi
> `STRIPE_PORTAL_CONFIG_ID` (`bpc_…`). Un compte n'a qu'**une** configuration de
> portail par défaut : sans cet identifiant, la famille qui vient gérer son
> carnet atterrit sur le portail d'un autre produit, titre et réglages de
> résiliation compris. Rien n'échoue et rien n'est journalisé — la session se
> crée très bien, elle est juste habillée par quelqu'un d'autre. Le serveur le
> signale au démarrage dès que le péage est armé.

Le secret de signature n'est affiché **qu'à la création** de l'endpoint : si le
vôtre existe déjà, révélez-le dans le tableau de bord. Une clé `sk_live_` est
refusée sans `--live` : on déroule d'abord le parcours complet en `sk_test_`.
`--amount 3900 --interval year` provisionne une offre annuelle.

Sans `STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID`, l'instance est gratuite et sans
limite : c'est le cas par défaut, et celui de tout homelab. Le serveur le dit au
démarrage plutôt que de le laisser deviner.

> **L'essai part à la première consultation**, pas à la création du compte : une
> instance installée depuis six mois le jour où l'on branche Stripe reçoit ses
> 14 jours comme une neuve, au lieu de se fermer à la seconde même.

## 5. Ce que Racontine ne voit jamais

Aucune donnée bancaire ne traverse l'application : ni numéro de carte, ni
cryptogramme, ni adresse de facturation. La page de paiement et le portail sont
**hébergés par Stripe** ; Racontine ne fabrique que deux liens et conserve trois
identifiants (`cus_…`, `sub_…`, un statut).

## 6. L'éditeur

Racontine est conçu, développé et hébergé par **[BATTISTELLA](https://pro.battistella.ovh/)**,
studio indépendant (micro-entreprise, Artigues-près-Bordeaux), qui exploite ses
propres applications auto-hébergées en France.

- [Conditions de vente](https://pro.battistella.ovh/cgv)
- [Résiliation & remboursement](https://pro.battistella.ovh/remboursement)
- [Politique de confidentialité](https://pro.battistella.ovh/confidentialite)
- [Mentions légales](https://pro.battistella.ovh/mentions-legales)

Ces liens sont affichés **dans l'app, au-dessus du bouton de paiement** (écran
« L'abonnement ») — pas seulement ici.
