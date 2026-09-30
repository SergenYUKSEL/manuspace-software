import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string; icon?: LucideIcon };

/** Contrôle segmenté façon macOS : boutons bascule exclusifs dans une capsule grise. */
export function SegmentedControl<T extends string>({
	label,
	value,
	options,
	onChange,
	className,
}: {
	label: string;
	value: T;
	options: Option<T>[];
	onChange: (value: T) => void;
	className?: string;
}) {
	return (
		<fieldset className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}>
			<legend className="sr-only">{label}</legend>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					aria-pressed={option.value === value}
					onClick={() => onChange(option.value)}
					className={cn(
						"flex h-6 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5",
						option.value === value &&
							"bg-background text-foreground shadow-[0_0.5px_2px_rgba(0,0,0,0.2)] dark:bg-white/15",
					)}
				>
					{option.icon && <option.icon />}
					{option.label}
				</button>
			))}
		</fieldset>
	);
}
