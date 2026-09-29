import { schema } from "@manuspace/db";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db } from "../db";
import { env } from "../env";
import { generateToken, sha256Hex } from "./crypto";

const DAY = 24 * 60 * 60 * 1000;
const SESSION_DURATION = 30 * DAY;
/** En dessous de ce délai restant, la session est prolongée (session glissante). */
const RENEW_THRESHOLD = 15 * DAY;

const isProd = env.NODE_ENV === "production";
// Préfixe __Host- : cookie lié à l'origine exacte, uniquement en HTTPS.
export const SESSION_COOKIE = isProd ? "__Host-ms_session" : "ms_session";

export type User = typeof schema.users.$inferSelect;

export async function createSession(c: Context, userId: string) {
	const token = generateToken();
	const expiresAt = new Date(Date.now() + SESSION_DURATION);
	// Seul le hash est stocké : une fuite de la base ne permet pas d'usurper une session.
	await db.insert(schema.sessions).values({ id: sha256Hex(token), userId, expiresAt });
	setSessionCookie(c, token, expiresAt);
}

/** Retourne l'utilisateur de la session, ou null si absente, expirée ou compte bloqué. */
export async function validateSession(
	c: Context,
): Promise<{ user: User; sessionId: string } | null> {
	const token = getCookie(c, SESSION_COOKIE);
	if (!token) return null;
	const sessionId = sha256Hex(token);

	const [row] = await db
		.select({ session: schema.sessions, user: schema.users })
		.from(schema.sessions)
		.innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
		.where(eq(schema.sessions.id, sessionId));

	if (!row || row.session.expiresAt.getTime() <= Date.now() || row.user.blockedAt) {
		if (row) await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
		deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isProd });
		return null;
	}

	if (row.session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD) {
		const expiresAt = new Date(Date.now() + SESSION_DURATION);
		await db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.id, sessionId));
		setSessionCookie(c, token, expiresAt);
	}

	return { user: row.user, sessionId };
}

export async function invalidateSession(c: Context, sessionId: string) {
	await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
	deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isProd });
}

export async function invalidateUserSessions(userId: string) {
	await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

function setSessionCookie(c: Context, token: string, expires: Date) {
	setCookie(c, SESSION_COOKIE, token, {
		path: "/",
		httpOnly: true,
		secure: isProd,
		sameSite: "Lax",
		expires,
	});
}
