import { schema } from "@manuspace/db";
import type { ProjectRole } from "@manuspace/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../db";

/** Rôle de l'utilisateur sur un manuscrit, ou null s'il n'y a pas accès. */
export async function getManuscriptRole(
	userId: string,
	manuscriptId: string,
): Promise<ProjectRole | null> {
	const manuscript = await db.query.manuscripts.findFirst({
		where: eq(schema.manuscripts.id, manuscriptId),
		columns: { ownerId: true },
	});
	if (!manuscript) return null;
	if (manuscript.ownerId === userId) return "OWNER";

	const member = await db.query.projectMembers.findFirst({
		where: and(
			eq(schema.projectMembers.manuscriptId, manuscriptId),
			eq(schema.projectMembers.userId, userId),
		),
		columns: { role: true },
	});
	return member?.role ?? null;
}
