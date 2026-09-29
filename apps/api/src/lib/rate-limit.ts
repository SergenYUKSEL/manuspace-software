/**
 * Limiteur en mémoire à fenêtre fixe. Suffisant pour une seule instance d'API ;
 * au-delà, il faudrait un stockage partagé (Redis).
 */
export function createRateLimiter(max: number, windowMs: number) {
	const hits = new Map<string, { count: number; resetAt: number }>();

	return {
		/** Retourne false si la limite est atteinte pour cette clé. */
		consume(key: string): boolean {
			const now = Date.now();
			const entry = hits.get(key);
			if (!entry || entry.resetAt <= now) {
				hits.set(key, { count: 1, resetAt: now + windowMs });
				return true;
			}
			entry.count++;
			return entry.count <= max;
		},
		reset(key: string) {
			hits.delete(key);
		},
	};
}
