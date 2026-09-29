import { createDb, schema } from "@manuspace/db";
import type { CollabClientMessage, CollabServerMessage, ProjectRole } from "@manuspace/shared";
import { SignJWT } from "jose";
import { startServer } from "../src/server";

export const db = createDb(process.env.DATABASE_URL as string);
export const { server } = startServer(0);
const secret = new TextEncoder().encode(process.env.COLLAB_TICKET_SECRET);

/** Utilisateur + manuscrit + chapitre vierge en base de test. */
export async function fixture() {
	const [user] = await db
		.insert(schema.users)
		.values({
			email: `c-${crypto.randomUUID()}@test.local`,
			displayName: "Autrice",
			passwordHash: "x",
		})
		.returning();
	const [manuscript] = await db
		.insert(schema.manuscripts)
		.values({ title: "Médusa", ownerId: (user as { id: string }).id })
		.returning();
	const [node] = await db
		.insert(schema.nodes)
		.values({ manuscriptId: (manuscript as { id: string }).id, type: "text", name: "Chapitre 1" })
		.returning();
	return { userId: (user as { id: string }).id, docId: (node as { id: string }).id };
}

export function ticket(
	userId: string,
	docId: string,
	role: ProjectRole = "OWNER",
	name = "Autrice",
) {
	return new SignJWT({ name, docId, role })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(userId)
		.setAudience("manuspace-collab")
		.setExpirationTime("60s")
		.sign(secret);
}

/** Client WebSocket de test : file des messages reçus et attente d'un message précis. */
export class TestClient {
	readonly received: CollabServerMessage[] = [];
	closeCode: number | null = null;
	private waiters: (() => void)[] = [];

	private constructor(readonly socket: WebSocket) {
		socket.addEventListener("message", (event) => {
			this.received.push(JSON.parse(String(event.data)));
			for (const wake of this.waiters.splice(0)) wake();
		});
		socket.addEventListener("close", (event) => {
			this.closeCode = event.code;
			for (const wake of this.waiters.splice(0)) wake();
		});
	}

	static async open() {
		const socket = new WebSocket(`ws://localhost:${server.port}`);
		await new Promise((resolve, reject) => {
			socket.addEventListener("open", resolve, { once: true });
			socket.addEventListener("error", reject, { once: true });
		});
		return new TestClient(socket);
	}

	/** Ouvre et s'authentifie ; renvoie le message `ready`. */
	static async join(ticketValue: string, since: number | null = null) {
		const client = await TestClient.open();
		client.send({ type: "hello", ticket: ticketValue, since });
		const ready = await client.next("ready");
		return { client, ready };
	}

	send(message: CollabClientMessage | Record<string, unknown>) {
		this.socket.send(JSON.stringify(message));
	}

	/** Prochain message du type donné (consommé), ou erreur après 2 s. */
	async next<T extends CollabServerMessage["type"]>(type: T, timeout = 2000) {
		const deadline = Date.now() + timeout;
		for (;;) {
			const index = this.received.findIndex((m) => m.type === type);
			if (index !== -1) {
				return this.received.splice(index, 1)[0] as Extract<CollabServerMessage, { type: T }>;
			}
			if (this.closeCode !== null) throw new Error(`fermé (${this.closeCode}) avant « ${type} »`);
			const left = deadline - Date.now();
			if (left <= 0) throw new Error(`« ${type} » non reçu`);
			await new Promise<void>((resolve) => {
				this.waiters.push(resolve);
				setTimeout(resolve, left);
			});
		}
	}

	/** Vérifie qu'aucun message de ce type n'arrive pendant `ms`. */
	async none(type: CollabServerMessage["type"], ms = 300) {
		await new Promise((r) => setTimeout(r, ms));
		return !this.received.some((m) => m.type === type);
	}

	async closed() {
		for (let i = 0; i < 40 && this.closeCode === null; i++)
			await new Promise((r) => setTimeout(r, 50));
		return this.closeCode;
	}

	close() {
		this.socket.close();
	}
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
