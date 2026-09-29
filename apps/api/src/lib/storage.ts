import { env } from "../env";

/**
 * Endpoint effectif. En style « virtual-hosted », Bun ignore l'option `bucket` : le nom du
 * bucket doit déjà figurer dans l'hôte (https://<bucket>.t3.storageapi.dev).
 */
export function s3Endpoint(endpoint: string, bucket: string, virtualHostedStyle: boolean) {
	if (!virtualHostedStyle) return endpoint;
	const url = new URL(endpoint);
	url.hostname = `${bucket}.${url.hostname}`;
	return url.origin;
}

/** Bucket S3 : bucket Railway en production, RustFS en local (client S3 intégré à Bun). */
const s3 = new Bun.S3Client({
	endpoint: s3Endpoint(env.S3_ENDPOINT, env.S3_BUCKET, env.S3_VIRTUAL_HOSTED_STYLE),
	bucket: env.S3_BUCKET,
	accessKeyId: env.S3_ACCESS_KEY_ID,
	secretAccessKey: env.S3_SECRET_ACCESS_KEY,
	region: env.S3_REGION,
	virtualHostedStyle: env.S3_VIRTUAL_HOSTED_STYLE,
});

/** Clé unique par version : un remplacement écrit un nouvel objet (pas de cache périmé). */
export function storageKey(manuscriptId: string, nodeId: string) {
	return `manuscripts/${manuscriptId}/${nodeId}/${crypto.randomUUID()}`;
}

export async function putObject(key: string, data: Uint8Array, type: string) {
	await s3.write(key, data, { type });
}

export function objectStream(key: string) {
	return s3.file(key).stream();
}

/** Suppression sans échec bloquant : un objet orphelin vaut mieux qu'une action utilisateur en erreur. */
export async function deleteObjects(keys: (string | null)[]) {
	await Promise.all(
		keys
			.filter((key): key is string => Boolean(key))
			.map((key) =>
				s3.delete(key).catch((error) => console.error(`Suppression S3 échouée (${key})`, error)),
			),
	);
}
