import type { ManuscriptNode } from "@manuspace/shared";
import { FilePlusIcon, FolderPlusIcon, PenLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatUpdatedAt, wordCountLabel } from "@/lib/manuscripts";
import type { NodeAction } from "./node-actions";
import { NodeIcon } from "./node-icon";

type Props = {
	/** Nœud sélectionné, ou undefined pour la racine du manuscrit. */
	node: ManuscriptNode | undefined;
	items: ManuscriptNode[];
	canEdit: boolean;
	onSelect: (nodeId: string) => void;
	onAction: (action: NodeAction) => void;
};

const TYPE_LABELS = { folder: "Dossier", text: "Document", file: "Fichier" } as const;

function UpdatedBy({ node }: { node: ManuscriptNode }) {
	return (
		<>
			{formatUpdatedAt(node.updatedAt)}
			{node.updatedBy && <> par {node.updatedBy.displayName}</>}
		</>
	);
}

export function NodeDetails({ node, items, canEdit, onSelect, onAction }: Props) {
	if (node?.type === "text") {
		return (
			<div className="grid gap-4">
				<header>
					<h2 className="font-serif text-2xl">{node.name}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{wordCountLabel(node.wordCount)} · modifié <UpdatedBy node={node} />
					</p>
				</header>
				<div className="grid place-items-center gap-2 rounded-xl border border-dashed py-20 text-center text-muted-foreground">
					<PenLineIcon className="size-6" />
					<p>L'éditeur arrive à la prochaine étape.</p>
				</div>
			</div>
		);
	}

	const parentId = node?.id ?? null;
	return (
		<div className="grid gap-4">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-serif text-2xl">{node?.name ?? "Sommaire"}</h2>
				{canEdit && (
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => onAction({ kind: "create", parentId, type: "text" })}
						>
							<FilePlusIcon /> Document
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => onAction({ kind: "create", parentId, type: "folder" })}
						>
							<FolderPlusIcon /> Dossier
						</Button>
					</div>
				)}
			</header>
			{items.length === 0 ? (
				<p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
					Ce dossier est vide.
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Nom</TableHead>
							<TableHead className="hidden sm:table-cell">Type</TableHead>
							<TableHead className="hidden md:table-cell">Mots</TableHead>
							<TableHead>Dernière modification</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => (
							<TableRow key={item.id} className="cursor-pointer" onClick={() => onSelect(item.id)}>
								<TableCell>
									<button
										type="button"
										className="flex items-center gap-2 font-medium hover:underline"
										onClick={(e) => {
											e.stopPropagation();
											onSelect(item.id);
										}}
									>
										<NodeIcon type={item.type} />
										{item.name}
									</button>
								</TableCell>
								<TableCell className="hidden text-muted-foreground sm:table-cell">
									{TYPE_LABELS[item.type]}
								</TableCell>
								<TableCell className="hidden text-muted-foreground md:table-cell">
									{item.type === "text" ? (item.wordCount ?? 0).toLocaleString("fr") : "—"}
								</TableCell>
								<TableCell className="text-muted-foreground">
									<UpdatedBy node={item} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</div>
	);
}
