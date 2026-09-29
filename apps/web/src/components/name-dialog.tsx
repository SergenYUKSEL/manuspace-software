import { useEffect, useState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	label: string;
	defaultValue?: string;
	submitLabel: string;
	pending?: boolean;
	onSubmit: (value: string) => void;
};

/** Dialogue à un champ, pour créer ou renommer. */
export function NameDialog(props: Props) {
	const [value, setValue] = useState(props.defaultValue ?? "");

	// Réinitialise le champ à chaque ouverture (l'ouverture est pilotée par le parent).
	useEffect(() => {
		if (props.open) setValue(props.defaultValue ?? "");
	}, [props.open, props.defaultValue]);

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						props.onSubmit(value.trim());
					}}
				>
					<DialogHeader>
						<DialogTitle>{props.title}</DialogTitle>
						{props.description && <DialogDescription>{props.description}</DialogDescription>}
					</DialogHeader>
					<FormField
						label={props.label}
						name="name"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						maxLength={200}
						required
						autoFocus
						onFocus={(e) => e.target.select()}
					/>
					<DialogFooter>
						<Button type="submit" disabled={props.pending || !value.trim()}>
							{props.submitLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
