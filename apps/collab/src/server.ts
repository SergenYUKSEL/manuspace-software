import { collabClientMessageSchema, hasRole, userColor } from "@manuspace/shared";
import type { Room } from "./room";
import { getRoom, releaseIfEmpty, saveAll } from "./rooms";
import { Session } from "./session";
import { verifyTicket } from "./ticket";

type SocketData = {
	session?: Session;
	room?: Room;
	/** Authentification en cours : les messages suivants l'attendent. */
	authenticating?: Promise<void>;
	authTimer?: ReturnType<typeof setTimeout>;
};

/** Délai pour envoyer le ticket après l'ouverture du WebSocket. */
const AUTH_TIMEOUT = 10_000;

/**
 * Serveur 2 : WebSocket maison (sans bibliothèque de synchro). Premier message obligatoire :
 * `hello` avec le ticket délivré par l'API (vérifié ici, lié à un document et à un rôle).
 */
export function startServer(port: number) {
	/** Arrêt en cours : les fermetures de sockets ne sont pas des départs (pas d'annonce). */
	let stopping = false;

	const server = Bun.serve<SocketData>({
		port,
		fetch(req, server) {
			const url = new URL(req.url);
			if (url.pathname === "/health") return Response.json({ status: "ok" });
			if (server.upgrade(req, { data: {} })) return;
			return new Response("Not found", { status: 404 });
		},
		websocket: {
			maxPayloadLength: 2 * 1024 * 1024,
			idleTimeout: 60,
			open(ws) {
				ws.data.authTimer = setTimeout(() => ws.close(4001, "unauthorized"), AUTH_TIMEOUT);
			},
			async message(ws, raw) {
				let message: ReturnType<typeof collabClientMessageSchema.parse>;
				try {
					message = collabClientMessageSchema.parse(JSON.parse(String(raw)));
				} catch {
					ws.send(JSON.stringify({ type: "error", code: "invalid", message: "Message invalide" }));
					return;
				}
				if (ws.data.authenticating) await ws.data.authenticating;
				const { session, room } = ws.data;

				if (!session || !room) {
					if (message.type !== "hello") return ws.close(4001, "unauthorized");
					ws.data.authenticating = authenticate(ws, message.ticket, message.since);
					return ws.data.authenticating;
				}
				if (message.type === "hello") return;
				await room.handle(session, message);
			},
			close(ws) {
				clearTimeout(ws.data.authTimer);
				const { session, room } = ws.data;
				// Pendant un redémarrage, annoncer des départs ferait raccrocher les appels en cours
				// (l'audio pair à pair continue) : les clients se reconnectent à la nouvelle instance.
				if (!session || !room || stopping) return;
				room.leave(session);
				void releaseIfEmpty(room);
			},
		},
	});

	/**
	 * Arrêt propre (redéploiement) : instantané de chaque document ouvert, puis fermeture des
	 * WebSockets. Les opérations acceptées sont déjà journalisées ; les clients gardent leurs
	 * frappes non confirmées et se reconnectent à la nouvelle instance.
	 */
	async function stop() {
		stopping = true;
		await Promise.race([saveAll(), Bun.sleep(10_000)]);
		server.stop(true);
	}

	return { server, stop };

	async function authenticate(
		ws: Bun.ServerWebSocket<SocketData>,
		ticket: string,
		since: number | null,
	) {
		try {
			const claims = await verifyTicket(ticket);
			clearTimeout(ws.data.authTimer);
			const session = new Session(
				ws,
				claims.sub,
				claims.name,
				userColor(claims.sub),
				!hasRole(claims.role, "EDITOR"),
			);
			const room = await getRoom(claims.docId);
			ws.data.session = session;
			ws.data.room = room;
			await room.join(session, since);
		} catch {
			ws.send(
				JSON.stringify({
					type: "error",
					code: "unauthorized",
					message: "Ticket invalide ou expiré",
				}),
			);
			ws.close(4001, "unauthorized");
		}
	}
}
