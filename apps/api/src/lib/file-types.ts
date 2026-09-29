/**
 * Types de fichiers acceptés pour les ressources d'un manuscrit, reconnus par leur signature
 * binaire (« magic bytes ») et non par l'extension ou le Content-Type envoyés par le client.
 * Pas de SVG ni de HTML : servis depuis notre origine, ils pourraient exécuter du script (XSS).
 */
export const ACCEPTED_FILE_TYPES = [
	{ mime: "image/png", label: "PNG", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
	{ mime: "image/jpeg", label: "JPEG", signature: [0xff, 0xd8, 0xff] },
	{ mime: "image/gif", label: "GIF", signature: [0x47, 0x49, 0x46, 0x38] },
	{ mime: "application/pdf", label: "PDF", signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
] as const;

export const MAX_FILE_SIZE = 20 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
	signature.every((byte, i) => bytes[offset + i] === byte);

/** Type MIME réel du fichier, ou null s'il n'est pas accepté. */
export function detectFileType(bytes: Uint8Array): string | null {
	const known = ACCEPTED_FILE_TYPES.find((type) => startsWith(bytes, type.signature));
	if (known) return known.mime;
	// WebP : conteneur RIFF (octets 0-3) de type WEBP (octets 8-11).
	if (
		startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
		startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
	) {
		return "image/webp";
	}
	return null;
}

/** Nom affichable : sans chemin ni caractères de contrôle, 200 caractères au plus. */
export function sanitizeFileName(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? "";
	// biome-ignore lint/suspicious/noControlCharactersInRegex: retrait volontaire des caractères de contrôle
	const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
	return clean.slice(0, 200) || "fichier";
}
