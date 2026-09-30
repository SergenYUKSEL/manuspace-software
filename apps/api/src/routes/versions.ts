import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { findNode } from "../lib/nodes";
import { validate } from "../lib/validator";
import { listVersions, textAtRevision } from "../lib/versions";
import { requireAuth } from "../middleware/auth";
import { type ManuscriptEnv, requireRole } from "../middleware/manuscript";

async function findTextNode(manuscriptId: string, nodeId: string) {
	const node = await findNode(manuscriptId, nodeId);
	if (node.type !== "text") throw new HTTPException(404, { message: "Document introuvable" });
	return node;
}

/** Historique des versions d'un chapitre (lecture). La restauration passe par l'éditeur (OT). */
export const versionRoutes = new Hono<ManuscriptEnv>()
	.use(requireAuth)
	.get(
		"/:id/nodes/:nodeId/versions",
		requireRole("VIEWER"),
		validate("param", z.object({ id: z.uuid(), nodeId: z.uuid() })),
		async (c) => {
			const { id, nodeId } = c.req.valid("param");
			await findTextNode(id, nodeId);
			return c.json(await listVersions(nodeId));
		},
	)
	.get(
		"/:id/nodes/:nodeId/versions/:revision",
		requireRole("VIEWER"),
		validate(
			"param",
			z.object({ id: z.uuid(), nodeId: z.uuid(), revision: z.coerce.number().int().min(0) }),
		),
		async (c) => {
			const { id, nodeId, revision } = c.req.valid("param");
			await findTextNode(id, nodeId);
			const text = await textAtRevision(nodeId, revision);
			if (text === null) throw new HTTPException(404, { message: "Version introuvable" });
			return c.json({ revision, text });
		},
	);
