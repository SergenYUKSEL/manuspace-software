/**
 * Commandes de mise en forme Markdown : elles produisent le nouveau texte et la nouvelle
 * sélection ; l'éditeur en déduit l'opération (comme pour une frappe).
 */
export type Edit = { text: string; start: number; end: number };

/** Entoure la sélection (ou retire l'entourage s'il est déjà là) : **gras**, *italique*. */
export function toggleWrap(text: string, start: number, end: number, marker: string): Edit {
	const before = text.slice(start - marker.length, start);
	const after = text.slice(end, end + marker.length);
	if (before === marker && after === marker) {
		const next =
			text.slice(0, start - marker.length) +
			text.slice(start, end) +
			text.slice(end + marker.length);
		return { text: next, start: start - marker.length, end: end - marker.length };
	}
	const next = `${text.slice(0, start)}${marker}${text.slice(start, end)}${marker}${text.slice(end)}`;
	return { text: next, start: start + marker.length, end: end + marker.length };
}

/** Préfixe de ligne (titre, citation) : ajouté, remplacé ou retiré sur les lignes sélectionnées. */
export function toggleLinePrefix(text: string, start: number, end: number, prefix: string): Edit {
	const lineStart = text.lastIndexOf("\n", start - 1) + 1;
	const lineEndIndex = text.indexOf("\n", end);
	const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
	const lines = text.slice(lineStart, lineEnd).split("\n");
	const PREFIX = /^(#{1,3} |> )/;
	const allHave = lines.every((line) => line.startsWith(prefix));
	const updated = lines.map((line) => {
		const bare = line.replace(PREFIX, "");
		return allHave ? bare : prefix + bare;
	});
	const block = updated.join("\n");
	const next = text.slice(0, lineStart) + block + text.slice(lineEnd);
	return { text: next, start: lineStart, end: lineStart + block.length };
}

/** Changement de scène (⁂) sur sa propre ligne, entouré de lignes vides. */
export function insertSceneBreak(text: string, position: number): Edit {
	const before = text.slice(0, position).replace(/\n*$/, "");
	const after = text.slice(position).replace(/^\n*/, "");
	const insert = `${before ? "\n\n" : ""}***\n\n`;
	const next = before + insert + after;
	const cursor = before.length + insert.length;
	return { text: next, start: cursor, end: cursor };
}
