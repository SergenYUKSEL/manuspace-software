CREATE TABLE "document_contents" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_operations" (
	"node_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"client_op_id" text NOT NULL,
	"operation" jsonb NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_operations_node_id_revision_pk" PRIMARY KEY("node_id","revision")
);
--> statement-breakpoint
ALTER TABLE "document_contents" ADD CONSTRAINT "document_contents_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_operations" ADD CONSTRAINT "document_operations_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_operations" ADD CONSTRAINT "document_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_operations_client_op_idx" ON "document_operations" USING btree ("node_id","client_op_id");