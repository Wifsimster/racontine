# ===========================================================================
#  L'IMAGE DU SERVEUR — construite depuis la RACINE du dépôt.
#
#  Le contexte est la racine, et pas `server/`, pour une raison précise : le
#  lockfile du monorepo est à la racine. Avec un contexte par paquet, le
#  `COPY pnpm-lock.yaml*` ne trouvait rien (le joker masquait l'absence, sans
#  une ligne d'avertissement), pnpm refaisait une résolution « propre », et
#  l'image publiée pouvait donc embarquer des versions que l'intégration
#  continue n'avait jamais testées. `--frozen-lockfile` échoue désormais
#  bruyamment si le lockfile et les manifestes divergent : c'est tout l'intérêt.
# ===========================================================================
FROM node:24-alpine AS build
WORKDIR /app
# pnpm est installé PAR NPM, et non par corepack.
#
# corepack était livré avec Node… jusqu'à ce qu'il ne le soit plus : il a été
# retiré des images à partir de Node 26, et `corepack enable` y meurt sur un
# « /bin/sh: corepack: not found » (code 127). L'ironie est que rien d'autre ne
# bronchait — typecheck, tests et build passaient très bien —, seule la
# construction de l'image cassait. C'est exactement ce que la construction des
# images sur les PR a intercepté, avant la fusion plutôt qu'après.
#
# La version reste épinglée, et elle DOIT rester alignée sur le champ
# `packageManager` de la racine : deux versions de pnpm, ce sont deux
# résolutions possibles du même lockfile.
RUN npm install -g pnpm@11.5.0

# Les manifestes d'abord : tant qu'ils ne changent pas, Docker garde le cache
# des dépendances et ne réinstalle rien.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json ./server/
RUN pnpm install --frozen-lockfile --filter @racontine/server

COPY server ./server
RUN pnpm --filter @racontine/server build

# `pnpm deploy` fabrique un dossier AUTONOME : node_modules réels (et non des
# liens vers le magasin du monorepo, qui ne survivraient pas au changement
# d'étape), dépendances de production seulement.
RUN pnpm --filter @racontine/server deploy --prod --legacy /out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

# `su-exec` sert à l'entrypoint : démarrer root le temps d'ajuster le volume,
# puis rendre la main à un utilisateur ordinaire pour de bon.
RUN apk add --no-cache su-exec

COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/package.json ./package.json
# SQL de migration + entrypoint (migrations appliquées au démarrage).
COPY server/drizzle ./drizzle
COPY server/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/uploads

EXPOSE 3010

# La sonde que le superviseur interroge. `/api/health` est la seule route que
# le limiteur de débit laisse toujours passer — c'est fait pour elle.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3010/api/health >/dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
