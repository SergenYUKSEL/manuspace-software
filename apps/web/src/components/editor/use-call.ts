import type { CallClientMessage, CallServerMessage, PeerState, RtcSignal } from "@manuspace/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, call as callApi } from "@/lib/api";
import type { CollabConnection, ConnectionSnapshot } from "./collab-connection";

/** Participant à l'appel (un par onglet, identifié par son peerId). */
export type CallParticipant = {
	sessionId: string;
	id: string;
	name: string;
	color: string;
	peerId: string;
	muted: boolean;
};

function participantsOf(peers: PeerState[]): CallParticipant[] {
	return peers.flatMap((p) =>
		p.call
			? [{ sessionId: p.sessionId, id: p.userId, name: p.name, color: p.color, ...p.call }]
			: [],
	);
}

const randomPeerId = () => `p-${crypto.randomUUID()}`;

/**
 * Appel audio du document, en maillage WebRTC (chaque participant est relié aux autres).
 * - Signalisation : messages du serveur collab (WebSocket maison), remis au seul destinataire.
 * - Pas de collision : pour chaque paire, le peerId le plus petit envoie l'offre.
 * - Le flux audio passe en direct entre navigateurs (ou via TURN) : il survit à une coupure
 *   du serveur collab ; seule la signalisation en dépend.
 */
export function useCall(connection: CollabConnection, snapshot: ConnectionSnapshot) {
	// Mémoïsé : un nouveau tableau à chaque rendu relancerait les effets en boucle.
	const callParticipants = useMemo(() => participantsOf(snapshot.peers), [snapshot.peers]);
	const [joined, setJoined] = useState(false);
	const [muted, setMuted] = useState(false);
	const mutedRef = useRef(muted);
	mutedRef.current = muted;
	const [joining, setJoining] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
	/** Incrémenté quand une connexion est fermée : relance la découverte (nouvel essai). */
	const [attempt, setAttempt] = useState(0);

	const peerId = useRef(randomPeerId());
	const localStream = useRef<MediaStream | null>(null);
	const iceServers = useRef<RTCIceServer[]>([]);
	const connections = useRef(new Map<string, RTCPeerConnection>());
	/** Candidats ICE reçus avant la description distante : appliqués ensuite. */
	const pendingCandidates = useRef(new Map<string, RTCIceCandidateInit[]>());

	const send = useCallback(
		(message: CallClientMessage | { type: "call-mute"; muted: boolean }) =>
			connection.sendCall(message),
		[connection],
	);

	const sendSignal = useCallback(
		(to: string, signal: RtcSignal) =>
			send({ type: "call-signal", from: peerId.current, to, signal }),
		[send],
	);

	const closePeer = useCallback((remote: string) => {
		connections.current.get(remote)?.close();
		connections.current.delete(remote);
		pendingCandidates.current.delete(remote);
		setRemoteStreams((streams) => {
			if (!streams.has(remote)) return streams;
			const next = new Map(streams);
			next.delete(remote);
			return next;
		});
	}, []);

	const createPeer = useCallback(
		(remote: string) => {
			const pc = new RTCPeerConnection({ iceServers: iceServers.current });
			for (const track of localStream.current?.getTracks() ?? []) {
				pc.addTrack(track, localStream.current as MediaStream);
			}
			pc.onicecandidate = ({ candidate }) => {
				if (!candidate) return;
				sendSignal(remote, {
					kind: "candidate",
					candidate: {
						candidate: candidate.candidate,
						sdpMid: candidate.sdpMid,
						sdpMLineIndex: candidate.sdpMLineIndex,
						usernameFragment: candidate.usernameFragment,
					},
				});
			};
			pc.ontrack = ({ streams }) => {
				const [stream] = streams;
				if (stream) setRemoteStreams((current) => new Map(current).set(remote, stream));
			};
			pc.onconnectionstatechange = () => {
				// Échec définitif (réseau changé, pair disparu) : on ferme, puis on retente
				// si le participant est toujours annoncé dans l'appel.
				if (pc.connectionState === "failed") {
					closePeer(remote);
					setAttempt((n) => n + 1);
				}
			};
			connections.current.set(remote, pc);
			return pc;
		},
		[sendSignal, closePeer],
	);

	const flushCandidates = useCallback(async (remote: string, pc: RTCPeerConnection) => {
		for (const candidate of pendingCandidates.current.get(remote) ?? []) {
			await pc.addIceCandidate(candidate).catch(() => {});
		}
		pendingCandidates.current.delete(remote);
	}, []);

	// Réception des offres, réponses et candidats.
	useEffect(() => {
		if (!joined) return;
		const onCallMessage = async (message: CallServerMessage) => {
			if (message.type === "call-peer-left") {
				closePeer(message.peerId);
				return;
			}
			const { from, signal } = message;

			if (signal.kind === "candidate") {
				const pc = connections.current.get(from);
				if (pc?.remoteDescription) await pc.addIceCandidate(signal.candidate).catch(() => {});
				else {
					const queue = pendingCandidates.current.get(from) ?? [];
					queue.push(signal.candidate);
					pendingCandidates.current.set(from, queue);
				}
				return;
			}

			if (signal.description.type === "offer") {
				const pc = connections.current.get(from) ?? createPeer(from);
				await pc.setRemoteDescription(signal.description);
				await flushCandidates(from, pc);
				await pc.setLocalDescription(await pc.createAnswer());
				const answer = pc.localDescription;
				if (answer) {
					sendSignal(from, {
						kind: "description",
						description: { type: "answer", sdp: answer.sdp },
					});
				}
			} else {
				const pc = connections.current.get(from);
				if (!pc) return;
				await pc.setRemoteDescription(signal.description);
				await flushCandidates(from, pc);
			}
		};
		return connection.onCall(onCallMessage);
	}, [joined, connection, createPeer, closePeer, flushCandidates, sendSignal]);

	// Découverte : on appelle les participants annoncés (si c'est à nous d'envoyer l'offre).
	// Jamais de raccrochage sur simple absence de la présence : pendant une coupure du serveur,
	// elle se vide alors que l'audio continue. Les départs viennent de « call-peer-left ».
	useEffect(() => {
		// `attempt` sert de déclencheur : il change quand une connexion a échoué, pour retenter.
		if (!joined || attempt < 0) return;
		for (const { peerId: remote } of callParticipants) {
			if (remote === peerId.current) continue;
			if (connections.current.has(remote) || peerId.current > remote) continue;
			const pc = createPeer(remote);
			pc.createOffer()
				.then((offer) => pc.setLocalDescription(offer))
				.then(() => {
					const offer = pc.localDescription;
					if (offer) {
						sendSignal(remote, {
							kind: "description",
							description: { type: "offer", sdp: offer.sdp },
						});
					}
				})
				.catch(() => closePeer(remote));
		}
	}, [joined, attempt, callParticipants, createPeer, closePeer, sendSignal]);

	// Reconnexion (ex. redémarrage du serveur collab) : il ne connaît plus notre peerId.
	useEffect(() => {
		if (!joined) return;
		return connection.onReady(() => {
			send({ type: "call-join", peerId: peerId.current });
			send({ type: "call-mute", muted: mutedRef.current });
		});
	}, [joined, connection, send]);

	const leave = useCallback(() => {
		for (const remote of [...connections.current.keys()]) closePeer(remote);
		for (const track of localStream.current?.getTracks() ?? []) track.stop();
		localStream.current = null;
		send({ type: "call-leave", peerId: peerId.current });
		setJoined(false);
		setMuted(false);
	}, [closePeer, send]);

	const join = useCallback(async () => {
		setError(null);
		setJoining(true);
		try {
			localStream.current = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
				video: false,
			});
		} catch {
			setError("Micro inaccessible : autorisez-le dans votre navigateur pour rejoindre l'appel.");
			setJoining(false);
			return;
		}
		try {
			iceServers.current = (await callApi(api.rtc["ice-servers"].$get())).iceServers;
		} catch {
			iceServers.current = [{ urls: "stun:stun.l.google.com:19302" }];
		}
		// Le serveur enregistre notre peerId et annonce notre présence dans l'appel.
		send({ type: "call-join", peerId: peerId.current });
		setJoined(true);
		setJoining(false);
	}, [send]);

	const toggleMute = useCallback(() => {
		const next = !muted;
		for (const track of localStream.current?.getAudioTracks() ?? []) track.enabled = !next;
		send({ type: "call-mute", muted: next });
		setMuted(next);
	}, [muted, send]);

	// Changement de document ou de page : on raccroche proprement.
	const leaveRef = useRef(leave);
	leaveRef.current = leave;
	const joinedRef = useRef(joined);
	joinedRef.current = joined;
	useEffect(
		() => () => {
			if (joinedRef.current) leaveRef.current();
		},
		[],
	);

	// Pendant une coupure du serveur, on garde la dernière liste connue (l'audio continue).
	const connected = snapshot.status === "connected";
	const [shown, setShown] = useState<CallParticipant[]>(callParticipants);
	useEffect(() => {
		if (connected) setShown(callParticipants);
	}, [connected, callParticipants]);
	const others = shown.filter((p) => p.peerId !== peerId.current);
	return { joined, joining, muted, error, others, remoteStreams, join, leave, toggleMute };
}
