FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --no-frozen-lockfile
COPY --from=build /app/dist ./dist
# SQL de migration + entrypoint (migrations appliquées au démarrage).
COPY drizzle ./drizzle
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3010
ENTRYPOINT ["./docker-entrypoint.sh"]
