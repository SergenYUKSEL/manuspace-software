import { TextOperation } from "../src/ot/text-operation";

/** Générateur pseudo-aléatoire à graine (mulberry32) : tests reproductibles. */
export function seeded(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const ALPHABET = "abcdeéèà \n*#".split("");

export function randomString(rand: () => number, max = 20) {
	const length = Math.floor(rand() * max);
	return Array.from({ length }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join("");
}

/** Opération aléatoire valide sur `text`. */
export function randomOperation(rand: () => number, text: string) {
	const op = new TextOperation();
	let left = text.length;
	while (left > 0) {
		const n = 1 + Math.floor(rand() * Math.min(left, 5));
		const r = rand();
		if (r < 0.2) op.insert(randomString(rand, 5));
		if (r < 0.5) op.retain(n);
		else op.delete(n);
		left -= n;
	}
	if (rand() < 0.3) op.insert(randomString(rand, 5));
	return op;
}
