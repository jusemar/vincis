-- Dados de recebimento do parceiro, e o retrato deles em cada saque.
--
-- Somente aditiva: uma tabela nova, quatro colunas nuláveis em
-- `parceiro_saques` e um índice. Nenhuma linha é reescrita e nenhum saque
-- existente muda — os antigos ficam com o retrato nulo, e a tela do Gestor diz
-- que aquele pedido não tem dados registrados, em vez de inventar uma chave.
--
-- A tabela é separada de `parceiros` de propósito: é dado pessoal com regra de
-- acesso própria (dono e Gestor), é opcional, e é o começo de uma lista —
-- conta bancária entra depois como outro `metodo`.
--
-- As colunas de `recebimento_*` no saque são cópia, não join: o parceiro pode
-- trocar a chave amanhã, e um pedido pendente não pode mudar de destino em
-- silêncio. Mesmo princípio de `valor_snapshot_centavos` na contratação.

CREATE TABLE "parceiro_recebimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"metodo" varchar(20) DEFAULT 'pix' NOT NULL,
	"tipo_chave" varchar(20) NOT NULL,
	"chave" varchar(140) NOT NULL,
	"titular" varchar(120) NOT NULL,
	"atualizado_por" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parceiro_saques" ADD COLUMN "recebimento_metodo" varchar(20);--> statement-breakpoint
ALTER TABLE "parceiro_saques" ADD COLUMN "recebimento_tipo_chave" varchar(20);--> statement-breakpoint
ALTER TABLE "parceiro_saques" ADD COLUMN "recebimento_chave" varchar(140);--> statement-breakpoint
ALTER TABLE "parceiro_saques" ADD COLUMN "recebimento_titular" varchar(120);--> statement-breakpoint
ALTER TABLE "parceiro_recebimentos" ADD CONSTRAINT "parceiro_recebimentos_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_recebimentos" ADD CONSTRAINT "parceiro_recebimentos_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_recebimentos_parceiro_unico" ON "parceiro_recebimentos" USING btree ("parceiro_id");