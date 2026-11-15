CREATE TABLE "repasses_profissionais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origem" varchar(20) NOT NULL,
	"origem_id" uuid NOT NULL,
	"profissional_id" uuid,
	"cliente_usuario_id" uuid NOT NULL,
	"assinatura_id" uuid,
	"atendimento_id" uuid,
	"descricao" varchar(200) NOT NULL,
	"referencia_pagamento" varchar(200),
	"pago_em" timestamp,
	"valor_bruto_centavos" integer NOT NULL,
	"comissao_vincis_milesimos" integer,
	"comissao_vincis_centavos" integer,
	"valor_profissional_centavos" integer,
	"comissao_indicador_centavos" integer DEFAULT 0 NOT NULL,
	"situacao" varchar(25) DEFAULT 'aguardando_liberacao' NOT NULL,
	"motivo_revisao" varchar(40),
	"liberado_em" timestamp,
	"repassado_em" timestamp,
	"repassado_por_id" uuid,
	"comprovante" varchar(200),
	"observacao" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repasses_profissionais_origem_valida" CHECK ("repasses_profissionais"."origem" in ('servico', 'acordo', 'consultoria', 'competencia')),
	CONSTRAINT "repasses_profissionais_situacao_valida" CHECK ("repasses_profissionais"."situacao" in ('aguardando_liberacao', 'disponivel', 'repassado', 'em_revisao')),
	CONSTRAINT "repasses_profissionais_bruto_positivo" CHECK ("repasses_profissionais"."valor_bruto_centavos" > 0),
	CONSTRAINT "repasses_profissionais_indicador_nao_negativo" CHECK ("repasses_profissionais"."comissao_indicador_centavos" >= 0),
	CONSTRAINT "repasses_profissionais_divisao_coerente" CHECK (("repasses_profissionais"."comissao_vincis_milesimos" is null and "repasses_profissionais"."comissao_vincis_centavos" is null
            and "repasses_profissionais"."valor_profissional_centavos" is null)
        or ("repasses_profissionais"."comissao_vincis_milesimos" between 1 and 999
            and "repasses_profissionais"."comissao_vincis_centavos" >= 0
            and "repasses_profissionais"."valor_profissional_centavos" >= 0
            and "repasses_profissionais"."comissao_vincis_centavos" + "repasses_profissionais"."valor_profissional_centavos" = "repasses_profissionais"."valor_bruto_centavos")),
	CONSTRAINT "repasses_profissionais_repasse_completo" CHECK (("repasses_profissionais"."situacao" = 'repassado') = ("repasses_profissionais"."repassado_em" is not null)
        and ("repasses_profissionais"."situacao" <> 'repassado'
          or ("repasses_profissionais"."repassado_por_id" is not null and "repasses_profissionais"."comprovante" is not null
              and "repasses_profissionais"."valor_profissional_centavos" is not null and "repasses_profissionais"."profissional_id" is not null))),
	CONSTRAINT "repasses_profissionais_revisao_com_motivo" CHECK (("repasses_profissionais"."situacao" = 'em_revisao') = ("repasses_profissionais"."motivo_revisao" is not null))
);
--> statement-breakpoint
ALTER TABLE "repasses_profissionais" ADD CONSTRAINT "repasses_profissionais_profissional_id_usuarios_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses_profissionais" ADD CONSTRAINT "repasses_profissionais_cliente_usuario_id_usuarios_id_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses_profissionais" ADD CONSTRAINT "repasses_profissionais_assinatura_id_assinaturas_id_fk" FOREIGN KEY ("assinatura_id") REFERENCES "public"."assinaturas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses_profissionais" ADD CONSTRAINT "repasses_profissionais_repassado_por_id_usuarios_id_fk" FOREIGN KEY ("repassado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repasses_profissionais_origem_unica" ON "repasses_profissionais" USING btree ("origem","origem_id");--> statement-breakpoint
CREATE INDEX "repasses_profissionais_situacao_idx" ON "repasses_profissionais" USING btree ("situacao","created_at");--> statement-breakpoint
CREATE INDEX "repasses_profissionais_profissional_idx" ON "repasses_profissionais" USING btree ("profissional_id","situacao");