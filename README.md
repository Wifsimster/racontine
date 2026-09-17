# Racontine

> Votre carnet de liaison, dématérialisé sans rien demander à la nounou.

Photographiez le carnet papier de la nounou / MAM / crèche → un LLM vision lit, structure et tague la journée (repas, siestes, humeur, activités, anecdotes) → un journal privé, hébergé chez vous, partagé avec les proches que vous choisissez.

📄 Voir [PLAN-PRODUIT.md](./PLAN-PRODUIT.md) pour le plan produit et le phasage complet, et [docs/identite.md](./docs/identite.md) pour la marque, les couleurs et les surfaces qui sortent de l'app (e-mail, carte de lien, notifications).
💶 Voir [docs/tarif.md](./docs/tarif.md) pour l'offre, son prix et ce qui reste gratuit pour toujours.
🧱 Voir [docs/SOLID.md](./docs/SOLID.md) pour l'architecture du serveur (domaine,
ports, adaptateurs) et la note SOLID du dépôt, barème compris.

## Stack

- **Front** : Vite + React + TypeScript + shadcn/ui + Tailwind (PWA)
- **Back** : Fastify + TypeScript
- **BDD** : PostgreSQL
- **Auth** : Better Auth (mot de passe pour le foyer, magic links pour les proches)
- **Extraction** : API Claude (vision) — option VLM local à terme

## Développement

```bash
# 1. Postgres
docker compose up -d db

# 2. Env
cp .env.example .env   # renseigner BETTER_AUTH_SECRET (la clé Anthropic se règle par utilisateur dans l'app)

# 3. Install & migrations
pnpm install
pnpm --filter server db:migrate   # crée les tables (idempotent)

# 4. Run
pnpm dev               # server sur :3010, web sur :5173
```

> Les icônes, la favicon, la pastille de notification et la carte de lien ne
> s'éditent jamais à la main : elles se regénèrent depuis la marque vectorielle
> avec `pnpm brand`. Voir
> [docs/identite.md](./docs/identite.md).

Premier lancement : ouvrir `http://localhost:5173`, créer le compte parent
(puis le co-parent), et fermer les inscriptions.

> En production, l'inscription est **fermée par défaut** : une instance dont on
> aurait oublié `SIGNUP_ENABLED` ne doit pas laisser un passant se créer un
> compte sur le homelab de quelqu'un d'autre. Le **premier** compte est toujours
> accepté — une instance sans aucun utilisateur ne peut pas s'amorcer autrement,
> et ce premier compte est justement celui du propriétaire. Pour ouvrir
> l'inscription au co-parent, l'écran Réglages la rouvre à chaud.

## Parcourir le journal

Un carnet d'un an, c'est ~250 journées. Mesuré sur mobile (390 × 844) : une
carte de journée fait **488 px**, soit 1,7 par écran — une page de 20 journées
représente **12,6 écrans** de défilement. Quatre commandes rendent le fil
navigable sans le raccourcir :

| Commande | Où | Ce que ça change |
|---|---|---|
| **Le carnet** | pastilles sous le titre (à partir de 2 enfants) | Le fil ne mêle plus deux enfants ; le choix est mémorisé |
| **Parcourir** | bascule à droite | Une journée = une ligne de **74 px** : **11,4 par écran** au lieu de 1,7 |
| **Le mois** | le bandeau de mois, devenu bouton | La table des matières du carnet (`GET /api/entries/months`) : un tap pour sauter à mars |
| **La suite** | automatique | La page suivante arrive 600 px avant le bas ; le bouton reste comme filet |

Deux comportements complètent l'ensemble : on **revient où l'on était** en
sortant d'une journée (fil déjà chargé conservé en mémoire + `ScrollRestoration`),
et le bouton **« Photographier le carnet » s'efface au défilement descendant**
— il occupait en permanence 12 % de l'écran, posés sur la journée suivante.

Côté serveur, le fil se pagine **par curseur** et non plus par décalage :
`GET /api/entries?cursor=<id de la dernière journée reçue>`, avec `from=AAAA-MM-JJ`
pour le saut de mois et `childId` pour le filtre. Publier une journée pendant
qu'un proche lit ne décale donc plus sa page — c'est Postgres qui compare le
triplet de tri `(date, created_at, id)`, aucun horodatage ne transitant par le
réseau (voir `server/src/domain/feed-window.ts`).

## Administration (administrateur d'un carnet)

L'écran **Administration** (visible de qui administre au moins un enfant)
rassemble ce que « Partager » ne montre qu'un carnet à la fois :

- **les carnets administrés** — proches, journées publiées, brouillons à
  relire, lectures en échec, date de la dernière publication, et le seul
  endroit d'où **effacer un carnet** (voir « Vos données », plus bas) ;
- **les proches, une carte par personne** — tous leurs rôles, carnet par
  carnet, changeables sur place ;
- **les invitations en attente**, tous carnets confondus, révocables.

Le périmètre est TOUJOURS celui de l'appelant : `GET /api/admin/console` ne
renvoie que les enfants dont il est `admin`, et rien de l'instance. Sur une
instance qui abrite deux foyers, l'un n'y apprend rien de l'autre. Les gestes
(changer un rôle, retirer un proche, révoquer une invitation) passent par les
routes du partage, déjà gardées enfant par enfant, et le refus de retirer le
**dernier administrateur** d'un carnet y est signalé avant le clic plutôt
qu'après. Seul l'**effacement d'un carnet** ouvre un chemin d'écriture propre à
cet écran : il est gardé par le rôle `admin` **sur ce carnet-là**, et confirmé
en recopiant le prénom de l'enfant.

> À ne pas confondre avec les **Réglages**, réservés au *propriétaire* de
> l'instance (ci-dessous) : un co-parent nommé administrateur gère les cercles
> sans jamais toucher au nom de l'instance, aux inscriptions ni au modèle VLM.

## Réglages (propriétaire)

Le **propriétaire** de l'instance — le premier compte créé — dispose d'un écran
**Réglages** (icône ⚙️ dans l'en-tête, visible de lui seul) pour piloter
l'application à chaud, sans redéploiement :

| Réglage | Effet |
|---|---|
| **Nom de l'instance** | En-tête et écran de connexion |
| **Inscriptions ouvertes** | Autorise la création de comptes email/mot de passe (les proches invités par lien restent toujours acceptés) |
| **Validité des invitations** | Durée avant expiration d'un lien d'invitation |
| **E-mails de notification** | Interrupteur global des e-mails aux abonnés |
| **Modèle d'extraction (VLM)** | Modèle Claude vision utilisé pour lire les carnets |
| **Clé API d'extraction (Anthropic)** | Par utilisateur : chacun enregistre sa propre clé (facturée sur son compte), stockée chiffrée |

Ces réglages sont stockés en base (table `app_settings`, ligne unique) et
priment sur les variables d'environnement correspondantes. Une valeur laissée
vide retombe sur le défaut d'environnement (`SIGNUP_ENABLED`, `INVITATION_TTL_DAYS`,
`VLM_MODEL`…). Les secrets d'infrastructure (SMTP, webhook) restent pilotés par
l'environnement ; l'écran en affiche l'état en lecture seule. La **clé API
Anthropic** est en revanche propre à chaque utilisateur (Réglages > Clé API
d'extraction) : elle est chiffrée en base (AES-256-GCM via `BETTER_AUTH_SECRET`)
et jamais réaffichée. Sans clé enregistrée, l'import de carnets est refusé.

## Abonnement (offre hébergée)

> **Une seule offre : Racontine Famille — 4,99 €/mois**, pour tout le foyer,
> après **14 jours d'essai gratuit sans carte bancaire**.
> Détail et justification du prix : [docs/tarif.md](./docs/tarif.md).

**Sur une instance auto-hébergée, il n'y a pas de péage du tout.** Le paywall
n'existe que si `STRIPE_SECRET_KEY` **et** `STRIPE_PRICE_ID` sont renseignés :
sans eux, Racontine est gratuit et sans limite, et pas une ligne d'abonnement
n'est écrite en base. L'abonnement paie l'offre **hébergée par le studio**, pas
le droit d'utiliser son propre serveur.

Quand il est armé, il ne ferme qu'une seule chose :

| | |
|---|---|
| **Payant** | **Ajouter une journée** — photographier une page, la faire lire, créer une journée via MCP (HTTP 402 sinon) |
| **Gratuit, pour toujours** | **Lire** le journal, le chercher, le partager ; les proches invités, sans limite ; les notifications ; publier un brouillon déjà commencé |

On ne prend jamais les souvenirs en otage : un abonnement qui s'arrête met le
carnet **en pause**, il ne le referme pas. Un prélèvement en échec ne coupe rien
non plus (Stripe relance pendant deux à trois semaines, l'app le signale), et
une période déjà payée reste due jusqu'à son terme.

L'abonnement appartient au **foyer** et se règle depuis le compte du
propriétaire. Le co-parent contribue, les grands-parents lisent : on ne leur
demande jamais de carte.

### Armer la caisse en une commande

Le produit, le prix et le point de webhook se créent **dans votre compte
Stripe** — et se ratent facilement à la main (un prix ponctuel au lieu de
récurrent, un webhook abonné à trois événements sur sept). Le script les crée
dans le bon ordre et rend les lignes à coller :

```bash
# ce qui existe déjà, sans rien écrire
STRIPE_SECRET_KEY=sk_test_... pnpm stripe:check --url https://racontine.exemple.fr

# créer ce qui manque (idempotent : relançable sans fabriquer de doublon)
STRIPE_SECRET_KEY=sk_test_... pnpm stripe:setup --url https://racontine.exemple.fr
```

Il refuse une clé `sk_live_` sans `--live` — on déroule d'abord le parcours en
mode test. `--amount 3900 --interval year` provisionne une offre annuelle à la
place. Puis, dans `.env` :

```bash
# .env (instance hébergée uniquement)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...          # un prix récurrent : 4,99 €/mois
STRIPE_WEBHOOK_SECRET=whsec_...    # endpoint POST /api/billing/webhook
```

Le **montant affiché est lu chez Stripe**, jamais recopié dans le code : changer
le prix (ou passer à un tarif annuel) se fait dans le tableau de bord, sans
redéploiement. Aucune donnée bancaire ne traverse Racontine — la page de
paiement et le portail (carte, factures, **résiliation**) sont hébergés par
Stripe.

## Partage avec les proches

Chaque enfant a son propre cercle. Le parent qui crée l'enfant en devient
**administrateur**. Depuis l'écran **Partager** (icône 👥 dans l'en-tête), il
invite des proches par email en choisissant un rôle :

| Rôle | Droits |
|---|---|
| **Administrateur** | Tout, y compris inviter / retirer des proches |
| **Contributeur** | Photographier, relire et publier les journées |
| **Lecteur** | Consulter uniquement le journal **publié** |

L'invitation génère un lien (`/invite/<token>`, valable `INVITATION_TTL_DAYS`
jours). L'admin peut le copier pour l'envoyer lui-même, ou le laisser partir par
e-mail.

> **En production, un canal de livraison est requis.** Les liens de connexion
> (magic link), de **réinitialisation de mot de passe** et d'invitation sont des
> **identifiants** : qui tient le lien tient le compte. Ils ne sont donc jamais écrits dans les logs quand
> `NODE_ENV=production` — il faut `SMTP_HOST` ou `NOTIFY_WEBHOOK_URL`, sans quoi
> le serveur journalise une erreur explicite au lieu de livrer. Le lien
> d'invitation reste copiable depuis l'écran Partage ; le magic link et le lien
> de réinitialisation, eux, n'ont pas d'autre chemin. En développement, le lien s'affiche dans la console. Le proche ouvre le lien, se connecte **sans mot de passe** (magic
link) et rejoint le cercle — même quand `SIGNUP_ENABLED=false`. La visibilité et
les droits sont vérifiés côté serveur, par enfant, sur chaque route.

## Vos données : les emporter, les effacer

Racontine garde le quotidien d'un enfant, des photos de son carnet et le nom de
ses proches. Trois gestes, accessibles depuis l'application, permettent de tout
reprendre ou de tout faire disparaître.

**Emporter** — « Mon compte » → *Télécharger mes données*. Un fichier JSON
(`racontine-export-AAAA-MM-JJ.json`) portant vos carnets, **toutes les journées
que vous pouvez lire**, leurs moments, vos corrections, vos abonnements et vos
notifications, plus l'adresse de chaque photo (`/api/attachments/…`, à ouvrir
avec la même session). Deux règles le composent :

- il ne montre **jamais plus que l'écran** — un lecteur y retrouve le journal
  publié, pas les brouillons que l'application lui cache ;
- il ne contient **aucun secret** : ni mot de passe, ni jeton de session, ni
  hash de jeton MCP, ni clé API. Ce sont des clés, pas des souvenirs — un export
  qui les rendrait ouvrirait le compte à quiconque trouve le fichier.

**Effacer un carnet** — console d'**Administration**, sur la carte de l'enfant.
Réservé aux administrateurs de ce carnet, et confirmé en recopiant le prénom de
l'enfant. Journées, moments, photos (fichiers compris), cercle, invitations et
glossaire disparaissent. Sans corbeille.

**Effacer son compte** — « Mon compte » → *Effacer mon compte*. L'écran montre
**d'abord** ce que cela emporterait : les carnets dont vous êtes le seul membre
partent avec vous, ceux que d'autres suivent leur restent. La confirmation est
**votre adresse e-mail**, recopiée.

Trois situations retiennent un compte, et chacune dit quoi faire (HTTP 409) :

| Ce qui bloque | Pourquoi | La sortie |
|---|---|---|
| Un abonnement Stripe encaisse encore | La carte continuerait d'être débitée pour une instance vidée | Résilier depuis le portail client |
| Vous êtes propriétaire **et** d'autres comptes existent | Le propriétaire est le **compte le plus ancien** : votre départ transmettrait l'instance — réglages, inscriptions, caisse — au suivant, en silence | Retirer les autres comptes d'abord |
| Vous êtes le **seul administrateur** d'un carnet que d'autres suivent | Un carnet sans administrateur ne peut plus être partagé, ni révoqué, ni effacé | Nommer un autre administrateur, ou effacer le carnet |

> **Les fichiers partent avant les lignes**, et c'est délibéré. Une panne entre
> les deux laisse des journées dont les photos manquent — visible, et qu'un
> second clic achève. Dans l'autre sens, elle laisserait sur le disque les
> photos du carnet d'un enfant sans plus aucune ligne pour les désigner :
> introuvables depuis l'application, et pourtant bien là.

Les règles vivent dans `server/src/domain/erasure.ts` (fonctions pures,
vérifiées sans base) ; les cascades du schéma font le reste, et sont exercées
contre un vrai Postgres par `pnpm --filter server test:privacy` et
`pnpm --filter server test:privacy:http`.

## Se connecter, et récupérer un mot de passe

L'écran de connexion porte **deux chemins**, pour deux publics, et ils ne se
confondent pas :

- **mot de passe** — le foyer. Oublié ? « Mot de passe oublié ? » sous le champ
  envoie un lien de **réinitialisation** (`/reset-password`, valable **1 heure**,
  à usage unique) qui mène au choix d'un nouveau mot de passe. Toutes les
  sessions ouvertes sont fermées au passage : un mot de passe qu'on réinitialise
  est un mot de passe dont on a pu perdre le contrôle.
- **lien par e-mail** (magic link) — les proches invités, qui n'ont pas de mot de
  passe et n'en auront jamais. Ce lien **connecte**, il ne change rien.

Le serveur répond « c'est parti » même pour une adresse inconnue : l'écran de
connexion ne dit jamais qui a un compte sur l'instance. En production, Better
Auth limite la demande de réinitialisation à **3 par minute** et l'envoi d'un
magic link à **3 par 10 secondes**, par adresse IP (d'où l'importance de
`TRUSTED_PROXIES`, plus bas).

## Connexion MCP (sessions Claude)

Racontine expose un **serveur MCP** (Model Context Protocol) permettant de
connecter une session **Claude** (cloud, Desktop ou Claude Code) à votre
instance pour **téléverser des photos de carnet** sans passer par l'app.

Depuis l'écran **Réglages** (⚙️), section **Connexion MCP**, créez un **jeton**
(affiché une seule fois) puis ajoutez le serveur à Claude :

- **Adresse** : `<votre-instance>/api/mcp` (transport *HTTP*)
- **Authentification** : en-tête `Authorization: Bearer <jeton>`

Le jeton porte les droits de l'utilisateur qui l'a créé (mêmes rôles par
enfant). Seul le hash SHA-256 est stocké ; un jeton peut être révoqué à tout
moment. Outils exposés :

| Outil | Rôle |
|---|---|
| `list_children` | Liste les enfants auxquels le compte peut contribuer (récupère le `childId`) |
| `upload_daily_note` | Téléverse une ou plusieurs pages d'une journée (`images` en base64 **ou** `imageIds` pré-téléversées) → crée un brouillon lu par le VLM, à relire puis publier |
| `create_daily_note` | Crée une journée à partir d'un contenu **déjà transcrit** (texte + listes structurées), sans photo ni VLM — aucune clé API requise. Brouillon par défaut, ou `publish: true` pour publier directement |
| `list_daily_notes` | Liste les journées récentes d'un enfant (récupère leur `id`) — un lecteur ne voit que le publié |
| `get_daily_note` | Détail complet d'une journée : récit, temps fort, repas, siestes, activités, anecdotes, santé, transcription |

Comme via l'app, plusieurs pages d'une même journée (même enfant / date / lieu)
sont fusionnées, et la lecture VLM tourne en arrière-plan : la journée apparaît
en **brouillon** à relire puis publier.

#### Pages volumineuses : pré-téléverser les octets bruts

Une photo réelle pèse plusieurs Mo ; encodée en base64 pour l'argument `images`,
elle représente des centaines de milliers de caractères — trop pour transiter
par le contexte du modèle. Un client capable d'exécuter un shell contourne la
limite en téléversant les **octets bruts** en une requête, puis en passant le
seul identifiant renvoyé à l'outil :

```bash
# 1. Téléverser le fichier brut (aucun base64) → renvoie un uploadId court
curl -sS -X POST "<votre-instance>/api/mcp/uploads" \
  -H "Authorization: Bearer <jeton>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @page.jpg
# → {"uploadId":"…","byteSize":1234567,"expiresAt":"…"}
```

Appelez ensuite `upload_daily_note` avec `imageIds: ["<uploadId>"]` (au lieu de
`images`). Les uploads sont propres au porteur du jeton, plafonnés à 20 Mo par
page, et expirent au bout de 30 min s'ils ne sont pas rattachés à une journée.

### Base de données

Schéma géré par **Drizzle**. Après modification de `server/src/db/schema.ts` :

```bash
pnpm --filter server db:generate   # génère la migration SQL dans server/drizzle/
pnpm --filter server db:migrate    # l'applique
```

## Versioning (semantic-release)

Le versionnement est **automatique**. À chaque merge sur `main`,
`.github/workflows/release.yml` analyse les messages de commit
[conventionnels](https://www.conventionalcommits.org/) et calcule la prochaine
version (SemVer) :

| Préfixe de commit | Effet sur la version |
|---|---|
| `fix:` | patch (`0.1.0` → `0.1.1`) |
| `feat:` | mineure (`0.1.0` → `0.2.0`) |
| `feat!:` / `BREAKING CHANGE:` | majeure (`0.1.0` → `1.0.0`) |
| `chore:`, `ci:`, `docs:`, `refactor:`… | aucun release |

La release met à jour les `package.json` du monorepo + `CHANGELOG.md`, taggue le
dépôt et publie une release GitHub. La version courante est affichée en bas de
l'application (injectée au build Vite depuis `web/package.json`).

## Déploiement (homelab, images GHCR)

Les images sont construites et publiées sur **GHCR** par GitHub Actions
(`.github/workflows/docker.yml`) à chaque push sur `main` :
`ghcr.io/wifsimster/racontine-server` et `…-web`. Le homelab ne build rien,
il tire les images.

```bash
cp .env.example .env         # POSTGRES_PASSWORD, BETTER_AUTH_SECRET, BETTER_AUTH_URL, CORS_ORIGINS (clé Anthropic : par utilisateur, dans l'app)
docker login ghcr.io         # PAT read:packages si les packages sont privés
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Les migrations s'appliquent automatiquement au démarrage du serveur. Le front
est servi sur `:8080` (nginx proxie `/api/` vers le serveur) — à placer
derrière votre reverse proxy en HTTPS.

**Ce que les images garantissent.** Elles se construisent depuis la racine du
dépôt et installent avec `--frozen-lockfile` : l'image publiée porte donc
exactement les versions que `pnpm test` a vues (avec un contexte par paquet, le
lockfile du monorepo était hors de portée et chaque build refaisait sa propre
résolution). Chacune porte un `HEALTHCHECK`, si bien que `docker compose ps`
dit si le service **répond**, et plus seulement s'il tourne. Et le processus
Node tourne **sans privilèges** (utilisateur `node`) : c'est lui qui décode des
photos fournies par des tiers invités (sharp/libheif), et ce qu'une faille de
décodeur permet d'atteindre n'est pas la même chose selon qu'on est root ou
non. Le conteneur démarre root juste le temps de reprendre `uploads/` — une
seule fois, automatiquement, sans geste de votre part sur une instance
existante. nginx pose les en-têtes de sécurité
(CSP, HSTS, `nosniff`, `frame-ancestors 'none'`) et le cache : un an sur les
fichiers versionnés par empreinte, jamais sur `index.html` ni `sw.js`.

**Adresse réelle des visiteurs.** Le serveur ne croit `X-Forwarded-For` que
s'il vient d'un relais listé dans `TRUSTED_PROXIES` (défaut : boucle locale et
plages privées, ce qui couvre nginx et un reverse proxy de homelab). C'est ce
qui permet de limiter le débit **par visiteur** : sans cette liste, toutes les
requêtes tombent dans un seau unique, et trois tentatives de connexion ratées
par un inconnu bloquent la connexion de toute la famille pendant dix secondes.
Si vous exposez l'API directement, resserrez la liste — un client peut sinon
se fabriquer l'adresse de son choix. Mise à jour : `docker compose -f
docker-compose.prod.yml pull && … up -d`.

## Sauvegarde et restauration

Le carnet d'un enfant tient dans **deux** endroits, et il faut les deux : la
**base** (journées, récits, cercle) et les **photos** (`uploads/`). Sauvegarder
l'une sans l'autre, c'est ne rien sauvegarder — la base seule décrit des
journées dont les pages ont disparu, les photos seules sont un dossier de JPEG
sans date et sans nom.

```bash
./scripts/backup.sh                       # → ./backups/AAAA-MM-JJ-HHMMSS/
./scripts/backup.sh -o /mnt/nas/racontine # ailleurs que sur le disque sauvegardé
./scripts/backup.sh -k 30                 # garder 30 jours (défaut : 14)
```

Chaque sauvegarde contient `base.dump` (format `custom`, restaurable table par
table), `uploads.tar.gz` et un `manifeste.txt` qui dit **de quelle version elle
vient** — utile le jour où l'on restaure.

> **Une sauvegarde non vérifiée n'est pas une sauvegarde.** Le script relit
> toujours ce qu'il vient d'écrire (`pg_restore --list`, `tar -t`) et **efface
> l'archive** plutôt que de laisser croire qu'elle existe. Le moment de
> découvrir qu'un dump est illisible, c'est maintenant.

**En cron, sur le homelab** — tous les jours à 3h15 :

```
15 3 * * * cd /opt/docker/racontine && ./scripts/backup.sh -o /mnt/nas/racontine >> /var/log/racontine-backup.log 2>&1
```

Le `-o` vers un montage distant n'est pas cosmétique : une sauvegarde qui dort
sur le disque qu'elle sauvegarde ne survit pas à ce disque.

**Restaurer :**

```bash
./scripts/restore.sh ./backups/2026-09-17-031500
docker compose -f docker-compose.prod.yml up -d server   # réapplique les migrations
```

La restauration **détruit** ce qu'elle remplace : elle demande de taper
« restaurer », et met les photos existantes de côté (`uploads.avant-
restauration-…`) avant de dérouler l'archive. Une sauvegarde plus ANCIENNE que
le code se remet à niveau toute seule au redémarrage (les migrations
s'appliquent au démarrage) ; une sauvegarde plus RÉCENTE que l'image déployée
demande de remettre d'abord la version notée dans le manifeste.

> **Pourquoi ça presse.** Les migrations s'appliquent **au démarrage du
> serveur**, donc à chaque déploiement, donc à chaque merge sur `main`. Une
> migration qui se passe mal sur une base non sauvegardée, c'est le journal de
> l'enfance de quelqu'un, perdu — il n'y a pas de corbeille.

Essayez la restauration **une fois**, sur une base jetable, avant d'en avoir
besoin pour de vrai. C'est la seule façon de savoir que la sauvegarde marche.

## Éditeur

Racontine est conçu, développé et hébergé par
**[BATTISTELLA](https://pro.battistella.ovh/)** — studio indépendant
(micro-entreprise, Artigues-près-Bordeaux), qui exploite ses propres
applications web, SaaS et outils d'IA auto-hébergés en France.

[Mentions légales](https://pro.battistella.ovh/mentions-legales) ·
[Conditions de vente](https://pro.battistella.ovh/cgv) ·
[Résiliation & remboursement](https://pro.battistella.ovh/remboursement) ·
[Confidentialité](https://pro.battistella.ovh/confidentialite)
