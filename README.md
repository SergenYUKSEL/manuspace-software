# Manuspace

Espace cloud pour auteurs : organiser ses romans, écrire ses chapitres, stocker ses ressources et
collaborer en temps réel (co-écriture, correction, appel audio).

## Architecture

```
apps/
  web/      React 19 + Vite, TanStack Router/Query, Tailwind v4 + shadcn/ui.
            En production : servi par Caddy, qui relaie /api vers l'API (Caddyfile).
  api/      Serveur 1 — API métier (Bun + Hono) : auth, 2FA, manuscrits, fichiers, admin.
  collab/   Serveur 2 — temps réel (WebSocket Bun maison) : autorité OT de l'édition
            collaborative, présence, curseurs.
packages/
  shared/   Algorithme OT (TextOperation, client, autorité serveur), Markdown léger,
            protocole WebSocket, schémas Zod et rôles partagés front / api / collab
  db/       Schéma Drizzle (PostgreSQL) + migrations, partagé par api et collab
infra/      docker-compose de dev (Postgres + stockage S3)
.railway/   Infrastructure Railway en code
```

```
navigateur ──https──▶ web (Caddy : front + proxy /api) ──réseau privé──▶ api ──▶ Postgres
           └──wss────▶ collab (WebSocket) ─────────────────────────────────────────▲
```

- **Front et API séparés, même origine** : le service web relaie `/api` vers l'API par le réseau
  privé. Le navigateur ne voit qu'une origine : cookie de session `SameSite=Lax` sans CORS. Deux
  domaines `*.up.railway.app` distincts seraient des sites différents (liste des suffixes publics)
  et le cookie deviendrait un cookie tiers, bloqué par Safari. En dev, le proxy de Vite joue ce rôle.
- **API privée** : aucun domaine public, le service web est son seul point d'entrée HTTP.
- **Collab public** : le navigateur s'y connecte en WebSocket avec un **ticket** (JWT HS256 d'une
  minute, lié à un document et à un rôle) délivré par l'API et vérifié avec le secret partagé
  `COLLAB_TICKET_SECRET`. Les deux serveurs restent découplés.

## Prérequis

- [Bun](https://bun.sh) ≥ 1.3
- Docker (Postgres + stockage S3 en local)

## Lancer en local

```sh
bun install
cp .env.example .env
bun infra:up          # Postgres (port 5434) + S3 RustFS (9000, console 9001)
bun db:migrate
bun run --cwd apps/api create-admin moi@exemple.fr "Mon nom"   # premier compte admin
bun dev               # web :5173, api :3000, collab :3001
```

Il n'y a pas d'inscription publique : les comptes suivants sont créés depuis la page Administration.

Ouvrir http://localhost:5173 (Vite redirige `/api` vers l'API).

## Scripts

| Commande | Rôle |
|---|---|
| `bun dev` | Lance les 3 apps en mode watch |
| `bun typecheck` | Vérifie les types de tous les packages |
| `bun lint` / `bun format` | Biome (lint + format) |
| `bun test` | Tests d'intégration (une base de test par paquet, créée et migrée automatiquement, nécessite `bun infra:up`) |
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
- Ticket collab : JWT de 60 s lié à un document et au rôle de l'utilisateur sur le manuscrit.

## Édition collaborative (écrite par nous, sans bibliothèque de synchronisation)

Contrainte du projet : ni Yjs/CRDT, ni bibliothèque de synchronisation, ni éditeur riche.

- **Éditeur** : zone de texte native (accents, correcteur, copier-coller, mobile) et **Markdown
  léger** (`# titre`, `> citation`, `**gras**`, `*italique*`, `***` changement de scène), avec
  barre d'outils, mode Lecture (rendu en éléments React à partir d'un arbre, jamais de HTML
  injecté) et compteur de mots.
- **Transformation opérationnelle (OT) à autorité centrale** (`packages/shared/src/ot`) :
  - `TextOperation` : conserver / insérer / supprimer, avec `apply`, `compose`, `transform`
    (convergence TP1), `invert` (annulation), `transformIndex` (curseurs) ;
  - client à trois états (synchronisé / en attente d'accusé / en attente + tampon) : une seule
    opération en vol, les frappes suivantes composées dans un tampon ;
  - `ServerDocument` : le serveur numérote les opérations (révisions) et transforme chaque
    opération reçue contre celles appliquées depuis sa révision de base.
- **Durabilité** : chaque opération est journalisée (`document_operations`) **avant** l'accusé de
  réception ; l'instantané (`document_contents`) est écrit 2 s après la dernière frappe. Au
  chargement, les opérations postérieures à l'instantané sont rejouées (arrêt brutal).
- **Coupures** : le texte, la révision et les opérations non confirmées sont gardés dans
  IndexedDB ; au retour, le serveur renvoie les opérations manquées et le client renvoie les
  siennes. Chaque opération a un identifiant : un renvoi n'est **jamais appliqué deux fois**.
- **Annulation** maison : on n'annule que ses propres modifications, transformées contre celles
  des co-auteurs. Saisie composée (accents, IME) fusionnée par transformation à la fin.
- **Curseurs** des collaborateurs transposés dans le texte local et superposés à la zone
  d'écriture (calque miroir).
- **Tests** : propriétés OT sur des milliers de cas aléatoires, simulation de clients
  concurrents avec coupures et messages perdus (convergence vérifiée), tests d'intégration du
  serveur.

## Fichiers (PDF, images)

- Import, aperçu, téléchargement, remplacement et suppression des ressources d'un manuscrit
  (cartes, recherches, couvertures…), dans n'importe quel dossier, y compris par glisser-déposer.
- L'upload passe par l'API, qui vérifie **avant stockage** la taille (20 Mo max) et le **type réel**
  du fichier par sa signature binaire : PDF, PNG, JPEG, WebP, GIF. Pas de SVG ni de HTML, qui
  pourraient exécuter du script une fois servis depuis notre domaine. Le type annoncé par le
  navigateur et l'extension sont ignorés.
- Le contenu est servi par l'API après vérification du rôle (`nosniff`, type détecté à l'import,
  cache privé). Chaque remplacement crée un nouvel objet S3 et supprime l'ancien.
- La suppression d'un manuscrit supprime ses objets du bucket.

## Déploiement (Railway)

L'infrastructure est décrite en code dans `.railway/railway.ts` : services `web`, `api` et `collab`
(Dockerfiles), Postgres, bucket S3 et variables. Les secrets ne sont pas dans le dépôt
(`preserve()` conserve la valeur définie sur Railway).

```sh
railway config plan               # aperçu des changements d'infrastructure
railway config apply              # application
railway up --service api --ci     # serveur 1
railway up --service collab --ci  # serveur 2
railway up --service web --ci     # front (Caddy)
```

- Les migrations sont appliquées automatiquement avant chaque déploiement de l'API.
- Postgres et l'API ne sont pas exposés publiquement (réseau privé Railway uniquement).
- Le service `collab` n'est jamais mis en veille (WebSocket) et dispose de 15 s pour sauvegarder
  les documents à l'arrêt.
- Le service `web` ajoute les en-têtes de sécurité (CSP, HSTS, X-Frame-Options…) et le cache
  permanent des fichiers hachés de Vite.
- Premier administrateur en production :
  `railway ssh --service api -- bun scripts/create-admin.ts <email> "<Nom>"`
