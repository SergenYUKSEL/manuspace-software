import type { PublicUser } from "@manuspace/shared";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api, call } from "@/lib/api";

const usersQuery = queryOptions({
	queryKey: ["admin", "users"],
	queryFn: () => call(api.admin.users.$get()),
});

export const Route = createFileRoute("/_app/admin")({
	beforeLoad: ({ context }) => {
		if (!context.user.isAdmin) throw redirect({ to: "/" });
	},
	loader: ({ context }) => context.queryClient.ensureQueryData(usersQuery),
	component: AdminPage,
});

function AdminPage() {
	return (
		<div className="grid gap-6">
			<h1 className="font-serif text-3xl">Administration</h1>
			<CreateUserCard />
			<UsersCard />
		</div>
	);
}

function CreateUserCard() {
	const queryClient = useQueryClient();
	const create = useMutation({
		mutationFn: (json: {
			email: string;
			displayName: string;
			password: string;
			isAdmin: boolean;
		}) => call(api.admin.users.$post({ json })),
		onSuccess: (user) => {
			queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
			toast.success(`Compte créé pour ${user.email}`);
		},
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Créer un compte</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					className="grid gap-4 sm:grid-cols-3"
					onSubmit={(e) => {
						e.preventDefault();
						const form = e.currentTarget;
						const data = new FormData(form);
						create.mutate(
							{
								email: String(data.get("email")),
								displayName: String(data.get("displayName")),
								password: String(data.get("password")),
								isAdmin: data.get("isAdmin") === "on",
							},
							{ onSuccess: () => form.reset() },
						);
					}}
				>
					<FormField label="Nom affiché" name="displayName" required />
					<FormField label="Email" name="email" type="email" required />
					<FormField
						label="Mot de passe initial"
						name="password"
						type="password"
						autoComplete="new-password"
						minLength={12}
						required
					/>
					<div className="flex items-center gap-2">
						<input id="isAdmin" name="isAdmin" type="checkbox" className="size-4" />
						<Label htmlFor="isAdmin">Administrateur</Label>
					</div>
					<Button type="submit" className="sm:col-start-3" disabled={create.isPending}>
						Créer le compte
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function UsersCard() {
	const { data: users } = useSuspenseQuery(usersQuery);
	const { user: me } = Route.useRouteContext();
	const queryClient = useQueryClient();

	const toggleBlock = useMutation({
		mutationFn: (user: PublicUser) =>
			call(
				user.blocked
					? api.admin.users[":id"].unblock.$post({ param: { id: user.id } })
					: api.admin.users[":id"].block.$post({ param: { id: user.id } }),
			),
		onSuccess: (user) => {
			queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
			toast.success(user.blocked ? `${user.email} est bloqué` : `${user.email} est débloqué`);
		},
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Comptes ({users.length})</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Nom</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Statut</TableHead>
							<TableHead className="text-right">Action</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{users.map((user) => (
							<TableRow key={user.id}>
								<TableCell className="font-medium">{user.displayName}</TableCell>
								<TableCell>{user.email}</TableCell>
								<TableCell className="flex gap-1">
									{user.isAdmin && <Badge variant="secondary">Admin</Badge>}
									{user.totpEnabled && <Badge variant="outline">2FA</Badge>}
									{user.blocked && <Badge variant="destructive">Bloqué</Badge>}
								</TableCell>
								<TableCell className="text-right">
									{user.id !== me.id && (
										<Button
											size="sm"
											variant={user.blocked ? "outline" : "destructive"}
											disabled={toggleBlock.isPending}
											onClick={() => toggleBlock.mutate(user)}
										>
											{user.blocked ? "Débloquer" : "Bloquer"}
										</Button>
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
