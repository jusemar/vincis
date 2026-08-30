CREATE TABLE "precificacao_adicionais" (
	"codigo" varchar(40) PRIMARY KEY NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"descricao" varchar(240) NOT NULL,
	"valor_mensal_centavos" integer NOT NULL,
	"disponivel_para_grupos" varchar(20)[] NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "precificacao_adicionais_valor_nao_negativo" CHECK ("precificacao_adicionais"."valor_mensal_centavos" >= 0),
	CONSTRAINT "precificacao_adicionais_grupos_preenchidos" CHECK (cardinality("precificacao_adicionais"."disponivel_para_grupos") >= 1
          and "precificacao_adicionais"."disponivel_para_grupos" <@ array['contabil', 'juridico']::varchar[])
);
--> statement-breakpoint
CREATE TABLE "precificacao_descontos" (
	"codigo" varchar(30) PRIMARY KEY NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"meses" integer,
	"servico_codigo" varchar(30),
	"desconto_milesimos" integer NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "precificacao_descontos_tipo_conhecido" CHECK ("precificacao_descontos"."tipo" in ('periodo', 'combo')),
	CONSTRAINT "precificacao_descontos_forma_coerente" CHECK (("precificacao_descontos"."tipo" = 'periodo' and "precificacao_descontos"."meses" > 0 and "precificacao_descontos"."servico_codigo" is null)
          or ("precificacao_descontos"."tipo" = 'combo' and "precificacao_descontos"."meses" is null and "precificacao_descontos"."servico_codigo" is not null)),
	CONSTRAINT "precificacao_descontos_valido" CHECK ("precificacao_descontos"."desconto_milesimos" >= 0 and "precificacao_descontos"."desconto_milesimos" < 1000)
);
--> statement-breakpoint
CREATE TABLE "precificacao_dimensoes" (
	"codigo" varchar(30) PRIMARY KEY NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"aplica_a_grupos" varchar(20)[] NOT NULL,
	"selecao" varchar(20) DEFAULT 'unica' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "precificacao_dimensoes_selecao_conhecida" CHECK ("precificacao_dimensoes"."selecao" in ('unica', 'multipla')),
	CONSTRAINT "precificacao_dimensoes_grupos_preenchidos" CHECK (cardinality("precificacao_dimensoes"."aplica_a_grupos") >= 1
          and "precificacao_dimensoes"."aplica_a_grupos" <@ array['contabil', 'juridico']::varchar[])
);
--> statement-breakpoint
CREATE TABLE "precificacao_faixas" (
	"grupo" varchar(20) NOT NULL,
	"tipo" varchar(30) NOT NULL,
	"codigo" varchar(30) NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"limite_min" integer DEFAULT 0 NOT NULL,
	"limite_max" integer,
	"valor_centavos" integer NOT NULL,
	"modo" varchar(20) DEFAULT 'fixo' NOT NULL,
	"emissor_exigido" varchar(30),
	"padrao" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "precificacao_faixas_tipo_conhecido" CHECK ("precificacao_faixas"."tipo" in ('funcionarios', 'notas_fiscais', 'faturamento')),
	CONSTRAINT "precificacao_faixas_grupo_conhecido" CHECK ("precificacao_faixas"."grupo" in ('contabil', 'juridico')),
	CONSTRAINT "precificacao_faixas_modo_conhecido" CHECK ("precificacao_faixas"."modo" in ('fixo', 'por_unidade')),
	CONSTRAINT "precificacao_faixas_intervalo_valido" CHECK ("precificacao_faixas"."limite_min" >= 0 and ("precificacao_faixas"."limite_max" is null or "precificacao_faixas"."limite_max" > "precificacao_faixas"."limite_min")),
	CONSTRAINT "precificacao_faixas_valor_nao_negativo" CHECK ("precificacao_faixas"."valor_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "precificacao_opcoes" (
	"dimensao_codigo" varchar(30) NOT NULL,
	"codigo" varchar(30) NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"ajuda" varchar(240),
	"multiplicador_milesimos" integer,
	"padrao" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "precificacao_opcoes_multiplicador_positivo" CHECK ("precificacao_opcoes"."multiplicador_milesimos" is null or "precificacao_opcoes"."multiplicador_milesimos" > 0)
);
--> statement-breakpoint
CREATE TABLE "precificacao_precos_base" (
	"grupo" varchar(20) NOT NULL,
	"regime" varchar(30) NOT NULL,
	"valor_centavos" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "precificacao_precos_base_grupo_conhecido" CHECK ("precificacao_precos_base"."grupo" in ('contabil', 'juridico')),
	CONSTRAINT "precificacao_precos_base_valor_nao_negativo" CHECK ("precificacao_precos_base"."valor_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "precificacao_servicos" (
	"codigo" varchar(30) PRIMARY KEY NOT NULL,
	"nome" varchar(80) NOT NULL,
	"chamada" varchar(400) NOT NULL,
	"grupo_base" varchar(20),
	"multiplicador_milesimos" integer,
	"componentes" varchar(30)[] DEFAULT '{}' NOT NULL,
	"destaque" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "precificacao_servicos_grupo_conhecido" CHECK ("precificacao_servicos"."grupo_base" is null or "precificacao_servicos"."grupo_base" in ('contabil', 'juridico')),
	CONSTRAINT "precificacao_servicos_origem_do_preco" CHECK (("precificacao_servicos"."grupo_base" is not null and "precificacao_servicos"."multiplicador_milesimos" > 0 and cardinality("precificacao_servicos"."componentes") = 0)
          or ("precificacao_servicos"."grupo_base" is null and "precificacao_servicos"."multiplicador_milesimos" is null and cardinality("precificacao_servicos"."componentes") >= 2))
);
--> statement-breakpoint
ALTER TABLE "precificacao_descontos" ADD CONSTRAINT "precificacao_descontos_servico_codigo_precificacao_servicos_codigo_fk" FOREIGN KEY ("servico_codigo") REFERENCES "public"."precificacao_servicos"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precificacao_opcoes" ADD CONSTRAINT "precificacao_opcoes_dimensao_codigo_precificacao_dimensoes_codigo_fk" FOREIGN KEY ("dimensao_codigo") REFERENCES "public"."precificacao_dimensoes"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "precificacao_faixas_grupo_tipo_codigo" ON "precificacao_faixas" USING btree ("grupo","tipo","codigo");--> statement-breakpoint
CREATE INDEX "precificacao_faixas_familia_idx" ON "precificacao_faixas" USING btree ("grupo","tipo","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "precificacao_faixas_padrao_unico" ON "precificacao_faixas" USING btree ("grupo","tipo") WHERE "precificacao_faixas"."padrao";--> statement-breakpoint
CREATE UNIQUE INDEX "precificacao_opcoes_dimensao_codigo" ON "precificacao_opcoes" USING btree ("dimensao_codigo","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "precificacao_opcoes_padrao_unico" ON "precificacao_opcoes" USING btree ("dimensao_codigo") WHERE "precificacao_opcoes"."padrao";--> statement-breakpoint
CREATE UNIQUE INDEX "precificacao_precos_base_grupo_regime" ON "precificacao_precos_base" USING btree ("grupo","regime");--> statement-breakpoint
-- Carga inicial da precificação.
--
-- São exatamente os valores que `src/features/precos/lib/pricing.ts` aplicava
-- em código, convertidos para as unidades da família: dinheiro em centavos,
-- fatores e percentuais em milésimos (número real x 1000). Nenhum valor novo
-- foi inventado — a página passa a ler do banco o que já cobrava.
--
-- `ON CONFLICT DO NOTHING` em todas as linhas: a migration pode reencontrar um
-- banco onde a carga já correu (homologação reaplicada, banco de teste
-- recriado) sem duplicar grade nem sobrescrever um reajuste que o Gestor já
-- tenha feito.
INSERT INTO "precificacao_servicos"
  ("codigo", "nome", "chamada", "grupo_base", "multiplicador_milesimos", "componentes", "destaque", "ordem")
VALUES
  ('padrao', 'Contabilidade Padrão', 'Execução das rotinas contábeis, fiscais e trabalhistas da empresa com segurança, organização e pontualidade.', 'contabil', 1000, '{}', false, 1),
  ('consultiva', 'Contabilidade Consultiva', 'Uma relação mais próxima com sua empresa, com acompanhamento, análises e orientação para apoiar decisões e crescimento.', 'contabil', 1350, '{}', true, 2),
  ('juridico', 'Assistência Jurídica', 'Consultas, contratos e suporte trabalhista e societário para proteger sua empresa no dia a dia.', 'juridico', 1000, '{}', false, 3),
  ('combo', 'Pacote Empresarial Completo', 'Contabilidade Consultiva somada à Assistência Jurídica para empresas que querem acompanhamento mais completo e segurança no dia a dia.', NULL, NULL, '{consultiva,juridico}', true, 4)
ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint
INSERT INTO "precificacao_precos_base" ("grupo", "regime", "valor_centavos")
VALUES
  ('contabil', 'mei', 8900),
  ('contabil', 'simples', 19500),
  ('contabil', 'presumido', 38900),
  ('contabil', 'real', 74900),
  ('juridico', 'mei', 6900),
  ('juridico', 'simples', 14900),
  ('juridico', 'presumido', 22900),
  ('juridico', 'real', 37900)
ON CONFLICT ("grupo", "regime") DO NOTHING;--> statement-breakpoint
INSERT INTO "precificacao_dimensoes" ("codigo", "rotulo", "aplica_a_grupos", "selecao", "ordem")
VALUES
  ('regime', 'Enquadramento fiscal', '{contabil,juridico}', 'unica', 1),
  ('atividade', 'Ramo da empresa', '{contabil}', 'multipla', 2),
  ('emissor', 'Quem emitirá as notas', '{contabil}', 'unica', 3),
  ('atendimento', 'Como quer ser atendido', '{contabil,juridico}', 'unica', 4),
  ('rotina', 'Quem cuida da rotina', '{contabil}', 'unica', 5)
ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint
INSERT INTO "precificacao_opcoes"
  ("dimensao_codigo", "codigo", "rotulo", "ajuda", "multiplicador_milesimos", "padrao", "ordem")
VALUES
  ('regime', 'mei', 'MEI', 'Faturamento até R$ 81 mil/ano', NULL, false, 1),
  ('regime', 'simples', 'Simples Nacional', 'O regime mais comum', NULL, true, 2),
  ('regime', 'presumido', 'Lucro Presumido', 'Apuração trimestral', NULL, false, 3),
  ('regime', 'real', 'Lucro Real', 'Estrutura contábil completa', NULL, false, 4),
  ('atividade', 'servicos', 'Serviços', NULL, 1000, true, 1),
  ('atividade', 'comercio', 'Comércio', NULL, 1080, false, 2),
  ('atividade', 'industria', 'Indústria', NULL, 1180, false, 3),
  ('emissor', 'empresa', 'Minha empresa', NULL, NULL, false, 1),
  ('emissor', 'vincis', 'Vincis', NULL, NULL, true, 2),
  ('atendimento', 'digital', '100% digital', 'Chat e e-mail, resposta em até 9h', 1000, false, 1),
  ('atendimento', 'hibrido', 'Híbrido', 'Chat, telefone e reuniões em grupo', 1070, true, 2),
  ('atendimento', 'prioritario', 'Atendimento prioritário', 'WhatsApp direto e reuniões 1:1', 1200, false, 3),
  ('rotina', 'compartilhado', 'Eu cuido de parte da rotina', 'Envio documentos e acompanho de perto', 1000, true, 1),
  ('rotina', 'vincis', 'Quero que a Vincis cuide', 'Rotina conduzida pelo time Vincis de ponta a ponta', 1140, false, 2)
ON CONFLICT ("dimensao_codigo", "codigo") DO NOTHING;--> statement-breakpoint
-- Funcionários: a faixa começa em 3 porque os dois primeiros não eram cobrados
-- (`max(0, funcionarios - 2)` no código antigo). `por_unidade` cobra o valor
-- por funcionário dentro da faixa.
INSERT INTO "precificacao_faixas"
  ("grupo", "tipo", "codigo", "rotulo", "limite_min", "limite_max", "valor_centavos", "modo", "emissor_exigido", "padrao", "ordem")
VALUES
  ('contabil', 'funcionarios', 'excedente', 'Funcionários acima dos 2 inclusos', 3, NULL, 2400, 'por_unidade', NULL, false, 1),
  ('juridico', 'funcionarios', 'excedente', 'Funcionários acima dos 2 inclusos', 3, NULL, 900, 'por_unidade', NULL, false, 1),
  ('contabil', 'notas_fiscais', 'ate10', 'Até 10', 0, 11, 0, 'fixo', 'vincis', false, 1),
  ('contabil', 'notas_fiscais', '11a30', '11 a 30', 11, 31, 2500, 'fixo', 'vincis', true, 2),
  ('contabil', 'notas_fiscais', '31a100', '31 a 100', 31, 101, 7000, 'fixo', 'vincis', false, 3),
  ('contabil', 'notas_fiscais', '101a250', '101 a 250', 101, 251, 16000, 'fixo', 'vincis', false, 4),
  ('contabil', 'notas_fiscais', 'mais250', 'Mais de 250', 251, NULL, 32000, 'fixo', 'vincis', false, 5),
  ('contabil', 'faturamento', 'ate50k', 'Até R$ 50 mil', 0, 5000000, 0, 'fixo', NULL, true, 1),
  ('contabil', 'faturamento', '50a150k', 'R$ 50 mil a R$ 150 mil', 5000000, 15000000, 6000, 'fixo', NULL, false, 2),
  ('contabil', 'faturamento', '150a500k', 'R$ 150 mil a R$ 500 mil', 15000000, 50000000, 18000, 'fixo', NULL, false, 3),
  ('contabil', 'faturamento', '500ka1m', 'R$ 500 mil a R$ 1 milhão', 50000000, 100000000, 34000, 'fixo', NULL, false, 4),
  ('contabil', 'faturamento', 'acima1m', 'Acima de R$ 1 milhão', 100000000, NULL, 62000, 'fixo', NULL, false, 5)
ON CONFLICT ("grupo", "tipo", "codigo") DO NOTHING;--> statement-breakpoint
INSERT INTO "precificacao_adicionais"
  ("codigo", "rotulo", "descricao", "valor_mensal_centavos", "disponivel_para_grupos", "ordem")
VALUES
  ('emissao_extra', 'Emissão de notas avulsas extra', 'Além da faixa contratada', 3900, '{contabil,juridico}', 1),
  ('reuniao_mensal', 'Reunião mensal 1:1', 'Com o profissional responsável', 5900, '{contabil,juridico}', 2),
  ('suporte_prioritario', 'Suporte prioritário', 'Resposta garantida em até 2h', 4900, '{contabil,juridico}', 3),
  ('especialista_dedicado', 'Especialista dedicado', 'Ponto de contato fixo', 14900, '{contabil,juridico}', 4)
ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint
INSERT INTO "precificacao_descontos"
  ("codigo", "tipo", "rotulo", "meses", "servico_codigo", "desconto_milesimos", "ordem")
VALUES
  ('mensal', 'periodo', 'Mensal', 1, NULL, 0, 1),
  ('seis_meses', 'periodo', '6 meses', 6, NULL, 80, 2),
  ('doze_meses', 'periodo', '12 meses', 12, NULL, 150, 3),
  ('combo', 'combo', 'Desconto do combo', NULL, 'combo', 150, 4)
ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint
-- Os dois parâmetros gerais da precificação entram no registro que a
-- plataforma já tem para decisões de produto (`configuracoes_plataforma`), e
-- não numa tabela chave-valor paralela só da precificação.
INSERT INTO "configuracoes_plataforma" ("chave", "valor")
VALUES
  ('precificacao_arredondamento_centavos', '500'),
  ('precificacao_funcionarios_padrao', '3')
ON CONFLICT ("chave") DO NOTHING;
