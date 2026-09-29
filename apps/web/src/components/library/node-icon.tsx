import type { NodeType } from "@manuspace/shared";
import { FileIcon, FileImageIcon, FileTextIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function NodeIcon({
	type,
	mimeType,
	open = false,
	className,
}: {
	type: NodeType;
	mimeType?: string | null;
	open?: boolean;
	className?: string;
}) {
	const [Icon, color] =
		type === "folder"
			? [open ? FolderOpenIcon : FolderIcon, "text-amber-600"]
			: type === "text"
				? [FileTextIcon, "text-muted-foreground"]
				: mimeType?.startsWith("image/")
					? [FileImageIcon, "text-sky-600"]
					: [FileIcon, "text-red-600"];
	return <Icon className={cn("size-4 shrink-0", color, className)} />;
}
