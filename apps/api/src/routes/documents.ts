import { schema } from "@manuspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { SignJWT } from "jose";
import { z } from "zod";
import { db } from "../db";
import { env } from "../env";
import { getManuscriptRole } from "../lib/permissions";
import { validate } from "../lib/validator";
import { type AuthEnv, requireAuth } from "../middleware/auth";

const ticketSecret = new TextEncoder().encode(env.COLLAB_TICKET_SECRET);

export const documents = new Hono<AuthEnv>().use(requireAuth).post(
	"/:id/collab-ticket",
	validate("param", z.object({ id: z.uuid() })),
	/**
	 * Ticket de connexion au serveur collab, valable 60 s pour un seul document.
	 * L'éditeur en redemande un à chaque (re)connexion au serveur collab.
	 */
	async (c) => {
		const { id } = c.req.valid("param");
		const node = await db.query.nodes.findFirst({
			where: and(
				eq(schema.nodes.id, id),
				eq(schema.nodes.type, "text"),
				isNull(schema.nodes.deletedAt),
			),
			columns: { manuscriptId: true },
		});
		const role = node && (await getManuscriptRole(c.var.user.id, node.manuscriptId));
		// 404 aussi quand l'accès est refusé : on ne révèle pas l'existence du document.
		if (!role) throw new HTTPException(404, { message: "Document introuvable" });

		const token = await new SignJWT({
			name: c.var.user.displayName,
			docId: id,
			role,
		})
			.setProtectedHeader({ alg: "HS256" })
			.setSubject(c.var.user.id)
			.setAudience("manuspace-collab")
			.setIssuedAt()
			.setExpirationTime("60s")
			.sign(ticketSecret);

		return c.json({ token });
	},
);
