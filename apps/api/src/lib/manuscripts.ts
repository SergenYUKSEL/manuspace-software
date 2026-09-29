import { schema } from "@manuspace/db";
import type { ManuscriptSummary } from "@manuspace/shared";
import { and, desc, eq, isNull, or, type SQL, sql } from "drizzle-orm";
import { db } from "../db";

const { manuscripts, projectMembers, nodes, users } = schema;

/** Manuscrits accessibles à l'utilisateur, avec son rôle, le total de mots et la dernière activité. */
export async function listManuscripts(userId: string, where?: SQL): Promise<ManuscriptSummary[]> {
	const updatedAt = sql<Date>`greatest(${manuscripts.updatedAt}, max(${nodes.updatedAt}))`;
	const rows = await db
		.select({
			id: manuscripts.id,
			title: manuscripts.title,
			createdAt: manuscripts.createdAt,
			ownerId: manuscripts.ownerId,
			ownerName: users.displayName,
			memberRole: projectMembers.role,
			updatedAt,
			wordCount: sql<number>`coalesce(sum(${nodes.wordCount}), 0)::int`,
		})
		.from(manuscripts)
		.innerJoin(users, eq(users.id, manuscripts.ownerId))
		.leftJoin(
			projectMembers,
			and(eq(projectMembers.manuscriptId, manuscripts.id), eq(projectMembers.userId, userId)),
		)
		.leftJoin(nodes, and(eq(nodes.manuscriptId, manuscripts.id), isNull(nodes.deletedAt)))
		.where(and(or(eq(manuscripts.ownerId, userId), eq(projectMembers.userId, userId)), where))
		.groupBy(manuscripts.id, users.displayName, projectMembers.role)
		.orderBy(desc(updatedAt));

	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		role: row.ownerId === userId ? "OWNER" : (row.memberRole ?? "VIEWER"),
		owner: { id: row.ownerId, displayName: row.ownerName },
		wordCount: row.wordCount,
		// max() via sql renvoie une chaîne avec le driver postgres-js
		updatedAt: new Date(row.updatedAt).toISOString(),
		createdAt: row.createdAt.toISOString(),
	}));
}

/** Structure de départ d'un nouveau manuscrit (reprise de l'exemple du brief). */
export const DEFAULT_TREE = [
	{ name: "Manuscrit", children: ["Chapitre 1"] },
	{ name: "Personnages", children: [] },
	{ name: "Univers", children: [] },
	{ name: "Recherches", children: [] },
] as const;
