import {
	BoldIcon,
	Heading2Icon,
	Heading3Icon,
	ItalicIcon,
	type LucideIcon,
	MinusIcon,
	QuoteIcon,
	Redo2Icon,
	Undo2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { FormatCommand } from "./collab-textarea";

type Item = { label: string; icon: LucideIcon; command: FormatCommand; shortcut?: string };

const GROUPS: Item[][] = [
	[
		{ label: "Annuler", icon: Undo2Icon, command: { kind: "undo" }, shortcut: "⌘Z" },
		{ label: "Rétablir", icon: Redo2Icon, command: { kind: "redo" }, shortcut: "⇧⌘Z" },
	],
	[
		{ label: "Titre (#)", icon: Heading2Icon, command: { kind: "prefix", prefix: "# " } },
		{ label: "Sous-titre (##)", icon: Heading3Icon, command: { kind: "prefix", prefix: "## " } },
	],
	[
		{
			label: "Gras (**texte**)",
			icon: BoldIcon,
			command: { kind: "wrap", marker: "**" },
			shortcut: "⌘B",
		},
		{
			label: "Italique (*texte*)",
			icon: ItalicIcon,
			command: { kind: "wrap", marker: "*" },
			shortcut: "⌘I",
		},
	],
	[
		{ label: "Citation (>)", icon: QuoteIcon, command: { kind: "prefix", prefix: "> " } },
		{ label: "Changement de scène (***)", icon: MinusIcon, command: { kind: "scene-break" } },
	],
];

/** Barre d'outils : insère les marques Markdown (le texte reste lisible tel quel). */
export function EditorToolbar({ onCommand }: { onCommand: (command: FormatCommand) => void }) {
	return (
		<div role="toolbar" aria-label="Mise en forme" className="flex flex-wrap items-center gap-1">
			{GROUPS.map((group, index) => (
				<div key={group[0]?.label} className="flex items-center gap-0.5">
					{index > 0 && <Separator orientation="vertical" className="mx-1 h-5" />}
					{group.map((item) => (
						<Button
							key={item.label}
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={item.label}
							title={item.shortcut ? `${item.label} — ${item.shortcut}` : item.label}
							// Garder le focus (et la sélection) dans la zone de texte.
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => onCommand(item.command)}
						>
							<item.icon />
						</Button>
					))}
				</div>
			))}
		</div>
	);
}
