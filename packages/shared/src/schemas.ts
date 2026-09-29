import { z } from "zod";
import { NODE_TYPES, type NodeType, PROJECT_ROLES, type ProjectRole } from "./roles";

const email = z.email().trim().toLowerCase();
const totpCode = z.string().regex(/^\d{6}$/, "Code à 6 chiffres attendu");
export const password = z
	.string()
	.min(12, "12 caractères minimum")
	.max(256, "256 caractères maximum");

export const loginSchema = z.object({
	email,
	password: z.string().min(1).max(256),
	totp: totpCode.optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
	displayName: z.string().trim().min(1).max(100).optional(),
	email: email.optional(),
});

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: password,
});

export const totpCodeSchema = z.object({ code: totpCode });

export const disableTotpSchema = z.object({
	password: z.string().min(1),
	code: totpCode,
});

export const createUserSchema = z.object({
	email,
	displayName: z.string().trim().min(1).max(100),
	password,
	isAdmin: z.boolean().default(false),
});

/** Utilisateur tel qu'exposé par l'API (jamais de hash ni de secret). */
export type PublicUser = {
	id: string;
	email: string;
	displayName: string;
	isAdmin: boolean;
	totpEnabled: boolean;
	blocked: boolean;
};

const title = z.string().trim().min(1, "Titre requis").max(200);
const nodeName = z.string().trim().min(1, "Nom requis").max(200);
const memberRole = z.enum(PROJECT_ROLES).exclude(["OWNER"]);

export const createManuscriptSchema = z.object({ title });
export const updateManuscriptSchema = z.object({ title });

/** Les fichiers (type "file") sont créés par l'upload, pas par cette route. */
export const createNodeSchema = z.object({
	parentId: z.uuid().nullable(),
	type: z.enum(NODE_TYPES).exclude(["file"]),
	name: nodeName,
});

/** Renommage et/ou déplacement (parentId null = racine du manuscrit). */
export const updateNodeSchema = z
	.object({ name: nodeName, parentId: z.uuid().nullable() })
	.partial()
	.refine((v) => v.name !== undefined || v.parentId !== undefined, "Rien à modifier");

export const inviteMemberSchema = z.object({ email, role: memberRole });
export const updateMemberSchema = z.object({ role: memberRole });

export type ManuscriptSummary = {
	id: string;
	title: string;
	role: ProjectRole;
	owner: { id: string; displayName: string };
	wordCount: number;
	updatedAt: string;
	createdAt: string;
};

export type ManuscriptNode = {
	id: string;
	parentId: string | null;
	type: NodeType;
	name: string;
	position: number;
	wordCount: number | null;
	mimeType: string | null;
	sizeBytes: number | null;
	updatedAt: string;
	updatedBy: { id: string; displayName: string } | null;
};

export type ManuscriptMember = {
	userId: string;
	email: string;
	displayName: string;
	role: ProjectRole;
};

/** Contenu du ticket signé par l'API et vérifié par le serveur collab. */
export const collabTicketSchema = z.object({
	sub: z.uuid(),
	name: z.string(),
	docId: z.uuid(),
	role: z.enum(PROJECT_ROLES),
});
export type CollabTicket = z.infer<typeof collabTicketSchema>;
