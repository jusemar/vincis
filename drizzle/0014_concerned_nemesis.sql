CREATE TABLE "colaboracoes_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"servico_id" uuid,
	"escopo" varchar(20) DEFAULT 'cliente' NOT NULL,
	"origem" varchar(20) NOT NULL,
	"empresa_origem_id" uuid,
	"remetente_id" uuid NOT NULL,
	"destinatario_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pendente' NOT NULL,
	"expira_em" timestamp NOT NULL,
	"respondido_em" timestamp,
	"revogado_em" timestamp,
	"revogado_por_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "colaboracoes_cliente" ADD CONSTRAINT "colaboracoes_cliente_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboracoes_cliente" ADD CONSTRAINT "colaboracoes_cliente_empresa_origem_id_empresas_id_fk" FOREIGN KEY ("empresa_origem_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboracoes_cliente" ADD CONSTRAINT "colaboracoes_cliente_remetente_id_usuarios_id_fk" FOREIGN KEY ("remetente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboracoes_cliente" ADD CONSTRAINT "colaboracoes_cliente_destinatario_id_usuarios_id_fk" FOREIGN KEY ("destinatario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colaboracoes_cliente" ADD CONSTRAINT "colaboracoes_cliente_revogado_por_id_usuarios_id_fk" FOREIGN KEY ("revogado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "colaboracoes_cliente_vivo_unique" ON "colaboracoes_cliente" USING btree ("cliente_id","destinatario_id") WHERE "colaboracoes_cliente"."status" in ('pendente', 'aceito');--> statement-breakpoint
CREATE INDEX "colaboracoes_cliente_destinatario_status_idx" ON "colaboracoes_cliente" USING btree ("destinatario_id","status");--> statement-breakpoint
CREATE INDEX "colaboracoes_cliente_cliente_status_idx" ON "colaboracoes_cliente" USING btree ("cliente_id","status");--> statement-breakpoint
CREATE INDEX "colaboracoes_cliente_remetente_idx" ON "colaboracoes_cliente" USING btree ("remetente_id");