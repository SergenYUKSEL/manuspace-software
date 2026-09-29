import type { ManuscriptNode } from "@manuspace/shared";

/** Actions déclenchées depuis l'arborescence ou le panneau de détail, gérées par la page. */
export type NodeAction =
	| { kind: "create"; parentId: string | null; type: "folder" | "text" }
	| { kind: "rename"; node: ManuscriptNode }
	| { kind: "delete"; node: ManuscriptNode };
