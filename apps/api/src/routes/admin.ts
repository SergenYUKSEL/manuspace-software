import { schema } from "@manuspace/db";
import { createUserSchema } from "@manuspace/shared";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db";
import { isUniqueViolation } from "../lib/errors";
import { invalidateUserSessions } from "../lib/session";
import { toPublicUser } from "../lib/users";
import { validate } from "../lib/validator";
import { type AuthEnv, requireAdmin, requireAuth } from "../middleware/auth";

const idParam = validate("param", z.object({ id: z.uuid() }));

async function setBlocked(id: string, blocked: boolean) {
	const [user] = await db
		.update(schema.users)
		.set({ blockedAt: blocked ? new Date() : null, updatedAt: new Date() })
		.where(eq(schema.users.id, id))
		.returning();
	if (!user) throw new HTTPException(404, { message: "Utilisateur introuvable" });
	return user;
}

export const admin = new Hono<AuthEnv>()
	.use(requireAuth, requireAdmin)
	.get("/users", async (c) => {
		const users = await db.query.users.findMany({ orderBy: asc(schema.users.createdAt) });
		return c.json(users.map(toPublicUser));
	})
	.post("/users", validate("json", createUserSchema), async (c) => {
		const { password, ...values } = c.req.valid("json");
		try {
			const [user] = await db
				.insert(schema.users)
				.values({ ...values, passwordHash: await Bun.password.hash(password) })
				.returning();
			if (!user) throw new Error("Insertion utilisateur sans retour");
			return c.json(toPublicUser(user), 201);
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new HTTPException(409, { message: "Cet email est déjà utilisé" });
			}
			throw error;
		}
	})
	.post("/users/:id/block", idParam, async (c) => {
		const { id } = c.req.valid("param");
		if (id === c.var.user.id) {
			throw new HTTPException(400, { message: "Impossible de bloquer son propre compte" });
		}
		const user = await setBlocked(id, true);
		// Un compte bloqué est déconnecté immédiatement, pas seulement à sa prochaine connexion.
		await invalidateUserSessions(id);
		return c.json(toPublicUser(user));
	})
	.post("/users/:id/unblock", idParam, async (c) => {
		const user = await setBlocked(c.req.valid("param").id, false);
		return c.json(toPublicUser(user));
	});
