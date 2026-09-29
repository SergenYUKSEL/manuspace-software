# Service web : front React compilé, servi par Caddy. Contexte de build : racine du monorepo.
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
# URL publique du serveur collab, intégrée au bundle (import.meta.env.VITE_COLLAB_URL).
ARG VITE_COLLAB_URL
RUN bun run --filter '@manuspace/web' build

FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
