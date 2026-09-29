import type { ManuscriptNode } from "@manuspace/shared";
import {
	ChevronRightIcon,
	FilePlusIcon,
	FolderInputIcon,
	FolderPlusIcon,
	MoreHorizontalIcon,
	PencilIcon,
	Trash2Icon,
} from "lucide-react";
import { type DragEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { childrenByParent } from "@/lib/manuscripts";
import { cn } from "@/lib/utils";
import type { NodeAction } from "./node-actions";
import { NodeIcon } from "./node-icon";

const DRAG_TYPE = "application/x-manuspace-node";
const ROOT = "__root__";

type Props = {
	nodes: ManuscriptNode[];
	selectedId: string | undefined;
	canEdit: boolean;
	onSelect: (nodeId: string | undefined) => void;
	onAction: (action: NodeAction) => void;
	onMove: (nodeId: string, parentId: string | null) => void;
};

export function NodeTree({ nodes, selectedId, canEdit, onSelect, onAction, onMove }: Props) {
	const children = useMemo(() => childrenByParent(nodes), [nodes]);
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const [dropTarget, setDropTarget] = useState<string | null>(null);

	const toggle = (id: string) =>
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	/** Zone de dépôt du glisser-déposer : un dossier, ou la racine (target = ROOT). */
	const dropProps = (target: string) =>
		canEdit
			? {
					onDragOver: (e: DragEvent) => {
						if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
						e.preventDefault();
						e.stopPropagation();
						setDropTarget(target);
					},
					onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
					onDrop: (e: DragEvent) => {
						e.preventDefault();
						e.stopPropagation();
						setDropTarget(null);
						const nodeId = e.dataTransfer.getData(DRAG_TYPE);
						if (nodeId && nodeId !== target) onMove(nodeId, target === ROOT ? null : target);
					},
				}
			: {};

	/** Dossiers où `node` peut aller : ni lui-même, ni ses descendants, ni son parent actuel. */
	function moveTargets(node: ManuscriptNode) {
		const excluded = new Set([node.id]);
		for (let changed = true; changed; ) {
			changed = false;
			for (const n of nodes) {
				if (n.parentId && excluded.has(n.parentId) && !excluded.has(n.id)) {
					excluded.add(n.id);
					changed = true;
				}
			}
		}
		const folders = nodes.filter(
			(n) => n.type === "folder" && !excluded.has(n.id) && n.id !== node.parentId,
		);
		return node.parentId === null ? folders : [null, ...folders];
	}

	function renderNodes(parentId: string | null, depth: number) {
		return (children.get(parentId) ?? []).map((node) => {
			const isFolder = node.type === "folder";
			const isOpen = isFolder && !collapsed.has(node.id);
			const kids = children.get(node.id) ?? [];
			return (
				<li key={node.id}>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: glisser-déposer à la souris ; équivalent clavier via « Déplacer vers… » du menu */}
					<div
						className={cn(
							"group flex h-8 items-center gap-1.5 rounded-md pr-1 text-sm hover:bg-muted",
							node.id === selectedId && "bg-muted font-medium",
							dropTarget === node.id && "ring-2 ring-primary",
						)}
						style={{ paddingLeft: `${depth * 14 + 4}px` }}
						draggable={canEdit}
						onDragStart={(e) => {
							e.dataTransfer.setData(DRAG_TYPE, node.id);
							e.dataTransfer.effectAllowed = "move";
						}}
						{...(isFolder ? dropProps(node.id) : {})}
					>
						{isFolder ? (
							<button
								type="button"
								aria-label={isOpen ? `Replier ${node.name}` : `Déplier ${node.name}`}
								aria-expanded={isOpen}
								className="grid size-4 place-items-center text-muted-foreground"
								onClick={() => toggle(node.id)}
							>
								<ChevronRightIcon
									className={cn("size-3.5 transition-transform", isOpen && "rotate-90")}
								/>
							</button>
						) : (
							<span className="size-4" />
						)}
						<button
							type="button"
							aria-current={node.id === selectedId ? "page" : undefined}
							className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:underline"
							onClick={() => onSelect(node.id)}
						>
							<NodeIcon type={node.type} open={isOpen} />
							<span className="truncate">{node.name}</span>
						</button>
						{canEdit && (
							<NodeMenu
								node={node}
								targets={moveTargets(node)}
								onAction={onAction}
								onMove={onMove}
							/>
						)}
					</div>
					{isOpen && kids.length > 0 && <ul>{renderNodes(node.id, depth + 1)}</ul>}
				</li>
			);
		});
	}

	return (
		<div className="flex h-full flex-col">
			<nav aria-label="Arborescence du manuscrit">
				<ul className="grid gap-px">{renderNodes(null, 0)}</ul>
			</nav>
			{canEdit && (
				<div
					{...dropProps(ROOT)}
					className={cn(
						"mt-2 grid min-h-12 flex-1 place-items-center rounded-md border border-dashed border-transparent text-xs text-muted-foreground",
						dropTarget === ROOT && "border-primary",
					)}
				>
					{dropTarget === ROOT && "Déposer à la racine"}
				</div>
			)}
		</div>
	);
}

function NodeMenu({
	node,
	targets,
	onAction,
	onMove,
}: {
	node: ManuscriptNode;
	/** null = racine du manuscrit */
	targets: (ManuscriptNode | null)[];
	onAction: (a: NodeAction) => void;
	onMove: (nodeId: string, parentId: string | null) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={`Actions pour ${node.name}`}
						className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
					/>
				}
			>
				<MoreHorizontalIcon />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				{node.type === "folder" && (
					<>
						<DropdownMenuItem
							onClick={() => onAction({ kind: "create", parentId: node.id, type: "text" })}
						>
							<FilePlusIcon /> Nouveau document
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => onAction({ kind: "create", parentId: node.id, type: "folder" })}
						>
							<FolderPlusIcon /> Nouveau dossier
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuItem onClick={() => onAction({ kind: "rename", node })}>
					<PencilIcon /> Renommer
				</DropdownMenuItem>
				{targets.length > 0 && (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger className="whitespace-nowrap">
							<FolderInputIcon /> Déplacer vers…
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{targets.map((target) => (
								<DropdownMenuItem
									key={target?.id ?? "root"}
									onClick={() => onMove(node.id, target?.id ?? null)}
								>
									{target ? target.name : <em>Racine du manuscrit</em>}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				)}
				<DropdownMenuItem variant="destructive" onClick={() => onAction({ kind: "delete", node })}>
					<Trash2Icon /> Supprimer
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
