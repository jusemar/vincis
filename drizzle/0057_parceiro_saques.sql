-- Solicitação de saque do parceiro.
--
-- Somente aditiva: duas tabelas novas, as chaves delas e dois índices. Nenhuma
-- coluna de `parceiro_comissoes` foi tocada — a comissão continua exatamente
-- como estava, e reservar não a altera.
--
-- `parceiro_saques` é o pedido, não o pagamento: nasce `solicitado`, `pago_em`
-- nasce nulo e nada nesta fatia o preenche.
--
-- `parceiro_saque_itens` diz quais comissões sustentam cada saque, e o índice
-- único em `comissao_id` é a trava do saldo: é ele que impede a mesma comissão
-- de pagar dois saques e, por consequência, o saldo de ficar negativo em duas
-- solicitações simultâneas. Consulta antes do insert evita o erro comum; só o
-- banco resolve a corrida.

CREATE TABLE "parceiro_saque_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saque_id" uuid NOT NULL,
	"comissao_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parceiro_saques" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"status" varchar(20) DEFAULT 'solicitado' NOT NULL,
	"solicitado_em" timestamp DEFAULT now() NOT NULL,
	"pago_em" timestamp,
	"observacao" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parceiro_saques_valor_positivo" CHECK ("parceiro_saques"."valor_centavos" > 0)
);
--> statement-breakpoint
ALTER TABLE "parceiro_saque_itens" ADD CONSTRAINT "parceiro_saque_itens_saque_id_parceiro_saques_id_fk" FOREIGN KEY ("saque_id") REFERENCES "public"."parceiro_saques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_saque_itens" ADD CONSTRAINT "parceiro_saque_itens_comissao_id_parceiro_comissoes_id_fk" FOREIGN KEY ("comissao_id") REFERENCES "public"."parceiro_comissoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_saques" ADD CONSTRAINT "parceiro_saques_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_saque_itens_comissao_unica" ON "parceiro_saque_itens" USING btree ("comissao_id");--> statement-breakpoint
CREATE INDEX "parceiro_saques_parceiro_idx" ON "parceiro_saques" USING btree ("parceiro_id","solicitado_em");