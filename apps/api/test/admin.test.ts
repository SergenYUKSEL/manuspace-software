import { describe, expect, test } from "bun:test";
import { createUser, loggedInUser, login, request } from "./helpers";

describe("administration", () => {
	test("réservée aux administrateurs", async () => {
		const { cookie } = await loggedInUser();
		expect((await request("GET", "/admin/users", { cookie })).res.status).toBe(403);
	});

	test("création de compte, puis connexion avec ce compte", async () => {
		const { cookie } = await loggedInUser({ isAdmin: true });
		const { res, json } = await request("POST", "/admin/users", {
			cookie,
			body: {
				email: "Nouvel@Auteur.fr",
				displayName: "Nouvel auteur",
				password: "mot-de-passe-solide",
			},
		});
		expect(res.status).toBe(201);
		expect(json).toMatchObject({ email: "nouvel@auteur.fr", isAdmin: false, blocked: false });
		expect((await login("nouvel@auteur.fr", "mot-de-passe-solide")).res.status).toBe(200);

		const list = await request("GET", "/admin/users", { cookie });
		expect(list.json.some((u: { email: string }) => u.email === "nouvel@auteur.fr")).toBe(true);
		expect(JSON.stringify(list.json)).not.toContain("passwordHash");
	});

	test("création : email en double 409, mot de passe faible 400", async () => {
		const existing = await createUser();
		const { cookie } = await loggedInUser({ isAdmin: true });
		const duplicate = await request("POST", "/admin/users", {
			cookie,
			body: { email: existing.email, displayName: "X", password: "mot-de-passe-solide" },
		});
		const weak = await request("POST", "/admin/users", {
			cookie,
			body: { email: "faible@test.local", displayName: "X", password: "123" },
		});
		expect(duplicate.res.status).toBe(409);
		expect(weak.res.status).toBe(400);
	});

	test("blocage : sessions révoquées, connexion impossible ; déblocage : connexion rétablie", async () => {
		const { cookie: adminCookie } = await loggedInUser({ isAdmin: true });
		const { user, cookie } = await loggedInUser();

		const blocked = await request("POST", `/admin/users/${user.id}/block`, { cookie: adminCookie });
		expect(blocked.json.blocked).toBe(true);
		expect((await request("GET", "/auth/me", { cookie })).res.status).toBe(401);
		expect((await login(user.email)).res.status).toBe(403);

		const unblocked = await request("POST", `/admin/users/${user.id}/unblock`, {
			cookie: adminCookie,
		});
		expect(unblocked.json.blocked).toBe(false);
		expect((await login(user.email)).res.status).toBe(200);
	});

	test("un admin ne peut pas se bloquer lui-même", async () => {
		const { user, cookie } = await loggedInUser({ isAdmin: true });
		const { res } = await request("POST", `/admin/users/${user.id}/block`, { cookie });
		expect(res.status).toBe(400);
	});

	test("id invalide : 400, utilisateur inexistant : 404", async () => {
		const { cookie } = await loggedInUser({ isAdmin: true });
		expect((await request("POST", "/admin/users/pas-un-uuid/block", { cookie })).res.status).toBe(
			400,
		);
		const missing = await request("POST", `/admin/users/${crypto.randomUUID()}/block`, { cookie });
		expect(missing.res.status).toBe(404);
	});
});
