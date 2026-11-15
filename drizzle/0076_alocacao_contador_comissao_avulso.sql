CREATE TABLE "assinatura_contador_alocacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assinatura_id" uuid NOT NULL,
	"contador_anterior_id" uuid,
	"contador_novo_id" uuid NOT NULL,
	"origem" varchar(20) NOT NULL,
	"alterado_por_id" uuid NOT NULL,
	"motivo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assinatura_contador_alocacoes_origem_valida" CHECK ("assinatura_contador_alocacoes"."origem" in ('cliente', 'gestor')),
	CONSTRAINT "assinatura_contador_alocacoes_troca_real" CHECK ("assinatura_contador_alocacoes"."contador_anterior_id" is null or "assinatura_contador_alocacoes"."contador_anterior_id" <> "assinatura_contador_alocacoes"."contador_novo_id")
);
--> statement-breakpoint
ALTER TABLE "assinaturas" ADD COLUMN "escolha_contador" varchar(20);--> statement-breakpoint
ALTER TABLE "contratacoes_servico" ADD COLUMN "comissao_vincis_milesimos" integer;--> statement-breakpoint
ALTER TABLE "contratacoes_servico" ADD COLUMN "comissao_vincis_centavos" integer;--> statement-breakpoint
ALTER TABLE "contratacoes_servico" ADD COLUMN "valor_profissional_centavos" integer;--> statement-breakpoint
ALTER TABLE "assinatura_contador_alocacoes" ADD CONSTRAINT "assinatura_contador_alocacoes_assinatura_id_assinaturas_id_fk" FOREIGN KEY ("assinatura_id") REFERENCES "public"."assinaturas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_contador_alocacoes" ADD CONSTRAINT "assinatura_contador_alocacoes_contador_anterior_id_usuarios_id_fk" FOREIGN KEY ("contador_anterior_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_contador_alocacoes" ADD CONSTRAINT "assinatura_contador_alocacoes_contador_novo_id_usuarios_id_fk" FOREIGN KEY ("contador_novo_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_contador_alocacoes" ADD CONSTRAINT "assinatura_contador_alocacoes_alterado_por_id_usuarios_id_fk" FOREIGN KEY ("alterado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assinatura_contador_alocacoes_assinatura_idx" ON "assinatura_contador_alocacoes" USING btree ("assinatura_id","created_at");--> statement-breakpoint
CREATE INDEX "assinatura_contador_alocacoes_contador_idx" ON "assinatura_contador_alocacoes" USING btree ("contador_novo_id");--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_escolha_contador_valida" CHECK ("assinaturas"."escolha_contador" is null or "assinaturas"."escolha_contador" in ('cliente', 'vincis'));--> statement-breakpoint
ALTER TABLE "contratacoes_servico" ADD CONSTRAINT "contratacoes_servico_comissao_coerente" CHECK (("contratacoes_servico"."comissao_vincis_milesimos" is null and "contratacoes_servico"."comissao_vincis_centavos" is null and "contratacoes_servico"."valor_profissional_centavos" is null)
        or ("contratacoes_servico"."comissao_vincis_milesimos" between 1 and 999
          and "contratacoes_servico"."comissao_vincis_centavos" >= 0
          and "contratacoes_servico"."valor_profissional_centavos" >= 0
          and "contratacoes_servico"."comissao_vincis_centavos" + "contratacoes_servico"."valor_profissional_centavos" = "contratacoes_servico"."valor_snapshot_centavos"));