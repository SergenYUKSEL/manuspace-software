import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation } from "@tanstack/react-query";
import {
	createFileRoute,
	Outlet,
	redirect,
	useNavigate,
	useRouterState,
} from "@tanstack/react-router";
import { MenuIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
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

	const [drawer, setDrawer] = useState(false);
	// Navigation (liens, retour arrière du navigateur) : le tiroir se ferme.
	const href = useRouterState({ select: (state) => state.location.href });
	// biome-ignore lint/correctness/useExhaustiveDependencies: réagit au changement d'URL
	useEffect(() => setDrawer(false), [href]);

	return (
		<div className="flex h-dvh overflow-hidden">
			{/* Écran large : barre latérale fixe. */}
			<aside className="hidden w-60 shrink-0 border-r border-sidebar-border lg:block">
				<AppSidebar user={user} onLogout={() => logout.mutate()} />
			</aside>
			{/* Écran étroit : tiroir modal (focus piégé, Échap, fermé à chaque navigation). */}
			<DialogPrimitive.Root open={drawer} onOpenChange={setDrawer}>
				<DialogPrimitive.Portal>
					<DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-black/20 lg:hidden" />
					<DialogPrimitive.Popup
						aria-label="Menu"
						className="fixed inset-y-0 left-0 z-50 w-72 shadow-[var(--shadow-window)] outline-none animate-in slide-in-from-left duration-200 lg:hidden"
					>
						<AppSidebar
							user={user}
							onLogout={() => logout.mutate()}
							onNavigate={() => setDrawer(false)}
						/>
					</DialogPrimitive.Popup>
				</DialogPrimitive.Portal>
			</DialogPrimitive.Root>
			<div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Ouvrir le menu"
					className="fixed top-2 left-2 z-30 lg:hidden"
					onClick={() => setDrawer(true)}
				>
					<MenuIcon />
				</Button>
				<Outlet />
			</div>
		</div>
	);
}
