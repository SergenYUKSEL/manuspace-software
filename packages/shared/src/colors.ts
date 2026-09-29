const COLORS = [
	"#b45309",
	"#0f766e",
	"#7c3aed",
	"#be123c",
	"#1d4ed8",
	"#15803d",
	"#c2410c",
	"#a21caf",
];

/** Couleur stable par utilisateur (curseur, pastille de présence), identique partout. */
export function userColor(userId: string) {
	let hash = 0;
	for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
	return COLORS[Math.abs(hash) % COLORS.length] as string;
}
