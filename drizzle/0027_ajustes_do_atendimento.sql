CREATE TABLE "atendimento_ajustes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pendente' NOT NULL,
	"motivo" text NOT NULL,
	"resposta" text,
	"arquivo_id" uuid,
	"manifestacao_id" uuid,
	"resposta_manifestacao_id" uuid,
	"analisado_por" uuid,
	"analisado_em" timestamp,
	"reabertura_evento_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendimento_ajustes" ADD CONSTRAINT "atendimento_ajustes_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_ajustes" ADD CONSTRAINT "atendimento_ajustes_cliente_usuario_id_usuarios_id_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_ajustes" ADD CONSTRAINT "atendimento_ajustes_arquivo_id_atendimento_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."atendimento_arquivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_ajustes" ADD CONSTRAINT "atendimento_ajustes_manifestacao_id_atendimento_manifestacoes_id_fk" FOREIGN KEY ("manifestacao_id") REFERENCES "public"."atendimento_manifestacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_ajustes" ADD CONSTRAINT "atendimento_ajustes_resposta_manifestacao_id_atendimento_manifestacoes_id_fk" FOREIGN KEY ("resposta_manifestacao_id") REFERENCES "public"."atendimento_manifestacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_ajustes" ADD CONSTRAINT "atendimento_ajustes_analisado_por_usuarios_id_fk" FOREIGN KEY ("analisado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_ajustes" ADD CONSTRAINT "atendimento_ajustes_reabertura_evento_id_atendimento_eventos_id_fk" FOREIGN KEY ("reabertura_evento_id") REFERENCES "public"."atendimento_eventos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "atendimento_ajustes_pendente_unico" ON "atendimento_ajustes" USING btree ("atendimento_id") WHERE status = 'pendente';--> statement-breakpoint
CREATE INDEX "atendimento_ajustes_atendimento_idx" ON "atendimento_ajustes" USING btree ("atendimento_id","created_at");--> statement-breakpoint
CREATE INDEX "atendimento_ajustes_cliente_idx" ON "atendimento_ajustes" USING btree ("cliente_usuario_id");