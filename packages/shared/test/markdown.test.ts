import { describe, expect, test } from "bun:test";
import { countWords, parseInline, parseMarkdown } from "../src/markdown";

describe("Markdown léger", () => {
	test("titres, paragraphes, citation, changement de scène", () => {
		const blocks = parseMarkdown(
			"# L'éveil\n\nMéduse ouvrit les yeux.\nElle attendit.\n\n> Qui es-tu ?\n\n***\n\n## Plus tard",
		);
		expect(blocks.map((b) => b.type)).toEqual([
			"heading",
			"paragraph",
			"quote",
			"scene-break",
			"heading",
		]);
		expect(blocks[1]).toEqual({
			type: "paragraph",
			lines: [
				[{ type: "text", text: "Méduse ouvrit les yeux." }],
				[{ type: "text", text: "Elle attendit." }],
			],
		});
		expect(blocks[4]).toMatchObject({ type: "heading", level: 2 });
	});

	test("gras, italique, imbrication", () => {
		expect(parseInline("un **mot** et *un autre* et _encore_")).toEqual([
			{ type: "text", text: "un " },
			{ type: "strong", children: [{ type: "text", text: "mot" }] },
			{ type: "text", text: " et " },
			{ type: "em", children: [{ type: "text", text: "un autre" }] },
			{ type: "text", text: " et " },
			{ type: "em", children: [{ type: "text", text: "encore" }] },
		]);
		expect(parseInline("**très *vraiment* fort**")).toEqual([
			{
				type: "strong",
				children: [
					{ type: "text", text: "très " },
					{ type: "em", children: [{ type: "text", text: "vraiment" }] },
					{ type: "text", text: " fort" },
				],
			},
		]);
	});

	test("marqueurs isolés laissés tels quels", () => {
		expect(parseInline("2 * 3 = 6 et un_mot")).toEqual([
			{ type: "text", text: "2 * 3 = 6 et un_mot" },
		]);
		expect(parseInline("**non fermé")).toEqual([{ type: "text", text: "**non fermé" }]);
	});

	test("le HTML reste du texte (aucune injection possible)", () => {
		expect(parseMarkdown("<script>alert(1)</script>")).toEqual([
			{ type: "paragraph", lines: [[{ type: "text", text: "<script>alert(1)</script>" }]] },
		]);
	});

	test("comptage de mots sans les marques", () => {
		expect(countWords("# L'éveil\n\nMéduse **ouvrit** les *yeux*.\n\n***\n\n> Qui es-tu ?")).toBe(
			7,
		);
		expect(countWords("")).toBe(0);
		expect(countWords("***\n---")).toBe(0);
	});
});
