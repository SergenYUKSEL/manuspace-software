import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	PORT: z.coerce.number().default(3000),
	DATABASE_URL: z.url(),
	/** Secret partagé avec le serveur collab pour signer les tickets. */
	COLLAB_TICKET_SECRET: z.string().min(32),
	/** Clé AES-256 (32 octets en base64) pour chiffrer les secrets TOTP en base. */
	TOTP_ENCRYPTION_KEY: z
		.base64()
		.refine((v) => Buffer.from(v, "base64").length === 32, "32 octets attendus"),
	S3_ENDPOINT: z.url(),
	S3_BUCKET: z.string().min(1),
	S3_ACCESS_KEY_ID: z.string().min(1),
	S3_SECRET_ACCESS_KEY: z.string().min(1),
	/** "auto" pour le bucket Railway, us-east-1 pour RustFS en local. */
	S3_REGION: z.string().default("auto"),
	/** URL de type https://bucket.endpoint (bucket Railway) plutôt que https://endpoint/bucket. */
	S3_VIRTUAL_HOSTED_STYLE: z.stringbool().default(false),
});

export const env = envSchema.parse(process.env);
