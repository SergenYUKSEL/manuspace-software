import {
	countWords,
	type DocumentVersion,
	type ManuscriptNode,
	type PeerState,
} from "@manuspace/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
	BookOpenIcon,
	CloudIcon,
	CloudOffIcon,
	HistoryIcon,
	LoaderIcon,
	LockIcon,
	MessageSquareIcon,
	PenLineIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SegmentedControl } from "@/components/segmented-control";
import { Button } from "@/components/ui/button";
import { formatUpdatedAt, wordCountLabel } from "@/lib/manuscripts";
import { initials } from "@/lib/user-color";
import { CallBar } from "./call-bar";
import { ChatPanel } from "./chat-panel";
import type { ConnectionSnapshot } from "./collab-connection";
import { CollabTextarea, type CollabTextareaHandle } from "./collab-textarea";
import { EditorToolbar } from "./editor-toolbar";
import { HistoryPanel } from "./history-panel";
import { MarkdownView } from "./markdown-view";
import { useCall } from "./use-call";
import { useCollabDocument } from "./use-collab-document";
import { VersionView } from "./version-view";

type Props = {
	node: ManuscriptNode;
	manuscriptId: string;
	user: { id: string; displayName: string };
	/** Rôle suffisant pour écrire (le serveur collab le vérifie aussi). */
	canEdit: boolean;
};

/** Monté avec `key={node.id}` : un changement de document recrée la connexion. */
export function ManuscriptEditor({ node, manuscriptId, user, canEdit }: Props) {
	const { connection, snapshot } = useCollabDocument(node.id);
	const queryClient = useQueryClient();

	// En quittant le document : rafraîchit l'arborescence (mots, date, dernier éditeur).
	useEffect(
		() => () => {
			queryClient.invalidateQueries({ queryKey: ["manuscripts", manuscriptId, "nodes"] });
			queryClient.invalidateQueries({ queryKey: ["manuscripts"], exact: true });
		},
		[queryClient, manuscriptId],
	);

	if (snapshot.error) {
		return (
			<p className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
				<TriangleAlertIcon className="size-4" />
				{snapshot.error}
			</p>
		);
	}
	if (!connection || !snapshot.loaded) {
		return (
			<div className="grid gap-3">
				<h2 className="font-serif text-2xl">{node.name}</h2>
				{snapshot.status === "offline" ? (
					<p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
						Hors ligne : ce chapitre n'a pas encore été ouvert sur cet appareil.
					</p>
				) : (
					<EditorSkeleton />
				)}
			</div>
		);
	}
	return (
		<LoadedEditor
			key={node.id}
			node={node}
			manuscriptId={manuscriptId}
			connection={connection}
			snapshot={snapshot}
			userId={user.id}
			canEdit={canEdit}
		/>
	);
}

function LoadedEditor({
	node,
	manuscriptId,
	connection,
	snapshot,
	userId,
	canEdit,
}: {
	node: ManuscriptNode;
	manuscriptId: string;
	connection: NonNullable<ReturnType<typeof useCollabDocument>["connection"]>;
	snapshot: ConnectionSnapshot;
	userId: string;
	canEdit: boolean;
}) {
	const editable = canEdit && !snapshot.readOnly;
	const [mode, setMode] = useState<"write" | "read">(editable ? "write" : "read");
	const [text, setText] = useState(connection.text);
	const textarea = useRef<CollabTextareaHandle>(null);
	const call = useCall(connection, snapshot);
	const onTextChange = useCallback((value: string) => setText(value), []);
	/** Un seul panneau latéral à la fois. */
	const [panel, setPanel] = useState<"chat" | "history" | null>(null);
	const chatOpen = panel === "chat";
	const togglePanel = (name: "chat" | "history") =>
		setPanel((current) => (current === name ? null : name));
	/** Version passée affichée à la place du texte (la zone d'écriture reste montée). */
	const [preview, setPreview] = useState<DocumentVersion | null>(null);
	/** Messages déjà vus : ceux des autres arrivés depuis, panneau fermé, sont « non lus ». */
	const [seen, setSeen] = useState(snapshot.chat.length);
	useEffect(() => {
		if (chatOpen) setSeen(snapshot.chat.length);
	}, [chatOpen, snapshot.chat.length]);
	const unread = snapshot.chat.slice(seen).filter((m) => m.userId !== userId).length;

	return (
		<div className="flex h-full flex-col">
			<div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/80 px-4 py-1.5 backdrop-blur-xl">
				<div className="min-w-48 flex-1">
					<h2 className="truncate text-[13px] font-semibold">{node.name}</h2>
					<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
						<span className="truncate">
							{wordCountLabel(countWords(text))}
							{node.updatedBy && (
								<>
									{" "}
									· modifié {formatUpdatedAt(node.updatedAt)} par {node.updatedBy.displayName}
								</>
							)}
						</span>
						<SaveStatus snapshot={snapshot} editable={editable} />
					</div>
				</div>
				{editable && mode === "write" && !preview && (
					<EditorToolbar onCommand={(command) => textarea.current?.run(command)} />
				)}
				{editable && (
					<SegmentedControl
						label="Mode d'affichage"
						value={mode}
						onChange={setMode}
						options={[
							{ value: "write", label: "Écrire", icon: PenLineIcon },
							{ value: "read", label: "Lecture", icon: BookOpenIcon },
						]}
					/>
				)}
				<Presence peers={snapshot.peers} myId={userId} />
				<CallBar call={call} />
				<Button
					size="sm"
					variant={chatOpen ? "secondary" : "ghost"}
					aria-pressed={chatOpen}
					title="Discussion de la session"
					onClick={() => togglePanel("chat")}
				>
					<MessageSquareIcon />
					<span className="max-2xl:sr-only">Discussion</span>
					{unread > 0 && (
						<span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
							<span className="sr-only">, messages non lus : </span>
							{unread}
						</span>
					)}
				</Button>
				<Button
					size="sm"
					variant={panel === "history" ? "secondary" : "ghost"}
					aria-pressed={panel === "history"}
					title="Historique des versions"
					onClick={() => {
						togglePanel("history");
						setPreview(null);
					}}
				>
					<HistoryIcon />
					<span className="max-2xl:sr-only">Historique</span>
				</Button>
			</div>

			<div className="flex min-h-0 flex-1">
				<div className="relative min-w-0 flex-1 overflow-y-auto">
					{preview && (
						<VersionView
							key={preview.revision}
							manuscriptId={manuscriptId}
							nodeId={node.id}
							version={preview}
							currentText={text}
							canRestore={editable}
							onRestore={(versionText) => {
								textarea.current?.replaceAll(versionText);
								setPreview(null);
								setMode("write");
								toast.success("Version restaurée. ⌘Z pour annuler.");
							}}
							onClose={() => setPreview(null)}
						/>
					)}
					{/* La zone de texte reste montée en mode Lecture : ses opérations et sa sélection sont conservées. */}
					<div hidden={mode !== "write" || preview !== null} className="h-full">
						<CollabTextarea
							ref={textarea}
							connection={connection}
							readOnly={!editable}
							peers={snapshot.peers}
							label={`Texte de ${node.name}`}
							onTextChange={onTextChange}
						/>
					</div>
					{mode === "read" && !preview && (
						<article className="manuscript-prose">
							<MarkdownView source={text} />
						</article>
					)}
				</div>
				{panel && (
					<div className="fixed inset-x-0 bottom-0 z-30 h-[70dvh] overflow-hidden rounded-t-2xl shadow-[var(--shadow-window)] md:static md:h-auto md:w-80 md:rounded-none md:border-l md:shadow-none">
						{chatOpen && (
							<ChatPanel
								connection={connection}
								messages={snapshot.chat}
								error={snapshot.chatError}
								connected={snapshot.status === "connected"}
								myId={userId}
								onClose={() => setPanel(null)}
							/>
						)}
						{panel === "history" && (
							<HistoryPanel
								manuscriptId={manuscriptId}
								nodeId={node.id}
								selected={preview?.revision ?? null}
								onSelect={setPreview}
								onClose={() => {
									setPanel(null);
									setPreview(null);
								}}
							/>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function Presence({ peers, myId }: { peers: PeerState[]; myId: string }) {
	const seen = new Set<string>();
	// Un même utilisateur ouvert dans plusieurs onglets n'apparaît qu'une fois.
	const others = peers.filter(
		(p) => p.userId !== myId && !seen.has(p.userId) && seen.add(p.userId),
	);
	if (others.length === 0) return null;
	return (
		<ul className="flex -space-x-2" aria-label="Personnes sur ce document">
			{others.map((p) => (
				<li
					key={p.userId}
					title={`${p.name} est sur ce document`}
					className="grid size-7 place-items-center rounded-full border-2 border-background text-xs font-medium text-white"
					style={{ backgroundColor: p.color }}
				>
					{initials(p.name)}
				</li>
			))}
		</ul>
	);
}

/** Où en est la sauvegarde : le serveur a-t-il confirmé toutes les frappes ? */
function SaveStatus({ snapshot, editable }: { snapshot: ConnectionSnapshot; editable: boolean }) {
	const [label, Icon, tone] = !editable
		? (["Lecture seule", LockIcon, "text-muted-foreground"] as const)
		: snapshot.status !== "connected"
			? ([
					snapshot.unconfirmed
						? "Hors ligne · modifications gardées sur cet appareil"
						: "Hors ligne · reconnexion…",
					CloudOffIcon,
					"text-amber-700",
				] as const)
			: snapshot.unconfirmed
				? (["Enregistrement…", LoaderIcon, "text-muted-foreground"] as const)
				: (["Enregistré", CloudIcon, "text-muted-foreground"] as const);
	return (
		<p role="status" aria-live="polite" className={`flex items-center gap-1 ${tone}`}>
			<Icon className="size-3" />
			{label}
		</p>
	);
}

function EditorSkeleton() {
	return (
		<div
			role="status"
			className="grid gap-3 rounded-xl border p-8"
			aria-busy="true"
			aria-label="Chargement du document"
		>
			{[90, 100, 95, 70].map((w) => (
				<div key={w} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
			))}
		</div>
	);
}
