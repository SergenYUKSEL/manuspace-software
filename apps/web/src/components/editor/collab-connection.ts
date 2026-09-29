import {
	type CollabClientMessage,
	type CollabServerMessage,
	OTClient,
	type PeerState,
	type Selection,
	TextOperation,
} from "@manuspace/shared";
import { readOfflineDocument, writeOfflineDocument } from "@/lib/offline";

export type ConnectionStatus = "connecting" | "connected" | "offline";

export type ConnectionSnapshot = {
	status: ConnectionStatus;
	/** Texte disponible (serveur ou copie locale) : l'éditeur peut s'afficher. */
	loaded: boolean;
	readOnly: boolean;
	/** Modifications locales pas encore confirmées par le serveur. */
	unconfirmed: boolean;
	sessionId: string | null;
	peers: PeerState[];
	error: string | null;
};

type RemoteListener = (operation: TextOperation) => void;

/** Ping régulier ; sans aucun message du serveur pendant SILENCE_LIMIT, la connexion est morte. */
const PING_INTERVAL = 10_000;
const SILENCE_LIMIT = 25_000;
const MAX_RECONNECT_DELAY = 5_000;
/** Opérations du serveur gardées pour replacer les curseurs des autres (révisions récentes). */
const RECENT_OPERATIONS = 200;

/**
 * Connexion d'un document au serveur collab (WebSocket maison) : client OT, copie hors ligne,
 * présence et transport de l'appel. Indépendante de React (voir useCollabDocument).
 */
export class CollabConnection {
	text = "";
	private ot: OTClient | null = null;
	private socket: WebSocket | null = null;
	private destroyed = false;
	private attempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private persistTimer: ReturnType<typeof setTimeout> | null = null;
	/** Opérations du serveur (révision → opération) pour transposer les sélections des autres. */
	private recent: { revision: number; operation: TextOperation }[] = [];
	private pendingSelection: Selection | null | undefined;
	private lastMessageAt = 0;
	private snapshot: ConnectionSnapshot = {
		status: "connecting",
		loaded: false,
		readOnly: false,
		unconfirmed: false,
		sessionId: null,
		peers: [],
		error: null,
	};
	private readonly listeners = new Set<() => void>();
	private readonly remoteListeners = new Set<RemoteListener>();

	constructor(
		readonly documentId: string,
		private readonly url: string,
		private readonly getTicket: () => Promise<string>,
	) {}

	// --- Abonnements (React : useSyncExternalStore) ---------------------------------------

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	getSnapshot = () => this.snapshot;

	/** Opérations des autres appliquées au texte (l'éditeur met à jour la zone de texte). */
	onRemote(listener: RemoteListener) {
		this.remoteListeners.add(listener);
		return () => {
			this.remoteListeners.delete(listener);
		};
	}

	private update(patch: Partial<ConnectionSnapshot>) {
		this.snapshot = { ...this.snapshot, ...patch };
		for (const listener of this.listeners) listener();
	}

	// --- Cycle de vie ---------------------------------------------------------------------

	async start() {
		const cached = await readOfflineDocument(this.documentId);
		if (this.destroyed) return;
		if (cached) {
			this.text = cached.text;
			this.ot = this.createClient(cached.revision);
			this.ot.restore(
				cached.outstanding
					? {
							id: cached.outstanding.id,
							operation: TextOperation.fromJSON(cached.outstanding.operation),
						}
					: null,
				cached.buffer ? TextOperation.fromJSON(cached.buffer) : null,
			);
			this.update({ loaded: true, unconfirmed: this.ot.status !== "synchronized" });
		}
		this.connect();
		window.addEventListener("online", this.reconnectNow);
		window.addEventListener("offline", this.dropConnection);
	}

	destroy() {
		this.destroyed = true;
		window.removeEventListener("online", this.reconnectNow);
		window.removeEventListener("offline", this.dropConnection);
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		if (this.pingTimer) clearInterval(this.pingTimer);
		if (this.persistTimer) {
			clearTimeout(this.persistTimer);
			void this.persist();
		}
		this.socket?.close();
	}

	/** Réseau perdu (événement du navigateur) : inutile d'attendre que le WebSocket s'en aperçoive. */
	private dropConnection = () => {
		this.socket?.close();
	};

	private reconnectNow = () => {
		if (this.snapshot.status !== "offline" || this.destroyed) return;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.connect();
	};

	private connect() {
		if (this.destroyed) return;
		this.update({ status: "connecting" });
		const socket = new WebSocket(this.url);
		this.socket = socket;
		socket.onopen = async () => {
			try {
				const ticket = await this.getTicket();
				this.send({ type: "hello", ticket, since: this.ot?.revision ?? null });
			} catch {
				socket.close();
			}
		};
		socket.onmessage = (event) => {
			this.lastMessageAt = Date.now();
			this.receive(JSON.parse(String(event.data)));
		};
		socket.onclose = (event) => {
			if (this.socket !== socket) return;
			this.socket = null;
			if (this.pingTimer) clearInterval(this.pingTimer);
			if (this.destroyed) return;
			this.update({ status: "offline" });
			if (event.code === 4001 || event.code === 4003) return; // Accès refusé : on n'insiste pas.
			// Reconnexion progressive : 0,5 s, 1 s, 2 s… plafonnée à 5 s.
			const delay = Math.min(MAX_RECONNECT_DELAY, 500 * 2 ** this.attempt++);
			this.reconnectTimer = setTimeout(() => this.connect(), delay);
		};
	}

	private send(message: CollabClientMessage) {
		if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
	}

	private createClient(revision: number) {
		return new OTClient(revision, {
			send: (rev, pending) =>
				this.send({
					type: "op",
					revision: rev,
					id: pending.id,
					operation: pending.operation.toJSON(),
				}),
			apply: (operation) => {
				this.text = operation.apply(this.text);
				for (const listener of this.remoteListeners) listener(operation);
			},
		});
	}

	// --- Messages du serveur --------------------------------------------------------------

	private receive(message: CollabServerMessage) {
		switch (message.type) {
			case "ready":
				return this.onReadyMessage(message);
			case "ack": {
				const outstanding = this.ot?.unconfirmed.outstanding;
				if (outstanding?.id === message.id) this.remember(message.revision, outstanding.operation);
				this.ot?.serverAck(message.id);
				this.afterChange();
				this.flushSelection();
				return;
			}
			case "op": {
				if (!this.ot || message.revision !== this.ot.revision + 1) return this.resync();
				const operation = TextOperation.fromJSON(message.operation);
				this.remember(message.revision, operation);
				this.ot.applyServer(operation);
				this.afterChange();
				return;
			}
			case "peer": {
				if (message.peer.sessionId === this.snapshot.sessionId) return;
				const others = this.snapshot.peers.filter((p) => p.sessionId !== message.peer.sessionId);
				this.update({ peers: [...others, message.peer] });
				return;
			}
			case "peer-left":
				this.update({
					peers: this.snapshot.peers.filter((p) => p.sessionId !== message.sessionId),
				});
				return;
			case "error":
				if (message.code === "unauthorized") {
					this.update({ error: "Vous n'avez plus accès à ce document, ou il a été supprimé." });
				}
				if (message.code === "desync") this.ot = null; // Repartir du texte du serveur.
				return;
			case "pong":
				return;
		}
	}

	private onReadyMessage(message: Extract<CollabServerMessage, { type: "ready" }>) {
		this.attempt = 0;
		if (message.text !== undefined) {
			// Première ouverture (ou état local inutilisable) : texte complet du serveur.
			this.text = message.text;
			this.ot = this.createClient(message.revision);
			this.recent = [];
			for (const listener of this.remoteListeners)
				listener(new TextOperation().retain(this.text.length));
		} else if (this.ot) {
			// Retour après coupure : opérations manquées, puis renvoi des nôtres.
			let revision = this.ot.revision;
			const missed = (message.operations ?? []).map(({ id, operation }) => {
				const op = TextOperation.fromJSON(operation);
				this.remember(++revision, op);
				return { id, operation: op };
			});
			this.ot.catchUp(missed);
			this.ot.resend();
		}
		if (this.pingTimer) clearInterval(this.pingTimer);
		this.pingTimer = setInterval(() => {
			// Coupure silencieuse (Wi-Fi perdu, mise en veille) : le serveur ne répond plus.
			if (Date.now() - this.lastMessageAt > SILENCE_LIMIT) this.socket?.close();
			else this.send({ type: "ping" });
		}, PING_INTERVAL);
		this.update({
			status: "connected",
			loaded: true,
			readOnly: message.readOnly,
			sessionId: message.sessionId,
			peers: message.peers,
			error: null,
		});
		this.afterChange();
	}

	/** Réponse incohérente (message perdu) : on repart proprement d'une nouvelle connexion. */
	private resync() {
		this.socket?.close();
	}

	private remember(revision: number, operation: TextOperation) {
		this.recent.push({ revision, operation });
		if (this.recent.length > RECENT_OPERATIONS) this.recent.shift();
	}

	private afterChange() {
		this.update({ unconfirmed: this.ot !== null && this.ot.status !== "synchronized" });
		if (this.persistTimer) clearTimeout(this.persistTimer);
		this.persistTimer = setTimeout(() => void this.persist(), 300);
	}

	private async persist() {
		this.persistTimer = null;
		if (!this.ot) return;
		const { outstanding, buffer } = this.ot.unconfirmed;
		await writeOfflineDocument(this.documentId, {
			revision: this.ot.revision,
			text: this.text,
			outstanding: outstanding
				? { id: outstanding.id, operation: outstanding.operation.toJSON() }
				: null,
			buffer: buffer?.toJSON() ?? null,
		});
	}

	// --- Modifications locales ------------------------------------------------------------

	/** Applique une modification locale (frappe, collage, mise en forme, annulation). */
	applyLocal(operation: TextOperation) {
		if (!this.ot || operation.isNoop() || this.snapshot.readOnly) return;
		this.text = operation.apply(this.text);
		this.ot.applyClient(operation);
		this.afterChange();
	}

	/** Sélection locale, envoyée quand tout est confirmé (positions valables pour les autres). */
	setSelection(selection: Selection | null) {
		this.pendingSelection = selection;
		this.flushSelection();
	}

	private flushSelection() {
		if (this.pendingSelection === undefined || !this.ot || this.ot.status !== "synchronized")
			return;
		this.send({ type: "selection", revision: this.ot.revision, selection: this.pendingSelection });
		this.pendingSelection = undefined;
	}

	/**
	 * Position d'un autre participant, transposée dans notre texte : rejoue les opérations du
	 * serveur survenues depuis sa révision, puis nos modifications non confirmées.
	 */
	localSelection(peer: PeerState): Selection | null {
		if (!peer.selection || !this.ot) return null;
		const { revision } = peer.selection;
		if (revision > this.ot.revision) return null;
		let { anchor, head } = peer.selection;
		for (const entry of this.recent) {
			if (entry.revision <= revision) continue;
			anchor = entry.operation.transformIndex(anchor);
			head = entry.operation.transformIndex(head);
		}
		const clamp = (n: number) =>
			Math.min(Math.max(0, this.ot?.transformIndexFromServer(n) ?? n), this.text.length);
		return { anchor: clamp(anchor), head: clamp(head) };
	}
}
