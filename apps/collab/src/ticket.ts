import { type CollabTicket, collabTicketSchema } from "@manuspace/shared";
import { jwtVerify } from "jose";
import { env } from "./env";

const secret = new TextEncoder().encode(env.COLLAB_TICKET_SECRET);

/** Vérifie un ticket émis par l'API (JWT HS256 à durée de vie courte). */
export async function verifyTicket(token: string): Promise<CollabTicket> {
	const { payload } = await jwtVerify(token, secret, {
		algorithms: ["HS256"],
		audience: "manuspace-collab",
	});
	return collabTicketSchema.parse(payload);
}
