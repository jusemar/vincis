CREATE TABLE "cadastros_celular" (
	"id" uuid PRIMARY KEY NOT NULL,
	"celular" varchar(20) NOT NULL,
	"codigo_hash" varchar(64) NOT NULL,
	"expira_em" timestamp NOT NULL,
	"verificado_em" timestamp,
	"autorizacao_hash" varchar(64),
	"autorizacao_expira_em" timestamp,
	"concluido_em" timestamp,
	"invalidado_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "email_pendente" varchar(255);--> statement-breakpoint
CREATE INDEX "cadastros_celular_celular_idx" ON "cadastros_celular" USING btree ("celular","created_at");--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_email_ou_celular" CHECK ("usuarios"."email" is not null or "usuarios"."whatsapp" is not null);