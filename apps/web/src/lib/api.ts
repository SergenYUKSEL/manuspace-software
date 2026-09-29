import type { Api } from "@manuspace/api/app";
import type { ClientResponse } from "hono/client";
import { hc } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";

/** Client RPC typé à partir des routes de l'API (même origine : cookies inclus). */
export const api = hc<Api>("/api", { init: { credentials: "include" } });

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

/** Corps JSON des seules réponses 2xx d'une route (les erreurs passent par ApiError). */
type SuccessBody<R> =
	// biome-ignore lint/suspicious/noExplicitAny: format de réponse quelconque
	R extends ClientResponse<infer Body, infer Status, any>
		? Status extends SuccessStatusCode
			? Body
			: never
		: never;

/** Attend la réponse, lève une ApiError si elle n'est pas 2xx, sinon renvoie le JSON typé. */
// biome-ignore lint/suspicious/noExplicitAny: accepte toute réponse du client RPC
export async function call<T extends ClientResponse<any, any, any>>(
	request: Promise<T>,
): Promise<SuccessBody<T>> {
	const res = await request;
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new ApiError(res.status, body?.error ?? "Une erreur est survenue");
	}
	return (await res.json()) as SuccessBody<T>;
}
