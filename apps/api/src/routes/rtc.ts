import { Hono } from "hono";
import { env } from "../env";
import { type AuthEnv, requireAuth } from "../middleware/auth";

/** Même forme que RTCIceServer côté navigateur (type DOM absent côté serveur). */
type IceServer = { urls: string | string[]; username?: string; credential?: string };

/** Configuration ICE des appels audio, réservée aux utilisateurs connectés (identifiants TURN). */
export const rtc = new Hono<AuthEnv>().use(requireAuth).get("/ice-servers", (c) => {
	const iceServers: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
	const turnUrls = env.TURN_URLS?.split(",")
		.map((url) => url.trim())
		.filter(Boolean);
	if (turnUrls?.length && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
		iceServers.push({
			urls: turnUrls,
			username: env.TURN_USERNAME,
			credential: env.TURN_CREDENTIAL,
		});
	}
	return c.json({ iceServers });
});
