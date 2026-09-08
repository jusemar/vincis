-- Link → acesso → ciclo de indicação → histórico.
--
-- Somente aditiva: duas tabelas novas, as chaves estrangeiras delas e três
-- índices. Nenhuma coluna, restrição ou índice de tabela existente foi tocado,
-- e as duas nascem vazias.
--
-- `parceiro_indicacoes` é o ciclo — o período em que um navegador pertence a um
-- parceiro —, não o clique. O índice parcial garante **um ciclo aberto por
-- navegador**: quando outro parceiro entra, o anterior é fechado e preservado.
--
-- `parceiro_eventos` é o histórico append-only do ciclo. Hoje grava um tipo só,
-- `acessou_link`; `tipo` é texto e `dados` é jsonb para que tipo novo não peça
-- migração de estrutura.
--
-- Nada aqui é atribuição comercial: não há prazo por serviço, janela de validade
-- nem comissão. `usuario_id` nasce nulo e ninguém escreve nele nesta fatia.

CREATE TABLE "parceiro_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"indicacao_id" uuid NOT NULL,
	"tipo" varchar(30) NOT NULL,
	"dados" jsonb,
	"ocorrido_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parceiro_indicacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"visitante_hash" varchar(64) NOT NULL,
	"origem" varchar(24) DEFAULT 'link_indicacao' NOT NULL,
	"user_agent" varchar(255),
	"referencia_host" varchar(120),
	"usuario_id" uuid,
	"substituida_em" timestamp,
	"substituida_por_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parceiro_eventos" ADD CONSTRAINT "parceiro_eventos_indicacao_id_parceiro_indicacoes_id_fk" FOREIGN KEY ("indicacao_id") REFERENCES "public"."parceiro_indicacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_indicacoes" ADD CONSTRAINT "parceiro_indicacoes_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_indicacoes" ADD CONSTRAINT "parceiro_indicacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_indicacoes" ADD CONSTRAINT "parceiro_indicacoes_substituida_por_id_parceiro_indicacoes_id_fk" FOREIGN KEY ("substituida_por_id") REFERENCES "public"."parceiro_indicacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parceiro_eventos_ciclo_idx" ON "parceiro_eventos" USING btree ("indicacao_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "parceiro_indicacoes_parceiro_idx" ON "parceiro_indicacoes" USING btree ("parceiro_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_indicacoes_ciclo_aberto_unico" ON "parceiro_indicacoes" USING btree ("visitante_hash") WHERE substituida_em is null;