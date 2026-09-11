-- Pagamentos reais das assinaturas da Vincis.
--
-- Somente aditiva: duas tabelas novas e um índice único novo em
-- `assinatura_competencias`. Nenhuma coluna existente muda, nenhum dado é
-- escrito — as assinaturas de teste continuam `aguardando_pagamento`.
--
-- `assinatura_pagamentos` é a fonte de verdade financeira da assinatura: só
-- `confirmado` produz efeito. Pagamentos simulados (`oportunidade_pagamentos`,
-- `consultoria_pagamentos`) não são referenciados. O único provedor aceito é
-- `homologacao_manual`; o gateway real entra por migration própria.
--
-- `assinatura_pagamento_alocacoes` diz quanto de cada pagamento cobre cada
-- competência. Coberto não é cumprido, e nenhuma comissão nasce daqui.
--
-- Os dois índices `(id, assinatura_id)` vêm antes das chaves estrangeiras
-- compostas que dependem deles: é o banco quem impede que o pagamento de uma
-- assinatura cubra o mês de outra.

CREATE TABLE "assinatura_pagamento_alocacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pagamento_id" uuid NOT NULL,
	"competencia_id" uuid NOT NULL,
	"assinatura_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assinatura_pagamento_alocacoes_valor_positivo" CHECK ("assinatura_pagamento_alocacoes"."valor_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "assinatura_pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assinatura_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"moeda" varchar(3) DEFAULT 'BRL' NOT NULL,
	"status" varchar(20) DEFAULT 'pendente' NOT NULL,
	"provedor" varchar(40) NOT NULL,
	"id_externo" varchar(120),
	"chave_idempotencia" varchar(120),
	"confirmado_em" timestamp,
	"cancelado_em" timestamp,
	"estornado_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assinatura_pagamentos_valor_positivo" CHECK ("assinatura_pagamentos"."valor_centavos" > 0),
	CONSTRAINT "assinatura_pagamentos_moeda_valida" CHECK ("assinatura_pagamentos"."moeda" = 'BRL'),
	CONSTRAINT "assinatura_pagamentos_provedor_valido" CHECK ("assinatura_pagamentos"."provedor" in ('homologacao_manual')),
	CONSTRAINT "assinatura_pagamentos_identificado" CHECK ("assinatura_pagamentos"."id_externo" is not null or "assinatura_pagamentos"."chave_idempotencia" is not null),
	CONSTRAINT "assinatura_pagamentos_status_coerente" CHECK (("assinatura_pagamentos"."status" = 'pendente' and "assinatura_pagamentos"."confirmado_em" is null
            and "assinatura_pagamentos"."cancelado_em" is null and "assinatura_pagamentos"."estornado_em" is null)
        or ("assinatura_pagamentos"."status" = 'confirmado' and "assinatura_pagamentos"."confirmado_em" is not null
            and "assinatura_pagamentos"."cancelado_em" is null and "assinatura_pagamentos"."estornado_em" is null)
        or ("assinatura_pagamentos"."status" = 'cancelado' and "assinatura_pagamentos"."confirmado_em" is null
            and "assinatura_pagamentos"."cancelado_em" is not null and "assinatura_pagamentos"."estornado_em" is null)
        or ("assinatura_pagamentos"."status" = 'estornado' and "assinatura_pagamentos"."confirmado_em" is not null
            and "assinatura_pagamentos"."cancelado_em" is null and "assinatura_pagamentos"."estornado_em" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "assinatura_pagamentos_id_assinatura_unico" ON "assinatura_pagamentos" USING btree ("id","assinatura_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "assinatura_competencias_id_assinatura_unico" ON "assinatura_competencias" USING btree ("id","assinatura_id");
--> statement-breakpoint
ALTER TABLE "assinatura_pagamento_alocacoes" ADD CONSTRAINT "assinatura_pagamento_alocacoes_assinatura_id_assinaturas_id_fk" FOREIGN KEY ("assinatura_id") REFERENCES "public"."assinaturas"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assinatura_pagamento_alocacoes" ADD CONSTRAINT "assinatura_pagamento_alocacoes_pagamento_fk" FOREIGN KEY ("pagamento_id","assinatura_id") REFERENCES "public"."assinatura_pagamentos"("id","assinatura_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assinatura_pagamento_alocacoes" ADD CONSTRAINT "assinatura_pagamento_alocacoes_competencia_fk" FOREIGN KEY ("competencia_id","assinatura_id") REFERENCES "public"."assinatura_competencias"("id","assinatura_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assinatura_pagamentos" ADD CONSTRAINT "assinatura_pagamentos_assinatura_id_assinaturas_id_fk" FOREIGN KEY ("assinatura_id") REFERENCES "public"."assinaturas"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "assinatura_pagamento_alocacoes_unica" ON "assinatura_pagamento_alocacoes" USING btree ("pagamento_id","competencia_id");
--> statement-breakpoint
CREATE INDEX "assinatura_pagamento_alocacoes_competencia_idx" ON "assinatura_pagamento_alocacoes" USING btree ("competencia_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "assinatura_pagamentos_id_externo_unico" ON "assinatura_pagamentos" USING btree ("provedor","id_externo") WHERE id_externo is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "assinatura_pagamentos_chave_unica" ON "assinatura_pagamentos" USING btree ("provedor","chave_idempotencia") WHERE chave_idempotencia is not null;
--> statement-breakpoint
CREATE INDEX "assinatura_pagamentos_assinatura_idx" ON "assinatura_pagamentos" USING btree ("assinatura_id","created_at");
