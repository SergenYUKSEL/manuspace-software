import { hasRole } from "@manuspace/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ChevronRightIcon,
	MoreHorizontalIcon,
	PencilIcon,
	Trash2Icon,
	UsersIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { NodeAction } from "@/components/library/node-actions";
import { NodeDetails } from "@/components/library/node-details";
import { NodeTree } from "@/components/library/node-tree";
import { ShareDialog } from "@/components/library/share-dialog";
import { NameDialog } from "@/components/name-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, call } from "@/lib/api";
import { ACCEPTED_TYPES, replaceFile, uploadFile } from "@/lib/files";
import {
	ancestry,
	childrenByParent,
	manuscriptQuery,
	manuscriptsQuery,
	nodesQuery,
	ROLE_LABELS,
} from "@/lib/manuscripts";

export const Route = createFileRoute("/_app/manuscrits/$id")({
	validateSearch: z.object({ node: z.string().optional() }),
	loader: ({ context, params }) =>
		Promise.all([
			context.queryClient.ensureQueryData(manuscriptQuery(params.id)),
			context.queryClient.ensureQueryData(nodesQuery(params.id)),
		]),
	component: ManuscriptPage,
});

type ManuscriptDialog =
	| NodeAction
	| { kind: "rename-manuscript" }
	| { kind: "delete-manuscript" }
	| null;

function ManuscriptPage() {
	const { id } = Route.useParams();
	const { node: selectedId } = Route.useSearch();
	const { user } = Route.useRouteContext();
	const navigate = useNavigate({ from: Route.fullPath });
	const queryClient = useQueryClient();

	const { data: manuscript } = useSuspenseQuery(manuscriptQuery(id));
	const { data: nodes } = useSuspenseQuery(nodesQuery(id));
	const [dialog, setDialog] = useState<ManuscriptDialog>(null);
	const [sharing, setSharing] = useState(false);

	const canEdit = hasRole(manuscript.role, "EDITOR");
	const isOwner = manuscript.role === "OWNER";
	const selected = nodes.find((n) => n.id === selectedId);
	const children = useMemo(() => childrenByParent(nodes), [nodes]);
	const path = ancestry(nodes, selected?.id);

	const select = (nodeId: string | undefined) => navigate({ search: { node: nodeId } });

	// Sélecteur de fichiers caché : ouvert depuis un menu ou un bouton (geste utilisateur).
	const fileInput = useRef<HTMLInputElement>(null);
	const fileTarget = useRef<Extract<NodeAction, { kind: "upload" | "replace" }> | null>(null);

	function handleAction(action: NodeAction) {
		if (action.kind === "upload" || action.kind === "replace") {
			fileTarget.current = action;
			const input = fileInput.current;
			if (!input) return;
			input.multiple = action.kind === "upload";
			input.value = "";
			input.click();
			return;
		}
		setDialog(action);
	}

	/** Import de un ou plusieurs fichiers, avec une notification par fichier. */
	async function importFiles(files: File[], parentId: string | null) {
		let lastId: string | undefined;
		for (const file of files) {
			const upload = uploadFile(id, file, parentId);
			toast.promise(upload, {
				loading: `Import de « ${file.name} »…`,
				success: `« ${file.name} » importé`,
				error: (error: Error) => error.message,
			});
			try {
				lastId = (await upload).id;
			} catch {
				// Déjà signalé par la notification ; on continue avec les fichiers suivants.
			}
		}
		refresh();
		if (lastId && files.length === 1) select(lastId);
	}

	async function onFilesPicked(files: File[]) {
		const target = fileTarget.current;
		if (!target || files.length === 0) return;
		if (target.kind === "upload") return importFiles(files, target.parentId);
		const [file] = files as [File];
		const replacing = replaceFile(id, target.node.id, file);
		toast.promise(replacing, {
			loading: `Remplacement de « ${target.node.name} »…`,
			success: `« ${target.node.name} » remplacé`,
			error: (error: Error) => error.message,
		});
		await replacing.catch(() => {});
		refresh();
	}
	const closeDialog = () => setDialog(null);
	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: nodesQuery(id).queryKey });
		queryClient.invalidateQueries({ queryKey: manuscriptsQuery.queryKey, exact: true });
	};

	const createNode = useMutation({
		mutationFn: (json: { parentId: string | null; type: "folder" | "text"; name: string }) =>
			call(api.manuscripts[":id"].nodes.$post({ param: { id }, json })),
		onSuccess: (node) => {
			refresh();
			closeDialog();
			select(node.id);
		},
	});
	const updateNode = useMutation({
		mutationFn: ({
			nodeId,
			...json
		}: {
			nodeId: string;
			name?: string;
			parentId?: string | null;
		}) => call(api.manuscripts[":id"].nodes[":nodeId"].$patch({ param: { id, nodeId }, json })),
		onSuccess: () => {
			refresh();
			closeDialog();
		},
	});
	const deleteNode = useMutation({
		mutationFn: (nodeId: string) =>
			call(api.manuscripts[":id"].nodes[":nodeId"].$delete({ param: { id, nodeId } })),
		onSuccess: (_, nodeId) => {
			refresh();
			closeDialog();
			// Si l'élément affiché était dans le dossier supprimé, on remonte au parent.
			if (path.some((n) => n.id === nodeId)) {
				select(nodes.find((n) => n.id === nodeId)?.parentId ?? undefined);
			}
		},
	});
	const renameManuscript = useMutation({
		mutationFn: (title: string) =>
			call(api.manuscripts[":id"].$patch({ param: { id }, json: { title } })),
		onSuccess: (updated) => {
			queryClient.setQueryData(manuscriptQuery(id).queryKey, updated);
			queryClient.invalidateQueries({ queryKey: manuscriptsQuery.queryKey, exact: true });
			closeDialog();
		},
	});
	const deleteManuscript = useMutation({
		mutationFn: () => call(api.manuscripts[":id"].$delete({ param: { id } })),
		onSuccess: () => {
			queryClient.removeQueries({ queryKey: ["manuscripts", id] });
			queryClient.invalidateQueries({ queryKey: manuscriptsQuery.queryKey, exact: true });
			toast.success(`« ${manuscript.title} » a été supprimé`);
			navigate({ to: "/" });
		},
	});

	const detailItems =
		selected?.type === "folder" || !selected ? (children.get(selected?.id ?? null) ?? []) : [];

	return (
		<div className="grid gap-6">
			<header className="flex flex-wrap items-center gap-3">
				<div className="min-w-0 flex-1">
					<nav
						aria-label="Fil d'Ariane"
						className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
					>
						<Link to="/" className="hover:text-foreground">
							Bibliothèque
						</Link>
						<ChevronRightIcon className="size-3.5" />
						<button
							type="button"
							className="hover:text-foreground"
							onClick={() => select(undefined)}
						>
							{manuscript.title}
						</button>
						{path.map((node) => (
							<span key={node.id} className="flex items-center gap-1">
								<ChevronRightIcon className="size-3.5" />
								<button
									type="button"
									className="hover:text-foreground"
									onClick={() => select(node.id)}
								>
									{node.name}
								</button>
							</span>
						))}
					</nav>
					<h1 className="mt-1 flex items-center gap-3 font-serif text-3xl">
						<span className="truncate">{manuscript.title}</span>
						<Badge variant="outline" className="font-sans">
							{ROLE_LABELS[manuscript.role]}
						</Badge>
					</h1>
				</div>
				<Button variant="outline" onClick={() => setSharing(true)}>
					<UsersIcon /> Collaborateurs
				</Button>
				{isOwner && (
					<DropdownMenu>
						<DropdownMenuTrigger
							render={<Button variant="ghost" size="icon" aria-label="Actions du manuscrit" />}
						>
							<MoreHorizontalIcon />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => setDialog({ kind: "rename-manuscript" })}>
								<PencilIcon /> Renommer
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								onClick={() => setDialog({ kind: "delete-manuscript" })}
							>
								<Trash2Icon /> Supprimer le manuscrit
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</header>

			<div className="grid gap-6 md:grid-cols-[16rem_1fr]">
				<aside className="md:border-r md:pr-4">
					<NodeTree
						nodes={nodes}
						selectedId={selected?.id}
						canEdit={canEdit}
						onSelect={select}
						onAction={handleAction}
						onMove={(nodeId, parentId) => updateNode.mutate({ nodeId, parentId })}
					/>
				</aside>
				<section>
					<NodeDetails
						node={selected}
						manuscriptId={id}
						user={user}
						items={detailItems}
						canEdit={canEdit}
						onSelect={select}
						onAction={handleAction}
						onDropFiles={importFiles}
					/>
				</section>
			</div>

			<input
				ref={fileInput}
				type="file"
				accept={ACCEPTED_TYPES}
				className="hidden"
				aria-hidden="true"
				tabIndex={-1}
				onChange={(e) => onFilesPicked([...(e.target.files ?? [])])}
			/>
			<NameDialog
				open={dialog?.kind === "create"}
				onOpenChange={(open) => !open && closeDialog()}
				title={
					dialog?.kind === "create" && dialog.type === "folder"
						? "Nouveau dossier"
						: "Nouveau document"
				}
				label="Nom"
				defaultValue=""
				submitLabel="Créer"
				pending={createNode.isPending}
				onSubmit={(name) =>
					dialog?.kind === "create" &&
					createNode.mutate({ parentId: dialog.parentId, type: dialog.type, name })
				}
			/>
			<NameDialog
				open={dialog?.kind === "rename"}
				onOpenChange={(open) => !open && closeDialog()}
				title="Renommer"
				label="Nom"
				defaultValue={dialog?.kind === "rename" ? dialog.node.name : ""}
				submitLabel="Renommer"
				pending={updateNode.isPending}
				onSubmit={(name) =>
					dialog?.kind === "rename" && updateNode.mutate({ nodeId: dialog.node.id, name })
				}
			/>
			<ConfirmDialog
				open={dialog?.kind === "delete"}
				onOpenChange={(open) => !open && closeDialog()}
				title="Supprimer cet élément ?"
				description={
					dialog?.kind === "delete" && dialog.node.type === "folder"
						? `« ${dialog.node.name} » et tout son contenu seront supprimés.`
						: `« ${dialog?.kind === "delete" ? dialog.node.name : ""} » sera supprimé.`
				}
				confirmLabel="Supprimer"
				pending={deleteNode.isPending}
				onConfirm={() => dialog?.kind === "delete" && deleteNode.mutate(dialog.node.id)}
			/>
			<NameDialog
				open={dialog?.kind === "rename-manuscript"}
				onOpenChange={(open) => !open && closeDialog()}
				title="Renommer le manuscrit"
				label="Titre"
				defaultValue={manuscript.title}
				submitLabel="Renommer"
				pending={renameManuscript.isPending}
				onSubmit={(title) => renameManuscript.mutate(title)}
			/>
			<ConfirmDialog
				open={dialog?.kind === "delete-manuscript"}
				onOpenChange={(open) => !open && closeDialog()}
				title="Supprimer le manuscrit ?"
				description={`« ${manuscript.title} », tous ses chapitres et ressources seront définitivement supprimés, pour vous et vos collaborateurs.`}
				confirmLabel="Supprimer définitivement"
				pending={deleteManuscript.isPending}
				onConfirm={() => deleteManuscript.mutate()}
			/>
			<ShareDialog
				manuscriptId={id}
				role={manuscript.role}
				currentUserId={user.id}
				open={sharing}
				onOpenChange={setSharing}
			/>
		</div>
	);
}
