CREATE TABLE "cobrancas_pix" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finalidade" varchar(20) NOT NULL,
	"referencia_id" uuid NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"prestador_id" uuid,
	"valor_centavos" integer NOT NULL,
	"descricao" varchar(140) NOT NULL,
	"contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provedor" varchar(20) DEFAULT 'efi' NOT NULL,
	"txid" varchar(35) NOT NULL,
	"status" varchar(25) DEFAULT 'gerando' NOT NULL,
	"pix_copia_e_cola" text,
	"qr_code_imagem" text,
	"expira_em" timestamp,
	"end_to_end_id" varchar(64),
	"valor_pago_centavos" integer,
	"paga_em" timestamp,
	"efeito" varchar(20),
	"efeito_referencia_id" uuid,
	"atendimento_id" uuid,
	"protocolo" varchar(40),
	"ultima_consulta_em" timestamp,
	"erro" varchar(300),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cobrancas_pix_finalidade_valida" CHECK (finalidade in ('servico', 'consultoria', 'acordo', 'assinatura')),
	CONSTRAINT "cobrancas_pix_status_valido" CHECK (status in ('gerando', 'aguardando_pagamento', 'paga', 'expirada', 'cancelada', 'falhou')),
	CONSTRAINT "cobrancas_pix_efeito_valido" CHECK (efeito is null or efeito in ('aplicado', 'conflito')),
	CONSTRAINT "cobrancas_pix_valor_positivo" CHECK (valor_centavos > 0),
	CONSTRAINT "cobrancas_pix_paga_comprovada" CHECK (status <> 'paga' or (end_to_end_id is not null and paga_em is not null))
);
--> statement-breakpoint
CREATE TABLE "efi_webhook_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identificador_evento" varchar(64) NOT NULL,
	"txid" varchar(35),
	"cobranca_id" uuid,
	"situacao" varchar(20) NOT NULL,
	"detalhe" varchar(300),
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assinatura_pagamentos" DROP CONSTRAINT "assinatura_pagamentos_provedor_valido";--> statement-breakpoint
ALTER TABLE "contratacoes_servico" ADD COLUMN "cobranca_id" uuid;--> statement-breakpoint
ALTER TABLE "cobrancas_pix" ADD CONSTRAINT "cobrancas_pix_cliente_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobrancas_pix" ADD CONSTRAINT "cobrancas_pix_prestador_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efi_webhook_eventos" ADD CONSTRAINT "efi_webhook_eventos_cobranca_id_cobrancas_pix_id_fk" FOREIGN KEY ("cobranca_id") REFERENCES "public"."cobrancas_pix"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cobrancas_pix_txid_unico" ON "cobrancas_pix" USING btree ("txid");--> statement-breakpoint
CREATE UNIQUE INDEX "cobrancas_pix_end_to_end_unico" ON "cobrancas_pix" USING btree ("end_to_end_id") WHERE end_to_end_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cobrancas_pix_viva_unica" ON "cobrancas_pix" USING btree ("finalidade","referencia_id","cliente_usuario_id") WHERE status in ('gerando', 'aguardando_pagamento');--> statement-breakpoint
CREATE INDEX "cobrancas_pix_pendentes_idx" ON "cobrancas_pix" USING btree ("status","expira_em");--> statement-breakpoint
CREATE INDEX "cobrancas_pix_cliente_idx" ON "cobrancas_pix" USING btree ("cliente_usuario_id","created_at");--> statement-breakpoint
CREATE INDEX "cobrancas_pix_referencia_idx" ON "cobrancas_pix" USING btree ("finalidade","referencia_id");--> statement-breakpoint
CREATE UNIQUE INDEX "efi_webhook_eventos_identificador_unico" ON "efi_webhook_eventos" USING btree ("identificador_evento");--> statement-breakpoint
CREATE INDEX "efi_webhook_eventos_txid_idx" ON "efi_webhook_eventos" USING btree ("txid");--> statement-breakpoint
ALTER TABLE "contratacoes_servico" ADD CONSTRAINT "contratacoes_servico_cobranca_id_cobrancas_pix_id_fk" FOREIGN KEY ("cobranca_id") REFERENCES "public"."cobrancas_pix"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contratacoes_servico_cobranca_unica" ON "contratacoes_servico" USING btree ("cobranca_id") WHERE cobranca_id is not null;--> statement-breakpoint
ALTER TABLE "assinatura_pagamentos" ADD CONSTRAINT "assinatura_pagamentos_provedor_valido" CHECK ("assinatura_pagamentos"."provedor" in ('homologacao_manual', 'efi'));