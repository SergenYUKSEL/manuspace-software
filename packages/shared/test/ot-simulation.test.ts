import { describe, expect, test } from "bun:test";
import { OTClient, type PendingOperation } from "../src/ot/client";
import { ServerDocument } from "../src/ot/server-document";
import { TextOperation } from "../src/ot/text-operation";
import { randomOperation, seeded } from "./random";

type ToServer = { revision: number; pending: PendingOperation };
type ToClient = { kind: "ack"; id: string } | { kind: "op"; operation: TextOperation };

type SimClient = {
	text: string;
	ot: OTClient;
	online: boolean;
	up: ToServer[];
	down: ToClient[];
};

/**
 * Simulation : plusieurs clients tapent au hasard, le réseau livre les messages dans un
 * ordre imprévisible (FIFO par canal, comme WebSocket), et les connexions tombent en perdant
 * les messages en vol — y compris l'accusé d'une opération que le serveur a bien appliquée.
 */
function simulate(seed: number, clientCount: number, steps: number) {
	const rand = seeded(seed);
	const server = new ServerDocument("Il était une fois.", 0);
	let idCounter = 0;
	const clients: SimClient[] = [];

	for (let c = 0; c < clientCount; c++) {
		const client = { text: server.text, online: true, up: [], down: [] } as unknown as SimClient;
		client.ot = new OTClient(
			0,
			{
				send: (revision, pending) => {
					if (client.online) client.up.push({ revision, pending });
				},
				apply: (operation) => {
					client.text = operation.apply(client.text);
				},
			},
			() => `op-${seed}-${idCounter++}`,
		);
		clients.push(client);
	}

	const deliverToServer = (client: SimClient) => {
		const message = client.up.shift();
		if (!message) return;
		const result = server.receive(message.revision, message.pending.id, message.pending.operation);
		if (result.kind === "duplicate") {
			stats.duplicates++;
			client.down.push({ kind: "ack", id: message.pending.id });
			return;
		}
		for (const other of clients) {
			if (!other.online) continue;
			other.down.push(
				other === client
					? { kind: "ack", id: message.pending.id }
					: { kind: "op", operation: result.operation },
			);
		}
	};

	const deliverToClient = (client: SimClient) => {
		const message = client.down.shift();
		if (!message) return;
		if (message.kind === "ack") client.ot.serverAck(message.id);
		else client.ot.applyServer(message.operation);
	};

	const stats = { edits: 0, disconnects: 0, duplicates: 0 };
	const reconnect = (client: SimClient) => {
		client.online = true;
		client.ot.catchUp(server.operationsSince(client.ot.revision));
		client.ot.resend();
	};

	for (let step = 0; step < steps; step++) {
		const client = clients[Math.floor(rand() * clients.length)] as SimClient;
		const r = rand();
		if (r < 0.35) {
			// Frappe locale, en ligne ou non.
			stats.edits++;
			const op = randomOperation(rand, client.text);
			client.text = op.apply(client.text);
			client.ot.applyClient(op);
		} else if (r < 0.6 && client.online) {
			deliverToServer(client);
		} else if (r < 0.9 && client.online) {
			deliverToClient(client);
		} else if (r < 0.95 && client.online) {
			// Coupure : tout ce qui est en vol est perdu dans les deux sens.
			stats.disconnects++;
			client.online = false;
			client.up = [];
			client.down = [];
		} else if (!client.online) {
			reconnect(client);
		}
	}

	// Fin : tout le monde se reconnecte et le réseau se vide.
	for (const client of clients) if (!client.online) reconnect(client);
	for (let guard = 0; guard < 100_000; guard++) {
		const busy = clients.filter((c) => c.up.length > 0 || c.down.length > 0);
		if (busy.length === 0) break;
		for (const client of busy) {
			deliverToServer(client);
			deliverToClient(client);
		}
	}
	return { server, clients, stats };
}

describe("OT : simulation de clients concurrents", () => {
	test("200 scénarios aléatoires (4 clients, coupures, messages perdus) : tout converge", () => {
		const total = { edits: 0, disconnects: 0, duplicates: 0 };
		for (let seed = 1; seed <= 200; seed++) {
			const { server, clients, stats } = simulate(seed, 4, 300);
			total.edits += stats.edits;
			total.disconnects += stats.disconnects;
			total.duplicates += stats.duplicates;
			for (const client of clients) {
				expect(client.ot.status).toBe("synchronized");
				expect(client.ot.revision).toBe(server.revision);
				expect(client.text).toBe(server.text);
			}
		}
		// La simulation exerce bien les cas difficiles (sinon le test ne prouverait rien).
		expect(total.edits).toBeGreaterThan(10_000);
		expect(total.disconnects).toBeGreaterThan(500);
		console.log(
			`   ${total.edits} frappes, ${total.disconnects} coupures, ${total.duplicates} renvois dédoublonnés`,
		);
	});

	test("accusé perdu : l'opération renvoyée n'est pas appliquée deux fois", () => {
		const server = new ServerDocument("abc", 0);
		let text = "abc";
		const sent: ToServer[] = [];
		const client = new OTClient(0, {
			send: (revision, pending) => sent.push({ revision, pending }),
			apply: (op) => {
				text = op.apply(text);
			},
		});
		const op = new TextOperation().retain(3).insert("!");
		text = op.apply(text);
		client.applyClient(op);

		const first = sent.shift() as ToServer;
		server.receive(first.revision, first.pending.id, first.pending.operation);
		// La connexion tombe avant l'accusé ; au retour, rattrapage puis renvoi.
		client.catchUp(server.operationsSince(0));
		client.resend();
		// Reconnue au rattrapage comme déjà appliquée : rien à renvoyer.
		expect(sent).toHaveLength(0);
		// Et si un renvoi arrivait quand même (course), le serveur le reconnaît comme doublon.
		expect(server.receive(0, first.pending.id, first.pending.operation).kind).toBe("duplicate");
		expect(server.text).toBe("abc!");
		expect(text).toBe("abc!");
		expect(client.status).toBe("synchronized");
	});
});
