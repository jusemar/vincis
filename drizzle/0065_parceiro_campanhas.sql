-- Campanhas, bônus e pontos do Programa de Parceiros.
--
-- Aditiva, com uma única alteração de coluna existente: `parceiro_saque_itens.
-- comissao_id` deixa de ser NOT NULL, porque um item de saque agora pode vir de
-- uma comissão OU de um bônus de campanha (`bonus_id`). O check
-- `parceiro_saque_itens_origem_unica` exige exatamente uma das duas — toda
-- linha existente tem comissão e nenhum bônus, e satisfaz o check.
--
-- `parceiro_campanhas`: meta, período (dias de São Paulo), recompensa e status
-- (rascunho → publicada → cancelada). Tipos com motor apenas: progressiva e
-- combinada são recusadas também pelo banco.
-- `parceiro_campanha_contribuicoes`: cada fato que contou, único por campanha +
-- origem — o mesmo fato não conta duas vezes na mesma meta.
-- `parceiro_campanha_recompensas`: uma concedida por campanha + parceiro.
-- `parceiro_bonus`: dinheiro da recompensa — não é comissão.
-- `parceiro_pontos_lancamentos`: extrato imutável; reversão é lançamento
-- negativo, único por lançamento revertido.
--
-- Nenhum dado é escrito. PostgreSQL local; nunca Neon nesta etapa.

CREATE TABLE "parceiro_bonus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recompensa_id" uuid NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"campanha_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"status" varchar(20) DEFAULT 'disponivel' NOT NULL,
	"disponivel_em" timestamp NOT NULL,
	"paga_em" timestamp,
	"cancelada_em" timestamp,
	"compensacao_pendente_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parceiro_bonus_valor_positivo" CHECK ("parceiro_bonus"."valor_centavos" > 0),
	CONSTRAINT "parceiro_bonus_status_valido" CHECK ("parceiro_bonus"."status" in ('disponivel', 'paga', 'cancelada')),
	CONSTRAINT "parceiro_bonus_pagamento_coerente" CHECK (("parceiro_bonus"."status" = 'paga') = ("parceiro_bonus"."paga_em" is not null)),
	CONSTRAINT "parceiro_bonus_cancelamento_coerente" CHECK (("parceiro_bonus"."status" = 'cancelada') = ("parceiro_bonus"."cancelada_em" is not null))
);
--> statement-breakpoint
CREATE TABLE "parceiro_campanha_contribuicoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campanha_id" uuid NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"origem_tipo" varchar(40) NOT NULL,
	"origem_id" uuid NOT NULL,
	"cliente_usuario_id" uuid,
	"valor_centavos" integer DEFAULT 0 NOT NULL,
	"ocorrido_em" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'valida' NOT NULL,
	"revertida_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parceiro_campanha_contribuicoes_origem_valida" CHECK ("parceiro_campanha_contribuicoes"."origem_tipo" in ('assinatura_ativada', 'servico_avulso_concluido', 'pagamento_assinatura')),
	CONSTRAINT "parceiro_campanha_contribuicoes_valor_valido" CHECK ("parceiro_campanha_contribuicoes"."valor_centavos" >= 0),
	CONSTRAINT "parceiro_campanha_contribuicoes_status_valido" CHECK ("parceiro_campanha_contribuicoes"."status" in ('valida', 'revertida')),
	CONSTRAINT "parceiro_campanha_contribuicoes_reversao_coerente" CHECK (("parceiro_campanha_contribuicoes"."status" = 'revertida') = ("parceiro_campanha_contribuicoes"."revertida_em" is not null))
);
--> statement-breakpoint
CREATE TABLE "parceiro_campanha_recompensas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campanha_id" uuid NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"bonus_centavos" integer NOT NULL,
	"pontos" integer NOT NULL,
	"status" varchar(20) DEFAULT 'concedida' NOT NULL,
	"concedida_em" timestamp NOT NULL,
	"revertida_em" timestamp,
	"motivo_reversao" varchar(60),
	"compensacao_pendente_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parceiro_campanha_recompensas_valores_validos" CHECK ("parceiro_campanha_recompensas"."bonus_centavos" >= 0 and "parceiro_campanha_recompensas"."pontos" >= 0 and ("parceiro_campanha_recompensas"."bonus_centavos" > 0 or "parceiro_campanha_recompensas"."pontos" > 0)),
	CONSTRAINT "parceiro_campanha_recompensas_status_valido" CHECK ("parceiro_campanha_recompensas"."status" in ('concedida', 'revertida')),
	CONSTRAINT "parceiro_campanha_recompensas_reversao_coerente" CHECK (("parceiro_campanha_recompensas"."status" = 'revertida') = ("parceiro_campanha_recompensas"."revertida_em" is not null))
);
--> statement-breakpoint
CREATE TABLE "parceiro_campanhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" varchar(120) NOT NULL,
	"descricao" varchar(280) DEFAULT '' NOT NULL,
	"tipo_meta" varchar(40) NOT NULL,
	"alvo" integer NOT NULL,
	"bonus_centavos" integer DEFAULT 0 NOT NULL,
	"pontos" integer DEFAULT 0 NOT NULL,
	"inicio" date NOT NULL,
	"fim" date NOT NULL,
	"escopo" varchar(20) DEFAULT 'todos' NOT NULL,
	"status" varchar(20) DEFAULT 'rascunho' NOT NULL,
	"criada_por" uuid,
	"publicada_em" timestamp,
	"publicada_por" uuid,
	"cancelada_em" timestamp,
	"cancelada_por" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parceiro_campanhas_tipo_valido" CHECK ("parceiro_campanhas"."tipo_meta" in ('novos_clientes_recorrentes', 'servicos_avulsos', 'valor_gerado')),
	CONSTRAINT "parceiro_campanhas_alvo_positivo" CHECK ("parceiro_campanhas"."alvo" > 0),
	CONSTRAINT "parceiro_campanhas_recompensa_valida" CHECK ("parceiro_campanhas"."bonus_centavos" >= 0 and "parceiro_campanhas"."pontos" >= 0 and ("parceiro_campanhas"."bonus_centavos" > 0 or "parceiro_campanhas"."pontos" > 0)),
	CONSTRAINT "parceiro_campanhas_periodo_valido" CHECK ("parceiro_campanhas"."fim" >= "parceiro_campanhas"."inicio"),
	CONSTRAINT "parceiro_campanhas_escopo_valido" CHECK ("parceiro_campanhas"."escopo" in ('todos')),
	CONSTRAINT "parceiro_campanhas_status_valido" CHECK ("parceiro_campanhas"."status" in ('rascunho', 'publicada', 'cancelada')),
	CONSTRAINT "parceiro_campanhas_publicacao_coerente" CHECK (("parceiro_campanhas"."status" = 'rascunho' and "parceiro_campanhas"."publicada_em" is null and "parceiro_campanhas"."cancelada_em" is null)
        or ("parceiro_campanhas"."status" = 'publicada' and "parceiro_campanhas"."publicada_em" is not null and "parceiro_campanhas"."cancelada_em" is null)
        or ("parceiro_campanhas"."status" = 'cancelada' and "parceiro_campanhas"."cancelada_em" is not null))
);
--> statement-breakpoint
CREATE TABLE "parceiro_pontos_lancamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"pontos" integer NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"campanha_id" uuid,
	"recompensa_id" uuid,
	"lancamento_revertido_id" uuid,
	"descricao" varchar(160) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parceiro_pontos_tipo_coerente" CHECK (("parceiro_pontos_lancamentos"."tipo" = 'credito' and "parceiro_pontos_lancamentos"."pontos" > 0 and "parceiro_pontos_lancamentos"."lancamento_revertido_id" is null)
        or ("parceiro_pontos_lancamentos"."tipo" = 'reversao' and "parceiro_pontos_lancamentos"."pontos" < 0 and "parceiro_pontos_lancamentos"."lancamento_revertido_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "parceiro_saque_itens" ALTER COLUMN "comissao_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "parceiro_saque_itens" ADD COLUMN "bonus_id" uuid;--> statement-breakpoint
ALTER TABLE "parceiro_bonus" ADD CONSTRAINT "parceiro_bonus_recompensa_id_parceiro_campanha_recompensas_id_fk" FOREIGN KEY ("recompensa_id") REFERENCES "public"."parceiro_campanha_recompensas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_bonus" ADD CONSTRAINT "parceiro_bonus_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_bonus" ADD CONSTRAINT "parceiro_bonus_campanha_id_parceiro_campanhas_id_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."parceiro_campanhas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_campanha_contribuicoes" ADD CONSTRAINT "parceiro_campanha_contribuicoes_campanha_id_parceiro_campanhas_id_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."parceiro_campanhas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_campanha_contribuicoes" ADD CONSTRAINT "parceiro_campanha_contribuicoes_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_campanha_contribuicoes" ADD CONSTRAINT "parceiro_campanha_contribuicoes_cliente_usuario_id_usuarios_id_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_campanha_recompensas" ADD CONSTRAINT "parceiro_campanha_recompensas_campanha_id_parceiro_campanhas_id_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."parceiro_campanhas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_campanha_recompensas" ADD CONSTRAINT "parceiro_campanha_recompensas_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_campanhas" ADD CONSTRAINT "parceiro_campanhas_criada_por_usuarios_id_fk" FOREIGN KEY ("criada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_campanhas" ADD CONSTRAINT "parceiro_campanhas_publicada_por_usuarios_id_fk" FOREIGN KEY ("publicada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_campanhas" ADD CONSTRAINT "parceiro_campanhas_cancelada_por_usuarios_id_fk" FOREIGN KEY ("cancelada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_pontos_lancamentos" ADD CONSTRAINT "parceiro_pontos_lancamentos_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_pontos_lancamentos" ADD CONSTRAINT "parceiro_pontos_lancamentos_campanha_id_parceiro_campanhas_id_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."parceiro_campanhas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_pontos_lancamentos" ADD CONSTRAINT "parceiro_pontos_lancamentos_recompensa_id_parceiro_campanha_recompensas_id_fk" FOREIGN KEY ("recompensa_id") REFERENCES "public"."parceiro_campanha_recompensas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_pontos_lancamentos" ADD CONSTRAINT "parceiro_pontos_lancamentos_lancamento_revertido_id_parceiro_pontos_lancamentos_id_fk" FOREIGN KEY ("lancamento_revertido_id") REFERENCES "public"."parceiro_pontos_lancamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_bonus_recompensa_unica" ON "parceiro_bonus" USING btree ("recompensa_id");--> statement-breakpoint
CREATE INDEX "parceiro_bonus_parceiro_idx" ON "parceiro_bonus" USING btree ("parceiro_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_campanha_contribuicoes_origem_unica" ON "parceiro_campanha_contribuicoes" USING btree ("campanha_id","origem_tipo","origem_id");--> statement-breakpoint
CREATE INDEX "parceiro_campanha_contribuicoes_parceiro_idx" ON "parceiro_campanha_contribuicoes" USING btree ("campanha_id","parceiro_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_campanha_recompensas_concedida_unica" ON "parceiro_campanha_recompensas" USING btree ("campanha_id","parceiro_id") WHERE status = 'concedida';--> statement-breakpoint
CREATE INDEX "parceiro_campanhas_status_idx" ON "parceiro_campanhas" USING btree ("status","inicio","fim");--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_pontos_credito_por_recompensa" ON "parceiro_pontos_lancamentos" USING btree ("recompensa_id") WHERE tipo = 'credito';--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_pontos_reversao_unica" ON "parceiro_pontos_lancamentos" USING btree ("lancamento_revertido_id") WHERE lancamento_revertido_id is not null;--> statement-breakpoint
CREATE INDEX "parceiro_pontos_parceiro_idx" ON "parceiro_pontos_lancamentos" USING btree ("parceiro_id","created_at");--> statement-breakpoint
ALTER TABLE "parceiro_saque_itens" ADD CONSTRAINT "parceiro_saque_itens_bonus_id_parceiro_bonus_id_fk" FOREIGN KEY ("bonus_id") REFERENCES "public"."parceiro_bonus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_saque_itens_bonus_unico" ON "parceiro_saque_itens" USING btree ("bonus_id") WHERE liberado_em is null and bonus_id is not null;--> statement-breakpoint
ALTER TABLE "parceiro_saque_itens" ADD CONSTRAINT "parceiro_saque_itens_origem_unica" CHECK (num_nonnulls("parceiro_saque_itens"."comissao_id", "parceiro_saque_itens"."bonus_id") = 1);