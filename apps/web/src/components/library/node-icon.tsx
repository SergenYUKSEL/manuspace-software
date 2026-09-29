import type { NodeType } from "@manuspace/shared";
import { FileIcon, FileTextIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function NodeIcon({
	type,
	open = false,
	className,
}: {
	type: NodeType;
	open?: boolean;
	className?: string;
}) {
	const Icon =
		type === "folder"
			? open
				? FolderOpenIcon
				: FolderIcon
			: type === "text"
				? FileTextIcon
				: FileIcon;
	return (
		<Icon
			className={cn(
				"size-4 shrink-0",
				type === "folder" ? "text-amber-600" : "text-muted-foreground",
				className,
			)}
		/>
	);
}
