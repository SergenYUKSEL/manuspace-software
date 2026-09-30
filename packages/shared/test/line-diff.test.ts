import { describe, expect, test } from "bun:test";
import { diffLines } from "../src/line-diff";

describe("comparaison par paragraphe", () => {
	test("ajout, suppression et paragraphes inchangés", () => {
		expect(
			diffLines("# L'éveil\nMéduse dort.\nFin.", "# L'éveil\nMéduse s'éveille.\nFin.\nÉpilogue."),
		).toEqual([
			{ kind: "same", text: "# L'éveil" },
			{ kind: "removed", text: "Méduse dort." },
			{ kind: "added", text: "Méduse s'éveille." },
			{ kind: "same", text: "Fin." },
			{ kind: "added", text: "Épilogue." },
		]);
	});

	test("textes identiques : aucune différence", () => {
		expect(diffLines("a\nb", "a\nb").every((l) => l.kind === "same")).toBe(true);
	});

	test("reconstitue les deux textes", () => {
		const before = "un\ndeux\ntrois\nquatre";
		const after = "zéro\nun\ntrois\nquatre\ncinq";
		const diff = diffLines(before, after);
		expect(
			diff
				.filter((l) => l.kind !== "added")
				.map((l) => l.text)
				.join("\n"),
		).toBe(before);
		expect(
			diff
				.filter((l) => l.kind !== "removed")
				.map((l) => l.text)
				.join("\n"),
		).toBe(after);
	});
});
