import { env } from "./env";
import { startServer } from "./server";

const { server, stop } = startServer(env.PORT);
console.log(`Collab en écoute sur ws://localhost:${server.port}`);

let shuttingDown = false;

async function shutdown() {
	if (shuttingDown) return;
	shuttingDown = true;
	await stop();
	process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
