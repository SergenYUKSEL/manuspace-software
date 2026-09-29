import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
		<main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="font-serif text-2xl">Manuspace</CardTitle>
					<CardDescription>
						{credentials
							? "Saisissez le code à 6 chiffres de votre application d'authentification."
							: "Connectez-vous à votre bibliothèque de manuscrits."}
					</CardDescription>
				</CardHeader>
				<CardContent>
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
				</CardContent>
			</Card>
		</main>
	);
}
