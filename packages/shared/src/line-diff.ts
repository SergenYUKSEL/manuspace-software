/**
 * Comparaison de deux textes paragraphe par paragraphe (plus longue sous-séquence commune sur
 * les lignes), pour afficher ce qu'une version ajoute ou retire par rapport à une autre.
 */
export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

/** Au-delà, le tableau de programmation dynamique serait trop coûteux : pas de comparaison fine. */
const MAX_CELLS = 4_000_000;

export function diffLines(before: string, after: string): DiffLine[] {
	const a = before.split("\n");
	const b = after.split("\n");
	if (a.length * b.length > MAX_CELLS) {
		return [
			...a.map((text) => ({ kind: "removed" as const, text })),
			...b.map((text) => ({ kind: "added" as const, text })),
		];
	}
	// lcs[i][j] = longueur de la plus longue sous-séquence commune de a[i..] et b[j..].
	const width = b.length + 1;
	const lcs = new Uint32Array((a.length + 1) * width);
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			lcs[i * width + j] =
				a[i] === b[j]
					? (lcs[(i + 1) * width + j + 1] as number) + 1
					: Math.max(lcs[(i + 1) * width + j] as number, lcs[i * width + j + 1] as number);
		}
	}
	const result: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			result.push({ kind: "same", text: a[i] as string });
			i++;
			j++;
		} else if ((lcs[(i + 1) * width + j] as number) >= (lcs[i * width + j + 1] as number)) {
			result.push({ kind: "removed", text: a[i++] as string });
		} else {
			result.push({ kind: "added", text: b[j++] as string });
		}
	}
	while (i < a.length) result.push({ kind: "removed", text: a[i++] as string });
	while (j < b.length) result.push({ kind: "added", text: b[j++] as string });
	return result;
}
