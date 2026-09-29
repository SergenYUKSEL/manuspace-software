import { describe, expect, test } from "bun:test";
import { schema } from "@manuspace/db";
import { collabTicketSchema } from "@manuspace/shared";
import { jwtVerify } from "jose";
import { db } from "../src/db";
import { createUser, loggedInUser, request } from "./helpers";

const secret = new TextEncoder().encode(process.env.COLLAB_TICKET_SECRET);

async function manuscriptWithChapter(ownerId: string) {
	const [manuscript] = await db
		.insert(schema.manuscripts)
		.values({ title: "Renaissance de Médusa", ownerId })
		.returning();
	if (!manuscript) throw new Error("manuscript");
	const [chapter] = await db
		.insert(schema.nodes)
		.values({ manuscriptId: manuscript.id, type: "text", name: "Chapitre 1" })
		.returning();
	if (!chapter) throw new Error("chapter");
	return { manuscript, chapter };
}

describe("ticket collab", () => {
	test("propriétaire : ticket signé, lié au document, rôle OWNER, 60 s", async () => {
		const { user, cookie } = await loggedInUser();
		const { chapter } = await manuscriptWithChapter(user.id);

		const { res, json } = await request("POST", `/documents/${chapter.id}/collab-ticket`, {
			cookie,
		});
		expect(res.status).toBe(200);

		const { payload } = await jwtVerify(json.token, secret, { audience: "manuspace-collab" });
		expect(collabTicketSchema.parse(payload)).toEqual({
			sub: user.id,
			name: user.displayName,
			docId: chapter.id,
			role: "OWNER",
		});
		expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(60);
	});

	test("membre invité : rôle de son invitation", async () => {
		const owner = await createUser();
		const { chapter, manuscript } = await manuscriptWithChapter(owner.id);
		const { user, cookie } = await loggedInUser();
		await db
			.insert(schema.projectMembers)
			.values({ manuscriptId: manuscript.id, userId: user.id, role: "VIEWER" });

		const { json } = await request("POST", `/documents/${chapter.id}/collab-ticket`, { cookie });
		const { payload } = await jwtVerify(json.token, secret, { audience: "manuspace-collab" });
		expect(payload.role).toBe("VIEWER");
	});

	test("non membre : 404 (l'existence du document n'est pas révélée)", async () => {
		const owner = await createUser();
		const { chapter } = await manuscriptWithChapter(owner.id);
		const { cookie } = await loggedInUser();

		const { res } = await request("POST", `/documents/${chapter.id}/collab-ticket`, { cookie });
		expect(res.status).toBe(404);
	});

	test("sans session : 401", async () => {
		const { res } = await request("POST", `/documents/${crypto.randomUUID()}/collab-ticket`);
		expect(res.status).toBe(401);
	});
});
