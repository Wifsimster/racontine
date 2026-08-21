# Racontine

> Votre carnet de liaison, dématérialisé sans rien demander à la nounou.

Photographiez le carnet papier de la nounou / MAM / crèche → un LLM vision lit, structure et tague la journée (repas, siestes, humeur, activités, anecdotes) → un journal privé, hébergé chez vous, partagé avec les proches que vous choisissez.

📄 Voir [PLAN-PRODUIT.md](./PLAN-PRODUIT.md) pour le plan produit et le phasage complet.

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

Premier lancement : ouvrir `http://localhost:5173`, créer le compte parent
(puis le co-parent), et fermer les inscriptions.

> En production, l'inscription est **fermée par défaut** : une instance dont on
> aurait oublié `SIGNUP_ENABLED` ne doit pas laisser un passant se créer un
> compte sur le homelab de quelqu'un d'autre. Le **premier** compte est toujours
> accepté — une instance sans aucun utilisateur ne peut pas s'amorcer autrement,
> et ce premier compte est justement celui du propriétaire. Pour ouvrir
> l'inscription au co-parent, l'écran Réglages la rouvre à chaud.

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
derrière votre reverse proxy en HTTPS. nginx pose les en-têtes de sécurité
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
