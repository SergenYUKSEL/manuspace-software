import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { ApiError } from "./lib/api";
import { routeTree } from "./routeTree.gen";
import "./index.css";

/** Session expirée ou révoquée (ex. compte bloqué) : retour à la connexion. */
function handleError(error: Error) {
	if (error instanceof ApiError && error.status === 401) {
		queryClient.setQueryData(["me"], null);
		router.navigate({ to: "/login" });
		return;
	}
	toast.error(error.message);
}

const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error, query) => {
			if (query.queryKey[0] !== "me") handleError(error);
		},
	}),
	mutationCache: new MutationCache({ onError: handleError }),
	defaultOptions: { queries: { retry: false } },
});

const router = createRouter({ routeTree, context: { queryClient } });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

// biome-ignore lint/style/noNonNullAssertion: #root est défini dans index.html
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</StrictMode>,
);
