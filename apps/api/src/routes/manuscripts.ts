import { schema } from "@manuspace/db";
import {
	createManuscriptSchema,
	createNodeSchema,
	inviteMemberSchema,
	type ManuscriptMember,
	type ManuscriptNode,
	updateManuscriptSchema,
	updateMemberSchema,
	updateNodeSchema,
} from "@manuspace/shared";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db";
import { isUniqueViolation } from "../lib/errors";
import { DEFAULT_TREE, listManuscripts } from "../lib/manuscripts";
import {
	assertFolder,
	findNode,
	listNodes,
	nextPosition,
	notFound,
	wouldCreateCycle,
} from "../lib/nodes";
import { deleteObjects } from "../lib/storage";
import { validate } from "../lib/validator";
import { requireAuth } from "../middleware/auth";
import { type ManuscriptEnv, requireRole } from "../middleware/manuscript";

const { manuscripts, nodes, projectMembers, users } = schema;

const nodeParam = validate("param", z.object({ id: z.uuid(), nodeId: z.uuid() }));
const memberParam = validate("param", z.object({ id: z.uuid(), userId: z.uuid() }));

export const manuscriptRoutes = new Hono<ManuscriptEnv>()
	.use(requireAuth)

	// --- Bibliothèque -------------------------------------------------------
	.get("/", async (c) => c.json(await listManuscripts(c.var.user.id)))
	.post("/", validate("json", createManuscriptSchema), async (c) => {
		const userId = c.var.user.id;
		const id = await db.transaction(async (tx) => {
			const [manuscript] = await tx
				.insert(manuscripts)
				.values({ title: c.req.valid("json").title, ownerId: userId })
				.returning({ id: manuscripts.id });
			if (!manuscript) throw new Error("Insertion manuscrit sans retour");
			for (const [position, folder] of DEFAULT_TREE.entries()) {
				const [parent] = await tx
					.insert(nodes)
					.values({
						manuscriptId: manuscript.id,
						type: "folder",
						name: folder.name,
						position,
						updatedById: userId,
					})
					.returning({ id: nodes.id });
				for (const [childPosition, name] of folder.children.entries()) {
					await tx.insert(nodes).values({
						manuscriptId: manuscript.id,
						parentId: parent?.id,
						type: "text",
						name,
						position: childPosition,
						wordCount: 0,
						updatedById: userId,
					});
				}
			}
			return manuscript.id;
		});
		const [summary] = await listManuscripts(userId, eq(manuscripts.id, id));
		return c.json(summary as NonNullable<typeof summary>, 201);
	})
	.get("/:id", requireRole("VIEWER"), async (c) => {
		const [summary] = await listManuscripts(c.var.user.id, eq(manuscripts.id, c.req.param("id")));
		if (!summary) throw notFound("Manuscrit introuvable");
		return c.json(summary);
	})
	.patch("/:id", requireRole("OWNER"), validate("json", updateManuscriptSchema), async (c) => {
		await db
			.update(manuscripts)
			.set({ title: c.req.valid("json").title, updatedAt: sql`now()` })
			.where(eq(manuscripts.id, c.req.param("id")));
		const [summary] = await listManuscripts(c.var.user.id, eq(manuscripts.id, c.req.param("id")));
		return c.json(summary as NonNullable<typeof summary>);
	})
	.delete("/:id", requireRole("OWNER"), async (c) => {
		const manuscriptId = c.req.param("id");
		// Clés des fichiers (y compris supprimés) avant que la cascade n'efface les nœuds.
		const files = await db
			.select({ key: nodes.storageKey })
			.from(nodes)
			.where(and(eq(nodes.manuscriptId, manuscriptId), eq(nodes.type, "file")));
		await db.delete(manuscripts).where(eq(manuscripts.id, manuscriptId));
		await deleteObjects(files.map((f) => f.key));
		return c.json({ ok: true });
	})

	// --- Arborescence -------------------------------------------------------
	.get("/:id/nodes", requireRole("VIEWER"), async (c) => c.json(await listNodes(c.req.param("id"))))
	.post("/:id/nodes", requireRole("EDITOR"), validate("json", createNodeSchema), async (c) => {
		const manuscriptId = c.req.param("id");
		const { parentId, type, name } = c.req.valid("json");
		await assertFolder(manuscriptId, parentId);
		const [node] = await db
			.insert(nodes)
			.values({
				manuscriptId,
				parentId,
				type,
				name,
				position: await nextPosition(manuscriptId, parentId),
				wordCount: type === "text" ? 0 : null,
				updatedById: c.var.user.id,
			})
			.returning({ id: nodes.id });
		const created = (await listNodes(manuscriptId)).find((n) => n.id === node?.id);
		return c.json(created as ManuscriptNode, 201);
	})
	.patch(
		"/:id/nodes/:nodeId",
		requireRole("EDITOR"),
		nodeParam,
		validate("json", updateNodeSchema),
		async (c) => {
			const { id: manuscriptId, nodeId } = c.req.valid("param");
			const { name, parentId } = c.req.valid("json");
			const node = await findNode(manuscriptId, nodeId);
			const values: Partial<Pick<typeof nodes.$inferInsert, "name" | "parentId" | "position">> = {};
			if (name !== undefined) values.name = name;
			if (parentId !== undefined && parentId !== node.parentId) {
				await assertFolder(manuscriptId, parentId);
				if (parentId && (await wouldCreateCycle(manuscriptId, nodeId, parentId))) {
					throw new HTTPException(400, {
						message: "Impossible de déplacer un dossier dans lui-même",
					});
				}
				values.parentId = parentId;
				values.position = await nextPosition(manuscriptId, parentId);
			}
			await db
				.update(nodes)
				.set({ ...values, updatedAt: sql`now()`, updatedById: c.var.user.id })
				.where(eq(nodes.id, nodeId));
			const updated = (await listNodes(manuscriptId)).find((n) => n.id === nodeId);
			return c.json(updated as ManuscriptNode);
		},
	)
	/** Suppression douce de l'élément et de tout son contenu (corbeille à venir). */
	.delete("/:id/nodes/:nodeId", requireRole("EDITOR"), nodeParam, async (c) => {
		const { id: manuscriptId, nodeId } = c.req.valid("param");
		await findNode(manuscriptId, nodeId);
		await db.execute(sql`
			with recursive subtree as (
				select id from ${nodes} where id = ${nodeId}
				union all
				select n.id from ${nodes} n join subtree s on n.parent_id = s.id
			)
			update ${nodes}
			set deleted_at = now(), updated_at = now(), updated_by_id = ${c.var.user.id}
			where id in (select id from subtree) and deleted_at is null
		`);
		return c.json({ ok: true });
	})

	// --- Collaborateurs -----------------------------------------------------
	.get("/:id/members", requireRole("VIEWER"), async (c) => {
		const manuscriptId = c.req.param("id");
		const [owner] = await db
			.select({ userId: users.id, email: users.email, displayName: users.displayName })
			.from(manuscripts)
			.innerJoin(users, eq(users.id, manuscripts.ownerId))
			.where(eq(manuscripts.id, manuscriptId));
		const members = await db
			.select({
				userId: users.id,
				email: users.email,
				displayName: users.displayName,
				role: projectMembers.role,
			})
			.from(projectMembers)
			.innerJoin(users, eq(users.id, projectMembers.userId))
			.where(eq(projectMembers.manuscriptId, manuscriptId))
			.orderBy(asc(projectMembers.createdAt));
		const result: ManuscriptMember[] = [
			...(owner ? [{ ...owner, role: "OWNER" as const }] : []),
			...members,
		];
		return c.json(result);
	})
	.post("/:id/members", requireRole("OWNER"), validate("json", inviteMemberSchema), async (c) => {
		const manuscriptId = c.req.param("id");
		const { email, role } = c.req.valid("json");
		const invitee = await db.query.users.findFirst({ where: eq(users.email, email) });
		if (!invitee) throw notFound("Aucun compte Manuspace avec cet email");
		if (invitee.id === c.var.user.id) {
			throw new HTTPException(409, { message: "Vous êtes déjà propriétaire de ce manuscrit" });
		}
		try {
			await db.insert(projectMembers).values({ manuscriptId, userId: invitee.id, role });
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new HTTPException(409, { message: "Cette personne est déjà invitée" });
			}
			throw error;
		}
		const member: ManuscriptMember = {
			userId: invitee.id,
			email: invitee.email,
			displayName: invitee.displayName,
			role,
		};
		return c.json(member, 201);
	})
	.patch(
		"/:id/members/:userId",
		requireRole("OWNER"),
		memberParam,
		validate("json", updateMemberSchema),
		async (c) => {
			const { id: manuscriptId, userId } = c.req.valid("param");
			const [updated] = await db
				.update(projectMembers)
				.set({ role: c.req.valid("json").role })
				.where(
					and(eq(projectMembers.manuscriptId, manuscriptId), eq(projectMembers.userId, userId)),
				)
				.returning();
			if (!updated) throw notFound("Collaborateur introuvable");
			return c.json({ ok: true });
		},
	)
	/** Le propriétaire retire un collaborateur, ou un collaborateur quitte le manuscrit. */
	.delete("/:id/members/:userId", requireRole("VIEWER"), memberParam, async (c) => {
		const { id: manuscriptId, userId } = c.req.valid("param");
		if (c.var.role !== "OWNER" && userId !== c.var.user.id) {
			throw new HTTPException(403, {
				message: "Seul le propriétaire peut retirer un collaborateur",
			});
		}
		const [removed] = await db
			.delete(projectMembers)
			.where(and(eq(projectMembers.manuscriptId, manuscriptId), eq(projectMembers.userId, userId)))
			.returning();
		if (!removed) throw notFound("Collaborateur introuvable");
		return c.json({ ok: true });
	});
