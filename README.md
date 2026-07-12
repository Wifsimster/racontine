# Racontine

> Votre carnet de liaison, dématérialisé sans rien demander à la nounou.

Photographiez le carnet papier de la nounou / MAM / crèche → un LLM vision lit, structure et tague la journée (repas, siestes, humeur, activités, anecdotes) → un journal privé, hébergé chez vous, partagé avec les proches que vous choisissez.

📄 Voir [PLAN-PRODUIT.md](./PLAN-PRODUIT.md) pour le plan produit et le phasage complet.

## Stack

- **Front** : Vite + React + TypeScript + shadcn/ui + Tailwind (PWA)
- **Back** : Fastify + TypeScript
- **BDD** : PostgreSQL
- **Auth** : Better Auth (magic links pour les proches)
- **Extraction** : API Claude (vision) — option VLM local à terme

## Développement

```bash
# 1. Postgres
docker compose up -d db

# 2. Env
cp .env.example .env   # renseigner ANTHROPIC_API_KEY et BETTER_AUTH_SECRET

# 3. Install & migrations
pnpm install
pnpm --filter server db:migrate   # crée les tables (idempotent)

# 4. Run
pnpm dev               # server sur :3010, web sur :5173
```

Premier lancement : ouvrir `http://localhost:5173`, créer le compte parent
(puis le co-parent), et fermer les inscriptions.

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

Ces réglages sont stockés en base (table `app_settings`, ligne unique) et
priment sur les variables d'environnement correspondantes. Une valeur laissée
vide retombe sur le défaut d'environnement (`SIGNUP_ENABLED`, `INVITATION_TTL_DAYS`,
`VLM_MODEL`…). Les secrets d'infrastructure (clé API, SMTP, webhook) restent
pilotés uniquement par l'environnement ; l'écran en affiche l'état en lecture
seule.

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
magic link. Le proche ouvre le lien, se connecte **sans mot de passe** (magic
link) et rejoint le cercle — même quand `SIGNUP_ENABLED=false`. La visibilité et
les droits sont vérifiés côté serveur, par enfant, sur chaque route.

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
| `upload_daily_note` | Téléverse une ou plusieurs pages (base64) d'une journée → crée un brouillon lu par le VLM, à relire puis publier |

Comme via l'app, plusieurs pages d'une même journée (même enfant / date / lieu)
sont fusionnées, et la lecture VLM tourne en arrière-plan : la journée apparaît
en **brouillon** à relire puis publier.

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
cp .env.example .env         # POSTGRES_PASSWORD, BETTER_AUTH_SECRET, ANTHROPIC_API_KEY, BETTER_AUTH_URL, CORS_ORIGINS
docker login ghcr.io         # PAT read:packages si les packages sont privés
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Les migrations s'appliquent automatiquement au démarrage du serveur. Le front
est servi sur `:8080` (nginx proxie `/api/` vers le serveur) — à placer
derrière votre reverse proxy en HTTPS. Mise à jour : `docker compose -f
docker-compose.prod.yml pull && … up -d`.
