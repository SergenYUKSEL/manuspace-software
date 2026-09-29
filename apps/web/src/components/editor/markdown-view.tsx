// biome-ignore-all lint/suspicious/noArrayIndexKey: blocs et fragments sans identifiant, dérivés du texte dans un ordre stable
import { type Block, type Inline, parseMarkdown } from "@manuspace/shared";
import { Fragment, useMemo } from "react";

/** Mode Lecture : rendu du Markdown léger en éléments React (jamais de HTML injecté). */
export function MarkdownView({ source }: { source: string }) {
	const blocks = useMemo(() => parseMarkdown(source), [source]);
	if (blocks.length === 0) {
		return <p className="text-muted-foreground italic">Ce chapitre est encore vide.</p>;
	}
	return <>{blocks.map((block, i) => renderBlock(block, i))}</>;
}

function renderBlock(block: Block, key: number) {
	switch (block.type) {
		case "heading": {
			const Tag = (["h2", "h3", "h4"] as const)[block.level - 1] ?? "h4";
			return <Tag key={key}>{renderInlines(block.children)}</Tag>;
		}
		case "paragraph":
			return <p key={key}>{renderLines(block.lines)}</p>;
		case "quote":
			return (
				<blockquote key={key}>
					<p>{renderLines(block.lines)}</p>
				</blockquote>
			);
		case "scene-break":
			return <hr key={key} />;
	}
}

function renderLines(lines: Inline[][]) {
	return lines.map((line, i) => (
		<Fragment key={i}>
			{i > 0 && <br />}
			{renderInlines(line)}
		</Fragment>
	));
}

function renderInlines(inlines: Inline[]) {
	return inlines.map((inline, i) => {
		if (inline.type === "text") return <Fragment key={i}>{inline.text}</Fragment>;
		const children = renderInlines(inline.children);
		return inline.type === "strong" ? (
			<strong key={i}>{children}</strong>
		) : (
			<em key={i}>{children}</em>
		);
	});
}
