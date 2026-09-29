# Serveur 1 : API métier (sans front). Contexte de build : racine du monorepo.
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile

FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
USER bun
CMD ["bun", "src/index.ts"]
