-- Os meses de prestação de cada contrato da Vincis.
--
-- Somente aditiva: uma tabela nova, uma chave estrangeira, dois índices únicos
-- e seis checks. Nenhuma tabela existente é tocada — `assinaturas` é só
-- referenciada, sem cascata, porque competência é histórico do contrato.
--
-- Competência é o mês que o contrato cobre, não a cobrança nem o pagamento. Um
-- semestral pago de uma vez tem seis competências e um pagamento; é por isso
-- que esta tabela não tem estado `paga` — o pagamento, quando existir, terá
-- entidade própria e apontará para cá. É também a unidade da comissão futura do
-- parceiro, apropriada mês a mês.
--
-- As datas nascem nulas: o início real depende do pagamento. Quando a vigência
-- existir, cada mês é datado por calendário, ancorado no dia original.
--
-- `(assinatura_id, numero)` único é a trava de reprocessar e da concorrência.
-- `(assinatura_id, periodo_inicio)` único, parcial, impede dois meses no mesmo
-- dia depois de datados. Os checks amarram estado e carimbo: não há competência
-- cancelada sem `cancelada_em`, nem cumprida sem `cumprida_em`.

CREATE TABLE "assinatura_competencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assinatura_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"periodo_inicio" date,
	"periodo_fim" date,
	"valor_base_centavos" integer NOT NULL,
	"status" varchar(20) DEFAULT 'prevista' NOT NULL,
	"cumprida_em" timestamp,
	"cancelada_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assinatura_competencias_status_valido" CHECK ("assinatura_competencias"."status" in ('prevista', 'em_andamento', 'cumprida', 'cancelada')),
	CONSTRAINT "assinatura_competencias_numero_positivo" CHECK ("assinatura_competencias"."numero" > 0),
	CONSTRAINT "assinatura_competencias_valor_nao_negativo" CHECK ("assinatura_competencias"."valor_base_centavos" >= 0),
	CONSTRAINT "assinatura_competencias_periodo_coerente" CHECK (("assinatura_competencias"."periodo_inicio" is null and "assinatura_competencias"."periodo_fim" is null)
        or ("assinatura_competencias"."periodo_inicio" is not null and "assinatura_competencias"."periodo_fim" is not null
            and "assinatura_competencias"."periodo_fim" >= "assinatura_competencias"."periodo_inicio")),
	CONSTRAINT "assinatura_competencias_cancelamento_coerente" CHECK (("assinatura_competencias"."status" = 'cancelada') = ("assinatura_competencias"."cancelada_em" is not null)),
	CONSTRAINT "assinatura_competencias_cumprimento_coerente" CHECK (("assinatura_competencias"."status" = 'cumprida') = ("assinatura_competencias"."cumprida_em" is not null))
);
--> statement-breakpoint
ALTER TABLE "assinatura_competencias" ADD CONSTRAINT "assinatura_competencias_assinatura_id_assinaturas_id_fk" FOREIGN KEY ("assinatura_id") REFERENCES "public"."assinaturas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assinatura_competencias_numero_unico" ON "assinatura_competencias" USING btree ("assinatura_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "assinatura_competencias_inicio_unico" ON "assinatura_competencias" USING btree ("assinatura_id","periodo_inicio") WHERE periodo_inicio is not null;