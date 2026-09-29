import type { PublicUser } from "@manuspace/shared";
import { queryOptions } from "@tanstack/react-query";
import { ApiError, api, call } from "./api";

/** Utilisateur connecté, ou null. Source de vérité côté front pour la session. */
export const meQuery = queryOptions({
	queryKey: ["me"],
	queryFn: async (): Promise<PublicUser | null> => {
		try {
			return await call(api.auth.me.$get());
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) return null;
			throw error;
		}
	},
	staleTime: 5 * 60 * 1000,
});
