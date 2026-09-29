import {
	type CollabClientMessage,
	type CollabServerMessage,
	ServerDocument,
	TextOperation,
} from "@manuspace/shared";
import { appendOperation, loadDocument, loadOperations, saveSnapshot } from "./persistence";
import type { Session } from "./session";

/** Opérations gardées en mémoire (au-delà : relues en base pour rattraper un client). */
const HISTORY_IN_MEMORY = 500;
/** Instantané 2 s après la dernière modification, au plus tard toutes les 10 s. */
const SAVE_DEBOUNCE = 2_000;
const SAVE_MAX_DELAY = 10_000;

/**
 * Un document ouvert : autorité OT (ServerDocument), sessions connectées, présence.
 * Les opérations d'un document sont traitées une par une (file) : l'ordre des révisions
 * est garanti même avec les écritures asynchrones en base.
 */
export class Room {
	readonly sessions = new Map<string, Session>();
	private queue: Promise<unknown> = Promise.resolve();
	private dirtySince: number | null = null;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private lastEditorId: string | undefined;

	private constructor(
		readonly documentId: string,
		private readonly document: ServerDocument,
	) {}

	static async load(documentId: string) {
		const stored = await loadDocument(documentId);
		const document = new ServerDocument(stored.text, stored.revision);
		// Opérations journalisées après le dernier instantané (arrêt brutal) : on les rejoue.
		for (const entry of stored.replay)
			document.receive(document.revision, entry.id, entry.operation);
		const room = new Room(documentId, document);
		if (stored.replay.length > 0) room.markDirty();
		return room;
	}

	/** Exécute les traitements d'un document l'un après l'autre. */
	private serialize<T>(task: () => Promise<T>): Promise<T> {
		const run = this.queue.then(task, task);
		this.queue = run.catch(() => {});
		return run;
	}

	private broadcast(message: CollabServerMessage, except?: Session) {
		for (const session of this.sessions.values()) if (session !== except) session.send(message);
	}

	/** Historique disponible depuis `since` (chargé en base si trop ancien pour la mémoire). */
	private async ensureHistory(since: number) {
		const oldest = this.document.oldestRevisionInMemory;
		if (since >= oldest) return;
		this.document.prependHistory(await loadOperations(this.documentId, since, oldest + 1), since);
	}

	join(session: Session, since: number | null) {
		return this.serialize(async () => {
			this.sessions.set(session.id, session);
			const peers = [...this.sessions.values()].filter((s) => s !== session).map((s) => s.peer);
			const base = {
				type: "ready",
				sessionId: session.id,
				revision: this.document.revision,
				readOnly: session.readOnly,
				peers,
			} as const;
			if (since !== null && since <= this.document.revision) {
				await this.ensureHistory(since);
				const operations = this.document
					.operationsSince(since)
					.map(({ id, operation }) => ({ id, operation: operation.toJSON() }));
				session.send({ ...base, operations });
			} else {
				session.send({ ...base, text: this.document.text });
			}
			this.broadcast({ type: "peer", peer: session.peer }, session);
		});
	}

	leave(session: Session) {
		if (!this.sessions.delete(session.id)) return;
		this.broadcast({ type: "peer-left", sessionId: session.id });
	}

	get isEmpty() {
		return this.sessions.size === 0;
	}

	handle(session: Session, message: CollabClientMessage) {
		switch (message.type) {
			case "op":
				return this.serialize(() => this.applyOperation(session, message));
			case "selection":
				session.selection = message.selection
					? { ...message.selection, revision: message.revision }
					: null;
				this.broadcast({ type: "peer", peer: session.peer }, session);
				return;
			case "ping":
				session.send({ type: "pong" });
				return;
		}
	}

	private async applyOperation(
		session: Session,
		message: Extract<CollabClientMessage, { type: "op" }>,
	) {
		if (session.readOnly) {
			session.send({ type: "error", code: "forbidden", message: "Document en lecture seule" });
			return;
		}
		let result: ReturnType<ServerDocument["receive"]>;
		try {
			await this.ensureHistory(message.revision);
			result = this.document.receive(
				message.revision,
				message.id,
				TextOperation.fromJSON(message.operation),
			);
		} catch {
			// Opération incompatible avec le texte : le client repart d'un état propre.
			session.send({
				type: "error",
				code: "desync",
				message: "Désynchronisé, rechargement du document",
			});
			session.socket.close(4009, "desync");
			return;
		}
		if (result.kind === "duplicate") {
			session.send({ type: "ack", id: message.id, revision: result.revision });
			return;
		}
		// Journalisée avant l'accusé : une frappe confirmée n'est jamais perdue.
		await appendOperation(
			this.documentId,
			result.revision,
			{ id: message.id, operation: result.operation },
			session.userId,
		);
		session.send({ type: "ack", id: message.id, revision: result.revision });
		this.broadcast(
			{
				type: "op",
				id: message.id,
				revision: result.revision,
				operation: result.operation.toJSON(),
				sessionId: session.id,
			},
			session,
		);
		this.lastEditorId = session.userId;
		this.document.trimHistory(HISTORY_IN_MEMORY);
		this.markDirty();
	}

	// --- Sauvegarde de l'instantané -------------------------------------------------------

	private markDirty() {
		const now = Date.now();
		this.dirtySince ??= now;
		if (this.saveTimer) clearTimeout(this.saveTimer);
		const delay = Math.max(0, Math.min(SAVE_DEBOUNCE, this.dirtySince + SAVE_MAX_DELAY - now));
		this.saveTimer = setTimeout(() => void this.save(), delay);
	}

	/** Enregistre l'instantané (texte, révision, mots, dernier éditeur) s'il a changé. */
	save() {
		return this.serialize(async () => {
			if (this.saveTimer) clearTimeout(this.saveTimer);
			this.saveTimer = null;
			if (this.dirtySince === null) return;
			this.dirtySince = null;
			await saveSnapshot(
				this.documentId,
				this.document.text,
				this.document.revision,
				this.lastEditorId,
			);
		});
	}
}
