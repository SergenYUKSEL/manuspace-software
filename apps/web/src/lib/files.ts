import type { ManuscriptNode } from "@manuspace/shared";
import { api, call } from "./api";

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
/** Même liste que l'API (qui vérifie de toute façon le contenu réel). */
export const ACCEPTED_TYPES = "application/pdf,image/png,image/jpeg,image/webp,image/gif";

/** URL du contenu servi par l'API ; `v` change à chaque remplacement (cache du navigateur). */
export function fileContentUrl(manuscriptId: string, node: ManuscriptNode, download = false) {
	const params = new URLSearchParams({ v: node.updatedAt });
	if (download) params.set("download", "");
	return `/api/manuscripts/${manuscriptId}/files/${node.id}/content?${params}`;
}

export const isImage = (node: ManuscriptNode) => node.mimeType?.startsWith("image/") ?? false;
export const isPdf = (node: ManuscriptNode) => node.mimeType === "application/pdf";

export function fileKindLabel(node: ManuscriptNode) {
	if (isPdf(node)) return "PDF";
	if (isImage(node)) return `Image ${node.mimeType?.split("/")[1]?.toUpperCase() ?? ""}`.trim();
	return "Fichier";
}

const sizeFormat = new Intl.NumberFormat("fr", { maximumFractionDigits: 1 });
export function formatSize(bytes: number | null) {
	if (bytes === null) return "—";
	if (bytes < 1024) return `${bytes} o`;
	if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} Ko`;
	return `${sizeFormat.format(bytes / (1024 * 1024))} Mo`;
}

/** Vérification locale, pour éviter d'envoyer 50 Mo pour rien (l'API revérifie). */
export function checkFileSize(file: File) {
	if (file.size > MAX_FILE_SIZE) {
		throw new Error(`« ${file.name} » dépasse 20 Mo`);
	}
}

export function uploadFile(manuscriptId: string, file: File, parentId: string | null) {
	checkFileSize(file);
	return call(
		api.manuscripts[":id"].files.$post({
			param: { id: manuscriptId },
			form: { file, parentId: parentId ?? "" },
		}),
	);
}

export function replaceFile(manuscriptId: string, nodeId: string, file: File) {
	checkFileSize(file);
	return call(
		api.manuscripts[":id"].files[":nodeId"].$put({
			param: { id: manuscriptId, nodeId },
			form: { file },
		}),
	);
}
