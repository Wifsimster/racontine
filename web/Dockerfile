# ===========================================================================
#  L'IMAGE DU FRONT — construite depuis la RACINE du dépôt.
#
#  Même raison que pour le serveur : le lockfile du monorepo est à la racine,
#  donc un contexte limité à `web/` ne pouvait pas le voir, et pnpm refaisait
#  une résolution libre à chaque build. `--frozen-lockfile` garantit désormais
#  que l'image servie est bâtie sur les versions que `pnpm test` a vues.
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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile --filter @racontine/web

COPY web ./web
RUN pnpm --filter @racontine/web build

FROM nginx:alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80

# Le front est un serveur de fichiers : s'il rend `index.html`, il fait son
# travail. On sonde donc la page elle-même, et pas un point de santé inventé
# pour l'occasion — ce qu'on veut savoir, c'est ce que le visiteur obtiendrait.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/index.html >/dev/null || exit 1
