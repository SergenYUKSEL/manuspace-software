import { schema } from "@manuspace/db";
import { type DocumentVersion, TextOperation } from "@manuspace/shared";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "../db";

const { documentOperations: ops, users } = schema;

/** Au-delà de cette pause entre deux opérations, une nouvelle session (version) commence. */
export const SESSION_GAP_MS = 10 * 60 * 1000;

/**
 * Versions d'un document, de la plus récente à la plus ancienne : les opérations du journal
 * regroupées en sessions d'écriture. Seuls les horodatages et auteurs sont lus (pas le contenu).
 */
export async function listVersions(nodeId: string): Promise<DocumentVersion[]> {
	const rows = await db
		.select({ revision: ops.revision, userId: ops.userId, createdAt: ops.createdAt })
		.from(ops)
		.where(eq(ops.nodeId, nodeId))
		.orderBy(asc(ops.revision));

	type Session = {
		start: Date;
		end: Date;
		revision: number;
		authorIds: Set<string>;
		count: number;
	};
	const sessions: Session[] = [];
	for (const row of rows) {
		const current = sessions.at(-1);
		if (current && row.createdAt.getTime() - current.end.getTime() <= SESSION_GAP_MS) {
			current.end = row.createdAt;
			current.revision = row.revision;
			current.count++;
			if (row.userId) current.authorIds.add(row.userId);
		} else {
			sessions.push({
				start: row.createdAt,
				end: row.createdAt,
				revision: row.revision,
				authorIds: new Set(row.userId ? [row.userId] : []),
				count: 1,
			});
		}
	}

	const authorIds = [...new Set(sessions.flatMap((s) => [...s.authorIds]))];
	const names = authorIds.length
		? await db
				.select({ id: users.id, displayName: users.displayName })
				.from(users)
				.where(inArray(users.id, authorIds))
		: [];
	const byId = new Map(names.map((n) => [n.id, n]));

	return sessions.reverse().map((s) => ({
		revision: s.revision,
		startedAt: s.start.toISOString(),
		endedAt: s.end.toISOString(),
		authors: [...s.authorIds].flatMap((id) => byId.get(id) ?? []),
		operationCount: s.count,
	}));
}

/**
 * Texte du document à la révision donnée : les opérations 1 à `revision` rejouées depuis le
 * texte vide (le journal est complet depuis la création du document). null si inconnue.
 */
export async function textAtRevision(nodeId: string, revision: number): Promise<string | null> {
	const rows = await db
		.select({ revision: ops.revision, operation: ops.operation })
		.from(ops)
		.where(and(eq(ops.nodeId, nodeId), lte(ops.revision, revision)))
		.orderBy(asc(ops.revision));
	if (rows.length !== revision) return null;
	let text = "";
	for (const row of rows) text = TextOperation.fromJSON(row.operation).apply(text);
	return text;
}
