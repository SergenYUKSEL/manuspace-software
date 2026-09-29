import { describe, expect, test } from "bun:test";
import { schema } from "@manuspace/db";
import { generateTOTP } from "@oslojs/otp";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { loggedInUser, login, PASSWORD, request } from "./helpers";

function keyFromUri(uri: string): Uint8Array {
	const secret = new URL(uri).searchParams.get("secret") ?? "";
	// Décodage base32 (RFC 4648) du secret contenu dans l'URI otpauth://
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let bits = "";
	for (const char of secret.replace(/=+$/, "")) {
		bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
	}
	const bytes = bits.match(/.{8}/g) ?? [];
	return new Uint8Array(bytes.map((b) => Number.parseInt(b, 2)));
}

async function enableTotp(cookie: string) {
	const setup = await request("POST", "/account/totp/setup", { cookie });
	const key = keyFromUri(setup.json.uri);
	const enabled = await request("POST", "/account/totp/enable", {
		cookie,
		body: { code: generateTOTP(key, 30, 6) },
	});
	return { setup, enabled, key };
}

describe("2FA TOTP", () => {
	test("activation : URI otpauth puis confirmation par code", async () => {
		const { cookie } = await loggedInUser();
		const { setup, enabled } = await enableTotp(cookie);

		expect(setup.json.uri).toStartWith("otpauth://totp/Manuspace:");
		expect(enabled.res.status).toBe(200);
		expect(enabled.json.totpEnabled).toBe(true);
	});

	test("le secret est chiffré en base", async () => {
		const { user, cookie } = await loggedInUser();
		const { setup } = await enableTotp(cookie);
		const row = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
		const base32 = new URL(setup.json.uri).searchParams.get("secret") ?? "";

		expect(row?.totpSecret).toBeTruthy();
		expect(row?.totpSecret).not.toContain(base32);
	});

	test("activation refusée avec un mauvais code", async () => {
		const { cookie } = await loggedInUser();
		await request("POST", "/account/totp/setup", { cookie });
		const { res } = await request("POST", "/account/totp/enable", {
			cookie,
			body: { code: "000000" },
		});
		expect(res.status).toBe(400);
	});

	test("connexion : code requis, refusé s'il est faux, accepté s'il est bon", async () => {
		const { user, cookie } = await loggedInUser();
		const { key } = await enableTotp(cookie);

		const noCode = await login(user.email);
		expect(noCode.json).toEqual({ status: "totp_required" });
		expect(noCode.cookie).toBeUndefined();

		const badCode = await login(user.email, PASSWORD, "000000");
		expect(badCode.res.status).toBe(401);
		expect(badCode.cookie).toBeUndefined();

		const ok = await login(user.email, PASSWORD, generateTOTP(key, 30, 6));
		expect(ok.json.status).toBe("ok");
		expect(ok.cookie).toBeDefined();
	});

	test("désactivation : mot de passe et code exigés", async () => {
		const { user, cookie } = await loggedInUser();
		const { key } = await enableTotp(cookie);

		const refused = await request("POST", "/account/totp/disable", {
			cookie,
			body: { password: "faux", code: generateTOTP(key, 30, 6) },
		});
		expect(refused.res.status).toBe(401);

		const disabled = await request("POST", "/account/totp/disable", {
			cookie,
			body: { password: PASSWORD, code: generateTOTP(key, 30, 6) },
		});
		expect(disabled.json.totpEnabled).toBe(false);
		expect((await login(user.email)).json.status).toBe("ok");
	});
});
