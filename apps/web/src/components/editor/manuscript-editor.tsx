import { countWords, type ManuscriptNode, type PeerState } from "@manuspace/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
	BookOpenIcon,
	CloudIcon,
	CloudOffIcon,
	LoaderIcon,
	LockIcon,
	MessageSquareIcon,
	PenLineIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatUpdatedAt, wordCountLabel } from "@/lib/manuscripts";
import { initials } from "@/lib/user-color";
import { CallBar } from "./call-bar";
import { ChatPanel } from "./chat-panel";
import type { ConnectionSnapshot } from "./collab-connection";
import { CollabTextarea, type CollabTextareaHandle } from "./collab-textarea";
import { EditorToolbar } from "./editor-toolbar";
import { MarkdownView } from "./markdown-view";
import { useCall } from "./use-call";
import { useCollabDocument } from "./use-collab-document";

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
			connection={connection}
			snapshot={snapshot}
			userId={user.id}
			canEdit={canEdit}
		/>
	);
}

function LoadedEditor({
	node,
	connection,
	snapshot,
	userId,
	canEdit,
}: {
	node: ManuscriptNode;
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
	const [chatOpen, setChatOpen] = useState(false);
	/** Messages déjà vus : ceux des autres arrivés depuis, panneau fermé, sont « non lus ». */
	const [seen, setSeen] = useState(snapshot.chat.length);
	useEffect(() => {
		if (chatOpen) setSeen(snapshot.chat.length);
	}, [chatOpen, snapshot.chat.length]);
	const unread = snapshot.chat.slice(seen).filter((m) => m.userId !== userId).length;

	return (
		<div className="grid gap-3">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="font-serif text-2xl">{node.name}</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{wordCountLabel(countWords(text))}
						{node.updatedBy && (
							<>
								{" "}
								· modifié {formatUpdatedAt(node.updatedAt)} par {node.updatedBy.displayName}
							</>
						)}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<Button
						size="sm"
						variant={chatOpen ? "secondary" : "outline"}
						aria-pressed={chatOpen}
						onClick={() => setChatOpen((open) => !open)}
					>
						<MessageSquareIcon />
						Discussion
						{unread > 0 && (
							<span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
								<span className="sr-only">, messages non lus : </span>
								{unread}
							</span>
						)}
					</Button>
					<CallBar call={call} />
					<Presence peers={snapshot.peers} myId={userId} />
					<SaveStatus snapshot={snapshot} editable={editable} />
				</div>
			</header>

			<div className={chatOpen ? "grid gap-3 lg:grid-cols-[1fr_18rem]" : "grid"}>
				<div className="overflow-hidden rounded-xl border bg-card">
					<div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-2 py-1.5">
						{editable && mode === "write" ? (
							<EditorToolbar onCommand={(command) => textarea.current?.run(command)} />
						) : (
							<span className="px-2 text-xs text-muted-foreground">
								{editable ? "Aperçu de la mise en page" : "Lecture"}
							</span>
						)}
						{editable && (
							<fieldset className="flex rounded-md border p-0.5">
								<legend className="sr-only">Mode d'affichage</legend>
								<Button
									size="xs"
									variant={mode === "write" ? "secondary" : "ghost"}
									aria-pressed={mode === "write"}
									onClick={() => setMode("write")}
								>
									<PenLineIcon /> Écrire
								</Button>
								<Button
									size="xs"
									variant={mode === "read" ? "secondary" : "ghost"}
									aria-pressed={mode === "read"}
									onClick={() => setMode("read")}
								>
									<BookOpenIcon /> Lecture
								</Button>
							</fieldset>
						)}
					</div>
					{/* La zone de texte reste montée en mode Lecture : ses opérations et sa sélection sont conservées. */}
					<div hidden={mode !== "write"}>
						<CollabTextarea
							ref={textarea}
							connection={connection}
							readOnly={!editable}
							peers={snapshot.peers}
							label={`Texte de ${node.name}`}
							onTextChange={onTextChange}
						/>
					</div>
					{mode === "read" && (
						<article className="manuscript-prose max-h-[70vh] overflow-y-auto">
							<MarkdownView source={text} />
						</article>
					)}
				</div>
				{chatOpen && (
					<ChatPanel
						connection={connection}
						messages={snapshot.chat}
						error={snapshot.chatError}
						connected={snapshot.status === "connected"}
						myId={userId}
						onClose={() => setChatOpen(false)}
					/>
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
		<p role="status" aria-live="polite" className={`flex items-center gap-1.5 text-sm ${tone}`}>
			<Icon className="size-4" />
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
