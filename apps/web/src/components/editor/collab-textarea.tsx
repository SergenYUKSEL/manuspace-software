import { type PeerState, TextOperation } from "@manuspace/shared";
import {
	forwardRef,
	type KeyboardEvent,
	useCallback,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { CollabConnection } from "./collab-connection";
import { type Edit, insertSceneBreak, toggleLinePrefix, toggleWrap } from "./formatting";
import { UndoManager } from "./undo-manager";

export type FormatCommand =
	| { kind: "wrap"; marker: "**" | "*" }
	| { kind: "prefix"; prefix: "# " | "## " | "> " }
	| { kind: "scene-break" }
	| { kind: "undo" }
	| { kind: "redo" };

/** Touches qui déplacent le curseur : elles closent le groupe d'annulation en cours. */
const NAVIGATION_KEYS = new Set([
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"ArrowDown",
	"Home",
	"End",
	"PageUp",
	"PageDown",
]);

export type CollabTextareaHandle = {
	run: (command: FormatCommand) => void;
	/** Remplace tout le texte (restauration d'une version) : une modification OT normale, annulable. */
	replaceAll: (text: string) => void;
};

type Props = {
	connection: CollabConnection;
	readOnly: boolean;
	peers: PeerState[];
	label: string;
	onTextChange: (text: string) => void;
};

/**
 * Zone de texte collaborative : chaque modification devient une opération OT (diff avec le
 * texte connu), les opérations des autres sont appliquées en préservant notre sélection.
 */
export const CollabTextarea = forwardRef<CollabTextareaHandle, Props>(function CollabTextarea(
	{ connection, readOnly, peers, label, onTextChange },
	ref,
) {
	const textarea = useRef<HTMLTextAreaElement>(null);
	const undo = useRef(new UndoManager());
	/** Composition en cours (accents, IME) : texte de départ et opérations des autres reçues entre-temps. */
	const composition = useRef<{ base: string; remote: TextOperation } | null>(null);
	const [, forceRender] = useState(0);

	/** Écrit le texte dans la zone en gardant la sélection et le défilement. */
	const display = useCallback((text: string, start: number, end: number) => {
		const el = textarea.current;
		if (!el) return;
		const scroll = el.scrollTop;
		el.value = text;
		el.setSelectionRange(start, end);
		el.scrollTop = scroll;
	}, []);

	// Texte initial et opérations des autres.
	useLayoutEffect(() => {
		const el = textarea.current;
		if (el) el.value = connection.text;
		onTextChange(connection.text);
		return connection.onRemote((operation) => {
			undo.current.transform(operation);
			const current = composition.current;
			if (current) {
				// Ne pas toucher à la zone pendant une composition : on fusionnera à la fin.
				try {
					current.remote = current.remote.compose(operation);
				} catch {
					composition.current = null;
					display(connection.text, connection.text.length, connection.text.length);
				}
			} else if (el) {
				const start = Math.min(operation.transformIndex(el.selectionStart), connection.text.length);
				const end = Math.min(operation.transformIndex(el.selectionEnd), connection.text.length);
				display(connection.text, start, end);
			}
			onTextChange(connection.text);
		});
	}, [connection, display, onTextChange]);

	/** Modification locale : du texte affiché à l'opération envoyée au serveur. */
	const commit = useCallback(
		(next: string, cursor: number, group = true) => {
			const before = connection.text;
			const operation = TextOperation.fromDiff(before, next, cursor);
			if (operation.isNoop()) return;
			connection.applyLocal(operation);
			undo.current.record(operation, before, group);
			onTextChange(connection.text);
		},
		[connection, onTextChange],
	);

	const applyEdit = useCallback(
		(edit: Edit) => {
			commit(edit.text, edit.end, false);
			display(connection.text, edit.start, edit.end);
		},
		[commit, connection, display],
	);

	const runUndo = useCallback(
		(direction: "undo" | "redo") => {
			const el = textarea.current;
			if (!el || readOnly) return;
			const operation =
				direction === "undo"
					? undo.current.undo(connection.text)
					: undo.current.redo(connection.text);
			if (!operation) return;
			connection.applyLocal(operation);
			const position = operation.transformIndex(el.selectionEnd);
			display(connection.text, position, position);
			onTextChange(connection.text);
		},
		[connection, display, onTextChange, readOnly],
	);

	const run = useCallback(
		(command: FormatCommand) => {
			const el = textarea.current;
			if (!el || readOnly) return;
			const { selectionStart: start, selectionEnd: end } = el;
			const text = connection.text;
			switch (command.kind) {
				case "wrap":
					applyEdit(toggleWrap(text, start, end, command.marker));
					break;
				case "prefix":
					applyEdit(toggleLinePrefix(text, start, end, command.prefix));
					break;
				case "scene-break":
					applyEdit(insertSceneBreak(text, end));
					break;
				case "undo":
				case "redo":
					runUndo(command.kind);
					break;
			}
			el.focus();
		},
		[applyEdit, connection, readOnly, runUndo],
	);
	const replaceAll = useCallback(
		(next: string) => {
			if (readOnly) return;
			commit(next, next.length, false);
			display(connection.text, 0, 0);
		},
		[commit, connection, display, readOnly],
	);
	useImperativeHandle(ref, () => ({ run, replaceAll }), [run, replaceAll]);

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (NAVIGATION_KEYS.has(event.key)) undo.current.breakGroup();
		const mod = event.metaKey || event.ctrlKey;
		if (!mod || composition.current) return;
		const key = event.key.toLowerCase();
		const command: FormatCommand | null =
			key === "z"
				? { kind: event.shiftKey ? "redo" : "undo" }
				: key === "y"
					? { kind: "redo" }
					: key === "b"
						? { kind: "wrap", marker: "**" }
						: key === "i"
							? { kind: "wrap", marker: "*" }
							: null;
		if (!command) return;
		event.preventDefault();
		run(command);
	};

	const reportSelection = () => {
		const el = textarea.current;
		if (el) connection.setSelection({ anchor: el.selectionStart, head: el.selectionEnd });
		forceRender((n) => n + 1);
	};

	return (
		<div className="relative h-full">
			<textarea
				ref={textarea}
				aria-label={label}
				readOnly={readOnly}
				spellCheck
				lang="fr"
				className="manuscript-textarea"
				placeholder={readOnly ? "" : "Il était une fois…"}
				onInput={(event) => {
					if (composition.current) return;
					const el = event.currentTarget;
					commit(el.value, el.selectionEnd);
				}}
				onCompositionStart={(event) => {
					composition.current = {
						base: event.currentTarget.value,
						remote: new TextOperation().retain(event.currentTarget.value.length),
					};
				}}
				onCompositionEnd={(event) => {
					const current = composition.current;
					composition.current = null;
					if (!current) return;
					// Frappe composée, transformée contre ce que les autres ont écrit pendant ce temps.
					const el = event.currentTarget;
					const local = TextOperation.fromDiff(current.base, el.value, el.selectionEnd);
					const [localPrime, remotePrime] = TextOperation.transform(local, current.remote);
					const cursor = remotePrime.transformIndex(el.selectionEnd);
					const before = connection.text;
					connection.applyLocal(localPrime);
					undo.current.record(localPrime, before);
					display(connection.text, cursor, cursor);
					onTextChange(connection.text);
				}}
				onKeyDown={onKeyDown}
				onMouseDown={() => undo.current.breakGroup()}
				onSelect={reportSelection}
				onScroll={() => forceRender((n) => n + 1)}
				onBlur={() => connection.setSelection(null)}
			/>
			<RemoteCarets textarea={textarea} connection={connection} peers={peers} />
		</div>
	);
});

/**
 * Curseurs des autres participants, superposés à la zone de texte. Leur position est mesurée
 * dans un calque « miroir » invisible qui reproduit exactement la mise en page du texte.
 */
function RemoteCarets({
	textarea,
	connection,
	peers,
}: {
	textarea: React.RefObject<HTMLTextAreaElement | null>;
	connection: CollabConnection;
	peers: PeerState[];
}) {
	const mirror = useRef<HTMLDivElement>(null);
	const [carets, setCarets] = useState<Caret[]>([]);

	useLayoutEffect(() => {
		const el = textarea.current;
		const box = mirror.current;
		if (!el || !box) return;
		const style = getComputedStyle(el);
		for (const property of [
			"fontFamily",
			"fontSize",
			"fontWeight",
			"lineHeight",
			"letterSpacing",
			"paddingTop",
			"paddingRight",
			"paddingBottom",
			"paddingLeft",
			"borderTopWidth",
			"borderLeftWidth",
			"boxSizing",
		] as const) {
			box.style[property] = style[property];
		}
		box.style.width = `${el.clientWidth}px`;

		const text = connection.text;
		const positioned = peers
			.map((peer) => ({ peer, selection: connection.localSelection(peer) }))
			.filter(
				(p): p is { peer: PeerState; selection: NonNullable<typeof p.selection> } =>
					p.selection !== null,
			)
			.sort((a, b) => a.selection.head - b.selection.head);

		box.replaceChildren();
		let cursor = 0;
		const markers: { peer: PeerState; marker: HTMLSpanElement }[] = [];
		for (const { peer, selection } of positioned) {
			box.append(document.createTextNode(text.slice(cursor, selection.head)));
			const marker = document.createElement("span");
			marker.textContent = "​";
			box.append(marker);
			markers.push({ peer, marker });
			cursor = selection.head;
		}
		box.append(document.createTextNode(`${text.slice(cursor)}​`));
		const lineHeight = Number.parseFloat(style.lineHeight) || 24;
		const next = markers.map(({ peer, marker }) => ({
			peer,
			top: marker.offsetTop - el.scrollTop,
			left: marker.offsetLeft - el.scrollLeft,
			height: lineHeight,
		}));
		// Mesuré à chaque rendu, mais l'état ne change que si une position bouge (pas de boucle).
		setCarets((previous) => (sameCarets(previous, next) ? previous : next));
	});

	return (
		<>
			<div
				ref={mirror}
				aria-hidden="true"
				className="pointer-events-none invisible absolute top-0 left-0 overflow-hidden whitespace-pre-wrap break-words"
			/>
			<div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
				{carets
					.filter((c) => c.top > -c.height && c.top < (textarea.current?.clientHeight ?? 0))
					.map(({ peer, top, left, height }) => (
						<div
							key={peer.sessionId}
							className="collab-caret"
							style={{ top, left, height, borderColor: peer.color }}
						>
							<span className="collab-caret__label" style={{ backgroundColor: peer.color }}>
								{peer.name}
							</span>
						</div>
					))}
			</div>
		</>
	);
}

type Caret = { peer: PeerState; top: number; left: number; height: number };

function sameCarets(a: Caret[], b: Caret[]) {
	return (
		a.length === b.length &&
		a.every(
			(caret, i) =>
				caret.peer === b[i]?.peer && caret.top === b[i]?.top && caret.left === b[i]?.left,
		)
	);
}
