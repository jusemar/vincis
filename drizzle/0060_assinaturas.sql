-- Contrato recorrente da própria Vincis.
--
-- Somente aditiva: uma tabela nova, duas chaves estrangeiras, dois índices e
-- cinco checks. Nenhuma tabela existente é tocada — nem `oportunidades`, nem
-- `contratacoes_servico`, que continuam sendo os caminhos diretos entre cliente
-- e profissional, fora desta tabela e fora da comissão de parceiros.
--
-- A assinatura nasce do botão "Contratar" de `/precos` e fica
-- `aguardando_pagamento` até existir confirmação real de gateway. A vigência
-- nasce nula pelo mesmo motivo: o contrato só começa a correr com dinheiro.
--
-- `periodicidade`/`meses` descrevem a forma comercial (1, 6 ou 12 meses). As
-- competências mensais de prestação são outra entidade, na próxima fatia — por
-- isso não há "próxima competência" aqui.
--
-- O índice único parcial em (cliente, chave_intencao) enquanto
-- `aguardando_pagamento` é a trava do clique duplo, do F5 e da volta do login.
-- O check `total_coerente` amarra o total ao mensal × meses: um contrato não
-- pode ter dois preços.

CREATE TABLE "assinaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"prestador_id" uuid,
	"plano_codigo" varchar(30) NOT NULL,
	"plano_nome" varchar(160) NOT NULL,
	"periodo_codigo" varchar(30) NOT NULL,
	"periodicidade" varchar(20) NOT NULL,
	"meses" integer NOT NULL,
	"valor_mensal_cheio_centavos" integer NOT NULL,
	"desconto_milesimos" integer NOT NULL,
	"valor_mensal_centavos" integer NOT NULL,
	"valor_total_centavos" integer NOT NULL,
	"oferta" jsonb NOT NULL,
	"chave_intencao" varchar(64) NOT NULL,
	"status" varchar(30) DEFAULT 'aguardando_pagamento' NOT NULL,
	"contratado_em" timestamp DEFAULT now() NOT NULL,
	"vigencia_inicio" timestamp,
	"vigencia_fim" timestamp,
	"cancelado_em" timestamp,
	"cancelamento_motivo" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assinaturas_status_valido" CHECK ("assinaturas"."status" in ('aguardando_pagamento', 'ativa', 'cancelada', 'encerrada')),
	CONSTRAINT "assinaturas_periodicidade_valida" CHECK ("assinaturas"."periodicidade" in ('mensal', 'semestral', 'anual')),
	CONSTRAINT "assinaturas_meses_positivos" CHECK ("assinaturas"."meses" > 0),
	CONSTRAINT "assinaturas_valores_positivos" CHECK ("assinaturas"."valor_mensal_centavos" > 0 and "assinaturas"."valor_mensal_cheio_centavos" > 0),
	CONSTRAINT "assinaturas_total_coerente" CHECK ("assinaturas"."valor_total_centavos" = "assinaturas"."valor_mensal_centavos" * "assinaturas"."meses")
);
--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_cliente_usuario_id_usuarios_id_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assinaturas_intencao_pendente_unica" ON "assinaturas" USING btree ("cliente_usuario_id","chave_intencao") WHERE status = 'aguardando_pagamento';--> statement-breakpoint
CREATE INDEX "assinaturas_cliente_idx" ON "assinaturas" USING btree ("cliente_usuario_id","created_at");