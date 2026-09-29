import type { ProjectRole } from "@manuspace/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { UserMinusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { api, call } from "@/lib/api";
import { INVITABLE_ROLES, membersQuery, ROLE_LABELS } from "@/lib/manuscripts";
import { cn } from "@/lib/utils";

type InvitableRole = (typeof INVITABLE_ROLES)[number];

type Props = {
	manuscriptId: string;
	role: ProjectRole;
	currentUserId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function RoleSelect({
	value,
	onChange,
	className,
	...props
}: {
	value: InvitableRole;
	onChange: (role: InvitableRole) => void;
	className?: string;
	"aria-label": string;
}) {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value as InvitableRole)}
			className={cn(
				"h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
				className,
			)}
			{...props}
		>
			{INVITABLE_ROLES.map((r) => (
				<option key={r} value={r}>
					{ROLE_LABELS[r]}
				</option>
			))}
		</select>
	);
}

export function ShareDialog({ manuscriptId, role, currentUserId, open, onOpenChange }: Props) {
	const isOwner = role === "OWNER";
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const members = useQuery({ ...membersQuery(manuscriptId), enabled: open });
	const [email, setEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<InvitableRole>("EDITOR");

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: membersQuery(manuscriptId).queryKey });
	const param = (userId: string) => ({ param: { id: manuscriptId, userId } });

	const invite = useMutation({
		mutationFn: () =>
			call(
				api.manuscripts[":id"].members.$post({
					param: { id: manuscriptId },
					json: { email, role: inviteRole },
				}),
			),
		onSuccess: (member) => {
			refresh();
			setEmail("");
			toast.success(
				`${member.displayName} est invité·e comme ${ROLE_LABELS[member.role].toLowerCase()}`,
			);
		},
	});
	const changeRole = useMutation({
		mutationFn: ({ userId, role }: { userId: string; role: InvitableRole }) =>
			call(api.manuscripts[":id"].members[":userId"].$patch({ ...param(userId), json: { role } })),
		onSuccess: refresh,
	});
	const remove = useMutation({
		mutationFn: (userId: string) =>
			call(api.manuscripts[":id"].members[":userId"].$delete(param(userId))),
		onSuccess: (_, userId) => {
			if (userId === currentUserId) {
				queryClient.invalidateQueries({ queryKey: ["manuscripts"] });
				toast.success("Vous avez quitté ce manuscrit");
				navigate({ to: "/" });
				return;
			}
			refresh();
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Collaborateurs</DialogTitle>
					<DialogDescription>
						Co-auteurs : écriture et organisation. Correcteurs et bêta-lecteurs : lecture.
					</DialogDescription>
				</DialogHeader>

				{isOwner && (
					<form
						className="flex flex-wrap gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							invite.mutate();
						}}
					>
						<Input
							type="email"
							placeholder="email@exemple.fr"
							aria-label="Email de la personne à inviter"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className="min-w-48 flex-1"
							required
						/>
						<RoleSelect value={inviteRole} onChange={setInviteRole} aria-label="Rôle" />
						<Button type="submit" disabled={invite.isPending}>
							Inviter
						</Button>
					</form>
				)}

				<Separator />

				<ul className="grid gap-3">
					{members.data?.map((member) => (
						<li key={member.userId} className="flex items-center gap-3">
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">
									{member.displayName}
									{member.userId === currentUserId && (
										<span className="font-normal text-muted-foreground"> (vous)</span>
									)}
								</p>
								<p className="truncate text-xs text-muted-foreground">{member.email}</p>
							</div>
							{isOwner && member.role !== "OWNER" ? (
								<>
									<RoleSelect
										value={member.role as InvitableRole}
										onChange={(r) => changeRole.mutate({ userId: member.userId, role: r })}
										aria-label={`Rôle de ${member.displayName}`}
									/>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={`Retirer ${member.displayName}`}
										onClick={() => remove.mutate(member.userId)}
									>
										<UserMinusIcon />
									</Button>
								</>
							) : (
								<span className="text-sm text-muted-foreground">{ROLE_LABELS[member.role]}</span>
							)}
						</li>
					))}
				</ul>

				{!isOwner && (
					<>
						<Separator />
						<Button
							variant="outline"
							className="justify-self-start"
							onClick={() => remove.mutate(currentUserId)}
						>
							Quitter ce manuscrit
						</Button>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
