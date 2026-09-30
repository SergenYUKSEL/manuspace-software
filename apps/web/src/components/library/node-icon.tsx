import type { NodeColor, NodeType } from "@manuspace/shared";
import { FileIcon, FileImageIcon, FileTextIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { tagClass } from "@/lib/node-colors";
import { cn } from "@/lib/utils";

export function NodeIcon({
	type,
	mimeType,
	color,
	open = false,
	className,
}: {
	type: NodeType;
	mimeType?: string | null;
	/** Couleur choisie par l'utilisateur : elle remplace la teinte par défaut. */
	color?: NodeColor | null;
	open?: boolean;
	className?: string;
}) {
	const [Icon, tone] =
		type === "folder"
			? [open ? FolderOpenIcon : FolderIcon, "text-amber-600"]
			: type === "text"
				? [FileTextIcon, "text-muted-foreground"]
				: mimeType?.startsWith("image/")
					? [FileImageIcon, "text-sky-600"]
					: [FileIcon, "text-red-600"];
	const tint = color ? tagClass[color].text : tone;
	return <Icon className={cn("size-4 shrink-0", tint, className)} />;
}
