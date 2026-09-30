import { type DocumentVersion, diffLines } from "@manuspace/shared";
import { useQuery } from "@tanstack/react-query";
import { GitCompareIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { versionTextQuery } from "@/lib/manuscripts";
import { cn } from "@/lib/utils";
import { MarkdownView } from "./markdown-view";

const dateTime = new Intl.DateTimeFormat("fr", { dateStyle: "long", timeStyle: "short" });

type Props = {
	manuscriptId: string;
	nodeId: string;
	version: DocumentVersion;
	currentText: string;
	canRestore: boolean;
	onRestore: (text: string) => void;
	onClose: () => void;
};

/** Aperçu d'une version passée : mise en page, ou comparaison avec le texte actuel. */
export function VersionView({
	manuscriptId,
	nodeId,
	version,
	currentText,
	canRestore,
	onRestore,
	onClose,
}: Props) {
	const { data } = useQuery(versionTextQuery(manuscriptId, nodeId, version.revision));
	const [compare, setCompare] = useState(true);
	const identical = data?.text === currentText;
	const diff = useMemo(() => (data ? diffLines(data.text, currentText) : []), [data, currentText]);

	return (
		<div className="grid">
			<div className="flex flex-wrap items-center justify-between gap-2 border-b bg-tag-yellow/15 px-3 py-2">
				<p className="text-sm">
					Version du <strong>{dateTime.format(new Date(version.endedAt))}</strong>
					{identical && <span className="text-muted-foreground"> · identique au texte actuel</span>}
				</p>
				<div className="flex flex-wrap gap-2">
					<Button
						size="xs"
						variant={compare ? "secondary" : "ghost"}
						aria-pressed={compare}
						onClick={() => setCompare((c) => !c)}
					>
						<GitCompareIcon /> Comparer avec l'actuelle
					</Button>
					{canRestore && !identical && data && (
						<Button size="xs" onClick={() => onRestore(data.text)}>
							<RotateCcwIcon /> Restaurer cette version
						</Button>
					)}
					<Button size="icon-xs" variant="ghost" aria-label="Fermer l'aperçu" onClick={onClose}>
						<XIcon />
					</Button>
				</div>
			</div>
			{!data ? (
				<p className="p-8 text-sm text-muted-foreground">Reconstitution de la version…</p>
			) : compare ? (
				<div className="max-h-[70vh] overflow-y-auto p-6">
					<p className="mb-4 flex gap-4 text-xs text-muted-foreground">
						<span>
							<span className="bg-tag-red/20 px-1 line-through">barré</span> : dans cette version,
							plus dans l'actuelle
						</span>
						<span>
							<span className="bg-tag-green/20 px-1">surligné</span> : ajouté depuis
						</span>
					</p>
					<ol className="font-serif text-base leading-relaxed">
						{diff.map((line, i) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: lignes de comparaison, ordre stable
								key={i}
								className={cn(
									"min-h-[1.5em] whitespace-pre-wrap break-words px-2",
									line.kind === "removed" && "bg-tag-red/20 line-through",
									line.kind === "added" && "bg-tag-green/20",
								)}
							>
								<span className="sr-only">
									{line.kind === "removed" ? "Retiré : " : line.kind === "added" ? "Ajouté : " : ""}
								</span>
								{line.text}
							</li>
						))}
					</ol>
				</div>
			) : (
				<article className="manuscript-prose max-h-[70vh] overflow-y-auto">
					<MarkdownView source={data.text} />
				</article>
			)}
		</div>
	);
}
