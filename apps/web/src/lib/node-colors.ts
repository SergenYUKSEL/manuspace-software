import type { NodeColor } from "@manuspace/shared";

export const COLOR_LABELS: Record<NodeColor, string> = {
	red: "Rouge",
	orange: "Orange",
	yellow: "Jaune",
	green: "Vert",
	blue: "Bleu",
	purple: "Violet",
	gray: "Gris",
};

/** Classes écrites en entier pour que Tailwind les détecte. */
export const tagClass: Record<NodeColor, { text: string; bg: string }> = {
	red: { text: "text-tag-red", bg: "bg-tag-red" },
	orange: { text: "text-tag-orange", bg: "bg-tag-orange" },
	yellow: { text: "text-tag-yellow", bg: "bg-tag-yellow" },
	green: { text: "text-tag-green", bg: "bg-tag-green" },
	blue: { text: "text-tag-blue", bg: "bg-tag-blue" },
	purple: { text: "text-tag-purple", bg: "bg-tag-purple" },
	gray: { text: "text-tag-gray", bg: "bg-tag-gray" },
};
