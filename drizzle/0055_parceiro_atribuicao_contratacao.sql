-- A contratação direta do catálogo também origina atribuição.
--
-- Segura para a base existente: solta um `not null`, acrescenta uma coluna
-- nulável, um índice e um `check`. Nenhuma linha é reescrita e nenhuma tabela
-- de outro domínio é tocada — `contratacoes_servico` só é referenciada.
--
-- `oportunidade_id` deixa de ser obrigatória porque passou a existir um
-- segundo caminho real: o cliente que abre o serviço do prestador e contrata,
-- sem oportunidade nenhuma no meio. Antes disto, o negócio acontecia e o
-- parceiro que trouxe o cliente não aparecia em lugar nenhum.
--
-- O `check` mantém a regra que o `not null` garantia sozinho: toda atribuição
-- aponta para um negócio, e para um só. O índice único em `contratacao_id` é a
-- mesma idempotência que já existe em `oportunidade_id` — reprocessar a
-- contratação não cria a segunda linha.

ALTER TABLE "parceiro_atribuicoes" ALTER COLUMN "oportunidade_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD COLUMN "contratacao_id" uuid;--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD CONSTRAINT "parceiro_atribuicoes_contratacao_id_contratacoes_servico_id_fk" FOREIGN KEY ("contratacao_id") REFERENCES "public"."contratacoes_servico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_atribuicoes_contratacao_unica" ON "parceiro_atribuicoes" USING btree ("contratacao_id");--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD CONSTRAINT "parceiro_atribuicoes_origem_unica" CHECK (num_nonnulls("parceiro_atribuicoes"."oportunidade_id", "parceiro_atribuicoes"."contratacao_id") = 1);