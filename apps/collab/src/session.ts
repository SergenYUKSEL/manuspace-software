import type { CollabServerMessage, PeerState } from "@manuspace/shared";
import type { ServerWebSocket } from "bun";

/** Une connexion WebSocket authentifiée sur un document (un onglet). */
export class Session {
	readonly id = crypto.randomUUID();
	selection: PeerState["selection"] = null;

	constructor(
		readonly socket: ServerWebSocket<unknown>,
		readonly userId: string,
		readonly name: string,
		readonly color: string,
		readonly readOnly: boolean,
	) {}

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
		};
	}
}
