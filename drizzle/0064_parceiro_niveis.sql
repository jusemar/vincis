-- Níveis do Programa de Parceiros, configurados pela Gestão.
--
-- Somente aditiva: cinco tabelas novas e duas colunas nuláveis em
-- `parceiro_comissoes` (o nível e a versão da configuração que deram o
-- percentual da recorrente). Nenhuma coluna existente muda.
--
-- `parceiro_niveis` é a estrutura (Bronze, Prata, Ouro e a ordem deles).
-- `parceiro_nivel_configuracoes` + `parceiro_nivel_regras` são a regra:
-- versões imutáveis, a vigente é a de maior número. Percentuais em centésimos
-- inteiros (500 = 5%), mínimos de clientes e dias de proteção são DADOS — o
-- código não tem nenhum desses números. `parceiro_nivel_estados` guarda o nível
-- atual e a proteção de cada parceiro; `parceiro_nivel_historico`, cada mudança.
--
-- Os INSERTs no fim são a configuração inicial (versão 1), a regra hoje
-- escolhida pelo negócio. A Gestão a substitui publicando uma versão nova pela
-- tela, sem deploy e sem migration.

CREATE TABLE "parceiro_niveis" (
	"codigo" varchar(20) PRIMARY KEY NOT NULL,
	"nome" varchar(40) NOT NULL,
	"ordem" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parceiro_nivel_configuracoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"versao" integer NOT NULL,
	"protecao_dias" integer NOT NULL,
	"criada_por" uuid,
	"vigente_desde" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parceiro_nivel_configuracoes_versao_positiva" CHECK ("parceiro_nivel_configuracoes"."versao" > 0),
	CONSTRAINT "parceiro_nivel_configuracoes_protecao_valida" CHECK ("parceiro_nivel_configuracoes"."protecao_dias" >= 0 and "parceiro_nivel_configuracoes"."protecao_dias" <= 3650)
);
--> statement-breakpoint
CREATE TABLE "parceiro_nivel_estados" (
	"parceiro_id" uuid PRIMARY KEY NOT NULL,
	"nivel_codigo" varchar(20) NOT NULL,
	"nivel_desde" timestamp NOT NULL,
	"protegido_ate" timestamp,
	"clientes_ativos" integer DEFAULT 0 NOT NULL,
	"configuracao_versao" integer NOT NULL,
	"calculado_em" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parceiro_nivel_estados_clientes_validos" CHECK ("parceiro_nivel_estados"."clientes_ativos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "parceiro_nivel_historico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"nivel_anterior" varchar(20),
	"nivel_novo" varchar(20) NOT NULL,
	"clientes_ativos" integer NOT NULL,
	"motivo" varchar(30) NOT NULL,
	"protegido_ate" timestamp,
	"protecao_anterior_ate" timestamp,
	"configuracao_versao" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parceiro_nivel_historico_motivo_valido" CHECK ("parceiro_nivel_historico"."motivo" in ('inicial', 'subida_por_clientes', 'queda_apos_protecao', 'mudanca_configuracao'))
);
--> statement-breakpoint
CREATE TABLE "parceiro_nivel_regras" (
	"configuracao_id" uuid NOT NULL,
	"nivel_codigo" varchar(20) NOT NULL,
	"minimo_clientes" integer NOT NULL,
	"percentual_centesimos" integer NOT NULL,
	CONSTRAINT "parceiro_nivel_regras_configuracao_id_nivel_codigo_pk" PRIMARY KEY("configuracao_id","nivel_codigo"),
	CONSTRAINT "parceiro_nivel_regras_minimo_valido" CHECK ("parceiro_nivel_regras"."minimo_clientes" >= 0),
	CONSTRAINT "parceiro_nivel_regras_percentual_valido" CHECK ("parceiro_nivel_regras"."percentual_centesimos" >= 0 and "parceiro_nivel_regras"."percentual_centesimos" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD COLUMN "nivel_codigo" varchar(20);--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD COLUMN "nivel_configuracao_versao" integer;--> statement-breakpoint
ALTER TABLE "parceiro_nivel_configuracoes" ADD CONSTRAINT "parceiro_nivel_configuracoes_criada_por_usuarios_id_fk" FOREIGN KEY ("criada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_nivel_estados" ADD CONSTRAINT "parceiro_nivel_estados_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_nivel_estados" ADD CONSTRAINT "parceiro_nivel_estados_nivel_codigo_parceiro_niveis_codigo_fk" FOREIGN KEY ("nivel_codigo") REFERENCES "public"."parceiro_niveis"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_nivel_historico" ADD CONSTRAINT "parceiro_nivel_historico_parceiro_id_parceiros_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_nivel_historico" ADD CONSTRAINT "parceiro_nivel_historico_nivel_anterior_parceiro_niveis_codigo_fk" FOREIGN KEY ("nivel_anterior") REFERENCES "public"."parceiro_niveis"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_nivel_historico" ADD CONSTRAINT "parceiro_nivel_historico_nivel_novo_parceiro_niveis_codigo_fk" FOREIGN KEY ("nivel_novo") REFERENCES "public"."parceiro_niveis"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_nivel_regras" ADD CONSTRAINT "parceiro_nivel_regras_configuracao_id_parceiro_nivel_configuracoes_id_fk" FOREIGN KEY ("configuracao_id") REFERENCES "public"."parceiro_nivel_configuracoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiro_nivel_regras" ADD CONSTRAINT "parceiro_nivel_regras_nivel_codigo_parceiro_niveis_codigo_fk" FOREIGN KEY ("nivel_codigo") REFERENCES "public"."parceiro_niveis"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_niveis_ordem_unica" ON "parceiro_niveis" USING btree ("ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_nivel_configuracoes_versao_unica" ON "parceiro_nivel_configuracoes" USING btree ("versao");--> statement-breakpoint
CREATE INDEX "parceiro_nivel_historico_parceiro_idx" ON "parceiro_nivel_historico" USING btree ("parceiro_id","created_at");--> statement-breakpoint
ALTER TABLE "parceiro_comissoes" ADD CONSTRAINT "parceiro_comissoes_nivel_codigo_parceiro_niveis_codigo_fk" FOREIGN KEY ("nivel_codigo") REFERENCES "public"."parceiro_niveis"("codigo") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "parceiro_niveis" ("codigo", "nome", "ordem") VALUES
  ('bronze', 'Bronze', 1),
  ('prata', 'Prata', 2),
  ('ouro', 'Ouro', 3);
--> statement-breakpoint
INSERT INTO "parceiro_nivel_configuracoes" ("versao", "protecao_dias") VALUES (1, 30);
--> statement-breakpoint
INSERT INTO "parceiro_nivel_regras" ("configuracao_id", "nivel_codigo", "minimo_clientes", "percentual_centesimos")
SELECT c."id", r."nivel_codigo", r."minimo_clientes", r."percentual_centesimos"
FROM "parceiro_nivel_configuracoes" c
CROSS JOIN (VALUES ('bronze', 0, 500), ('prata', 4, 750), ('ouro', 10, 1000))
  AS r("nivel_codigo", "minimo_clientes", "percentual_centesimos")
WHERE c."versao" = 1;
