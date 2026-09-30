import type { ProjectRole, TrashEntry } from "@manuspace/shared";
import { hasRole } from "@manuspace/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api, call } from "@/lib/api";
import { formatUpdatedAt, manuscriptsQuery, nodesQuery, trashQuery } from "@/lib/manuscripts";
import { NodeIcon } from "./node-icon";

type Props = { manuscriptId: string; role: ProjectRole };

type Pending = { kind: "destroy"; entry: TrashEntry } | { kind: "empty" } | null;

/** Corbeille : restaurer (co-auteur), supprimer définitivement ou vider (auteur principal). */
export function TrashView({ manuscriptId, role }: Props) {
	const { data: entries } = useSuspenseQuery(trashQuery(manuscriptId));
	const queryClient = useQueryClient();
	const [pending, setPending] = useState<Pending>(null);
	const canRestore = hasRole(role, "EDITOR");
	const isOwner = role === "OWNER";

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: trashQuery(manuscriptId).queryKey });
		queryClient.invalidateQueries({ queryKey: nodesQuery(manuscriptId).queryKey });
		queryClient.invalidateQueries({ queryKey: manuscriptsQuery.queryKey, exact: true });
	};
	const param = (nodeId: string) => ({ param: { id: manuscriptId, nodeId } });

	const restore = useMutation({
		mutationFn: (entry: TrashEntry) =>
			call(api.manuscripts[":id"].trash[":nodeId"].restore.$post(param(entry.id))),
		onSuccess: (_, entry) => {
			refresh();
			toast.success(
				`« ${entry.name} » restauré${entry.restoreTo ? ` dans « ${entry.restoreTo.name} »` : " à la racine"}`,
			);
		},
	});
	const destroy = useMutation({
		mutationFn: (entry: TrashEntry) =>
			call(api.manuscripts[":id"].trash[":nodeId"].$delete(param(entry.id))),
		onSuccess: (_, entry) => {
			refresh();
			setPending(null);
			toast.success(`« ${entry.name} » supprimé définitivement`);
		},
	});
	const empty = useMutation({
		mutationFn: () => call(api.manuscripts[":id"].trash.$delete({ param: { id: manuscriptId } })),
		onSuccess: () => {
			refresh();
			setPending(null);
			toast.success("Corbeille vidée");
		},
	});

	return (
		<section aria-label="Corbeille" className="grid gap-4">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="font-serif text-2xl">Corbeille</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Les éléments sont supprimés définitivement après 30 jours.
					</p>
				</div>
				{isOwner && entries.length > 0 && (
					<Button
						size="sm"
						variant="outline"
						className="text-destructive"
						onClick={() => setPending({ kind: "empty" })}
					>
						<Trash2Icon /> Vider la corbeille
					</Button>
				)}
			</header>

			{entries.length === 0 ? (
				<p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
					La corbeille est vide.
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Élément</TableHead>
							<TableHead className="hidden md:table-cell">Emplacement d'origine</TableHead>
							<TableHead>Supprimé</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{entries.map((entry) => (
							<TableRow key={entry.id}>
								<TableCell>
									<span className="flex items-center gap-2 font-medium">
										<NodeIcon type={entry.type} mimeType={entry.mimeType} />
										{entry.name}
									</span>
									{entry.containedCount > 0 && (
										<span className="ml-6 text-xs text-muted-foreground">
											et {entry.containedCount} élément{entry.containedCount > 1 ? "s" : ""}
										</span>
									)}
								</TableCell>
								<TableCell className="hidden text-muted-foreground md:table-cell">
									{entry.restoreTo?.name ?? "Racine du manuscrit"}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{formatUpdatedAt(entry.deletedAt)}
									{entry.deletedBy && <> par {entry.deletedBy.displayName}</>}
								</TableCell>
								<TableCell className="text-right">
									<div className="flex justify-end gap-1">
										{canRestore && (
											<Button
												size="sm"
												variant="outline"
												disabled={restore.isPending}
												onClick={() => restore.mutate(entry)}
											>
												<RotateCcwIcon /> Restaurer
											</Button>
										)}
										{isOwner && (
											<Button
												size="icon-sm"
												variant="ghost"
												aria-label={`Supprimer définitivement ${entry.name}`}
												onClick={() => setPending({ kind: "destroy", entry })}
											>
												<Trash2Icon className="text-destructive" />
											</Button>
										)}
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			<ConfirmDialog
				open={pending !== null}
				onOpenChange={(open) => !open && setPending(null)}
				title={pending?.kind === "empty" ? "Vider la corbeille ?" : "Supprimer définitivement ?"}
				description={
					pending?.kind === "destroy"
						? `« ${pending.entry.name} »${pending.entry.containedCount > 0 ? " et son contenu" : ""} sera supprimé définitivement. Cette action est irréversible.`
						: `${entries.length} élément${entries.length > 1 ? "s" : ""} et leur contenu seront supprimés définitivement. Cette action est irréversible.`
				}
				confirmLabel="Supprimer définitivement"
				pending={destroy.isPending || empty.isPending}
				onConfirm={() =>
					pending?.kind === "destroy" ? destroy.mutate(pending.entry) : empty.mutate()
				}
			/>
		</section>
	);
}
