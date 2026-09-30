import { schema } from "@manuspace/db";
import type { TrashEntry } from "@manuspace/shared";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { nextPosition } from "./nodes";
import { deleteObjects } from "./storage";

const { nodes, users } = schema;

/** Durée de conservation dans la corbeille avant suppression définitive automatique. */
export const TRASH_RETENTION_DAYS = 30;

type NodeRow = typeof nodes.$inferSelect;

/**
 * Un « lot » = les éléments supprimés ensemble : la suppression d'un dossier marque tout son
 * sous-arbre dans une même requête, donc avec le même horodatage `deleted_at`.
 * La racine d'un lot est un élément supprimé dont le parent n'appartient pas au même lot.
 */
function sameBatch(a: NodeRow, b: NodeRow) {
	return (
		a.deletedAt !== null && b.deletedAt !== null && a.deletedAt.getTime() === b.deletedAt.getTime()
	);
}

async function manuscriptNodes(manuscriptId: string) {
	return db.select().from(nodes).where(eq(nodes.manuscriptId, manuscriptId));
}

/** Sous-arbre de `root` (lui compris) ; `batchOnly` : seulement les éléments de son lot. */
function subtree(all: NodeRow[], root: NodeRow, batchOnly: boolean) {
	const children = new Map<string, NodeRow[]>();
	for (const node of all) {
		if (!node.parentId) continue;
		children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
	}
	const result: NodeRow[] = [];
	const stack = [root];
	while (stack.length) {
		const node = stack.pop() as NodeRow;
		result.push(node);
		for (const child of children.get(node.id) ?? []) {
			if (!batchOnly || sameBatch(child, root)) stack.push(child);
		}
	}
	return result;
}

function batchRoots(all: NodeRow[]) {
	const byId = new Map(all.map((n) => [n.id, n]));
	return all.filter((node) => {
		if (!node.deletedAt) return false;
		const parent = node.parentId ? byId.get(node.parentId) : undefined;
		return !parent || !sameBatch(parent, node);
	});
}

export async function listTrash(manuscriptId: string): Promise<TrashEntry[]> {
	const all = await manuscriptNodes(manuscriptId);
	const byId = new Map(all.map((n) => [n.id, n]));
	const roots = batchRoots(all).sort(
		(a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0),
	);
	const deleterIds = [
		...new Set(roots.map((r) => r.updatedById).filter((id): id is string => Boolean(id))),
	];
	const deleters = deleterIds.length
		? await db
				.select({ id: users.id, displayName: users.displayName })
				.from(users)
				.where(inArray(users.id, deleterIds))
		: [];
	return roots.map((root) => {
		const parent = root.parentId ? byId.get(root.parentId) : undefined;
		return {
			id: root.id,
			type: root.type,
			name: root.name,
			mimeType: root.mimeType,
			containedCount: subtree(all, root, true).length - 1,
			deletedAt: (root.deletedAt as Date).toISOString(),
			deletedBy: deleters.find((d) => d.id === root.updatedById) ?? null,
			restoreTo: parent && !parent.deletedAt ? { id: parent.id, name: parent.name } : null,
		};
	});
}

async function findRoot(manuscriptId: string, nodeId: string) {
	const all = await manuscriptNodes(manuscriptId);
	const root = batchRoots(all).find((n) => n.id === nodeId);
	if (!root) throw new HTTPException(404, { message: "Élément introuvable dans la corbeille" });
	return { all, root };
}

/**
 * Restaure l'élément et ce qui a été supprimé avec lui. S'il a été supprimé séparément avant
 * son dossier, un élément reste dans la corbeille. Parent disparu : retour à la racine.
 */
export async function restore(manuscriptId: string, nodeId: string, userId: string) {
	const { all, root } = await findRoot(manuscriptId, nodeId);
	const parent = all.find((n) => n.id === root.parentId);
	const parentId = parent && !parent.deletedAt ? parent.id : null;
	const ids = subtree(all, root, true).map((n) => n.id);
	const position = await nextPosition(manuscriptId, parentId);
	await db.transaction(async (tx) => {
		await tx
			.update(nodes)
			.set({ deletedAt: null, updatedAt: sql`now()`, updatedById: userId })
			.where(inArray(nodes.id, ids));
		await tx.update(nodes).set({ parentId, position }).where(eq(nodes.id, root.id));
	});
	return { restoredCount: ids.length, parentId };
}

/** Suppression définitive : lignes (en cascade) et fichiers du bucket. */
export async function destroy(manuscriptId: string, nodeId: string) {
	const { all, root } = await findRoot(manuscriptId, nodeId);
	const keys = subtree(all, root, false).map((n) => n.storageKey);
	await db.delete(nodes).where(eq(nodes.id, root.id));
	await deleteObjects(keys);
}

export async function emptyTrash(manuscriptId: string) {
	const roots = batchRoots(await manuscriptNodes(manuscriptId));
	for (const root of roots) await destroy(manuscriptId, root.id);
	return roots.length;
}

/** Purge automatique : ce qui est dans la corbeille depuis plus de TRASH_RETENTION_DAYS jours. */
export async function purgeExpiredTrash(now = new Date()) {
	const limit = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
	const expired = await db
		.selectDistinct({ manuscriptId: nodes.manuscriptId })
		.from(nodes)
		.where(and(isNotNull(nodes.deletedAt), lt(nodes.deletedAt, limit)));
	let purged = 0;
	for (const { manuscriptId } of expired) {
		const roots = batchRoots(await manuscriptNodes(manuscriptId)).filter(
			(r) => (r.deletedAt as Date) < limit,
		);
		for (const root of roots) {
			await destroy(manuscriptId, root.id);
			purged++;
		}
	}
	return purged;
}
