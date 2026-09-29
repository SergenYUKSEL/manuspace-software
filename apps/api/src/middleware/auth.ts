import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { type User, validateSession } from "../lib/session";

export type AuthEnv = { Variables: { user: User; sessionId: string } };

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
	const result = await validateSession(c);
	if (!result) throw new HTTPException(401, { message: "Non authentifié" });
	c.set("user", result.user);
	c.set("sessionId", result.sessionId);
	await next();
});

export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
	if (!c.var.user.isAdmin) throw new HTTPException(403, { message: "Réservé aux administrateurs" });
	await next();
});
