import { z } from "zod";

/**
 * Protocole de signalisation WebRTC, relayé par le serveur collab sur la connexion WebSocket
 * déjà authentifiée du document.
 */

/** Identifiant aléatoire d'un participant à l'appel (un par onglet). */
export const callPeerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const rtcSignalSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("description"),
		description: z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().max(100_000) }),
	}),
	z.object({
		kind: z.literal("candidate"),
		candidate: z.object({
			candidate: z.string().max(2_000),
			sdpMid: z.string().max(64).nullish(),
			sdpMLineIndex: z.number().int().min(0).max(64).nullish(),
			usernameFragment: z.string().max(256).nullish(),
		}),
	}),
]);
export type RtcSignal = z.infer<typeof rtcSignalSchema>;

/** Messages envoyés par le navigateur au serveur collab. */
export const callClientMessageSchema = z.discriminatedUnion("type", [
	/** Enregistre ce participant : le serveur lui routera les messages qui lui sont destinés. */
	z.object({ type: z.literal("call-join"), peerId: callPeerIdSchema }),
	z.object({ type: z.literal("call-leave"), peerId: callPeerIdSchema }),
	/** Offre, réponse ou candidat ICE pour un seul participant. */
	z.object({
		type: z.literal("call-signal"),
		from: callPeerIdSchema,
		to: callPeerIdSchema,
		signal: rtcSignalSchema,
	}),
]);
export type CallClientMessage = z.infer<typeof callClientMessageSchema>;

/** Messages du serveur : signal remis au destinataire (`fromUserId` ajouté par le serveur),
 * ou départ d'un participant (quitte l'appel ou se déconnecte vraiment du serveur). */
export type CallServerMessage =
	| { type: "call-signal"; from: string; fromUserId: string; signal: RtcSignal }
	| { type: "call-peer-left"; peerId: string };

/** Présence dans l'appel, tenue par le serveur collab (état de chaque participant). */
export type CallPresence = { peerId: string; muted: boolean };
