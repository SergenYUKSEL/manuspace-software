import { schema } from "@manuspace/db";
import { loginSchema } from "@manuspace/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { createRateLimiter } from "../lib/rate-limit";
import { createSession, invalidateSession } from "../lib/session";
import { verifyTotp } from "../lib/totp";
import { toPublicUser } from "../lib/users";
import { validate } from "../lib/validator";
import { requireAuth } from "../middleware/auth";

// 10 tentatives par compte toutes les 15 minutes (mot de passe et code 2FA confondus).
const loginLimiter = createRateLimiter(10, 15 * 60 * 1000);

// Vérifié quand l'email est inconnu : même temps de réponse, pas d'énumération des comptes.
const DUMMY_HASH = await Bun.password.hash("manuspace-dummy-password");

const invalidCredentials = () =>
	new HTTPException(401, { message: "Email ou mot de passe incorrect" });

export const auth = new Hono()
	.post("/login", validate("json", loginSchema), async (c) => {
		const { email, password, totp } = c.req.valid("json");

		if (!loginLimiter.consume(email)) {
			throw new HTTPException(429, { message: "Trop de tentatives, réessayez dans 15 minutes" });
		}

		const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
		if (!user) {
			await Bun.password.verify(password, DUMMY_HASH);
			throw invalidCredentials();
		}
		if (!(await Bun.password.verify(password, user.passwordHash))) throw invalidCredentials();

		if (user.blockedAt) throw new HTTPException(403, { message: "Ce compte est bloqué" });

		if (user.totpEnabledAt && user.totpSecret) {
			if (!totp) return c.json({ status: "totp_required" as const });
			if (!(await verifyTotp(user.totpSecret, totp))) {
				throw new HTTPException(401, { message: "Code de vérification incorrect" });
			}
		}

		loginLimiter.reset(email);
		await createSession(c, user.id);
		return c.json({ status: "ok" as const, user: toPublicUser(user) });
	})
	.post("/logout", requireAuth, async (c) => {
		await invalidateSession(c, c.var.sessionId);
		return c.json({ ok: true });
	})
	.get("/me", requireAuth, (c) => c.json(toPublicUser(c.var.user)));
