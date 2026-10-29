FROM node:26-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.5.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
RUN pnpm install --frozen-lockfile --filter @racontine/server

COPY server ./server
RUN pnpm --filter @racontine/server build

RUN pnpm --filter @racontine/server deploy --prod --legacy /out

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache su-exec

COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/package.json ./package.json
COPY server/drizzle ./drizzle
COPY server/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/uploads

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3010/api/health >/dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
