import type { CollabServerMessage, PeerState } from "@manuspace/shared";
import type { ServerWebSocket } from "bun";

/** Une connexion WebSocket authentifiée sur un document (un onglet). */
export class Session {
	readonly id = crypto.randomUUID();
	selection: PeerState["selection"] = null;
	call: PeerState["call"] = null;

	constructor(
		readonly socket: ServerWebSocket<unknown>,
		readonly userId: string,
		readonly name: string,
		readonly color: string,
		readonly readOnly: boolean,
	) {}

	private chatTimes: number[] = [];

	/** Fenêtre glissante : vrai si ce message reste sous la limite (anti-inondation). */
	allowChatMessage(limit: number, windowMs: number) {
		const now = Date.now();
		this.chatTimes = this.chatTimes.filter((t) => now - t < windowMs);
		if (this.chatTimes.length >= limit) return false;
		this.chatTimes.push(now);
		return true;
	}

	send(message: CollabServerMessage) {
		this.socket.send(JSON.stringify(message));
	}

	get peer(): PeerState {
		return {
			sessionId: this.id,
			userId: this.userId,
			name: this.name,
			color: this.color,
			selection: this.selection,
			call: this.call,
		};
	}
}
