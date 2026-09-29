/**
 * Opération sur un texte, au sens de la transformation opérationnelle (OT).
 *
 * Une opération parcourt tout le document d'origine avec trois types de composants :
 * - entier positif n : conserver n caractères ;
 * - entier négatif -n : supprimer n caractères ;
 * - chaîne s : insérer s.
 * Exemple : sur « Méduse dort », [7, "s'éveille", -4] donne « Méduse s'éveille ».
 *
 * Les longueurs sont en unités UTF-16 (comme String.length et les sélections d'un textarea).
 */
export type Component = number | string;

const isRetain = (c: Component | undefined): c is number => typeof c === "number" && c > 0;
const isDelete = (c: Component | undefined): c is number => typeof c === "number" && c < 0;
const isInsert = (c: Component | undefined): c is string => typeof c === "string";

export class TextOperation {
	readonly ops: Component[] = [];
	/** Longueur du texte auquel l'opération s'applique. */
	baseLength = 0;
	/** Longueur du texte obtenu. */
	targetLength = 0;

	retain(n: number): this {
		if (!Number.isInteger(n) || n < 0) throw new Error("retain : entier positif attendu");
		if (n === 0) return this;
		this.baseLength += n;
		this.targetLength += n;
		const last = this.ops.at(-1);
		if (isRetain(last)) this.ops[this.ops.length - 1] = last + n;
		else this.ops.push(n);
		return this;
	}

	insert(text: string): this {
		if (text === "") return this;
		this.targetLength += text.length;
		const last = this.ops.at(-1);
		if (isInsert(last)) {
			this.ops[this.ops.length - 1] = last + text;
		} else if (isDelete(last)) {
			// Forme canonique : l'insertion précède toujours la suppression au même endroit.
			const beforeLast = this.ops.at(-2);
			if (isInsert(beforeLast)) this.ops[this.ops.length - 2] = beforeLast + text;
			else this.ops.splice(this.ops.length - 1, 0, text);
		} else {
			this.ops.push(text);
		}
		return this;
	}

	delete(n: number): this {
		const count = Math.abs(n);
		if (!Number.isInteger(count)) throw new Error("delete : entier attendu");
		if (count === 0) return this;
		this.baseLength += count;
		const last = this.ops.at(-1);
		if (isDelete(last)) this.ops[this.ops.length - 1] = last - count;
		else this.ops.push(-count);
		return this;
	}

	/** Vrai si l'opération ne change rien (uniquement des « conserver »). */
	isNoop(): boolean {
		return this.ops.length === 0 || (this.ops.length === 1 && isRetain(this.ops[0]));
	}

	/** Applique l'opération au texte. */
	apply(text: string): string {
		if (text.length !== this.baseLength) {
			throw new Error(`apply : longueur ${text.length}, attendue ${this.baseLength}`);
		}
		const parts: string[] = [];
		let index = 0;
		for (const c of this.ops) {
			if (isRetain(c)) {
				parts.push(text.slice(index, index + c));
				index += c;
			} else if (isInsert(c)) {
				parts.push(c);
			} else {
				index -= c;
			}
		}
		return parts.join("");
	}

	/** Opération inverse (annulation) : appliquée au résultat, elle redonne `text`. */
	invert(text: string): TextOperation {
		const inverse = new TextOperation();
		let index = 0;
		for (const c of this.ops) {
			if (isRetain(c)) {
				inverse.retain(c);
				index += c;
			} else if (isInsert(c)) {
				inverse.delete(c.length);
			} else {
				inverse.insert(text.slice(index, index - c));
				index -= c;
			}
		}
		return inverse;
	}

	/**
	 * Composition : une seule opération équivalente à `this` puis `other`.
	 * apply(apply(s, a), b) === apply(s, a.compose(b)).
	 */
	compose(other: TextOperation): TextOperation {
		if (this.targetLength !== other.baseLength) {
			throw new Error("compose : la seconde opération ne suit pas la première");
		}
		const result = new TextOperation();
		const a = [...this.ops];
		const b = [...other.ops];
		let i = 0;
		let j = 0;
		let opA = a[i++];
		let opB = b[j++];
		while (opA !== undefined || opB !== undefined) {
			if (isDelete(opA)) {
				result.delete(opA);
				opA = a[i++];
				continue;
			}
			if (isInsert(opB)) {
				result.insert(opB);
				opB = b[j++];
				continue;
			}
			if (opA === undefined || opB === undefined)
				throw new Error("compose : opérations incohérentes");

			if (isRetain(opA) && isRetain(opB)) {
				const n = Math.min(opA, opB);
				result.retain(n);
				[opA, i] = opA > n ? [opA - n, i] : [a[i], i + 1];
				[opB, j] = opB > n ? [opB - n, j] : [b[j], j + 1];
			} else if (isInsert(opA) && isDelete(opB)) {
				const n = Math.min(opA.length, -opB);
				[opA, i] = opA.length > n ? [opA.slice(n), i] : [a[i], i + 1];
				[opB, j] = -opB > n ? [opB + n, j] : [b[j], j + 1];
			} else if (isInsert(opA) && isRetain(opB)) {
				const n = Math.min(opA.length, opB);
				result.insert(opA.slice(0, n));
				[opA, i] = opA.length > n ? [opA.slice(n), i] : [a[i], i + 1];
				[opB, j] = opB > n ? [opB - n, j] : [b[j], j + 1];
			} else if (isRetain(opA) && isDelete(opB)) {
				const n = Math.min(opA, -opB);
				result.delete(n);
				[opA, i] = opA > n ? [opA - n, i] : [a[i], i + 1];
				[opB, j] = -opB > n ? [opB + n, j] : [b[j], j + 1];
			} else {
				throw new Error("compose : combinaison inattendue");
			}
		}
		return result;
	}

	/**
	 * Transformation : deux opérations concurrentes a et b (même texte de départ) donnent
	 * [a', b'] tels que apply(apply(s, a), b') === apply(apply(s, b), a').
	 * À position d'insertion égale, l'insertion de `a` passe avant celle de `b`.
	 */
	static transform(a: TextOperation, b: TextOperation): [TextOperation, TextOperation] {
		if (a.baseLength !== b.baseLength) {
			throw new Error("transform : opérations sur des textes différents");
		}
		const aPrime = new TextOperation();
		const bPrime = new TextOperation();
		const opsA = [...a.ops];
		const opsB = [...b.ops];
		let i = 0;
		let j = 0;
		let opA = opsA[i++];
		let opB = opsB[j++];
		while (opA !== undefined || opB !== undefined) {
			if (isInsert(opA)) {
				aPrime.insert(opA);
				bPrime.retain(opA.length);
				opA = opsA[i++];
				continue;
			}
			if (isInsert(opB)) {
				aPrime.retain(opB.length);
				bPrime.insert(opB);
				opB = opsB[j++];
				continue;
			}
			if (opA === undefined || opB === undefined)
				throw new Error("transform : opérations incohérentes");

			if (isRetain(opA) && isRetain(opB)) {
				const n = Math.min(opA, opB);
				aPrime.retain(n);
				bPrime.retain(n);
				[opA, i] = opA > n ? [opA - n, i] : [opsA[i], i + 1];
				[opB, j] = opB > n ? [opB - n, j] : [opsB[j], j + 1];
			} else if (isDelete(opA) && isDelete(opB)) {
				// Les deux suppriment les mêmes caractères : rien à reporter.
				const n = Math.min(-opA, -opB);
				[opA, i] = -opA > n ? [opA + n, i] : [opsA[i], i + 1];
				[opB, j] = -opB > n ? [opB + n, j] : [opsB[j], j + 1];
			} else if (isDelete(opA) && isRetain(opB)) {
				const n = Math.min(-opA, opB);
				aPrime.delete(n);
				[opA, i] = -opA > n ? [opA + n, i] : [opsA[i], i + 1];
				[opB, j] = opB > n ? [opB - n, j] : [opsB[j], j + 1];
			} else if (isRetain(opA) && isDelete(opB)) {
				const n = Math.min(opA, -opB);
				bPrime.delete(n);
				[opA, i] = opA > n ? [opA - n, i] : [opsA[i], i + 1];
				[opB, j] = -opB > n ? [opB + n, j] : [opsB[j], j + 1];
			} else {
				throw new Error("transform : combinaison inattendue");
			}
		}
		return [aPrime, bPrime];
	}

	/**
	 * Nouvelle position d'un curseur (ou d'une borne de sélection) après l'opération.
	 * Une insertion exactement à la position du curseur le décale vers la droite.
	 */
	transformIndex(index: number): number {
		let remaining = index;
		let newIndex = index;
		for (const c of this.ops) {
			if (isRetain(c)) {
				remaining -= c;
			} else if (isInsert(c)) {
				newIndex += c.length;
			} else {
				newIndex -= Math.min(remaining, -c);
				remaining += c;
			}
			if (remaining < 0) break;
		}
		return newIndex;
	}

	toJSON(): Component[] {
		return this.ops;
	}

	static fromJSON(ops: readonly Component[]): TextOperation {
		const op = new TextOperation();
		for (const c of ops) {
			if (isRetain(c)) op.retain(c);
			else if (isDelete(c)) op.delete(c);
			else if (isInsert(c)) op.insert(c);
			else throw new Error("fromJSON : composant invalide");
		}
		return op;
	}

	/** Opération minimale qui transforme `before` en `after` (une seule zone modifiée). */
	static fromDiff(before: string, after: string, cursorHint?: number): TextOperation {
		let start = 0;
		const maxStart = Math.min(before.length, after.length);
		while (start < maxStart && before[start] === after[start]) start++;
		let endBefore = before.length;
		let endAfter = after.length;
		while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
			endBefore--;
			endAfter--;
		}
		// Insertion ambiguë (« aa » → « aaa ») : on la place pour qu'elle finisse au curseur de
		// l'auteur, ce qui donne la bonne position aux curseurs des autres et à l'annulation.
		if (cursorHint !== undefined && endBefore === start) {
			while (start > 0 && endAfter > cursorHint && before[start - 1] === after[endAfter - 1]) {
				start--;
				endBefore--;
				endAfter--;
			}
		}
		// Ne jamais couper une paire de substitution UTF-16 (émojis) en deux.
		if (start > 0 && isHighSurrogate(before.charCodeAt(start - 1))) start--;
		if (endBefore < before.length && isLowSurrogate(before.charCodeAt(endBefore))) {
			endBefore++;
			endAfter++;
		}
		return new TextOperation()
			.retain(start)
			.delete(endBefore - start)
			.insert(after.slice(start, endAfter))
			.retain(before.length - endBefore);
	}
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
