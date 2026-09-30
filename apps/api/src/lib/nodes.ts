import { schema } from "@manuspace/db";
import type { ManuscriptNode } from "@manuspace/shared";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";

const { nodes, users } = schema;

export const notFound = (message: string) => new HTTPException(404, { message });

export async function findNode(manuscriptId: string, nodeId: string) {
	const node = await db.query.nodes.findFirst({
		where: and(eq(nodes.id, nodeId), eq(nodes.manuscriptId, manuscriptId), isNull(nodes.deletedAt)),
	});
	if (!node) throw notFound("Élément introuvable");
	return node;
}

/** Le parent doit être un dossier non supprimé du même manuscrit. */
export async function assertFolder(manuscriptId: string, parentId: string | null) {
	if (parentId === null) return;
	const parent = await findNode(manuscriptId, parentId).catch(() => null);
	if (parent?.type !== "folder") {
		throw new HTTPException(400, { message: "Le parent doit être un dossier du manuscrit" });
	}
}

/** Position après le dernier enfant du dossier (ou de la racine). */
export async function nextPosition(manuscriptId: string, parentId: string | null) {
	const [row] = await db
		.select({ last: max(nodes.position) })
		.from(nodes)
		.where(
			and(
				eq(nodes.manuscriptId, manuscriptId),
				parentId ? eq(nodes.parentId, parentId) : isNull(nodes.parentId),
				isNull(nodes.deletedAt),
			),
		);
	return (row?.last ?? -1) + 1;
}

/** Vrai si `candidateParentId` est `nodeId` lui-même ou l'un de ses descendants. */
export async function wouldCreateCycle(
	manuscriptId: string,
	nodeId: string,
	candidateParentId: string,
) {
	const all = await db
		.select({ id: nodes.id, parentId: nodes.parentId })
		.from(nodes)
		.where(eq(nodes.manuscriptId, manuscriptId));
	const parentOf = new Map(all.map((n) => [n.id, n.parentId]));
	for (let id: string | null = candidateParentId; id; id = parentOf.get(id) ?? null) {
		if (id === nodeId) return true;
	}
	return false;
}

export async function listNodes(manuscriptId: string): Promise<ManuscriptNode[]> {
	const rows = await db
		.select({ node: nodes, updaterName: users.displayName })
		.from(nodes)
		.leftJoin(users, eq(users.id, nodes.updatedById))
		.where(and(eq(nodes.manuscriptId, manuscriptId), isNull(nodes.deletedAt)))
		.orderBy(asc(nodes.position), asc(nodes.createdAt));
	return rows.map(({ node, updaterName }) => ({
		id: node.id,
		parentId: node.parentId,
		type: node.type,
		name: node.name,
		color: node.color as ManuscriptNode["color"],
		position: node.position,
		wordCount: node.wordCount,
		mimeType: node.mimeType,
		sizeBytes: node.sizeBytes,
		updatedAt: node.updatedAt.toISOString(),
		updatedBy:
			node.updatedById && updaterName ? { id: node.updatedById, displayName: updaterName } : null,
	}));
}
