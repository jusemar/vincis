CREATE TABLE "atendimento_encerramentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"gestor_id" uuid NOT NULL,
	"motivo" varchar(40) NOT NULL,
	"observacao_interna" text NOT NULL,
	"status_anterior" varchar(30) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "atendimento_encerramentos_motivo_valido" CHECK (motivo in ('cliente_nao_responde', 'profissional_nao_responde', 'ambos_nao_respondem', 'outro')),
	CONSTRAINT "atendimento_encerramentos_observacao_preenchida" CHECK (length(btrim(observacao_interna)) >= 10)
);
--> statement-breakpoint
ALTER TABLE "atendimento_encerramentos" ADD CONSTRAINT "atendimento_encerramentos_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_encerramentos" ADD CONSTRAINT "atendimento_encerramentos_gestor_id_usuarios_id_fk" FOREIGN KEY ("gestor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "atendimento_encerramentos_atendimento_unico" ON "atendimento_encerramentos" USING btree ("atendimento_id");--> statement-breakpoint
CREATE INDEX "atendimento_encerramentos_gestor_idx" ON "atendimento_encerramentos" USING btree ("gestor_id","created_at");