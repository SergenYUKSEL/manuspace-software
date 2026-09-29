import { NODE_TYPES, PROJECT_ROLES } from "@manuspace/shared";
import {
	type AnyPgColumn,
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const projectRole = pgEnum("project_role", PROJECT_ROLES);
export const nodeType = pgEnum("node_type", NODE_TYPES);

export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: text("email").notNull().unique(),
	displayName: text("display_name").notNull(),
	passwordHash: text("password_hash").notNull(),
	isAdmin: boolean("is_admin").notNull().default(false),
	blockedAt: timestamp("blocked_at", { withTimezone: true }),
	/** Secret TOTP chiffré ; null tant que la 2FA n'est pas activée. */
	totpSecret: text("totp_secret"),
	totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
	...timestamps,
});

export const sessions = pgTable(
	"sessions",
	{
		/** Hash SHA-256 du token opaque stocké dans le cookie. */
		id: text("id").primaryKey(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("sessions_user_idx").on(t.userId)],
);

export const manuscripts = pgTable("manuscripts", {
	id: uuid("id").primaryKey().defaultRandom(),
	title: text("title").notNull(),
	ownerId: uuid("owner_id")
		.notNull()
		.references(() => users.id),
	...timestamps,
});

export const projectMembers = pgTable(
	"project_members",
	{
		manuscriptId: uuid("manuscript_id")
			.notNull()
			.references(() => manuscripts.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: projectRole("role").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.manuscriptId, t.userId] })],
);

/** Élément de l'arborescence : dossier, document texte ou fichier (PDF/image). */
export const nodes = pgTable(
	"nodes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		manuscriptId: uuid("manuscript_id")
			.notNull()
			.references(() => manuscripts.id, { onDelete: "cascade" }),
		parentId: uuid("parent_id").references((): AnyPgColumn => nodes.id, {
			onDelete: "cascade",
		}),
		type: nodeType("type").notNull(),
		name: text("name").notNull(),
		position: integer("position").notNull().default(0),
		/** Fichiers uniquement : clé de l'objet dans le bucket S3. */
		storageKey: text("storage_key"),
		mimeType: text("mime_type"),
		sizeBytes: integer("size_bytes"),
		/** Documents texte uniquement : mis à jour à chaque sauvegarde collab. */
		wordCount: integer("word_count"),
		updatedById: uuid("updated_by_id").references(() => users.id),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		...timestamps,
	},
	(t) => [
		index("nodes_manuscript_idx").on(t.manuscriptId),
		index("nodes_parent_idx").on(t.parentId),
	],
);

/** Texte d'un document et sa révision (nombre d'opérations appliquées), écrits par le serveur collab. */
export const documentContents = pgTable("document_contents", {
	nodeId: uuid("node_id")
		.primaryKey()
		.references(() => nodes.id, { onDelete: "cascade" }),
	content: text("content").notNull().default(""),
	revision: integer("revision").notNull().default(0),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Journal des opérations OT : la révision n est l'opération n. Permet de rattraper un client
 * revenu d'une coupure (opérations depuis sa révision) ; client_op_id rend chaque opération
 * idempotente (un renvoi après une coupure n'est jamais appliqué deux fois).
 */
export const documentOperations = pgTable(
	"document_operations",
	{
		nodeId: uuid("node_id")
			.notNull()
			.references(() => nodes.id, { onDelete: "cascade" }),
		revision: integer("revision").notNull(),
		clientOpId: text("client_op_id").notNull(),
		operation: jsonb("operation").$type<(number | string)[]>().notNull(),
		userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.nodeId, t.revision] }),
		uniqueIndex("document_operations_client_op_idx").on(t.nodeId, t.clientOpId),
	],
);
