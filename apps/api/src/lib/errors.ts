/** Violation de contrainte d'unicité Postgres (ex. email déjà utilisé). */
export function isUniqueViolation(error: unknown): boolean {
	const e = error as { code?: string; cause?: { code?: string } };
	return e?.code === "23505" || e?.cause?.code === "23505";
}
