import { TextOperation } from "./text-operation";

/** Opération envoyée au serveur, identifiée pour être reconnue même après une coupure. */
export type PendingOperation = { id: string; operation: TextOperation };

type State =
	/** Tout est confirmé par le serveur. */
	| { name: "synchronized" }
	/** Une opération est partie, on attend l'accusé de réception. */
	| { name: "awaiting"; outstanding: PendingOperation }
	/** Une opération attend son accusé, et d'autres frappes s'accumulent dans le tampon. */
	| { name: "buffering"; outstanding: PendingOperation; buffer: TextOperation };

export type ClientCallbacks = {
	/** Envoie une opération au serveur, basée sur la révision `revision`. */
	send: (revision: number, pending: PendingOperation) => void;
	/** Applique au texte local une opération venue des autres (déjà transformée). */
	apply: (operation: TextOperation) => void;
};

/**
 * Client OT à autorité centrale : une seule opération en vol à la fois.
 * Tant que le serveur n'a pas confirmé, les frappes suivantes sont composées dans un tampon ;
 * les opérations des autres sont transformées contre ce qui n'est pas encore confirmé.
 * Le serveur transforme de son côté l'opération reçue contre celles appliquées entre-temps,
 * avec le même ordre (opération du client en premier) : tout le monde converge.
 */
export class OTClient {
	private state: State = { name: "synchronized" };

	constructor(
		/** Numéro de la dernière opération du serveur intégrée localement. */
		public revision: number,
		private readonly callbacks: ClientCallbacks,
		private readonly newId: () => string = () => crypto.randomUUID(),
	) {}

	get status() {
		return this.state.name;
	}

	/** Opérations locales pas encore confirmées (pour la sauvegarde hors ligne). */
	get unconfirmed(): { outstanding: PendingOperation | null; buffer: TextOperation | null } {
		if (this.state.name === "synchronized") return { outstanding: null, buffer: null };
		return {
			outstanding: this.state.outstanding,
			buffer: this.state.name === "buffering" ? this.state.buffer : null,
		};
	}

	/** Modification locale (frappe, collage, annulation…). */
	applyClient(operation: TextOperation) {
		if (operation.isNoop()) return;
		switch (this.state.name) {
			case "synchronized": {
				const outstanding = { id: this.newId(), operation };
				this.callbacks.send(this.revision, outstanding);
				this.state = { name: "awaiting", outstanding };
				return;
			}
			case "awaiting":
				this.state = { ...this.state, name: "buffering", buffer: operation };
				return;
			case "buffering":
				this.state = { ...this.state, buffer: this.state.buffer.compose(operation) };
				return;
		}
	}

	/** Opération d'un autre utilisateur, reçue du serveur (révision + 1). */
	applyServer(operation: TextOperation) {
		this.revision++;
		switch (this.state.name) {
			case "synchronized":
				this.callbacks.apply(operation);
				return;
			case "awaiting": {
				const [outstanding, incoming] = TextOperation.transform(
					this.state.outstanding.operation,
					operation,
				);
				this.state = {
					...this.state,
					outstanding: { ...this.state.outstanding, operation: outstanding },
				};
				this.callbacks.apply(incoming);
				return;
			}
			case "buffering": {
				const [outstanding, afterOutstanding] = TextOperation.transform(
					this.state.outstanding.operation,
					operation,
				);
				const [buffer, incoming] = TextOperation.transform(this.state.buffer, afterOutstanding);
				this.state = {
					name: "buffering",
					outstanding: { ...this.state.outstanding, operation: outstanding },
					buffer,
				};
				this.callbacks.apply(incoming);
				return;
			}
		}
	}

	/** Le serveur confirme l'opération en vol (révision + 1). */
	serverAck(id: string) {
		if (this.state.name === "synchronized" || this.state.outstanding.id !== id) return;
		this.revision++;
		if (this.state.name === "awaiting") {
			this.state = { name: "synchronized" };
			return;
		}
		const outstanding = { id: this.newId(), operation: this.state.buffer };
		this.callbacks.send(this.revision, outstanding);
		this.state = { name: "awaiting", outstanding };
	}

	/**
	 * Rattrapage après (re)connexion : opérations du serveur manquées, dans l'ordre.
	 * Notre propre opération en vol peut y figurer (confirmée juste avant la coupure) :
	 * reconnue à son identifiant, elle vaut accusé de réception et n'est pas réappliquée.
	 */
	catchUp(operations: { id: string; operation: TextOperation }[]) {
		for (const { id, operation } of operations) {
			if (this.state.name !== "synchronized" && this.state.outstanding.id === id)
				this.serverAck(id);
			else this.applyServer(operation);
		}
	}

	/** Après reconnexion et rattrapage : renvoie l'opération en vol (même identifiant). */
	resend() {
		if (this.state.name !== "synchronized")
			this.callbacks.send(this.revision, this.state.outstanding);
	}

	/** Restaure des opérations non confirmées sauvegardées localement (rechargement hors ligne). */
	restore(outstanding: PendingOperation | null, buffer: TextOperation | null) {
		if (!outstanding) return;
		this.state = buffer
			? { name: "buffering", outstanding, buffer }
			: { name: "awaiting", outstanding };
	}

	/**
	 * Transforme une position reçue d'un autre (relative au texte du serveur) en position
	 * dans notre texte local, qui inclut nos modifications non confirmées.
	 */
	transformIndexFromServer(index: number): number {
		if (this.state.name === "synchronized") return index;
		let result = this.state.outstanding.operation.transformIndex(index);
		if (this.state.name === "buffering") result = this.state.buffer.transformIndex(result);
		return result;
	}
}
