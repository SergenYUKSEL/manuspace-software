import { describe, expect, test } from "bun:test";
import { schema } from "@manuspace/db";
import { TextOperation } from "@manuspace/shared";
import { eq } from "drizzle-orm";
import { Room } from "../src/room";
import { db, fixture, TestClient, ticket, wait } from "./helpers";

const op = (...components: (number | string)[]) => TextOperation.fromJSON(components).toJSON();

describe("serveur collab : connexion", () => {
	test("ticket valide : document vierge, révision 0", async () => {
		const { userId, docId } = await fixture();
		const { client, ready } = await TestClient.join(await ticket(userId, docId));
		expect(ready).toMatchObject({ text: "", revision: 0, readOnly: false, peers: [] });
		client.close();
	});

	test("ticket invalide : refus et fermeture 4001", async () => {
		const client = await TestClient.open();
		client.send({ type: "hello", ticket: "faux", since: null });
		expect((await client.next("error")).code).toBe("unauthorized");
		expect(await client.closed()).toBe(4001);
	});

	test("message avant authentification : fermeture 4001", async () => {
		const client = await TestClient.open();
		client.send({ type: "op", revision: 0, id: "abcdefgh", operation: ["x"] });
		expect(await client.closed()).toBe(4001);
	});

	test("message mal formé : erreur, connexion conservée", async () => {
		const { userId, docId } = await fixture();
		const { client } = await TestClient.join(await ticket(userId, docId));
		client.send({ type: "op", revision: 0, id: "abcdefgh", operation: [0] });
		expect((await client.next("error")).code).toBe("invalid");
		client.send({ type: "ping" });
		await client.next("pong");
		client.close();
	});
});

describe("serveur collab : édition", () => {
	test("opération : accusée à l'auteur, diffusée aux autres, journalisée", async () => {
		const { userId, docId } = await fixture();
		const a = await TestClient.join(await ticket(userId, docId));
		const b = await TestClient.join(await ticket(userId, docId));
		await a.client.next("peer");

		a.client.send({ type: "op", revision: 0, id: "op-a-00001", operation: op("Méduse") });
		expect(await a.client.next("ack")).toEqual({ type: "ack", id: "op-a-00001", revision: 1 });
		expect(await b.client.next("op")).toMatchObject({ revision: 1, operation: ["Méduse"] });

		const logged = await db.query.documentOperations.findMany({
			where: eq(schema.documentOperations.nodeId, docId),
		});
		expect(logged).toMatchObject([{ revision: 1, clientOpId: "op-a-00001", userId }]);
		a.client.close();
		b.client.close();
	});

	test("opérations concurrentes sur la même révision : transformées, tout converge", async () => {
		const { userId, docId } = await fixture();
		const a = await TestClient.join(await ticket(userId, docId));
		a.client.send({ type: "op", revision: 0, id: "op-base-001", operation: op("abc") });
		await a.client.next("ack");
		const b = await TestClient.join(await ticket(userId, docId), 1);

		// Les deux écrivent sur la révision 1 sans connaître l'autre.
		a.client.send({ type: "op", revision: 1, id: "op-a-00002", operation: op(3, "A") });
		b.client.send({ type: "op", revision: 1, id: "op-b-00002", operation: op(3, "B") });
		await a.client.next("ack");
		await b.client.next("ack");
		// Chacun reçoit l'opération de l'autre, déjà transformée par le serveur.
		await a.client.next("op");
		await b.client.next("op");
		const c = await TestClient.join(await ticket(userId, docId));
		expect(["abcAB", "abcBA"]).toContain(c.ready.text as string);
		expect(c.ready.revision).toBe(3);
		for (const x of [a, b, c]) x.client.close();
	});

	test("renvoi après coupure (même identifiant) : jamais appliqué deux fois", async () => {
		const { userId, docId } = await fixture();
		const a = await TestClient.join(await ticket(userId, docId));
		const message = {
			type: "op",
			revision: 0,
			id: "op-dup-0001",
			operation: op("gorgone"),
		} as const;
		a.client.send(message);
		expect((await a.client.next("ack")).revision).toBe(1);
		a.client.send(message);
		expect((await a.client.next("ack")).revision).toBe(1);
		const check = await TestClient.join(await ticket(userId, docId));
		expect(check.ready).toMatchObject({ text: "gorgone", revision: 1 });
		a.client.close();
		check.client.close();
	});

	test("rattrapage : ready contient les opérations manquées depuis `since`", async () => {
		const { userId, docId } = await fixture();
		const a = await TestClient.join(await ticket(userId, docId));
		a.client.send({ type: "op", revision: 0, id: "op-r-00001", operation: op("Il était") });
		await a.client.next("ack");
		a.client.send({ type: "op", revision: 1, id: "op-r-00002", operation: op(8, " une fois") });
		await a.client.next("ack");
		const late = await TestClient.join(await ticket(userId, docId), 1);
		expect(late.ready.text).toBeUndefined();
		expect(late.ready.operations).toEqual([{ id: "op-r-00002", operation: [8, " une fois"] }]);
		a.client.close();
		late.client.close();
	});

	test("bêta-lecteur (lecture seule) : opération refusée, texte reçu", async () => {
		const { userId, docId } = await fixture();
		const author = await TestClient.join(await ticket(userId, docId));
		const reader = await TestClient.join(await ticket(userId, docId, "VIEWER"));
		expect(reader.ready.readOnly).toBe(true);
		reader.client.send({ type: "op", revision: 0, id: "op-v-00001", operation: op("x") });
		expect((await reader.client.next("error")).code).toBe("forbidden");
		author.client.send({ type: "op", revision: 0, id: "op-w-00001", operation: op("texte") });
		expect((await reader.client.next("op")).operation).toEqual(["texte"]);
		author.client.close();
		reader.client.close();
	});

	test("opération incompatible avec le texte : désynchronisation, fermeture 4009", async () => {
		const { userId, docId } = await fixture();
		const a = await TestClient.join(await ticket(userId, docId));
		a.client.send({ type: "op", revision: 0, id: "op-bad-0001", operation: op(50, "x") });
		expect((await a.client.next("error")).code).toBe("desync");
		expect(await a.client.closed()).toBe(4009);
	});

	test("dernier départ : instantané enregistré (texte, mots, dernier éditeur)", async () => {
		const { userId, docId } = await fixture();
		const a = await TestClient.join(await ticket(userId, docId));
		a.client.send({
			type: "op",
			revision: 0,
			id: "op-s-00001",
			operation: op("Méduse ouvrit les *yeux*."),
		});
		await a.client.next("ack");
		a.client.close();
		await wait(300);
		const content = await db.query.documentContents.findFirst({
			where: eq(schema.documentContents.nodeId, docId),
		});
		const node = await db.query.nodes.findFirst({ where: eq(schema.nodes.id, docId) });
		expect(content).toMatchObject({ content: "Méduse ouvrit les *yeux*.", revision: 1 });
		expect(node).toMatchObject({ wordCount: 4, updatedById: userId });
	});

	test("arrêt brutal : opérations journalisées après l'instantané rejouées au chargement", async () => {
		const { userId, docId } = await fixture();
		await db.insert(schema.documentContents).values({ nodeId: docId, content: "abc", revision: 1 });
		await db.insert(schema.documentOperations).values([
			{ nodeId: docId, revision: 1, clientOpId: "old-op-0001", operation: ["abc"], userId },
			{ nodeId: docId, revision: 2, clientOpId: "new-op-0002", operation: [3, "d"], userId },
		]);
		const room = await Room.load(docId);
		const { client, ready } = await TestClient.join(await ticket(userId, docId));
		void room;
		expect(ready).toMatchObject({ text: "abcd", revision: 2 });
		client.close();
	});
});

describe("serveur collab : présence et appel", () => {
	test("présence : arrivée, sélection, départ", async () => {
		const { userId, docId } = await fixture();
		const a = await TestClient.join(await ticket(userId, docId, "OWNER", "Autrice"));
		const b = await TestClient.join(await ticket(userId, docId, "VIEWER", "Lectrice"));
		expect(b.ready.peers.map((p) => p.name)).toEqual(["Autrice"]);
		expect((await a.client.next("peer")).peer.name).toBe("Lectrice");

		b.client.send({ type: "selection", revision: 0, selection: { anchor: 0, head: 0 } });
		expect((await a.client.next("peer")).peer.selection).toEqual({
			anchor: 0,
			head: 0,
			revision: 0,
		});

		b.client.close();
		expect((await a.client.next("peer-left")).sessionId).toBe(b.ready.sessionId);
		a.client.close();
	});

	test("appel : signal au seul destinataire, usurpation refusée, départ annoncé", async () => {
		const { userId, docId } = await fixture();
		const [a, b, c] = await Promise.all(
			[1, 2, 3].map(async () => TestClient.join(await ticket(userId, docId, "VIEWER"))),
		);
		const offer = { kind: "description", description: { type: "offer", sdp: "v=0" } };
		a?.client.send({ type: "call-join", peerId: "peer-aaaa" });
		b?.client.send({ type: "call-join", peerId: "peer-bbbb" });
		await wait(150);

		a?.client.send({ type: "call-signal", from: "peer-aaaa", to: "peer-bbbb", signal: offer });
		expect((await b?.client.next("call-signal"))?.from).toBe("peer-aaaa");
		expect(await c?.client.none("call-signal")).toBe(true);

		c?.client.send({ type: "call-signal", from: "peer-aaaa", to: "peer-bbbb", signal: offer });
		c?.client.send({ type: "call-join", peerId: "peer-bbbb" });
		expect(await b?.client.none("call-signal")).toBe(true);

		a?.client.close();
		expect((await b?.client.next("call-peer-left"))?.peerId).toBe("peer-aaaa");
		b?.client.close();
		c?.client.close();
	});
});

describe("serveur collab : arrêt", () => {
	test("redémarrage : aucun départ annoncé (les appels en cours ne raccrochent pas)", async () => {
		const { startServer } = await import("../src/server");
		const instance = startServer(0);
		const { userId, docId } = await fixture();
		const join = async () => {
			const socket = new WebSocket(`ws://localhost:${instance.server.port}`);
			const messages: { type: string }[] = [];
			socket.addEventListener("message", (e) => messages.push(JSON.parse(String(e.data))));
			await new Promise((r) => socket.addEventListener("open", r, { once: true }));
			socket.send(
				JSON.stringify({ type: "hello", ticket: await ticket(userId, docId), since: null }),
			);
			await wait(200);
			return { socket, messages };
		};
		const a = await join();
		const b = await join();
		a.socket.send(JSON.stringify({ type: "call-join", peerId: "peer-aaaa" }));
		b.socket.send(JSON.stringify({ type: "call-join", peerId: "peer-bbbb" }));
		await wait(150);

		await instance.stop();
		await wait(150);
		for (const client of [a, b]) {
			expect(
				client.messages.some((m) => m.type === "call-peer-left" || m.type === "peer-left"),
			).toBe(false);
		}
	});
});

describe("serveur collab : messagerie de session", () => {
	test("message diffusé à tous (expéditeur compris), bêta-lecteur autorisé", async () => {
		const { userId, docId } = await fixture();
		const author = await TestClient.join(await ticket(userId, docId, "OWNER", "Autrice"));
		const reader = await TestClient.join(await ticket(userId, docId, "VIEWER", "Lectrice"));
		expect(author.ready.chat).toEqual([]);

		reader.client.send({ type: "chat", text: "  Le chapitre 3 est superbe !  " });
		const [toAuthor, toReader] = await Promise.all([
			author.client.next("chat"),
			reader.client.next("chat"),
		]);
		expect(toAuthor.message).toMatchObject({
			name: "Lectrice",
			text: "Le chapitre 3 est superbe !",
		});
		expect(toReader.message.id).toBe(toAuthor.message.id);
		expect(Number.isNaN(Date.parse(toAuthor.message.sentAt))).toBe(false);
		author.client.close();
		reader.client.close();
	});

	test("en rejoignant la session : les messages précédents sont reçus", async () => {
		const { userId, docId } = await fixture();
		const first = await TestClient.join(await ticket(userId, docId));
		first.client.send({ type: "chat", text: "On relit la scène du phare ?" });
		await first.client.next("chat");
		const late = await TestClient.join(await ticket(userId, docId));
		expect(late.ready.chat.map((m) => m.text)).toEqual(["On relit la scène du phare ?"]);
		first.client.close();
		late.client.close();
	});

	test("message vide ou trop long refusé, HTML gardé comme texte", async () => {
		const { userId, docId } = await fixture();
		const { client } = await TestClient.join(await ticket(userId, docId));
		client.send({ type: "chat", text: "   " });
		expect((await client.next("error")).code).toBe("invalid");
		client.send({ type: "chat", text: "x".repeat(2001) });
		expect((await client.next("error")).code).toBe("invalid");
		client.send({ type: "chat", text: "<img src=x onerror=alert(1)>" });
		expect((await client.next("chat")).message.text).toBe("<img src=x onerror=alert(1)>");
		client.close();
	});

	test("anti-inondation : au-delà de 10 messages en 10 s, refus", async () => {
		const { userId, docId } = await fixture();
		const { client } = await TestClient.join(await ticket(userId, docId));
		for (let i = 0; i < 11; i++) client.send({ type: "chat", text: `message ${i}` });
		expect((await client.next("error")).code).toBe("rate-limited");
		await wait(100);
		expect(client.received.filter((m) => m.type === "chat")).toHaveLength(10);
		client.close();
	});
});
