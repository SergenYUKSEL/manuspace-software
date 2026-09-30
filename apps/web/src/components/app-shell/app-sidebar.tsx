import type { PublicUser } from "@manuspace/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	BookIcon,
	LibraryIcon,
	LogOutIcon,
	MoreHorizontalIcon,
	ShieldIcon,
	UserIcon,
	UsersIcon,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { manuscriptsQuery } from "@/lib/manuscripts";
import { initials } from "@/lib/user-color";

const item =
	"flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-primary";
const active = {
	className: "bg-sidebar-accent font-medium",
	"aria-current": "page" as const,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="grid gap-px">
			<h2 className="px-2 pt-3 pb-1 text-[11px] font-semibold text-muted-foreground">{title}</h2>
			{children}
		</section>
	);
}

/** Barre latérale façon Finder : bibliothèque, manuscrits, compte. */
export function AppSidebar({
	user,
	onLogout,
	onNavigate,
}: {
	user: PublicUser;
	onLogout: () => void;
	/** Fermeture du tiroir sur mobile après un choix. */
	onNavigate?: () => void;
}) {
	const { data: manuscripts = [] } = useQuery(manuscriptsQuery);
	return (
		<nav
			aria-label="Navigation principale"
			className="flex h-full flex-col gap-1 bg-sidebar px-2.5 py-3 backdrop-blur-2xl"
		>
			<Link to="/" onClick={onNavigate} className="px-2 pb-1 font-serif text-lg font-semibold">
				Manuspace
			</Link>
			<Section title="Bibliothèque">
				<Link
					to="/"
					search={{}}
					onClick={onNavigate}
					className={item}
					activeProps={active}
					activeOptions={{ exact: true, includeSearch: true }}
				>
					<LibraryIcon /> Tous les manuscrits
				</Link>
				<Link
					to="/"
					search={{ filtre: "partages" }}
					onClick={onNavigate}
					className={item}
					activeProps={active}
					activeOptions={{ exact: true, includeSearch: true }}
				>
					<UsersIcon /> Partagés avec moi
				</Link>
			</Section>
			<Section title="Manuscrits">
				<div className="grid max-h-[50vh] gap-px overflow-y-auto">
					{manuscripts.map((m) => (
						<Link
							key={m.id}
							to="/manuscrits/$id"
							params={{ id: m.id }}
							onClick={onNavigate}
							className={item}
							activeProps={active}
						>
							<BookIcon /> <span className="truncate">{m.title}</span>
						</Link>
					))}
				</div>
			</Section>
			<div className="mt-auto border-t border-sidebar-border pt-2">
				<DropdownMenu>
					<DropdownMenuTrigger
						className={`${item} w-full`}
						aria-label={`Menu de ${user.displayName}`}
					>
						<span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
							{initials(user.displayName)}
						</span>
						<span className="flex-1 truncate text-left">{user.displayName}</span>
						<MoreHorizontalIcon className="text-muted-foreground!" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" side="top">
						<DropdownMenuItem render={<Link to="/compte" onClick={onNavigate} />}>
							<UserIcon /> Mon compte
						</DropdownMenuItem>
						{user.isAdmin && (
							<DropdownMenuItem render={<Link to="/admin" onClick={onNavigate} />}>
								<ShieldIcon /> Administration
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={onLogout}>
							<LogOutIcon /> Se déconnecter
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</nav>
	);
}
