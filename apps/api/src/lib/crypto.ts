import { env } from "../env";

/** Jeton aléatoire de 256 bits, encodé pour un cookie. */
export function generateToken(): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

export function sha256Hex(value: string): string {
	return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

const aesKey = await crypto.subtle.importKey(
	"raw",
	Buffer.from(env.TOTP_ENCRYPTION_KEY, "base64"),
	"AES-GCM",
	false,
	["encrypt", "decrypt"],
);

/** Chiffre en AES-256-GCM ; résultat : base64(iv ‖ ciphertext). */
export async function encrypt(plain: Uint8Array<ArrayBuffer>): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plain);
	return Buffer.concat([iv, new Uint8Array(cipher)]).toString("base64");
}

export async function decrypt(encoded: string): Promise<Uint8Array> {
	const data = Buffer.from(encoded, "base64");
	const plain = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: data.subarray(0, 12) },
		aesKey,
		data.subarray(12),
	);
	return new Uint8Array(plain);
}
