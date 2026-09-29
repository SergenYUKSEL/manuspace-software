# Manuspace

Espace cloud pour auteurs : organiser ses romans, écrire ses chapitres, stocker ses ressources et
collaborer en temps réel (co-écriture, correction, appel audio).

## Architecture

```
apps/
  web/      React 19 + Vite, TanStack Router/Query, Tailwind v4 + shadcn/ui.
            En production : servi par Caddy, qui relaie /api vers l'API (Caddyfile).
  api/      Serveur 1 — API métier (Bun + Hono) : auth, 2FA, manuscrits, admin.
packages/
  shared/   Schémas Zod et rôles partagés front / api
  db/       Schéma Drizzle (PostgreSQL) + migrations
infra/      docker-compose de dev (Postgres + stockage S3)
.railway/   Infrastructure Railway en code
```

```
navigateur ──https──▶ web (Caddy : front + proxy /api) ──réseau privé──▶ api ──▶ Postgres
```

- **Front et API séparés, même origine** : le service web relaie `/api` vers l'API par le réseau
  privé. Le navigateur ne voit qu'une origine : cookie de session `SameSite=Lax` sans CORS. Deux
  domaines `*.up.railway.app` distincts seraient des sites différents (liste des suffixes publics)
  et le cookie deviendrait un cookie tiers, bloqué par Safari. En dev, le proxy de Vite joue ce rôle.
- **API privée** : aucun domaine public, le service web est son seul point d'entrée HTTP.

## Prérequis

- [Bun](https://bun.sh) ≥ 1.3
- Docker (Postgres en local)

## Lancer en local

```sh
bun install
cp .env.example .env
bun infra:up          # Postgres (port 5434)
bun db:migrate
bun run --cwd apps/api create-admin moi@exemple.fr "Mon nom"   # premier compte admin
bun dev               # web :5173, api :3000
```

Il n'y a pas d'inscription publique : les comptes suivants sont créés depuis la page Administration.

Ouvrir http://localhost:5173 (Vite redirige `/api` vers l'API).

## Scripts

| Commande | Rôle |
|---|---|
| `bun dev` | Lance le front et l'API en mode watch |
| `bun typecheck` | Vérifie les types de tous les packages |
| `bun lint` / `bun format` | Biome (lint + format) |
| `bun test` | Tests d'intégration (base de test créée et migrée automatiquement, nécessite `bun infra:up`) |
| `bun db:generate` | Génère une migration après modification de `packages/db/src/schema.ts` |
| `bun db:migrate` | Applique les migrations |

## Authentification

- Mots de passe hachés en argon2id (`Bun.password`), 12 caractères minimum.
- Session : jeton aléatoire de 256 bits dans un cookie `httpOnly`, `SameSite=Lax` (`__Host-` et
  `Secure` en production). Seul son hash SHA-256 est stocké en base. Durée 30 jours, prolongée
  automatiquement à l'usage.
- 2FA TOTP (RFC 6238) : activation en deux temps (QR code puis code de confirmation), secret
  chiffré en AES-256-GCM en base (`TOTP_ENCRYPTION_KEY`).
- Protections : 10 tentatives de connexion par compte / 15 min, temps de réponse identique pour un
  email inconnu, middleware CSRF, révocation des sessions au blocage et au changement de mot de passe.

## Déploiement (Railway)

L'infrastructure est décrite en code dans `.railway/railway.ts` : services `web` et `api`
(Dockerfiles), Postgres et variables. Les secrets ne sont pas dans le dépôt (`preserve()` conserve
la valeur définie sur Railway).

```sh
railway config plan               # aperçu des changements d'infrastructure
railway config apply              # application
railway up --service api --ci     # serveur 1
railway up --service web --ci     # front (Caddy)
```

- Les migrations sont appliquées automatiquement avant chaque déploiement de l'API.
- Postgres et l'API ne sont pas exposés publiquement (réseau privé Railway uniquement).
- Le service `web` ajoute les en-têtes de sécurité (CSP, HSTS, X-Frame-Options…) et le cache
  permanent des fichiers hachés de Vite.
- Premier administrateur en production :
  `railway ssh --service api -- bun scripts/create-admin.ts <email> "<Nom>"`
