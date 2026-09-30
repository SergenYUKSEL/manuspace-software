import { bucket, defineRailway, postgres, preserve, project, service, volume } from "railway/iac";

/**
 * Infrastructure Railway de Manuspace :
 * - web    : front React servi par Caddy, relaie /api vers api (seul point d'entrée HTTP)
 * - api    : serveur 1, API métier — privé, joignable uniquement via le réseau Railway
 * - collab : serveur 2, collaboration temps réel (WebSocket public)
 * - Postgres privé et bucket S3.
 * Aperçu : `railway config plan` — application : `railway config apply`.
 * Les secrets ne sont pas dans le dépôt : preserve() conserve la valeur définie sur Railway.
 */
export default defineRailway(() => {
	const region = "europe-west4-drams3a";

	const Postgres = postgres("Postgres", { region });
	Postgres.networking = { privateNetworkEndpoint: "postgres" };
	const postgresVolume = volume("postgres-volume", {
		alerts: { usage: { "100": {}, "80": {}, "95": {} } },
		allowOnlineResize: true,
		region,
		sizeMB: 5000,
	});
	const files = bucket("manuspace-files", { region: "ams" });

	// Serveur 2 : collaboration temps réel (WebSocket).
	const collab = service("collab", {
		replicas: { [region]: 1 },
		build: {
			builder: "DOCKERFILE",
			dockerfilePath: "apps/collab/Dockerfile",
			watchPatterns: ["apps/collab/**", "packages/**", "bun.lock"],
		},
		deploy: {
			healthcheckPath: "/health",
			restartPolicyType: "ON_FAILURE",
			// Jamais en veille : les connexions WebSocket seraient coupées.
			sleepApplication: false,
			// Laisse le temps au SIGTERM de sauvegarder les documents en mémoire.
			drainingSeconds: 15,
		},
		env: {
			// Port fixe, identique à celui des domaines publics.
			PORT: "8080",
			NODE_ENV: "production",
			DATABASE_URL: Postgres.env.DATABASE_URL,
			COLLAB_TICKET_SECRET: preserve(),
		},
	});

	// Serveur 1 : API métier. Pas de domaine public : le service web la relaie.
	const api = service("api", {
		replicas: { [region]: 1 },
		build: {
			builder: "DOCKERFILE",
			dockerfilePath: "apps/api/Dockerfile",
			watchPatterns: ["apps/api/**", "packages/**", "bun.lock"],
		},
		deploy: {
			preDeployCommand: ["bun run --cwd /app/packages/db migrate"],
			healthcheckPath: "/api/health",
			restartPolicyType: "ON_FAILURE",
		},
		env: {
			// Port fixe, utilisé par le proxy du service web.
			PORT: "8080",
			NODE_ENV: "production",
			DATABASE_URL: Postgres.env.DATABASE_URL,
			COLLAB_TICKET_SECRET: preserve(),
			TOTP_ENCRYPTION_KEY: preserve(),
			S3_ENDPOINT: preserve(),
			S3_BUCKET: preserve(),
			S3_ACCESS_KEY_ID: preserve(),
			S3_SECRET_ACCESS_KEY: preserve(),
			// Relais TURN des appels audio (fournisseur externe : Railway ne gère pas l'UDP).
			TURN_URLS: preserve(),
			TURN_USERNAME: preserve(),
			TURN_CREDENTIAL: preserve(),
			// Bucket Railway : région "auto" et URLs https://<bucket>.<endpoint>.
			S3_REGION: "auto",
			S3_VIRTUAL_HOSTED_STYLE: "true",
		},
	});

	// Front : fichiers statiques + reverse proxy /api (même origine pour les cookies de session).
	// Syntaxe de référence Railway (résolue par Railway, pas par JavaScript : guillemets simples).
	// biome-ignore lint/suspicious/noTemplateCurlyInString: référence Railway, pas un template JS
	const collabUrl = "wss://${{collab.RAILWAY_PUBLIC_DOMAIN}}";
	const web = service("web", {
		replicas: { [region]: 1 },
		build: {
			builder: "DOCKERFILE",
			dockerfilePath: "apps/web/Dockerfile",
			watchPatterns: ["apps/web/**", "packages/shared/**", "apps/api/src/**", "bun.lock"],
		},
		deploy: {
			healthcheckPath: "/healthz",
			restartPolicyType: "ON_FAILURE",
		},
		env: {
			PORT: "8080",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: référence Railway, pas un template JS
			API_INTERNAL_URL: "http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8080",
			// Autorisé dans la Content-Security-Policy (connect-src).
			COLLAB_URL: collabUrl,
			// Injectée au build du front (ARG du Dockerfile).
			VITE_COLLAB_URL: collabUrl,
		},
	});

	return project("manuspace", {
		resources: [web, api, collab, Postgres, postgresVolume, files],
	});
});
