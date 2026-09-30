import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { BookIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { api, call } from "@/lib/api";
import { meQuery } from "@/lib/auth";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	beforeLoad: async ({ context }) => {
		if (await context.queryClient.ensureQueryData(meQuery)) throw redirect({ to: "/" });
	},
	component: LoginPage,
});

function LoginPage() {
	const { queryClient } = Route.useRouteContext();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

	const login = useMutation({
		mutationFn: (json: { email: string; password: string; totp?: string }) =>
			call(api.auth.login.$post({ json })),
		onSuccess: (result, variables) => {
			if (result.status === "totp_required") {
				setCredentials({ email: variables.email, password: variables.password });
				return;
			}
			queryClient.setQueryData(meQuery.queryKey, result.user);
			// Uniquement un chemin interne : pas de redirection ouverte vers un autre site.
			const target = search.redirect?.startsWith("/") ? search.redirect : "/";
			navigate({ to: target });
		},
	});

	function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		if (credentials) {
			login.mutate({ ...credentials, totp: String(form.get("totp")) });
		} else {
			login.mutate({ email: String(form.get("email")), password: String(form.get("password")) });
		}
	}

	return (
		<main className="grid min-h-dvh place-items-center bg-gradient-to-b from-muted to-background p-4">
			<div className="w-full max-w-sm rounded-2xl bg-popover p-7 shadow-[var(--shadow-window)]">
				<div className="mb-5 grid justify-items-center gap-2 text-center">
					<span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/80 to-primary text-primary-foreground shadow-md">
						<BookIcon className="size-7" />
					</span>
					<h1 className="font-serif text-xl font-semibold">Manuspace</h1>
					<p className="text-[13px] text-muted-foreground">
						{credentials
							? "Saisissez le code à 6 chiffres de votre application d'authentification."
							: "Connectez-vous à votre bibliothèque de manuscrits."}
					</p>
				</div>
				<form onSubmit={onSubmit} className="grid gap-4">
					{credentials ? (
						<FormField
							key="totp"
							label="Code de vérification"
							name="totp"
							inputMode="numeric"
							autoComplete="one-time-code"
							pattern="\d{6}"
							maxLength={6}
							required
							autoFocus
						/>
					) : (
						<>
							<FormField
								label="Email"
								name="email"
								type="email"
								autoComplete="email"
								required
								autoFocus
							/>
							<FormField
								label="Mot de passe"
								name="password"
								type="password"
								autoComplete="current-password"
								required
							/>
						</>
					)}
					<Button type="submit" disabled={login.isPending}>
						{credentials ? "Vérifier" : "Se connecter"}
					</Button>
					{credentials && (
						<Button type="button" variant="ghost" onClick={() => setCredentials(null)}>
							Retour
						</Button>
					)}
				</form>
			</div>
		</main>
	);
}
