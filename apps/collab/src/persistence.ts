import { createDb, schema } from "@manuspace/db";
import { countWords, type HistoryEntry, TextOperation } from "@manuspace/shared";
import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import { env } from "./env";

const db = createDb(env.DATABASE_URL);
const { documentContents, documentOperations, nodes } = schema;

export type StoredDocument = { text: string; revision: number; replay: HistoryEntry[] };

/**
 * Dernier instantané du document + opérations journalisées après lui (celles acceptées avant
 * un éventuel arrêt brutal, avant l'enregistrement de l'instantané suivant).
 */
export async function loadDocument(nodeId: string): Promise<StoredDocument> {
	const snapshot = await db.query.documentContents.findFirst({
		where: eq(documentContents.nodeId, nodeId),
	});
	const revision = snapshot?.revision ?? 0;
	return {
		text: snapshot?.content ?? "",
		revision,
		replay: await loadOperations(nodeId, revision),
	};
}

/** Opérations de révision > `after` (et < `before` si précisé), dans l'ordre. */
export async function loadOperations(
	nodeId: string,
	after: number,
	before?: number,
): Promise<HistoryEntry[]> {
	const rows = await db
		.select()
		.from(documentOperations)
		.where(
			and(
				eq(documentOperations.nodeId, nodeId),
				gt(documentOperations.revision, after),
				before === undefined ? undefined : lt(documentOperations.revision, before),
			),
		)
		.orderBy(asc(documentOperations.revision));
	return rows.map((row) => ({
		id: row.clientOpId,
		operation: TextOperation.fromJSON(row.operation),
	}));
}

/** Journalise une opération acceptée (avant d'en accuser réception). */
export async function appendOperation(
	nodeId: string,
	revision: number,
	entry: HistoryEntry,
	userId: string,
) {
	await db.insert(documentOperations).values({
		nodeId,
		revision,
		clientOpId: entry.id,
		operation: entry.operation.toJSON(),
		userId,
	});
}

/** Instantané du texte + métadonnées du nœud (mots, date, dernier éditeur). */
export async function saveSnapshot(
	nodeId: string,
	text: string,
	revision: number,
	editorId?: string,
) {
	await db.transaction(async (tx) => {
		await tx
			.insert(documentContents)
			.values({ nodeId, content: text, revision })
			.onConflictDoUpdate({
				target: documentContents.nodeId,
				set: { content: text, revision, updatedAt: sql`now()` },
				// Jamais revenir en arrière (instantanés concurrents après un rechargement).
				setWhere: lt(documentContents.revision, revision),
			});
		await tx
			.update(nodes)
			.set({ wordCount: countWords(text), updatedAt: sql`now()`, updatedById: editorId })
			.where(eq(nodes.id, nodeId));
	});
}
