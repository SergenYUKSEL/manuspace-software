import { app } from "./app";
import { env } from "./env";
import { purgeExpiredTrash } from "./lib/trash";

/** Purge de la corbeille (plus de 30 jours) au démarrage puis toutes les 6 heures. */
async function purge() {
	try {
		const purged = await purgeExpiredTrash();
		if (purged > 0) console.log(`Corbeille : ${purged} élément(s) expiré(s) supprimé(s)`);
	} catch (error) {
		console.error("Purge de la corbeille échouée", error);
	}
}
void purge();
setInterval(purge, 6 * 60 * 60 * 1000);

export default {
	port: env.PORT,
	// IPv4 + IPv6 : le réseau privé Railway (api.railway.internal) peut être en IPv6.
	hostname: "::",
	fetch: app.fetch,
};
