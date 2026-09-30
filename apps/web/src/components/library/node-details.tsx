import type { ManuscriptNode } from "@manuspace/shared";
import { FilePlusIcon, FolderPlusIcon, UploadIcon } from "lucide-react";
import { type DragEvent, useState } from "react";
import { ManuscriptEditor } from "@/components/editor/manuscript-editor";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { fileKindLabel, formatSize } from "@/lib/files";
import { formatUpdatedAt } from "@/lib/manuscripts";
import { cn } from "@/lib/utils";
import { FileDetails } from "./file-details";
import type { NodeAction } from "./node-actions";
import { NodeIcon } from "./node-icon";

type Props = {
	/** Nœud sélectionné, ou undefined pour la racine du manuscrit. */
	node: ManuscriptNode | undefined;
	manuscriptId: string;
	user: { id: string; displayName: string };
	items: ManuscriptNode[];
	canEdit: boolean;
	onSelect: (nodeId: string) => void;
	onAction: (action: NodeAction) => void;
	/** Fichiers glissés depuis l'ordinateur sur un dossier. */
	onDropFiles: (files: File[], parentId: string | null) => void;
};

function typeLabel(node: ManuscriptNode) {
	if (node.type === "folder") return "Dossier";
	if (node.type === "text") return "Document";
	return fileKindLabel(node);
}

/** Mots pour un document, poids pour un fichier. */
function sizeLabel(node: ManuscriptNode) {
	if (node.type === "text") return `${(node.wordCount ?? 0).toLocaleString("fr")} mots`;
	if (node.type === "file") return formatSize(node.sizeBytes);
	return "—";
}

function UpdatedBy({ node }: { node: ManuscriptNode }) {
	return (
		<>
			{formatUpdatedAt(node.updatedAt)}
			{node.updatedBy && <> par {node.updatedBy.displayName}</>}
		</>
	);
}

export function NodeDetails(props: Props) {
	const { node, manuscriptId, user, canEdit, onAction } = props;

	if (node?.type === "text") {
		return (
			<ManuscriptEditor
				key={node.id}
				node={node}
				manuscriptId={manuscriptId}
				user={user}
				canEdit={canEdit}
			/>
		);
	}
	if (node?.type === "file") {
		return (
			<div className="p-5">
				<FileDetails
					node={node}
					manuscriptId={manuscriptId}
					canEdit={canEdit}
					onAction={onAction}
				/>
			</div>
		);
	}
	return (
		<div className="p-5">
			<FolderDetails {...props} />
		</div>
	);
}

function FolderDetails({ node, items, canEdit, onSelect, onAction, onDropFiles }: Props) {
	const parentId = node?.id ?? null;
	const [dragging, setDragging] = useState(false);

	const isFileDrag = (e: DragEvent) => canEdit && e.dataTransfer.types.includes("Files");

	return (
		<section
			aria-label={node ? `Contenu de ${node.name}` : "Sommaire du manuscrit"}
			className={cn(
				"grid gap-4 rounded-xl outline-2 outline-offset-4 outline-transparent transition-colors",
				dragging && "outline-dashed outline-primary",
			)}
			onDragOver={(e) => {
				if (!isFileDrag(e)) return;
				e.preventDefault();
				setDragging(true);
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
			}}
			onDrop={(e) => {
				if (!isFileDrag(e)) return;
				e.preventDefault();
				setDragging(false);
				onDropFiles([...e.dataTransfer.files], parentId);
			}}
		>
			<header className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-serif text-2xl">{node?.name ?? "Sommaire"}</h2>
				{canEdit && (
					<div className="flex flex-wrap gap-2">
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
						<Button
							size="sm"
							variant="outline"
							onClick={() => onAction({ kind: "upload", parentId })}
						>
							<UploadIcon /> Importer
						</Button>
					</div>
				)}
			</header>
			{items.length === 0 ? (
				<p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
					Ce dossier est vide.
					{canEdit && <> Glissez-y des PDF ou des images pour les importer.</>}
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Nom</TableHead>
							<TableHead className="hidden sm:table-cell">Type</TableHead>
							<TableHead className="hidden md:table-cell">Taille</TableHead>
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
										<NodeIcon type={item.type} mimeType={item.mimeType} color={item.color} />
										{item.name}
									</button>
								</TableCell>
								<TableCell className="hidden text-muted-foreground sm:table-cell">
									{typeLabel(item)}
								</TableCell>
								<TableCell className="hidden text-muted-foreground md:table-cell">
									{sizeLabel(item)}
								</TableCell>
								<TableCell className="text-muted-foreground">
									<UpdatedBy node={item} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
			{canEdit && items.length > 0 && (
				<p className="text-xs text-muted-foreground">
					Astuce : glissez des PDF ou des images ici pour les importer dans ce dossier (20 Mo max).
				</p>
			)}
		</section>
	);
}
