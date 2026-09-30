import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { NODE_COLORS, type NodeColor } from "@manuspace/shared";
import { CheckIcon, XIcon } from "lucide-react";
import { COLOR_LABELS, tagClass } from "@/lib/node-colors";
import { cn } from "@/lib/utils";

const NONE = "none";

/** Tags façon Finder dans un menu : une pastille par couleur, plus « Aucune couleur ». */
export function ColorSwatches({
	value,
	onChange,
}: {
	value: NodeColor | null;
	onChange: (color: NodeColor | null) => void;
}) {
	const swatch =
		"grid size-5 shrink-0 cursor-default place-items-center rounded-full outline-none ring-offset-2 ring-offset-popover focus:ring-2 focus:ring-ring";
	return (
		<MenuPrimitive.RadioGroup
			value={value ?? NONE}
			onValueChange={(next) => onChange(next === NONE ? null : (next as NodeColor))}
			className="flex items-center gap-1.5 px-2 py-1.5"
			aria-label="Couleur"
		>
			{NODE_COLORS.map((color) => (
				<MenuPrimitive.RadioItem
					key={color}
					value={color}
					closeOnClick
					aria-label={COLOR_LABELS[color]}
					title={COLOR_LABELS[color]}
					className={cn(swatch, tagClass[color].bg)}
				>
					<MenuPrimitive.RadioItemIndicator>
						<CheckIcon className="size-3 text-white" />
					</MenuPrimitive.RadioItemIndicator>
				</MenuPrimitive.RadioItem>
			))}
			<MenuPrimitive.RadioItem
				value={NONE}
				closeOnClick
				aria-label="Aucune couleur"
				title="Aucune couleur"
				className={cn(swatch, "border border-border text-muted-foreground")}
			>
				<XIcon className="size-3" />
			</MenuPrimitive.RadioItem>
		</MenuPrimitive.RadioGroup>
	);
}
