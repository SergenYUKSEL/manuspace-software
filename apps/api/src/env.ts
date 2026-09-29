import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().default(3000),
	DATABASE_URL: z.url(),
	/** Clé AES-256 (32 octets en base64) pour chiffrer les secrets TOTP en base. */
	TOTP_ENCRYPTION_KEY: z
		.base64()
		.refine((v) => Buffer.from(v, "base64").length === 32, "32 octets attendus"),
});

export const env = envSchema.parse(process.env);
