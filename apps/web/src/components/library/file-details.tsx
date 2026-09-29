import type { ManuscriptNode } from "@manuspace/shared";
import { DownloadIcon, ExternalLinkIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fileContentUrl, fileKindLabel, formatSize, isImage, isPdf } from "@/lib/files";
import { formatUpdatedAt } from "@/lib/manuscripts";
import type { NodeAction } from "./node-actions";

type Props = {
	node: ManuscriptNode;
	manuscriptId: string;
	canEdit: boolean;
	onAction: (action: NodeAction) => void;
};

/** Ressource (carte, recherche, couverture…) : aperçu, téléchargement, remplacement, suppression. */
export function FileDetails({ node, manuscriptId, canEdit, onAction }: Props) {
	const url = fileContentUrl(manuscriptId, node);

	return (
		<div className="grid gap-4">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div className="min-w-0">
					<h2 className="truncate font-serif text-2xl">{node.name}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{fileKindLabel(node)} · {formatSize(node.sizeBytes)} · modifié{" "}
						{formatUpdatedAt(node.updatedAt)}
						{node.updatedBy && <> par {node.updatedBy.displayName}</>}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="outline"
						render={<a href={url} target="_blank" rel="noopener" />}
					>
						<ExternalLinkIcon /> Ouvrir
					</Button>
					<Button
						size="sm"
						variant="outline"
						render={<a href={fileContentUrl(manuscriptId, node, true)} download={node.name} />}
					>
						<DownloadIcon /> Télécharger
					</Button>
					{canEdit && (
						<>
							<Button
								size="sm"
								variant="outline"
								onClick={() => onAction({ kind: "replace", node })}
							>
								<RefreshCwIcon /> Remplacer
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="text-destructive"
								onClick={() => onAction({ kind: "delete", node })}
							>
								<Trash2Icon /> Supprimer
							</Button>
						</>
					)}
				</div>
			</header>

			<div className="overflow-hidden rounded-xl border bg-muted/30">
				{isImage(node) ? (
					<img src={url} alt={node.name} className="mx-auto max-h-[70vh] object-contain" />
				) : isPdf(node) ? (
					<iframe src={url} title={`Aperçu de ${node.name}`} className="h-[75vh] w-full bg-white" />
				) : (
					<p className="p-8 text-center text-sm text-muted-foreground">Aperçu indisponible.</p>
				)}
			</div>
		</div>
	);
}
