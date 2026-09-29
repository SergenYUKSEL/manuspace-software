import { TextOperation } from "./text-operation";

export type HistoryEntry = { id: string; operation: TextOperation };

export type ReceiveResult =
	/** Opération nouvelle, transformée et appliquée : elle devient la révision `revision`. */
	| { kind: "applied"; operation: TextOperation; revision: number }
	/** Déjà appliquée (renvoi après une coupure) : on se contente de reconfirmer. */
	| { kind: "duplicate"; revision: number };

/**
 * Autorité centrale d'un document : le texte de référence, sa révision et l'historique des
 * opérations (révision n = historique[n - 1]). Le serveur collab l'entoure de la persistance.
 * `historyStart` : révision à partir de laquelle l'historique est en mémoire.
 */
export class ServerDocument {
	constructor(
		public text: string,
		public revision: number,
		private history: HistoryEntry[] = [],
		private historyStart = revision - history.length,
	) {}

	/** Opérations appliquées après la révision `since` (rattrapage d'un client). */
	operationsSince(since: number): HistoryEntry[] {
		if (since < this.historyStart) throw new Error("Historique antérieur non chargé");
		return this.history.slice(since - this.historyStart);
	}

	/** Reçoit l'opération d'un client, écrite sur la révision `baseRevision`. */
	receive(baseRevision: number, id: string, operation: TextOperation): ReceiveResult {
		const index = this.history.findIndex((entry) => entry.id === id);
		if (index !== -1) return { kind: "duplicate", revision: this.historyStart + index + 1 };
		if (!Number.isInteger(baseRevision) || baseRevision > this.revision || baseRevision < 0) {
			throw new Error("Révision de base invalide");
		}
		let transformed = operation;
		for (const entry of this.operationsSince(baseRevision)) {
			[transformed] = TextOperation.transform(transformed, entry.operation);
		}
		// Lève une erreur si l'opération ne correspond pas au texte (client désynchronisé).
		this.text = transformed.apply(this.text);
		this.history.push({ id, operation: transformed });
		this.revision++;
		return { kind: "applied", operation: transformed, revision: this.revision };
	}

	/** Oublie l'historique ancien (mémoire), en gardant les `keep` dernières opérations. */
	trimHistory(keep: number) {
		const drop = Math.max(0, this.history.length - keep);
		this.history = this.history.slice(drop);
		this.historyStart += drop;
	}

	/** Ajoute en tête un historique plus ancien chargé depuis la base. */
	prependHistory(entries: HistoryEntry[], from: number) {
		if (from + entries.length !== this.historyStart) throw new Error("Historique non contigu");
		this.history = [...entries, ...this.history];
		this.historyStart = from;
	}

	get oldestRevisionInMemory() {
		return this.historyStart;
	}
}
