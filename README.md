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
(puis le co-parent), et passer `SIGNUP_ENABLED=false` pour fermer les
inscriptions.

### Base de données

Schéma géré par **Drizzle**. Après modification de `server/src/db/schema.ts` :

```bash
pnpm --filter server db:generate   # génère la migration SQL dans server/drizzle/
pnpm --filter server db:migrate    # l'applique
```

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
