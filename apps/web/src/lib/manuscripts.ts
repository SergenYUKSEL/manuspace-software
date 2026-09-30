import type { ManuscriptNode, ProjectRole } from "@manuspace/shared";
import { queryOptions } from "@tanstack/react-query";
import { api, call } from "./api";

export const manuscriptsQuery = queryOptions({
	queryKey: ["manuscripts"],
	queryFn: () => call(api.manuscripts.$get()),
});

export const manuscriptQuery = (id: string) =>
	queryOptions({
		queryKey: ["manuscripts", id],
		queryFn: () => call(api.manuscripts[":id"].$get({ param: { id } })),
	});

export const nodesQuery = (id: string) =>
	queryOptions({
		queryKey: ["manuscripts", id, "nodes"],
		queryFn: () => call(api.manuscripts[":id"].nodes.$get({ param: { id } })),
	});

export const membersQuery = (id: string) =>
	queryOptions({
		queryKey: ["manuscripts", id, "members"],
		queryFn: () => call(api.manuscripts[":id"].members.$get({ param: { id } })),
	});

export const trashQuery = (id: string) =>
	queryOptions({
		queryKey: ["manuscripts", id, "trash"],
		queryFn: () => call(api.manuscripts[":id"].trash.$get({ param: { id } })),
	});

export const versionsQuery = (manuscriptId: string, nodeId: string) =>
	queryOptions({
		queryKey: ["manuscripts", manuscriptId, "nodes", nodeId, "versions"],
		queryFn: () =>
			call(
				api.manuscripts[":id"].nodes[":nodeId"].versions.$get({
					param: { id: manuscriptId, nodeId },
				}),
			),
	});

export const versionTextQuery = (manuscriptId: string, nodeId: string, revision: number) =>
	queryOptions({
		queryKey: ["manuscripts", manuscriptId, "nodes", nodeId, "versions", revision],
		queryFn: () =>
			call(
				api.manuscripts[":id"].nodes[":nodeId"].versions[":revision"].$get({
					param: { id: manuscriptId, nodeId, revision: String(revision) },
				}),
			),
		// Le texte d'une révision passée ne change jamais.
		staleTime: Number.POSITIVE_INFINITY,
	});

/** Vocabulaire métier des rôles (brief : co-auteur, correcteur, bêta-lecteur). */
export const ROLE_LABELS: Record<ProjectRole, string> = {
	OWNER: "Auteur principal",
	EDITOR: "Co-auteur",
	COMMENTER: "Correcteur",
	VIEWER: "Bêta-lecteur",
};

export const INVITABLE_ROLES = ["EDITOR", "COMMENTER", "VIEWER"] as const;

/** Enfants de chaque dossier (clé null = racine), dans l'ordre d'affichage. */
export function childrenByParent(nodes: ManuscriptNode[]) {
	const map = new Map<string | null, ManuscriptNode[]>();
	for (const node of nodes) {
		const siblings = map.get(node.parentId) ?? [];
		siblings.push(node);
		map.set(node.parentId, siblings);
	}
	return map;
}

/** Chemin de la racine jusqu'au nœud (fil d'Ariane). */
export function ancestry(nodes: ManuscriptNode[], nodeId: string | undefined) {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const path: ManuscriptNode[] = [];
	for (let node = nodeId ? byId.get(nodeId) : undefined; node; ) {
		path.unshift(node);
		node = node.parentId ? byId.get(node.parentId) : undefined;
	}
	return path;
}

const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short" });

/** « il y a 5 minutes », « hier »… puis date absolue au-delà d'une semaine. */
export function formatUpdatedAt(iso: string) {
	const date = new Date(iso);
	const seconds = Math.round((date.getTime() - Date.now()) / 1000);
	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		["second", 60],
		["minute", 60],
		["hour", 24],
		["day", 7],
	];
	let value = seconds;
	for (const [unit, size] of units) {
		if (Math.abs(value) < size)
			return unit === "second" ? "à l'instant" : relative.format(value, unit);
		value = Math.round(value / size);
	}
	return absolute.format(date);
}

export const wordCountLabel = (count: number | null) =>
	`${(count ?? 0).toLocaleString("fr")} mot${(count ?? 0) > 1 ? "s" : ""}`;
