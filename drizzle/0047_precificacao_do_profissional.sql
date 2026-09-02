-- A tabela de preços individual de cada Profissional.
--
-- Duas tabelas e nada mais: o estado de publicação e os números. A estrutura da
-- grade (regimes, faixas, limites, dimensões) continua sendo a da Vincis, em
-- `precificacao_*` — o Profissional escolhe quanto cobra, nunca como se cobra.
-- É o que permite reaproveitar o motor de preço sem duplicá-lo, e o que impede
-- uma grade individual de nascer incoerente.
--
-- Nenhuma linha de `precificacao_*` é criada, alterada ou removida aqui: a
-- precificação da Vincis atravessa esta migration sem ser tocada.

CREATE TABLE "precificacao_profissional" (
	"profissional_id" uuid PRIMARY KEY NOT NULL,
	"publicado" boolean DEFAULT false NOT NULL,
	"publicado_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precificacao_profissional_valores" (
	"profissional_id" uuid NOT NULL,
	"estado" varchar(12) NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"chave" varchar(80) NOT NULL,
	"valor" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "precificacao_profissional_valores_profissional_id_estado_tipo_chave_pk" PRIMARY KEY("profissional_id","estado","tipo","chave"),
	CONSTRAINT "precificacao_profissional_valores_estado_conhecido" CHECK ("precificacao_profissional_valores"."estado" in ('rascunho', 'publicado')),
	CONSTRAINT "precificacao_profissional_valores_tipo_conhecido" CHECK ("precificacao_profissional_valores"."tipo" in ('preco_base', 'faixa', 'fator')),
	CONSTRAINT "precificacao_profissional_valores_nao_negativo" CHECK ("precificacao_profissional_valores"."valor" >= 0),
	CONSTRAINT "precificacao_profissional_valores_fator_positivo" CHECK ("precificacao_profissional_valores"."tipo" <> 'fator' or "precificacao_profissional_valores"."valor" > 0)
);
--> statement-breakpoint
ALTER TABLE "precificacao_profissional" ADD CONSTRAINT "precificacao_profissional_profissional_id_usuarios_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precificacao_profissional_valores" ADD CONSTRAINT "precificacao_profissional_valores_profissional_id_usuarios_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "precificacao_profissional_publicado_idx" ON "precificacao_profissional" USING btree ("publicado");--> statement-breakpoint
CREATE INDEX "precificacao_profissional_valores_conjunto_idx" ON "precificacao_profissional_valores" USING btree ("profissional_id","estado");