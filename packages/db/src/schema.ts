import { NODE_TYPES, PROJECT_ROLES } from "@manuspace/shared";
import {
	type AnyPgColumn,
	boolean,
	customType,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
	dataType: () => "bytea",
	toDriver: (value) => Buffer.from(value),
	fromDriver: (value) => new Uint8Array(value),
});

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

/** État d'un document texte, écrit par le serveur collab (éditeur à venir). */
export const documentStates = pgTable("document_states", {
	nodeId: uuid("node_id")
		.primaryKey()
		.references(() => nodes.id, { onDelete: "cascade" }),
	state: bytea("state").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
