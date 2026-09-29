import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BookOpenIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { NameDialog } from "@/components/name-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, call } from "@/lib/api";
import { formatUpdatedAt, manuscriptsQuery, ROLE_LABELS, wordCountLabel } from "@/lib/manuscripts";

export const Route = createFileRoute("/_app/")({
	loader: ({ context }) => context.queryClient.ensureQueryData(manuscriptsQuery),
	component: Library,
});

function Library() {
	const { data: manuscripts } = useSuspenseQuery(manuscriptsQuery);
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
		<section className="grid gap-6">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h1 className="font-serif text-3xl">Bibliothèque</h1>
					<p className="mt-1 text-muted-foreground">
						Vos manuscrits et ceux auxquels vous avez été invité.
					</p>
				</div>
				<Button onClick={() => setCreating(true)}>
					<PlusIcon /> Nouveau manuscrit
				</Button>
			</div>

			{manuscripts.length === 0 ? (
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
				<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{manuscripts.map((manuscript) => (
						<li key={manuscript.id}>
							<Link to="/manuscrits/$id" params={{ id: manuscript.id }} className="block h-full">
								<Card className="h-full transition-colors hover:bg-muted/40">
									<CardHeader>
										<CardTitle className="font-serif text-xl">{manuscript.title}</CardTitle>
										<CardDescription className="grid gap-2">
											<span>
												{wordCountLabel(manuscript.wordCount)} · modifié{" "}
												{formatUpdatedAt(manuscript.updatedAt)}
											</span>
											<span className="flex flex-wrap items-center gap-2">
												<Badge variant={manuscript.role === "OWNER" ? "secondary" : "outline"}>
													{ROLE_LABELS[manuscript.role]}
												</Badge>
												{manuscript.role !== "OWNER" && (
													<span className="text-xs">de {manuscript.owner.displayName}</span>
												)}
											</span>
										</CardDescription>
									</CardHeader>
								</Card>
							</Link>
						</li>
					))}
				</ul>
			)}

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
