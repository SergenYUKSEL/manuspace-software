import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = ComponentProps<typeof Input> & { label: string; name: string };

export function FormField({ label, name, ...props }: Props) {
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={name}>{label}</Label>
			<Input id={name} name={name} {...props} />
		</div>
	);
}
