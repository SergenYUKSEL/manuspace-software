import { describe, expect, test } from "bun:test";
import { app } from "../src/app";
import { createUser, loggedInUser, login, PASSWORD, request } from "./helpers";

describe("connexion", () => {
	test("identifiants valides : cookie de session httpOnly et profil public", async () => {
		const user = await createUser();
		const { res, json, cookie } = await login(user.email);

		expect(res.status).toBe(200);
		expect(json).toEqual({
			status: "ok",
			user: {
				id: user.id,
				email: user.email,
				displayName: user.displayName,
				isAdmin: false,
				totpEnabled: false,
				blocked: false,
			},
		});
		expect(cookie).toBeDefined();
		expect(res.headers.get("set-cookie")).toContain("HttpOnly");
		expect(res.headers.get("set-cookie")).toContain("SameSite=Lax");

		const me = await request("GET", "/auth/me", { cookie });
		expect(me.json.id).toBe(user.id);
	});

	test("email insensible à la casse", async () => {
		const user = await createUser();
		const { res } = await login(user.email.toUpperCase());
		expect(res.status).toBe(200);
	});

	test("mauvais mot de passe et email inconnu : même réponse 401", async () => {
		const user = await createUser();
		const wrong = await login(user.email, "mauvais-mot-de-passe");
		const unknown = await login("personne@test.local");

		expect(wrong.res.status).toBe(401);
		expect(unknown.res.status).toBe(401);
		expect(wrong.json).toEqual(unknown.json);
		expect(wrong.cookie).toBeUndefined();
	});

	test("compte bloqué : connexion refusée", async () => {
		const user = await createUser({ blockedAt: new Date() });
		const { res, cookie } = await login(user.email);
		expect(res.status).toBe(403);
		expect(cookie).toBeUndefined();
	});

	test("limite de tentatives : 429 après 10 échecs", async () => {
		const user = await createUser();
		for (let i = 0; i < 10; i++) await login(user.email, "mauvais-mot-de-passe");
		const { res } = await login(user.email);
		expect(res.status).toBe(429);
	});

	test("déconnexion : la session n'est plus valide", async () => {
		const { cookie } = await loggedInUser();
		expect((await request("POST", "/auth/logout", { cookie })).res.status).toBe(200);
		expect((await request("GET", "/auth/me", { cookie })).res.status).toBe(401);
	});

	test("sans session : 401", async () => {
		expect((await request("GET", "/auth/me")).res.status).toBe(401);
		expect((await request("GET", "/auth/me", { cookie: "ms_session=faux" })).res.status).toBe(401);
	});

	test("CSRF : derrière un proxy HTTPS (Railway), une requête same-origin passe", async () => {
		const { cookie } = await loggedInUser();
		// Le proxy termine TLS : l'API voit http://, le navigateur envoie Origin: https://
		const res = await app.request("http://manuspace.test/api/auth/logout", {
			method: "POST",
			headers: { cookie, host: "manuspace.test", origin: "https://manuspace.test" },
		});
		expect(res.status).toBe(200);
	});

	test("CSRF : formulaire cross-site refusé", async () => {
		const { cookie } = await loggedInUser();
		const { res, json } = await request("POST", "/auth/logout", {
			cookie,
			headers: {
				origin: "https://evil.example",
				"content-type": "application/x-www-form-urlencoded",
			},
		});
		expect(res.status).toBe(403);
		expect(json).toEqual({ error: "Requête cross-site refusée" });
	});
});

describe("profil", () => {
	test("modification du nom et de l'email", async () => {
		const { cookie } = await loggedInUser();
		const { res, json } = await request("PATCH", "/account/profile", {
			cookie,
			body: { displayName: "Victor Hugo", email: "Victor@Test.local" },
		});
		expect(res.status).toBe(200);
		expect(json.displayName).toBe("Victor Hugo");
		expect(json.email).toBe("victor@test.local");
	});

	test("email déjà pris : 409", async () => {
		const other = await createUser();
		const { cookie } = await loggedInUser();
		const { res } = await request("PATCH", "/account/profile", {
			cookie,
			body: { email: other.email },
		});
		expect(res.status).toBe(409);
	});

	test("changement de mot de passe : les autres sessions sont révoquées", async () => {
		const user = await createUser();
		const other = (await login(user.email)).cookie;
		const current = (await login(user.email)).cookie;

		const changed = await request("POST", "/account/password", {
			cookie: current,
			body: { currentPassword: PASSWORD, newPassword: "un-nouveau-mot-de-passe" },
		});
		expect(changed.res.status).toBe(200);
		expect((await request("GET", "/auth/me", { cookie: other })).res.status).toBe(401);
		expect((await request("GET", "/auth/me", { cookie: changed.cookie })).res.status).toBe(200);
		expect((await login(user.email, "un-nouveau-mot-de-passe")).res.status).toBe(200);
	});

	test("changement de mot de passe : mauvais mot de passe actuel ou trop court refusé", async () => {
		const { cookie } = await loggedInUser();
		const wrong = await request("POST", "/account/password", {
			cookie,
			body: { currentPassword: "faux", newPassword: "un-nouveau-mot-de-passe" },
		});
		const short = await request("POST", "/account/password", {
			cookie,
			body: { currentPassword: PASSWORD, newPassword: "court" },
		});
		expect(wrong.res.status).toBe(401);
		expect(short.res.status).toBe(400);
	});
});
