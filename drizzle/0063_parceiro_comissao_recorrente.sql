-- Comissão recorrente de parceiro, por competência paga e cumprida.
--
-- Uma infraestrutura de comissão: `parceiro_comissoes` ganha `tipo`
-- ('avulso' | 'recorrente') e `competencia_id`. Toda linha existente vira
-- 'avulso' pelo default, e o check novo exige dela exatamente o que já tinha —
-- contratação e profissional. Por isso `contratacao_id` e `profissional_id`
-- deixam de ser NOT NULL na coluna: a obrigação passou para o check, por tipo.
-- Um mês tem no máximo uma comissão (`parceiro_comissoes_competencia_unica`).
--
-- `parceiro_atribuicoes` ganha a terceira origem, `assinatura_id`. O check de
-- "exatamente uma origem" é trocado por um que conta três colunas — as linhas
-- atuais satisfazem os dois. Uma indicação origina uma assinatura só (índice
-- parcial em `indicacao_id`): o parceiro fica com a primeira assinatura da
-- conta que trouxe, não com todas as futuras.
--
-- `pagamento_estornado_em` marca a recorrente cujo dinheiro voltou;
-- `parceiro_saques.cancelado_em` registra o saque que o estorno esvaziou.
--
-- Nenhum dado é escrito. Homologação somente.

ALTER TABLE "parceiro_atribuicoes" DROP CONSTRAINT "parceiro_atribuicoes_origem_unica";--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ALTER COLUMN "contratacao_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ALTER COLUMN "profissional_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD COLUMN "assinatura_id" uuid;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD COLUMN "tipo" varchar(20) DEFAULT 'avulso' NOT NULL;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD COLUMN "competencia_id" uuid;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD COLUMN "pagamento_estornado_em" timestamp;--> statement-breakpoint
ALTER TABLE "parceiro_saques" ADD COLUMN "cancelado_em" timestamp;--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD CONSTRAINT "parceiro_atribuicoes_assinatura_id_assinaturas_id_fk" FOREIGN KEY ("assinatura_id") REFERENCES "public"."assinaturas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD CONSTRAINT "parceiro_comissoes_competencia_id_assinatura_competencias_id_fk" FOREIGN KEY ("competencia_id") REFERENCES "public"."assinatura_competencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_atribuicoes_assinatura_unica" ON "parceiro_atribuicoes" USING btree ("assinatura_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_atribuicoes_indicacao_assinatura_unica" ON "parceiro_atribuicoes" USING btree ("indicacao_id") WHERE assinatura_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_comissoes_competencia_unica" ON "parceiro_comissoes" USING btree ("competencia_id");--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD CONSTRAINT "parceiro_atribuicoes_origem_unica" CHECK (num_nonnulls("parceiro_atribuicoes"."oportunidade_id", "parceiro_atribuicoes"."contratacao_id", "parceiro_atribuicoes"."assinatura_id") = 1);--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD CONSTRAINT "parceiro_comissoes_tipo_valido" CHECK ("parceiro_comissoes"."tipo" in ('avulso', 'recorrente'));--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD CONSTRAINT "parceiro_comissoes_origem_coerente" CHECK (("parceiro_comissoes"."tipo" = 'avulso' and "parceiro_comissoes"."contratacao_id" is not null
            and "parceiro_comissoes"."competencia_id" is null and "parceiro_comissoes"."profissional_id" is not null)
        or ("parceiro_comissoes"."tipo" = 'recorrente' and "parceiro_comissoes"."competencia_id" is not null
            and "parceiro_comissoes"."contratacao_id" is null));