import { hasRole, type ProjectRole } from "@manuspace/shared";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getManuscriptRole } from "../lib/permissions";
import type { User } from "../lib/session";

export type ManuscriptEnv = {
	Variables: { user: User; sessionId: string; role: ProjectRole };
};

const uuid = z.uuid();

/**
 * Vérifie le rôle de l'utilisateur sur le manuscrit `:id` et l'expose dans `c.var.role`.
 * 404 si l'utilisateur n'y a pas accès (on ne révèle pas son existence), 403 si le rôle est insuffisant.
 */
export const requireRole = (minimum: ProjectRole) =>
	createMiddleware<ManuscriptEnv>(async (c, next) => {
		const id = c.req.param("id");
		const role = uuid.safeParse(id).success
			? await getManuscriptRole(c.var.user.id, id as string)
			: null;
		if (!role) throw new HTTPException(404, { message: "Manuscrit introuvable" });
		if (!hasRole(role, minimum)) {
			throw new HTTPException(403, { message: "Vos droits sur ce manuscrit ne le permettent pas" });
		}
		c.set("role", role);
		await next();
	});
