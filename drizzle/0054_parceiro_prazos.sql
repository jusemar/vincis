-- Prazo de atribuição do parceiro: configurável e congelado.
--
-- Somente aditiva: uma tabela nova e duas colunas nuláveis em
-- `parceiro_atribuicoes`, do próprio módulo. Nenhuma tabela de outro domínio
-- foi tocada.
--
-- `parceiro_prazos` é a configuração do Gestor, uma linha por serviço. O
-- padrão global continua em `configuracoes_plataforma`, que é onde parâmetro
-- único pertence.
--
-- `prazo_dias` e `expira_em` são a cópia congelada: nascem no insert da
-- atribuição e nunca são recalculados. Mudar a configuração vale só para o que
-- vier depois — mesmo princípio de `oportunidades.expira_em`. Nulas apenas nas
-- linhas gravadas antes desta migration.

CREATE TABLE "parceiro_prazos" (
	"referencia" varchar(30) PRIMARY KEY NOT NULL,
	"dias" integer NOT NULL,
	"atualizado_por" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parceiro_prazos_dias_positivos" CHECK ("parceiro_prazos"."dias" >= 1 and "parceiro_prazos"."dias" <= 3650)
);
--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD COLUMN "prazo_dias" integer;--> statement-breakpoint
ALTER TABLE "parceiro_atribuicoes" ADD COLUMN "expira_em" timestamp;--> statement-breakpoint
ALTER TABLE "parceiro_prazos" ADD CONSTRAINT "parceiro_prazos_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;