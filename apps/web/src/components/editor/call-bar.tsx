import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/user-color";
import type { useCall } from "./use-call";

type Call = ReturnType<typeof useCall>;

/** Appel audio du document : démarrer / rejoindre, participants, micro, raccrocher. */
export function CallBar({ call }: { call: Call }) {
	if (!call.joined) {
		const waiting = call.others.length;
		return (
			<div className="flex items-center gap-2">
				{call.error && <p className="max-w-64 text-xs text-destructive">{call.error}</p>}
				<Button
					size="sm"
					variant={waiting > 0 ? "default" : "outline"}
					disabled={call.joining}
					onClick={call.join}
					title="Discuter à voix haute pendant la correction ou la co-écriture"
				>
					<PhoneIcon />
					{waiting > 0 ? `Rejoindre l'appel (${waiting})` : "Appel"}
				</Button>
			</div>
		);
	}

	return (
		<section
			aria-label="Appel en cours"
			className="flex items-center gap-2 rounded-full border bg-emerald-50 py-1 pr-1 pl-3 dark:bg-emerald-950/40"
		>
			<span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">En appel</span>
			<ul className="flex -space-x-1.5" aria-label="Participants">
				{call.others.map((p) => (
					<li
						key={p.peerId}
						title={`${p.name}${p.muted ? " (micro coupé)" : ""}`}
						className="relative grid size-6 place-items-center rounded-full border-2 border-background text-[0.65rem] font-medium text-white"
						style={{ backgroundColor: p.color }}
					>
						{initials(p.name)}
						{p.muted && (
							<MicOffIcon className="absolute -right-1 -bottom-1 size-3 rounded-full bg-background p-px text-destructive" />
						)}
					</li>
				))}
			</ul>
			{call.others.length === 0 && (
				<span className="text-xs text-muted-foreground">En attente de collaborateurs…</span>
			)}
			<Button
				size="icon-sm"
				variant="ghost"
				aria-pressed={call.muted}
				aria-label={call.muted ? "Réactiver le micro" : "Couper le micro"}
				title={call.muted ? "Réactiver le micro" : "Couper le micro"}
				onClick={call.toggleMute}
			>
				{call.muted ? <MicOffIcon className="text-destructive" /> : <MicIcon />}
			</Button>
			<Button
				size="icon-sm"
				variant="destructive"
				aria-label="Quitter l'appel"
				onClick={call.leave}
			>
				<PhoneOffIcon />
			</Button>
			{[...call.remoteStreams].map(([peerId, stream]) => (
				<RemoteAudio key={peerId} stream={stream} />
			))}
		</section>
	);
}

/** Lecture du son d'un participant (élément audio invisible). */
function RemoteAudio({ stream }: { stream: MediaStream }) {
	const ref = useRef<HTMLAudioElement>(null);
	useEffect(() => {
		if (ref.current) ref.current.srcObject = stream;
	}, [stream]);
	// biome-ignore lint/a11y/useMediaCaption: flux vocal en direct, pas de sous-titres disponibles
	return <audio ref={ref} autoPlay />;
}
