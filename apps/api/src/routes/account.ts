import { schema } from "@manuspace/db";
import {
	changePasswordSchema,
	disableTotpSchema,
	totpCodeSchema,
	updateProfileSchema,
} from "@manuspace/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { isUniqueViolation } from "../lib/errors";
import { createSession, invalidateUserSessions } from "../lib/session";
import { generateTotpSecret, verifyTotp } from "../lib/totp";
import { toPublicUser } from "../lib/users";
import { validate } from "../lib/validator";
import { type AuthEnv, requireAuth } from "../middleware/auth";

async function updateUser(id: string, values: Partial<typeof schema.users.$inferInsert>) {
	const [user] = await db
		.update(schema.users)
		.set({ ...values, updatedAt: new Date() })
		.where(eq(schema.users.id, id))
		.returning();
	if (!user) throw new HTTPException(404, { message: "Utilisateur introuvable" });
	return user;
}

export const account = new Hono<AuthEnv>()
	.use(requireAuth)
	.patch("/profile", validate("json", updateProfileSchema), async (c) => {
		try {
			const user = await updateUser(c.var.user.id, c.req.valid("json"));
			return c.json(toPublicUser(user));
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new HTTPException(409, { message: "Cet email est déjà utilisé" });
			}
			throw error;
		}
	})
	.post("/password", validate("json", changePasswordSchema), async (c) => {
		const { currentPassword, newPassword } = c.req.valid("json");
		if (!(await Bun.password.verify(currentPassword, c.var.user.passwordHash))) {
			throw new HTTPException(401, { message: "Mot de passe actuel incorrect" });
		}
		await updateUser(c.var.user.id, { passwordHash: await Bun.password.hash(newPassword) });
		// Déconnecte toutes les autres sessions, puis en recrée une pour l'appareil courant.
		await invalidateUserSessions(c.var.user.id);
		await createSession(c, c.var.user.id);
		return c.json({ ok: true });
	})
	/** Étape 1 : génère un secret (non actif) et renvoie l'URI à afficher en QR code. */
	.post("/totp/setup", async (c) => {
		if (c.var.user.totpEnabledAt) {
			throw new HTTPException(409, { message: "La 2FA est déjà activée" });
		}
		const { encrypted, uri } = await generateTotpSecret(c.var.user.email);
		await updateUser(c.var.user.id, { totpSecret: encrypted });
		return c.json({ uri });
	})
	/** Étape 2 : active la 2FA si le code prouve que l'application est bien configurée. */
	.post("/totp/enable", validate("json", totpCodeSchema), async (c) => {
		const { totpSecret, totpEnabledAt } = c.var.user;
		if (totpEnabledAt) throw new HTTPException(409, { message: "La 2FA est déjà activée" });
		if (!totpSecret) throw new HTTPException(400, { message: "Configuration 2FA non démarrée" });
		if (!(await verifyTotp(totpSecret, c.req.valid("json").code))) {
			throw new HTTPException(400, { message: "Code de vérification incorrect" });
		}
		const user = await updateUser(c.var.user.id, { totpEnabledAt: new Date() });
		return c.json(toPublicUser(user));
	})
	.post("/totp/disable", validate("json", disableTotpSchema), async (c) => {
		const { password, code } = c.req.valid("json");
		const { passwordHash, totpSecret, totpEnabledAt } = c.var.user;
		if (!totpEnabledAt || !totpSecret) {
			throw new HTTPException(409, { message: "La 2FA n'est pas activée" });
		}
		if (
			!(await Bun.password.verify(password, passwordHash)) ||
			!(await verifyTotp(totpSecret, code))
		) {
			throw new HTTPException(401, { message: "Mot de passe ou code incorrect" });
		}
		const user = await updateUser(c.var.user.id, { totpSecret: null, totpEnabledAt: null });
		return c.json(toPublicUser(user));
	});
