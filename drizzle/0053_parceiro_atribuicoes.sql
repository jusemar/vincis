-- Origem do parceiro no negócio originado.
--
-- Somente aditiva: uma tabela nova, as chaves estrangeiras dela e dois índices.
-- Nenhuma coluna, restrição ou índice de `oportunidades` — ou de qualquer outra
-- tabela existente — foi tocado, e a tabela nasce vazia.
--
-- Tabela de ligação em vez de coluna: negócio nasce de três lugares
-- (oportunidade, contratação direta, consultoria), e a atribuição é da relação,
-- não da oportunidade. As outras duas origens entram depois como colunas
-- nuláveis ao lado de `oportunidade_id`, com `check` de exatamente uma.
--
-- O índice único em `oportunidade_id` é a idempotência: uma atribuição por
-- negócio, garantida pelo banco.
--
-- Nada aqui é comissão: não há valor, percentual, prazo nem status financeiro.

CREATE TABLE "parceiro_atribuicoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"indicacao_id" uuid NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"resolvida_por" varchar(10) NOT NULL,
	"servico_referencia" varchar(30),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD CONSTRAINT "parceiro_atribuicoes_indicacao_id_parceiro_indicacoes_id_fk" FOREIGN KEY ("indicacao_id") REFERENCES "public"."parceiro_indicacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD CONSTRAINT "parceiro_atribuicoes_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD CONSTRAINT "parceiro_atribuicoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD CONSTRAINT "parceiro_atribuicoes_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_atribuicoes_oportunidade_unica" ON "parceiro_atribuicoes" USING btree ("oportunidade_id");--> statement-breakpoint
CREATE INDEX "parceiro_atribuicoes_parceiro_idx" ON "parceiro_atribuicoes" USING btree ("parceiro_id","created_at");