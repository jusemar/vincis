CREATE TABLE "convites_empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"remetente_id" uuid NOT NULL,
	"destinatario_id" uuid NOT NULL,
	"funcao" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pendente' NOT NULL,
	"expira_em" timestamp NOT NULL,
	"respondido_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empresa_membros" ADD COLUMN "funcao" varchar(20);--> statement-breakpoint
ALTER TABLE "convites_empresa" ADD CONSTRAINT "convites_empresa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_empresa" ADD CONSTRAINT "convites_empresa_remetente_id_usuarios_id_fk" FOREIGN KEY ("remetente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_empresa" ADD CONSTRAINT "convites_empresa_destinatario_id_usuarios_id_fk" FOREIGN KEY ("destinatario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "convites_empresa_pendente_unique" ON "convites_empresa" USING btree ("empresa_id","destinatario_id") WHERE "convites_empresa"."status" = 'pendente';--> statement-breakpoint
CREATE INDEX "convites_empresa_destinatario_status_idx" ON "convites_empresa" USING btree ("destinatario_id","status");--> statement-breakpoint
CREATE INDEX "convites_empresa_empresa_status_idx" ON "convites_empresa" USING btree ("empresa_id","status");