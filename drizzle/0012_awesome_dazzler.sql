CREATE TABLE "cliente_atribuicoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"empresa_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"atribuido_por_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "codigo" varchar(20) DEFAULT 'CLI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "cep" varchar(8);--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "logradouro" varchar(255);--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "numero" varchar(30);--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "complemento" varchar(120);--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "bairro" varchar(120);--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "cidade" varchar(120);--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "estado" varchar(2);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "formacao" varchar(255);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "instituicao_ensino" varchar(255);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "ano_formacao" integer;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "especialidades" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "certificacoes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "valor_hora_centavos" integer;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "avaliacao_media" integer;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "total_avaliacoes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "disponivel_atendimento" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cliente_atribuicoes" ADD CONSTRAINT "cliente_atribuicoes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_atribuicoes" ADD CONSTRAINT "cliente_atribuicoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_atribuicoes" ADD CONSTRAINT "cliente_atribuicoes_profissional_id_usuarios_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_atribuicoes" ADD CONSTRAINT "cliente_atribuicoes_atribuido_por_id_usuarios_id_fk" FOREIGN KEY ("atribuido_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cliente_atribuicoes_cliente_profissional_unique" ON "cliente_atribuicoes" USING btree ("cliente_id","profissional_id");--> statement-breakpoint
CREATE INDEX "cliente_atribuicoes_profissional_idx" ON "cliente_atribuicoes" USING btree ("profissional_id");--> statement-breakpoint
CREATE INDEX "cliente_atribuicoes_empresa_idx" ON "cliente_atribuicoes" USING btree ("empresa_id");--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_codigo_unique" UNIQUE("codigo");