import { TextOperation } from "@manuspace/shared";

/** Frappes regroupées dans une même annulation si elles se suivent de près. */
const GROUP_DELAY = 800;

/**
 * Annuler / rétablir en collaboration : on n'annule que ses propres modifications.
 * Les inverses stockés sont transformés contre les modifications des autres, pour que
 * « Annuler » ne défasse jamais le texte d'un co-auteur arrivé entre-temps.
 */
export class UndoManager {
	private undoStack: TextOperation[] = [];
	private redoStack: TextOperation[] = [];
	private lastEdit = 0;

	/** Modification locale `operation` appliquée à `before`. */
	record(operation: TextOperation, before: string, group = true) {
		const inverse = operation.invert(before);
		const now = Date.now();
		const top = this.undoStack.at(-1);
		if (group && top && now - this.lastEdit < GROUP_DELAY) {
			// Annuler le groupe = annuler la dernière frappe puis les précédentes.
			this.undoStack[this.undoStack.length - 1] = inverse.compose(top);
		} else {
			this.undoStack.push(inverse);
			if (this.undoStack.length > 200) this.undoStack.shift();
		}
		this.lastEdit = group ? now : 0;
		this.redoStack = [];
	}

	/**
	 * Modification d'un autre : les annulations en attente sont décalées en conséquence.
	 * Le groupe en cours n'est pas coupé : ses inverses restent valables une fois transformés,
	 * donc une frappe simultanée d'un co-auteur ne fragmente pas notre annulation.
	 */
	transform(remote: TextOperation) {
		this.undoStack = transformStack(this.undoStack, remote);
		this.redoStack = transformStack(this.redoStack, remote);
	}

	/** Le curseur a été déplacé (clic, flèches) : la prochaine frappe ouvre un nouveau groupe. */
	breakGroup() {
		this.lastEdit = 0;
	}

	/** Opération à appliquer pour annuler (et à enregistrer pour rétablir). */
	undo(text: string): TextOperation | null {
		const operation = this.undoStack.pop();
		if (!operation) return null;
		this.redoStack.push(operation.invert(text));
		this.lastEdit = 0;
		return operation;
	}

	redo(text: string): TextOperation | null {
		const operation = this.redoStack.pop();
		if (!operation) return null;
		this.undoStack.push(operation.invert(text));
		this.lastEdit = 0;
		return operation;
	}
}

/** Pile d'opérations (la dernière s'applique au texte courant) transformée contre `op`. */
function transformStack(stack: TextOperation[], op: TextOperation) {
	const result: TextOperation[] = [];
	let current = op;
	for (let i = stack.length - 1; i >= 0; i--) {
		const [item, next] = TextOperation.transform(stack[i] as TextOperation, current);
		if (!item.isNoop()) result.push(item);
		current = next;
	}
	return result.reverse();
}
