CREATE TABLE "eventos_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"acao" varchar(80) NOT NULL,
	"entidade" varchar(60) NOT NULL,
	"registro_afetado" uuid,
	"autor_id" uuid,
	"usuario_id" uuid,
	"empresa_id" uuid,
	"origem" varchar(40) NOT NULL,
	"ip" varchar(45),
	"metadados" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "whatsapp_verificado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "whatsapp_verificado_em" timestamp;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "whatsapp_verificado_por_id" uuid;--> statement-breakpoint
ALTER TABLE "eventos_auditoria" ADD CONSTRAINT "eventos_auditoria_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_auditoria" ADD CONSTRAINT "eventos_auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_auditoria" ADD CONSTRAINT "eventos_auditoria_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_auditoria_acao_idx" ON "eventos_auditoria" USING btree ("acao","created_at");--> statement-breakpoint
CREATE INDEX "eventos_auditoria_usuario_idx" ON "eventos_auditoria" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "eventos_auditoria_autor_idx" ON "eventos_auditoria" USING btree ("autor_id");--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_whatsapp_verificado_por_id_usuarios_id_fk" FOREIGN KEY ("whatsapp_verificado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;