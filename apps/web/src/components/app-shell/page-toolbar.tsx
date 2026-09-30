/** Barre d'outils de fenêtre : titre de la page à gauche, actions à droite. */
export function PageToolbar({
	title,
	subtitle,
	children,
}: {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<header className="sticky top-0 z-20 flex min-h-12 flex-wrap items-center gap-2 border-b bg-background/80 py-2 pr-4 pl-12 backdrop-blur-xl lg:px-5">
			<div className="min-w-0 flex-1">
				<h1 className="truncate text-[15px] font-semibold">{title}</h1>
				{subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
			</div>
			{children && <div className="flex flex-wrap items-center gap-1.5">{children}</div>}
		</header>
	);
}
