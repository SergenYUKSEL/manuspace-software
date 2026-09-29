import { z } from "zod";

const envSchema = z.object({
	PORT: z.coerce.number().default(3001),
	DATABASE_URL: z.url(),
	/** Même valeur que côté API : sert à vérifier les tickets de connexion. */
	COLLAB_TICKET_SECRET: z.string().min(32),
});

export const env = envSchema.parse({
	...process.env,
	// En local l'API occupe PORT ; sur Railway chaque service reçoit son propre PORT.
	PORT: process.env.COLLAB_PORT ?? process.env.PORT,
});
