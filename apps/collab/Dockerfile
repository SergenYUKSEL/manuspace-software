# Serveur 2 : collaboration temps réel. Contexte de build : racine du monorepo.
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --production --filter '@manuspace/collab'

FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/collab
USER bun
# SIGTERM reçu directement par Bun (pas de shell) : sauvegarde des documents avant arrêt.
CMD ["bun", "src/index.ts"]
