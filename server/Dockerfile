FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.5.0 --activate
COPY package.json pnpm-lock.yaml* ./
# --config.dangerouslyAllowAllBuilds : le contexte de build par paquet n'a pas
# le lockfile du monorepo, donc pnpm refait un résolveur « propre » et bloque les
# scripts d'installation (esbuild) sauf approbation explicite.
RUN pnpm install --no-frozen-lockfile --config.dangerouslyAllowAllBuilds=true
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.5.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --no-frozen-lockfile --config.dangerouslyAllowAllBuilds=true
COPY --from=build /app/dist ./dist
# SQL de migration + entrypoint (migrations appliquées au démarrage).
COPY drizzle ./drizzle
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3010
ENTRYPOINT ["./docker-entrypoint.sh"]
