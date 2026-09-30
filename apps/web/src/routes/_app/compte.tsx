import type { PublicUser } from "@manuspace/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { PageToolbar } from "@/components/app-shell/page-toolbar";
import { FormField } from "@/components/form-field";
import { SegmentedControl } from "@/components/segmented-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, call } from "@/lib/api";
import { meQuery } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/_app/compte")({
	component: AccountPage,
});

function useMe() {
	const { data } = useSuspenseQuery(meQuery);
	if (!data) throw new Error("Session absente");
	return data;
}

function useSetMe() {
	const queryClient = useQueryClient();
	return (user: PublicUser) => queryClient.setQueryData(meQuery.queryKey, user);
}

function formValues(event: React.FormEvent<HTMLFormElement>) {
	event.preventDefault();
	return Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
}

function AccountPage() {
	return (
		<>
			<PageToolbar title="Mon compte" />
			<div className="grid max-w-2xl gap-5 p-5">
				<ProfileCard />
				<AppearanceCard />
				<PasswordCard />
				<TwoFactorCard />
			</div>
		</>
	);
}

function AppearanceCard() {
	const { preference, setPreference } = useTheme();
	return (
		<Card>
			<CardHeader>
				<CardTitle>Apparence</CardTitle>
				<CardDescription>
					Réglage propre à cet appareil. Auto suit celui du système.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<SegmentedControl
					label="Apparence"
					value={preference}
					onChange={setPreference}
					options={[
						{ value: "auto", label: "Auto", icon: MonitorIcon },
						{ value: "light", label: "Clair", icon: SunIcon },
						{ value: "dark", label: "Sombre", icon: MoonIcon },
					]}
				/>
			</CardContent>
		</Card>
	);
}

function ProfileCard() {
	const me = useMe();
	const setMe = useSetMe();
	const update = useMutation({
		mutationFn: (json: { displayName: string; email: string }) =>
			call(api.account.profile.$patch({ json })),
		onSuccess: (user) => {
			setMe(user);
			toast.success("Profil mis à jour");
		},
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Profil</CardTitle>
				<CardDescription>Votre nom est visible par vos co-auteurs et correcteurs.</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						const { displayName = "", email = "" } = formValues(e);
						update.mutate({ displayName, email });
					}}
				>
					<FormField
						label="Nom affiché"
						name="displayName"
						defaultValue={me.displayName}
						required
					/>
					<FormField label="Email" name="email" type="email" defaultValue={me.email} required />
					<Button type="submit" className="justify-self-start" disabled={update.isPending}>
						Enregistrer
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function PasswordCard() {
	const change = useMutation({
		mutationFn: (json: { currentPassword: string; newPassword: string }) =>
			call(api.account.password.$post({ json })),
		onSuccess: () =>
			toast.success("Mot de passe modifié, vos autres sessions ont été déconnectées"),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Mot de passe</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						const form = e.currentTarget;
						const { currentPassword = "", newPassword = "" } = formValues(e);
						change.mutate({ currentPassword, newPassword }, { onSuccess: () => form.reset() });
					}}
				>
					<FormField
						label="Mot de passe actuel"
						name="currentPassword"
						type="password"
						autoComplete="current-password"
						required
					/>
					<FormField
						label="Nouveau mot de passe (12 caractères minimum)"
						name="newPassword"
						type="password"
						autoComplete="new-password"
						minLength={12}
						required
					/>
					<Button type="submit" className="justify-self-start" disabled={change.isPending}>
						Changer le mot de passe
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

const codeInputProps = {
	inputMode: "numeric",
	autoComplete: "one-time-code",
	pattern: "\\d{6}",
	maxLength: 6,
	required: true,
} as const;

function TwoFactorCard() {
	const me = useMe();
	const setMe = useSetMe();
	const [setupUri, setSetupUri] = useState<string | null>(null);

	const setup = useMutation({
		mutationFn: () => call(api.account.totp.setup.$post()),
		onSuccess: ({ uri }) => setSetupUri(uri),
	});
	const enable = useMutation({
		mutationFn: (code: string) => call(api.account.totp.enable.$post({ json: { code } })),
		onSuccess: (user) => {
			setMe(user);
			setSetupUri(null);
			toast.success("Authentification à deux facteurs activée");
		},
	});
	const disable = useMutation({
		mutationFn: (json: { password: string; code: string }) =>
			call(api.account.totp.disable.$post({ json })),
		onSuccess: (user) => {
			setMe(user);
			toast.success("Authentification à deux facteurs désactivée");
		},
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					Authentification à deux facteurs
					<Badge variant={me.totpEnabled ? "default" : "outline"}>
						{me.totpEnabled ? "Activée" : "Désactivée"}
					</Badge>
				</CardTitle>
				<CardDescription>
					Un code temporaire (Google Authenticator, 1Password, Aegis…) est demandé à chaque
					connexion.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{me.totpEnabled ? (
					<form
						className="grid gap-4"
						onSubmit={(e) => {
							const { password = "", code = "" } = formValues(e);
							disable.mutate({ password, code });
						}}
					>
						<FormField label="Mot de passe" name="password" type="password" required />
						<FormField label="Code de vérification" name="code" {...codeInputProps} />
						<Button type="submit" variant="destructive" className="justify-self-start">
							Désactiver la 2FA
						</Button>
					</form>
				) : setupUri ? (
					<form className="grid gap-4" onSubmit={(e) => enable.mutate(formValues(e).code ?? "")}>
						<p className="text-sm">
							1. Scannez ce QR code avec votre application d'authentification.
						</p>
						<div className="justify-self-start rounded-lg border bg-white p-3">
							<QRCodeSVG value={setupUri} size={176} />
						</div>
						<details className="text-sm text-muted-foreground">
							<summary className="cursor-pointer">Saisie manuelle de la clé</summary>
							<code className="mt-2 block break-all">
								{new URL(setupUri).searchParams.get("secret")}
							</code>
						</details>
						<p className="text-sm">2. Saisissez le code affiché pour confirmer.</p>
						<FormField label="Code de vérification" name="code" {...codeInputProps} autoFocus />
						<div className="flex gap-2">
							<Button type="submit" disabled={enable.isPending}>
								Activer
							</Button>
							<Button type="button" variant="ghost" onClick={() => setSetupUri(null)}>
								Annuler
							</Button>
						</div>
					</form>
				) : (
					<Button onClick={() => setup.mutate()} disabled={setup.isPending}>
						Configurer la 2FA
					</Button>
				)}
			</CardContent>
		</Card>
	);
}
