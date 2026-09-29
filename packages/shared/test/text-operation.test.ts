import { describe, expect, test } from "bun:test";
import { TextOperation } from "../src/ot/text-operation";
import { randomOperation, randomString, seeded } from "./random";

const ROUNDS = 2000;

describe("TextOperation : exemples", () => {
	test("apply : conserver, insérer, supprimer", () => {
		const op = new TextOperation().retain(7).insert("s'éveille").delete(4);
		expect(op.apply("Méduse dort")).toBe("Méduse s'éveille");
		expect(op.baseLength).toBe(11);
		expect(op.targetLength).toBe(16);
	});

	test("apply refuse un texte de mauvaise longueur", () => {
		expect(() => new TextOperation().retain(3).apply("ab")).toThrow();
	});

	test("forme canonique : composants fusionnés, insertion avant suppression", () => {
		const op = new TextOperation().retain(1).retain(2).delete(1).insert("x").insert("y").delete(2);
		expect(op.ops).toEqual([3, "xy", -3]);
	});

	test("transform : insertions concurrentes au même endroit, ordre déterministe", () => {
		const a = new TextOperation().retain(3).insert("A");
		const b = new TextOperation().retain(3).insert("B");
		const [aPrime, bPrime] = TextOperation.transform(a, b);
		expect(bPrime.apply(a.apply("abc"))).toBe("abcAB");
		expect(aPrime.apply(b.apply("abc"))).toBe("abcAB");
	});

	test("transform : suppression et insertion dans la zone supprimée", () => {
		const text = "la gorgone";
		const deleteWord = new TextOperation().retain(3).delete(7);
		const insertInside = new TextOperation().retain(5).insert("RR").retain(5);
		const [dPrime, iPrime] = TextOperation.transform(deleteWord, insertInside);
		const result = iPrime.apply(deleteWord.apply(text));
		expect(dPrime.apply(insertInside.apply(text))).toBe(result);
		expect(result).toBe("la RR");
	});

	test("transformIndex : curseur décalé par une insertion avant lui", () => {
		const op = new TextOperation().retain(2).insert("xyz").retain(5);
		expect(op.transformIndex(1)).toBe(1);
		expect(op.transformIndex(2)).toBe(5);
		expect(op.transformIndex(6)).toBe(9);
	});

	test("transformIndex : curseur dans une zone supprimée ramené au début", () => {
		const op = new TextOperation().retain(2).delete(4).retain(3);
		expect(op.transformIndex(4)).toBe(2);
		expect(op.transformIndex(8)).toBe(4);
	});

	test("fromDiff : frappe, suppression, remplacement", () => {
		for (const [before, after] of [
			["Méduse", "Méduse!"],
			["Méduse", "Mduse"],
			["la nuit", "le jour"],
			["", "abc"],
			["abc", ""],
		]) {
			expect(
				TextOperation.fromDiff(before as string, after as string).apply(before as string),
			).toBe(after as string);
		}
	});

	test("fromDiff : insertion ambiguë placée au curseur de l'auteur", () => {
		// « aa » → « aaa » en tapant un « a » en position 1 (curseur ensuite en 2).
		const op = TextOperation.fromDiff("aa", "aaa", 2);
		expect(op.ops).toEqual([1, "a", 1]);
	});

	test("fromDiff : ne coupe jamais un émoji (paire UTF-16)", () => {
		const op = TextOperation.fromDiff("x😀y", "x😁y");
		for (const c of op.ops) {
			if (typeof c === "string") expect(c).toBe("😁");
		}
		expect(op.apply("x😀y")).toBe("x😁y");
	});

	test("JSON aller-retour", () => {
		const op = new TextOperation().retain(2).insert("é").delete(3).retain(1);
		expect(TextOperation.fromJSON(JSON.parse(JSON.stringify(op))).ops).toEqual(op.ops);
	});
});

describe(`TextOperation : propriétés (${ROUNDS} cas aléatoires chacune)`, () => {
	test("compose équivaut à appliquer les deux opérations à la suite", () => {
		const rand = seeded(1);
		for (let i = 0; i < ROUNDS; i++) {
			const text = randomString(rand);
			const a = randomOperation(rand, text);
			const afterA = a.apply(text);
			const b = randomOperation(rand, afterA);
			expect(a.compose(b).apply(text)).toBe(b.apply(afterA));
		}
	});

	test("transform converge (TP1) : a puis b' = b puis a'", () => {
		const rand = seeded(2);
		for (let i = 0; i < ROUNDS; i++) {
			const text = randomString(rand);
			const a = randomOperation(rand, text);
			const b = randomOperation(rand, text);
			const [aPrime, bPrime] = TextOperation.transform(a, b);
			expect(bPrime.apply(a.apply(text))).toBe(aPrime.apply(b.apply(text)));
		}
	});

	test("invert annule l'opération", () => {
		const rand = seeded(3);
		for (let i = 0; i < ROUNDS; i++) {
			const text = randomString(rand);
			const op = randomOperation(rand, text);
			expect(op.invert(text).apply(op.apply(text))).toBe(text);
		}
	});

	test("fromDiff reproduit toujours la modification", () => {
		const rand = seeded(4);
		for (let i = 0; i < ROUNDS; i++) {
			const before = randomString(rand);
			const after = randomOperation(rand, before).apply(before);
			expect(TextOperation.fromDiff(before, after).apply(before)).toBe(after);
		}
	});
});
