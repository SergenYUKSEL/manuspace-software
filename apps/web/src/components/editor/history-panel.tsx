import type { DocumentVersion } from "@manuspace/shared";
import { useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUpdatedAt, versionsQuery } from "@/lib/manuscripts";
import { cn } from "@/lib/utils";

const dateTime = new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short" });

type Props = {
	manuscriptId: string;
	nodeId: string;
	selected: number | null;
	onSelect: (version: DocumentVersion) => void;
	onClose: () => void;
};

/** Versions du chapitre : une par session d'écriture, la plus récente en haut. */
export function HistoryPanel({ manuscriptId, nodeId, selected, onSelect, onClose }: Props) {
	const versions = useQuery({ ...versionsQuery(manuscriptId, nodeId), refetchOnMount: "always" });

	return (
		<aside
			aria-label="Historique des versions"
			className="flex h-full min-h-80 flex-col bg-sidebar backdrop-blur-2xl"
		>
			<header className="flex items-center justify-between border-b px-3 py-2">
				<h3 className="text-sm font-medium">Historique</h3>
				<Button size="icon-xs" variant="ghost" aria-label="Fermer l'historique" onClick={onClose}>
					<XIcon />
				</Button>
			</header>
			{versions.isPending ? (
				<p className="p-3 text-sm text-muted-foreground">Chargement…</p>
			) : versions.data?.length === 0 ? (
				<p className="p-3 text-sm text-muted-foreground">
					Aucune version pour l'instant : écrivez quelques lignes.
				</p>
			) : (
				<ol className="flex-1 overflow-y-auto p-1">
					{versions.data?.map((version, index) => (
						<li key={version.revision}>
							<button
								type="button"
								aria-current={version.revision === selected ? "true" : undefined}
								onClick={() => onSelect(version)}
								className={cn(
									"w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
									version.revision === selected && "bg-muted",
								)}
							>
								<span className="flex items-baseline justify-between gap-2">
									<time
										dateTime={version.endedAt}
										className="font-medium"
										title={dateTime.format(new Date(version.endedAt))}
									>
										{formatUpdatedAt(version.endedAt)}
									</time>
									{index === 0 && <span className="text-xs text-muted-foreground">actuelle</span>}
								</span>
								<span className="block text-xs text-muted-foreground">
									{version.authors.map((a) => a.displayName).join(", ") || "Auteur inconnu"} ·{" "}
									{version.operationCount} modification{version.operationCount > 1 ? "s" : ""}
								</span>
							</button>
						</li>
					))}
				</ol>
			)}
		</aside>
	);
}
