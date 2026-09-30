import { describe, expect, test } from "bun:test";

/** Tokens de couleur d'un bloc de index.css (`:root` ou `.dark`), valeurs hexadécimales seulement. */
async function tokens(selector: ":root" | ".dark") {
	const css = await Bun.file(new URL("../src/index.css", import.meta.url)).text();
	const start = css.indexOf(`\n${selector} {`);
	const block = css.slice(start, css.indexOf("\n}", start));
	return Object.fromEntries(
		[...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, value]) => [name, value]),
	) as Record<string, string>;
}

function luminance(hex: string) {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return (hi + 0.05) / (lo + 0.05);
}

/** Texte sur fond : au moins 4,5:1 (WCAG AA), exigence de la spec, en clair et en sombre. */
const PAIRS: [text: string, background: string][] = [
	["foreground", "background"],
	["muted-foreground", "background"],
	["primary-foreground", "primary"],
	["destructive", "background"],
	["popover-foreground", "popover"],
];

for (const theme of [":root", ".dark"] as const) {
	describe(`contraste du thème ${theme === ":root" ? "clair" : "sombre"}`, () => {
		for (const [text, background] of PAIRS) {
			test(`${text} sur ${background} ≥ 4,5:1`, async () => {
				const t = await tokens(theme);
				expect(t[text]).toBeDefined();
				expect(t[background]).toBeDefined();
				expect(contrast(t[text] as string, t[background] as string)).toBeGreaterThanOrEqual(4.5);
			});
		}
	});
}
