import { app } from "./app";
import { env } from "./env";

export default {
	port: env.PORT,
	// IPv4 + IPv6 : le réseau privé Railway (api.railway.internal) peut être en IPv6.
	hostname: "::",
	fetch: app.fetch,
};
