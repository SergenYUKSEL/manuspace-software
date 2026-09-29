import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

/** zValidator qui renvoie { error, issues } en 400, au même format que les autres erreurs. */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(
	target: Target,
	schema: T,
) =>
	zValidator(target, schema, (result, c) => {
		if (!result.success) {
			return c.json(
				{
					error: result.error.issues[0]?.message ?? "Requête invalide",
					issues: result.error.issues,
				},
				400,
			);
		}
	});
