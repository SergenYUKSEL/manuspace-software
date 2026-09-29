import { schema } from "@manuspace/db";
import { app } from "../src/app";
import { db } from "../src/db";

export const PASSWORD = "correct-horse-battery";

let counter = 0;

export async function createUser(values: Partial<typeof schema.users.$inferInsert> = {}) {
	const [user] = await db
		.insert(schema.users)
		.values({
			email: `user${++counter}-${crypto.randomUUID().slice(0, 8)}@test.local`,
			displayName: `User ${counter}`,
			passwordHash: await Bun.password.hash(PASSWORD),
			...values,
		})
		.returning();
	if (!user) throw new Error("createUser");
	return user;
}

type RequestOptions = { cookie?: string; body?: unknown; headers?: Record<string, string> };

export async function request(method: string, path: string, options: RequestOptions = {}) {
	// Comme un navigateur sur une requête same-origin (requis par le middleware CSRF).
	const headers: Record<string, string> = {
		host: "localhost",
		origin: "http://localhost",
		...options.headers,
	};
	if (options.cookie) headers.cookie = options.cookie;
	if (options.body !== undefined) headers["content-type"] = "application/json";
	const res = await app.request(`/api${path}`, {
		method,
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	// biome-ignore lint/suspicious/noExplicitAny: corps JSON libre dans les tests
	const json: any = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
	return { res, json, cookie: sessionCookie(res) };
}

function sessionCookie(res: Response): string | undefined {
	const header = res.headers.getSetCookie().find((c) => c.startsWith("ms_session="));
	const value = header?.split(";")[0];
	return value && value !== "ms_session=" ? value : undefined;
}

export async function login(email: string, password = PASSWORD, totp?: string) {
	return request("POST", "/auth/login", { body: { email, password, totp } });
}

/** Crée un utilisateur et renvoie son cookie de session. */
export async function loggedInUser(values: Partial<typeof schema.users.$inferInsert> = {}) {
	const user = await createUser(values);
	const { cookie } = await login(user.email);
	if (!cookie) throw new Error("loggedInUser : pas de cookie");
	return { user, cookie };
}

/** Envoi multipart (import de fichier), comme un formulaire du navigateur. */
export async function upload(
	method: "POST" | "PUT",
	path: string,
	cookie: string,
	fields: Record<string, string | File>,
) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	const res = await app.request(`/api${path}`, {
		method,
		headers: { host: "localhost", origin: "http://localhost", cookie },
		body,
	});
	// biome-ignore lint/suspicious/noExplicitAny: corps JSON libre dans les tests
	const json: any = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
	return { res, json };
}
