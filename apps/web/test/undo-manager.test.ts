import { describe, expect, test } from "bun:test";
import { TextOperation } from "@manuspace/shared";
import { UndoManager } from "../src/components/editor/undo-manager";

/** Simule une frappe locale : applique l'opération et l'enregistre pour l'annulation. */
function type(undo: UndoManager, text: string, at: number, insert: string) {
	const op = new TextOperation()
		.retain(at)
		.insert(insert)
		.retain(text.length - at);
	undo.record(op, text);
	return op.apply(text);
}

/** Simule une frappe d'un co-auteur : appliquée et transmise au gestionnaire. */
function remote(undo: UndoManager, text: string, at: number, insert: string) {
	const op = new TextOperation()
		.retain(at)
		.insert(insert)
		.retain(text.length - at);
	undo.transform(op);
	return op.apply(text);
}

describe("annulation collaborative", () => {
	test("annule ses propres frappes, jamais celles du co-auteur", () => {
		const undo = new UndoManager();
		let text = "Il était une fois.";
		text = type(undo, text, text.length, " Méduse");
		text = remote(undo, text, 0, "Prologue — ");
		const inverse = undo.undo(text) as TextOperation;
		expect(inverse.apply(text)).toBe("Prologue — Il était une fois.");
	});

	test("frappe entrecoupée de celles d'un co-auteur : un seul groupe annulé", () => {
		const undo = new UndoManager();
		let text = "abc";
		for (const [i, char] of [..." Méduse"].entries()) {
			text = type(undo, text, text.length, char);
			if (i % 2 === 0) text = remote(undo, text, 0, "x");
		}
		const inverse = undo.undo(text) as TextOperation;
		expect(inverse.apply(text)).toBe("xxxxabc");
	});

	test("déplacement du curseur : nouvelle frappe, nouveau groupe", () => {
		const undo = new UndoManager();
		let text = type(undo, "", 0, "Il était une fois.");
		undo.breakGroup();
		text = type(undo, text, text.length, " Méduse");
		expect((undo.undo(text) as TextOperation).apply(text)).toBe("Il était une fois.");
	});

	test("rétablir refait la modification annulée", () => {
		const undo = new UndoManager();
		let text = type(undo, "Méduse", 6, " dort");
		text = (undo.undo(text) as TextOperation).apply(text);
		expect(text).toBe("Méduse");
		text = (undo.redo(text) as TextOperation).apply(text);
		expect(text).toBe("Méduse dort");
	});
});
