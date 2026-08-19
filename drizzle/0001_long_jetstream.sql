CREATE TABLE "tokens_usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" varchar(50) NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expira_em" timestamp NOT NULL,
	"usado_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tokens_usuario" ADD CONSTRAINT "tokens_usuario_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;