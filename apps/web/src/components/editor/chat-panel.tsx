import { CHAT_MAX_LENGTH, type ChatMessage } from "@manuspace/shared";
import { SendHorizontalIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CollabConnection } from "./collab-connection";

const time = new Intl.DateTimeFormat("fr", { hour: "2-digit", minute: "2-digit" });

type Props = {
	connection: CollabConnection;
	messages: ChatMessage[];
	error: string | null;
	connected: boolean;
	myId: string;
	onClose: () => void;
};

/** Messagerie de la session d'édition : échanges rapides pendant la co-écriture ou la correction. */
export function ChatPanel({ connection, messages, error, connected, myId, onClose }: Props) {
	const [draft, setDraft] = useState("");
	const list = useRef<HTMLOListElement>(null);

	// Toujours afficher le dernier message.
	const count = messages.length;
	useEffect(() => {
		if (count > 0) list.current?.lastElementChild?.scrollIntoView({ block: "end" });
	}, [count]);

	const send = () => {
		if (connection.sendChat(draft)) setDraft("");
	};

	return (
		<aside
			aria-label="Discussion de la session"
			className="flex h-full min-h-80 flex-col bg-sidebar backdrop-blur-2xl"
		>
			<header className="flex items-center justify-between border-b px-3 py-2">
				<h3 className="text-sm font-medium">Discussion</h3>
				<Button size="icon-xs" variant="ghost" aria-label="Fermer la discussion" onClick={onClose}>
					<XIcon />
				</Button>
			</header>
			<ol
				ref={list}
				role="log"
				aria-live="polite"
				className="flex-1 space-y-3 overflow-y-auto p-3 text-sm"
			>
				{messages.length === 0 && (
					<li className="text-muted-foreground">
						Aucun message. Les échanges restent visibles pendant la session d'édition.
					</li>
				)}
				{messages.map((message) => (
					<li key={message.id}>
						<p className="flex items-baseline gap-2">
							<span className="font-medium" style={{ color: message.color }}>
								{message.userId === myId ? "Vous" : message.name}
							</span>
							<time dateTime={message.sentAt} className="text-xs text-muted-foreground">
								{time.format(new Date(message.sentAt))}
							</time>
						</p>
						{/* Texte brut : rendu comme du texte par React, jamais comme du HTML. */}
						<p className="break-words whitespace-pre-wrap">{message.text}</p>
					</li>
				))}
			</ol>
			<form
				className="flex items-end gap-2 border-t p-2"
				onSubmit={(e) => {
					e.preventDefault();
					send();
				}}
			>
				<textarea
					aria-label="Message"
					rows={2}
					maxLength={CHAT_MAX_LENGTH}
					value={draft}
					disabled={!connected}
					placeholder={connected ? "Écrire un message…" : "Hors ligne"}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						// Entrée envoie, Maj+Entrée va à la ligne (hors saisie composée).
						if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
							e.preventDefault();
							send();
						}
					}}
					className="min-h-9 flex-1 resize-none rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				/>
				<Button
					type="submit"
					size="icon-sm"
					aria-label="Envoyer"
					disabled={!connected || !draft.trim()}
				>
					<SendHorizontalIcon />
				</Button>
			</form>
			{error && <p className="px-3 pb-2 text-xs text-destructive">{error}</p>}
		</aside>
	);
}
