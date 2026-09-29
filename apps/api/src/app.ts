import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./env";
import { account } from "./routes/account";
import { admin } from "./routes/admin";
import { auth } from "./routes/auth";
import { health } from "./routes/health";
import { manuscriptRoutes } from "./routes/manuscripts";

const api = new Hono()
	.route("/health", health)
	.route("/auth", auth)
	.route("/account", account)
	.route("/admin", admin)
	.route("/manuscripts", manuscriptRoutes);

/** Type de l'API, importé par le front pour le client RPC typé (`hono/client`). */
export type Api = typeof api;

export const app = new Hono();

if (env.NODE_ENV !== "test") app.use(logger());

app
	.use(secureHeaders())
	// Refuse les requêtes cross-site par formulaire ; le cookie SameSite=Lax couvre le reste.
	// Compare l'hôte de l'Origin à l'en-tête Host plutôt qu'à l'URL : derrière les proxys
	// (Railway termine TLS, puis Caddy du service web relaie en http:// en conservant Host),
	// l'API voit http:// alors que le navigateur envoie https://.
	.use("/api/*", csrf({ origin: (origin, c) => URL.parse(origin)?.host === c.req.header("host") }))
	.route("/api", api)
	.notFound((c) => c.json({ error: "Route inconnue" }, 404))
	.onError((error, c) => {
		if (error instanceof HTTPException) {
			// Le middleware CSRF lève une HTTPException sans message.
			const message = error.message || (error.status === 403 ? "Requête cross-site refusée" : "");
			return c.json({ error: message || "Requête invalide" }, error.status);
		}
		console.error(error);
		return c.json({ error: "Erreur interne" }, 500);
	});
