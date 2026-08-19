CREATE TABLE "sessoes_usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"ip" varchar(45),
	"user_agent" text,
	"expira_em" timestamp NOT NULL,
	"encerrada_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessoes_usuario" ADD CONSTRAINT "sessoes_usuario_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;