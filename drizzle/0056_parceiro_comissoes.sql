CREATE TABLE "parceiro_comissoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"atribuicao_id" uuid NOT NULL,
	"contratacao_id" uuid NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"servico_referencia" varchar(30),
	"valor_base_centavos" integer NOT NULL,
	"percentual" numeric(5, 2) NOT NULL,
	"valor_centavos" integer NOT NULL,
	"status" varchar(20) DEFAULT 'gerada' NOT NULL,
	"gerada_em" timestamp DEFAULT now() NOT NULL,
	"disponivel_em" timestamp,
	"paga_em" timestamp,
	"cancelada_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "codigo_publico" varchar(12);--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD CONSTRAINT "parceiro_comissoes_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD CONSTRAINT "parceiro_comissoes_atribuicao_id_parceiro_atribuicoes_id_fk" FOREIGN KEY ("atribuicao_id") REFERENCES "public"."parceiro_atribuicoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD CONSTRAINT "parceiro_comissoes_contratacao_id_contratacoes_servico_id_fk" FOREIGN KEY ("contratacao_id") REFERENCES "public"."contratacoes_servico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD CONSTRAINT "parceiro_comissoes_cliente_usuario_id_usuarios_id_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD CONSTRAINT "parceiro_comissoes_profissional_id_usuarios_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_comissoes_contratacao_unica" ON "parceiro_comissoes" USING btree ("contratacao_id");--> statement-breakpoint
CREATE INDEX "parceiro_comissoes_parceiro_idx" ON "parceiro_comissoes" USING btree ("parceiro_id","created_at");--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD CONSTRAINT "perfis_profissionais_codigo_publico_unique" UNIQUE("codigo_publico");