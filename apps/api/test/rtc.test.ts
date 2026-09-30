import { describe, expect, test } from "bun:test";
import { loggedInUser, request } from "./helpers";

describe("appels audio : serveurs ICE", () => {
	test("réservés aux utilisateurs connectés", async () => {
		expect((await request("GET", "/rtc/ice-servers")).res.status).toBe(401);
	});

	test("STUN public toujours présent", async () => {
		const { cookie } = await loggedInUser();
		const { json } = await request("GET", "/rtc/ice-servers", { cookie });
		expect(json.iceServers[0]).toEqual({ urls: "stun:stun.l.google.com:19302" });
	});
});
