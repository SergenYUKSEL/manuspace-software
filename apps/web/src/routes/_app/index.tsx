import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BookIcon, BookOpenIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { PageToolbar } from "@/components/app-shell/page-toolbar";
import { NameDialog } from "@/components/name-dialog";
import { Button } from "@/components/ui/button";
import { api, call } from "@/lib/api";
import { formatUpdatedAt, manuscriptsQuery, ROLE_LABELS, wordCountLabel } from "@/lib/manuscripts";

export const Route = createFileRoute("/_app/")({
	validateSearch: z.object({ filtre: z.enum(["partages"]).optional() }),
	loader: ({ context }) => context.queryClient.ensureQueryData(manuscriptsQuery),
	component: Library,
});

function Library() {
	const { data: manuscripts } = useSuspenseQuery(manuscriptsQuery);
	const { filtre } = Route.useSearch();
	const shared = filtre === "partages";
	const visible = shared ? manuscripts.filter((m) => m.role !== "OWNER") : manuscripts;
	const [creating, setCreating] = useState(false);
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const create = useMutation({
		mutationFn: (title: string) => call(api.manuscripts.$post({ json: { title } })),
		onSuccess: (manuscript) => {
			queryClient.invalidateQueries({ queryKey: manuscriptsQuery.queryKey });
			setCreating(false);
			navigate({ to: "/manuscrits/$id", params: { id: manuscript.id } });
		},
	});

	return (
		<section>
			<PageToolbar
				title={shared ? "Partagés avec moi" : "Tous les manuscrits"}
				subtitle={`${visible.length} manuscrit${visible.length > 1 ? "s" : ""}`}
			>
				<Button size="sm" onClick={() => setCreating(true)}>
					<PlusIcon /> Nouveau manuscrit
				</Button>
			</PageToolbar>

			<div className="p-5">
				{visible.length === 0 && shared ? (
					<p className="py-16 text-center text-muted-foreground">
						Aucun manuscrit partagé avec vous pour l'instant.
					</p>
				) : visible.length === 0 ? (
					<div className="grid place-items-center gap-3 rounded-xl border border-dashed py-16 text-center">
						<BookOpenIcon className="size-8 text-muted-foreground" />
						<p className="font-serif text-xl">Votre bibliothèque est vide</p>
						<p className="text-sm text-muted-foreground">
							Commencez un roman : chapitres, personnages et recherches au même endroit.
						</p>
						<Button className="mt-2" onClick={() => setCreating(true)}>
							Créer mon premier manuscrit
						</Button>
					</div>
				) : (
					<ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-3 gap-y-5">
						{visible.map((manuscript) => (
							<li key={manuscript.id}>
								<Link
									to="/manuscrits/$id"
									params={{ id: manuscript.id }}
									className="group grid justify-items-center gap-1.5 rounded-lg p-2 text-center outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
								>
									<span className="grid aspect-[3/4] w-24 place-items-center rounded-md bg-gradient-to-br from-primary/80 to-primary text-primary-foreground shadow-[var(--shadow-window)]">
										<BookIcon className="size-8 opacity-90" />
									</span>
									<span className="line-clamp-2 text-[13px] font-medium">{manuscript.title}</span>
									<span className="text-[11px] text-muted-foreground">
										{wordCountLabel(manuscript.wordCount)} · {formatUpdatedAt(manuscript.updatedAt)}
									</span>
									{manuscript.role !== "OWNER" && (
										<span className="text-[11px] text-muted-foreground">
											{ROLE_LABELS[manuscript.role]} · de {manuscript.owner.displayName}
										</span>
									)}
								</Link>
							</li>
						))}
					</ul>
				)}
			</div>

			<NameDialog
				open={creating}
				onOpenChange={setCreating}
				title="Nouveau manuscrit"
				description="Un dossier Manuscrit avec un premier chapitre, ainsi que Personnages, Univers et Recherches seront créés."
				label="Titre"
				submitLabel="Créer"
				pending={create.isPending}
				onSubmit={(title) => create.mutate(title)}
			/>
		</section>
	);
}
