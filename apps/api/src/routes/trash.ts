import { Hono } from "hono";
import { z } from "zod";
import { destroy, emptyTrash, listTrash, restore } from "../lib/trash";
import { validate } from "../lib/validator";
import { requireAuth } from "../middleware/auth";
import { type ManuscriptEnv, requireRole } from "../middleware/manuscript";

const entryParam = validate("param", z.object({ id: z.uuid(), nodeId: z.uuid() }));

/**
 * Corbeille d'un manuscrit. Restaurer : co-auteur. Supprimer définitivement ou vider :
 * auteur principal seulement (action irréversible).
 */
export const trashRoutes = new Hono<ManuscriptEnv>()
	.use(requireAuth)
	.get("/:id/trash", requireRole("VIEWER"), async (c) => c.json(await listTrash(c.req.param("id"))))
	.post("/:id/trash/:nodeId/restore", requireRole("EDITOR"), entryParam, async (c) => {
		const { id, nodeId } = c.req.valid("param");
		return c.json(await restore(id, nodeId, c.var.user.id));
	})
	.delete("/:id/trash/:nodeId", requireRole("OWNER"), entryParam, async (c) => {
		const { id, nodeId } = c.req.valid("param");
		await destroy(id, nodeId);
		return c.json({ ok: true });
	})
	.delete("/:id/trash", requireRole("OWNER"), async (c) =>
		c.json({ deletedCount: await emptyTrash(c.req.param("id")) }),
	);
