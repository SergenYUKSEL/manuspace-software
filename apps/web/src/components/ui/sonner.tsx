import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/lib/theme";

/** Notifications en bannières arrondies, façon Centre de notifications. */
const Toaster = (props: ToasterProps) => {
	const { resolved } = useTheme();
	return (
		<Sonner
			theme={resolved}
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-4 text-tag-green" />,
				info: <InfoIcon className="size-4 text-primary" />,
				warning: <TriangleAlertIcon className="size-4 text-tag-orange" />,
				error: <OctagonXIcon className="size-4 text-destructive" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "color-mix(in srgb, var(--popover) 85%, transparent)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "14px",
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: { toast: "cn-toast backdrop-blur-xl shadow-[var(--shadow-window)]" },
			}}
			{...props}
		/>
	);
};

export { Toaster };
