import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { api, call } from "@/lib/api";
import { meQuery } from "@/lib/auth";
import { clearOfflineDocuments } from "@/lib/offline";

/** Layout des pages authentifiées : redirige vers /login sans session. */
export const Route = createFileRoute("/_app")({
	beforeLoad: async ({ context, location }) => {
		const user = await context.queryClient.ensureQueryData(meQuery);
		if (!user) throw redirect({ to: "/login", search: { redirect: location.href } });
		return { user };
	},
	component: AppLayout,
});

function AppLayout() {
	const { user, queryClient } = Route.useRouteContext();
	const navigate = useNavigate();

	const logout = useMutation({
		mutationFn: () => call(api.auth.logout.$post()),
		onSuccess: async () => {
			await clearOfflineDocuments();
			queryClient.clear();
			queryClient.setQueryData(meQuery.queryKey, null);
			navigate({ to: "/login" });
		},
	});

	const linkClass = "text-sm text-muted-foreground hover:text-foreground";
	const activeProps = { className: "text-sm font-medium text-foreground" };

	return (
		<div className="min-h-screen">
			<header className="border-b">
				<div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
					<Link to="/" className="font-serif text-xl">
						Manuspace
					</Link>
					<nav className="flex gap-4">
						<Link
							to="/"
							className={linkClass}
							activeProps={activeProps}
							activeOptions={{ exact: true }}
						>
							Bibliothèque
						</Link>
						<Link to="/compte" className={linkClass} activeProps={activeProps}>
							Mon compte
						</Link>
						{user.isAdmin && (
							<Link to="/admin" className={linkClass} activeProps={activeProps}>
								Administration
							</Link>
						)}
					</nav>
					<div className="ml-auto flex items-center gap-3">
						<span className="text-sm text-muted-foreground">{user.displayName}</span>
						<Button variant="outline" size="sm" onClick={() => logout.mutate()}>
							Se déconnecter
						</Button>
					</div>
				</div>
			</header>
			<main className="mx-auto max-w-5xl px-4 py-8">
				<Outlet />
			</main>
		</div>
	);
}
