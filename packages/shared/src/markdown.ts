/**
 * Markdown léger pour l'écriture de roman, analysé en arbre (jamais de HTML) :
 * - `# Titre`, `## Sous-titre`, `### Section`
 * - `> citation`
 * - `***` ou `---` seul sur sa ligne : changement de scène
 * - `**gras**`, `*italique*` ou `_italique_`
 * - paragraphes séparés par une ligne vide ; un retour simple reste un retour à la ligne.
 */
export type Inline =
	| { type: "text"; text: string }
	| { type: "strong"; children: Inline[] }
	| { type: "em"; children: Inline[] };

export type Block =
	| { type: "heading"; level: 1 | 2 | 3; children: Inline[] }
	| { type: "paragraph"; lines: Inline[][] }
	| { type: "quote"; lines: Inline[][] }
	| { type: "scene-break" };

const SCENE_BREAK = /^\s*(\*\s*\*\s*\*|-\s*-\s*-)[\s*-]*$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

export function parseMarkdown(source: string): Block[] {
	const blocks: Block[] = [];
	let paragraph: string[] = [];
	let quote: string[] = [];

	const flush = () => {
		if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph.map(parseInline) });
		if (quote.length) blocks.push({ type: "quote", lines: quote.map(parseInline) });
		paragraph = [];
		quote = [];
	};

	for (const line of source.split("\n")) {
		const heading = HEADING.exec(line);
		const quoted = QUOTE.exec(line);
		if (line.trim() === "") {
			flush();
		} else if (SCENE_BREAK.test(line)) {
			flush();
			blocks.push({ type: "scene-break" });
		} else if (heading) {
			flush();
			const level = (heading[1] as string).length as 1 | 2 | 3;
			blocks.push({ type: "heading", level, children: parseInline(heading[2] as string) });
		} else if (quoted) {
			if (paragraph.length) flush();
			quote.push(quoted[1] as string);
		} else {
			if (quote.length) flush();
			paragraph.push(line);
		}
	}
	flush();
	return blocks;
}

/** Emphases : `**gras**` puis `*italique*` / `_italique_`, imbrication autorisée. */
export function parseInline(text: string): Inline[] {
	const result: Inline[] = [];
	let plain = "";
	let i = 0;
	const pushPlain = () => {
		if (plain) result.push({ type: "text", text: plain });
		plain = "";
	};
	while (i < text.length) {
		if (text.startsWith("**", i)) {
			const end = text.indexOf("**", i + 2);
			if (end > i + 2) {
				pushPlain();
				result.push({ type: "strong", children: parseInline(text.slice(i + 2, end)) });
				i = end + 2;
				continue;
			}
		}
		const char = text[i];
		if (char === "*" || char === "_") {
			const end = findClosing(text, char, i + 1);
			if (end > i + 1) {
				pushPlain();
				result.push({ type: "em", children: parseInline(text.slice(i + 1, end)) });
				i = end + 1;
				continue;
			}
		}
		plain += char;
		i++;
	}
	pushPlain();
	return result;
}

/** Marqueur fermant simple (pas un `**`), sans espace juste après l'ouvrant. */
function findClosing(text: string, marker: string, from: number) {
	if (text[from] === " " || text[from] === marker) return -1;
	for (let i = from; i < text.length; i++) {
		if (text[i] !== marker) continue;
		if (marker === "*" && text[i + 1] === "*") {
			i++;
			continue;
		}
		if (text[i - 1] !== " ") return i;
	}
	return -1;
}

/** Nombre de mots du texte lu (marques de mise en forme exclues). */
export function countWords(source: string): number {
	return source
		.split("\n")
		.filter((line) => !SCENE_BREAK.test(line))
		.join(" ")
		.replace(/^#{1,3}\s|^>\s?/gm, " ")
		.replace(/[*_]+/g, " ")
		.split(/\s+/)
		.filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}
