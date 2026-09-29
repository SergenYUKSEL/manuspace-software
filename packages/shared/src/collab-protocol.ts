import { z } from "zod";
import type { Component } from "./ot/text-operation";

/**
 * Protocole WebSocket entre l'éditeur et le serveur collab (JSON). Le serveur valide chaque
 * message du navigateur avec ces schémas ; les réponses du serveur sont seulement typées.
 */

const MAX_INSERT = 200_000;

const componentSchema = z.union([
	z
		.number()
		.int()
		.refine((n) => n !== 0, "Composant vide"),
	z.string().min(1),
]);

export const operationSchema = z
	.array(componentSchema)
	.max(10_000)
	.refine(
		(ops) =>
			ops.reduce<number>((sum, c) => sum + (typeof c === "string" ? c.length : 0), 0) <= MAX_INSERT,
		"Insertion trop longue",
	);

const selectionSchema = z.object({
	anchor: z.number().int().min(0),
	head: z.number().int().min(0),
});
export type Selection = z.infer<typeof selectionSchema>;

const revisionSchema = z.number().int().min(0);
const opIdSchema = z.string().min(8).max(64);

export const collabClientMessageSchema = z.discriminatedUnion("type", [
	/** Premier message : ticket délivré par l'API, et révision déjà connue (hors ligne). */
	z.object({
		type: z.literal("hello"),
		ticket: z.string().max(4_000),
		since: revisionSchema.nullable(),
	}),
	z.object({
		type: z.literal("op"),
		revision: revisionSchema,
		id: opIdSchema,
		operation: operationSchema,
	}),
	z.object({
		type: z.literal("selection"),
		revision: revisionSchema,
		selection: selectionSchema.nullable(),
	}),
	z.object({ type: z.literal("ping") }),
]);
export type CollabClientMessage = z.infer<typeof collabClientMessageSchema>;

export type PeerState = {
	sessionId: string;
	userId: string;
	name: string;
	color: string;
	selection: (Selection & { revision: number }) | null;
};

export type SerializedOperation = { id: string; operation: Component[] };

export type CollabServerMessage =
	| {
			type: "ready";
			sessionId: string;
			revision: number;
			readOnly: boolean;
			peers: PeerState[];
			/** Texte complet (première ouverture) ou opérations manquées depuis `since`. */
			text?: string;
			operations?: SerializedOperation[];
	  }
	| { type: "ack"; id: string; revision: number }
	| { type: "op"; id: string; revision: number; operation: Component[]; sessionId: string }
	| { type: "peer"; peer: PeerState }
	| { type: "peer-left"; sessionId: string }
	| {
			type: "error";
			code: "unauthorized" | "invalid" | "forbidden" | "desync" | "server";
			message: string;
	  }
	| { type: "pong" };
