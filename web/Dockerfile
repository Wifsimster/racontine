FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.5.0 --activate
COPY package.json pnpm-lock.yaml* ./
# --config.dangerouslyAllowAllBuilds : le contexte de build par paquet n'a pas
# le lockfile du monorepo, donc pnpm bloque les scripts d'installation (esbuild)
# sauf approbation explicite.
RUN pnpm install --no-frozen-lockfile --config.dangerouslyAllowAllBuilds=true
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
