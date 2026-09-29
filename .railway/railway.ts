import { defineRailway, postgres, preserve, project, service, volume } from "railway/iac";

/**
 * Infrastructure Railway de Manuspace :
 * - web    : front React servi par Caddy, relaie /api vers api (seul point d'entrée HTTP)
 * - api    : serveur 1, API métier — privé, joignable uniquement via le réseau Railway
 * - Postgres privé.
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
			TOTP_ENCRYPTION_KEY: preserve(),
		},
	});

	// Front : fichiers statiques + reverse proxy /api (même origine pour les cookies de session).
	// Syntaxe de référence Railway (résolue par Railway, pas par JavaScript : guillemets simples).
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
		},
	});

	return project("manuspace", {
		resources: [web, api, Postgres, postgresVolume],
	});
});
