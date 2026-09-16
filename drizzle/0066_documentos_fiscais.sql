-- Central Fiscal — fundação (Etapa 1 / Fase 1.1).
--
-- Somente aditiva: sete tabelas novas, nenhuma coluna ou constraint existente
-- muda. Nenhum upload, parser ou integração — só a estrutura que as próximas
-- fases vão preencher.
--
-- `documentos_fiscais`: um documento por perspectiva (empresa + cliente),
-- isolado por `empresa_id` (o escritório). Chave de acesso única por
-- perspectiva; eventos não entram nesta unicidade.
-- `documentos_fiscais_eventos`: autorização, cancelamento, CC-e, manifestações —
-- únicos por documento + tipo + código + sequência.
-- `documentos_fiscais_arquivos`: o original, imutável (sem updated_at), em
-- armazenamento privado. FK composta (documento, empresa) impede arquivo de um
-- escritório apontar para documento de outro. SHA-256 indexado por empresa,
-- para detecção de duplicidade.
-- `documentos_fiscais_extracoes`: cada leitura (parser XML, OCR, IA, revisão
-- manual) com provedor, versão, status e confiança; no máximo uma vigente.
-- `documentos_fiscais_partes`, `_itens`, `_tributos`: dados derivados,
-- pertencentes à extração que os leu. Tributo é linha com código, não coluna.
--
-- Os INSERTs no fim registram as permissões `documentos_fiscais.*` no RBAC e as
-- concedem aos perfis existentes, conforme
-- `features/documentos-fiscais/constants/permissoes.ts`. Idempotentes: perfil
-- ausente não recebe nada, vínculo existente não duplica.

CREATE TABLE "documentos_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cliente_id" uuid,
	"enviado_por_id" uuid,
	"tipo" varchar(20),
	"origem" varchar(30) NOT NULL,
	"status_processamento" varchar(20) DEFAULT 'pendente' NOT NULL,
	"status_revisao" varchar(20) DEFAULT 'pendente' NOT NULL,
	"situacao" varchar(20) DEFAULT 'nao_verificada' NOT NULL,
	"sentido" varchar(20),
	"chave_acesso" varchar(60),
	"modelo" varchar(4),
	"serie" varchar(20),
	"numero" varchar(20),
	"versao_leiaute" varchar(10),
	"emitido_em" timestamp,
	"data_emissao" date,
	"emitente_identificacao" varchar(20),
	"emitente_nome" varchar(300),
	"destinatario_identificacao" varchar(20),
	"destinatario_nome" varchar(300),
	"valor_total" numeric(15, 2),
	"valor_produtos" numeric(15, 2),
	"valor_servicos" numeric(15, 2),
	"valor_desconto" numeric(15, 2),
	"valor_frete" numeric(15, 2),
	"valor_seguro" numeric(15, 2),
	"valor_outras_despesas" numeric(15, 2),
	"processado_em" timestamp,
	"revisado_em" timestamp,
	"revisado_por_id" uuid,
	"excluido_em" timestamp,
	"excluido_por_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_fiscais_id_empresa_unico" UNIQUE("id","empresa_id"),
	CONSTRAINT "documentos_fiscais_tipo_valido" CHECK ("documentos_fiscais"."tipo" is null or "documentos_fiscais"."tipo" in ('nfe', 'nfce', 'nfse', 'cte', 'outro')),
	CONSTRAINT "documentos_fiscais_origem_valida" CHECK ("documentos_fiscais"."origem" in ('envio_usuario', 'captura_automatica', 'integracao')),
	CONSTRAINT "documentos_fiscais_status_processamento_valido" CHECK ("documentos_fiscais"."status_processamento" in ('pendente', 'processando', 'processado', 'falhou')),
	CONSTRAINT "documentos_fiscais_status_revisao_valido" CHECK ("documentos_fiscais"."status_revisao" in ('pendente', 'revisado', 'com_divergencia')),
	CONSTRAINT "documentos_fiscais_situacao_valida" CHECK ("documentos_fiscais"."situacao" in ('nao_verificada', 'autorizada', 'cancelada', 'denegada')),
	CONSTRAINT "documentos_fiscais_sentido_valido" CHECK ("documentos_fiscais"."sentido" is null or "documentos_fiscais"."sentido" in ('emitido', 'recebido')),
	CONSTRAINT "documentos_fiscais_chave_formato" CHECK ("documentos_fiscais"."chave_acesso" is null or "documentos_fiscais"."chave_acesso" ~ '^[0-9A-Z]+$'),
	CONSTRAINT "documentos_fiscais_processamento_coerente" CHECK ("documentos_fiscais"."status_processamento" <> 'processado'
        or ("documentos_fiscais"."tipo" is not null and "documentos_fiscais"."processado_em" is not null)),
	CONSTRAINT "documentos_fiscais_revisao_coerente" CHECK (("documentos_fiscais"."status_revisao" = 'pendente') = ("documentos_fiscais"."revisado_em" is null)),
	CONSTRAINT "documentos_fiscais_valores_nao_negativos" CHECK (coalesce("documentos_fiscais"."valor_total", 0) >= 0
        and coalesce("documentos_fiscais"."valor_produtos", 0) >= 0
        and coalesce("documentos_fiscais"."valor_servicos", 0) >= 0
        and coalesce("documentos_fiscais"."valor_desconto", 0) >= 0
        and coalesce("documentos_fiscais"."valor_frete", 0) >= 0
        and coalesce("documentos_fiscais"."valor_seguro", 0) >= 0
        and coalesce("documentos_fiscais"."valor_outras_despesas", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "documentos_fiscais_arquivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"documento_fiscal_id" uuid NOT NULL,
	"evento_fiscal_id" uuid,
	"tipo_arquivo" varchar(20) NOT NULL,
	"nome_original" varchar(255) NOT NULL,
	"tipo_mime" varchar(120) NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"chave_armazenamento" varchar(500) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"enviado_por_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_fiscais_arquivos_chave_unica" UNIQUE("chave_armazenamento"),
	CONSTRAINT "documentos_fiscais_arquivos_id_documento_unico" UNIQUE("id","documento_fiscal_id"),
	CONSTRAINT "documentos_fiscais_arquivos_tipo_valido" CHECK ("documentos_fiscais_arquivos"."tipo_arquivo" in ('xml', 'pdf', 'imagem')),
	CONSTRAINT "documentos_fiscais_arquivos_tamanho_positivo" CHECK ("documentos_fiscais_arquivos"."tamanho_bytes" > 0),
	CONSTRAINT "documentos_fiscais_arquivos_sha256_formato" CHECK ("documentos_fiscais_arquivos"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "documentos_fiscais_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documento_fiscal_id" uuid NOT NULL,
	"tipo" varchar(40) NOT NULL,
	"codigo_evento" varchar(10),
	"sequencia" integer DEFAULT 1 NOT NULL,
	"protocolo" varchar(30),
	"ocorrido_em" timestamp,
	"origem" varchar(30) NOT NULL,
	"registrado_por_id" uuid,
	"dados_especificos" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_fiscais_eventos_id_documento_unico" UNIQUE("id","documento_fiscal_id"),
	CONSTRAINT "documentos_fiscais_eventos_tipo_valido" CHECK ("documentos_fiscais_eventos"."tipo" in ('autorizacao', 'denegacao', 'cancelamento', 'carta_correcao',
        'ciencia_operacao', 'confirmacao_recebimento', 'desconhecimento_operacao',
        'operacao_nao_realizada', 'outro')),
	CONSTRAINT "documentos_fiscais_eventos_origem_valida" CHECK ("documentos_fiscais_eventos"."origem" in ('envio_usuario', 'captura_automatica', 'integracao')),
	CONSTRAINT "documentos_fiscais_eventos_sequencia_positiva" CHECK ("documentos_fiscais_eventos"."sequencia" >= 1)
);
--> statement-breakpoint
CREATE TABLE "documentos_fiscais_extracoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documento_fiscal_id" uuid NOT NULL,
	"arquivo_id" uuid,
	"metodo" varchar(20) NOT NULL,
	"provedor" varchar(60) NOT NULL,
	"versao" varchar(40) NOT NULL,
	"status" varchar(20) DEFAULT 'processando' NOT NULL,
	"vigente" boolean DEFAULT false NOT NULL,
	"confianca" numeric(5, 4),
	"dados" jsonb,
	"erros" jsonb,
	"criada_por_id" uuid,
	"iniciada_em" timestamp DEFAULT now() NOT NULL,
	"finalizada_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_fiscais_extracoes_metodo_valido" CHECK ("documentos_fiscais_extracoes"."metodo" in ('parser_xml', 'ocr', 'ia', 'manual')),
	CONSTRAINT "documentos_fiscais_extracoes_status_valido" CHECK ("documentos_fiscais_extracoes"."status" in ('processando', 'concluida', 'falhou')),
	CONSTRAINT "documentos_fiscais_extracoes_vigente_concluida" CHECK (not "documentos_fiscais_extracoes"."vigente" or "documentos_fiscais_extracoes"."status" = 'concluida'),
	CONSTRAINT "documentos_fiscais_extracoes_conclusao_coerente" CHECK (("documentos_fiscais_extracoes"."status" = 'processando') = ("documentos_fiscais_extracoes"."finalizada_em" is null)),
	CONSTRAINT "documentos_fiscais_extracoes_confianca_valida" CHECK ("documentos_fiscais_extracoes"."confianca" is null or ("documentos_fiscais_extracoes"."confianca" >= 0 and "documentos_fiscais_extracoes"."confianca" <= 1)),
	CONSTRAINT "documentos_fiscais_extracoes_origem_coerente" CHECK (("documentos_fiscais_extracoes"."metodo" = 'manual') = ("documentos_fiscais_extracoes"."arquivo_id" is null))
);
--> statement-breakpoint
CREATE TABLE "documentos_fiscais_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extracao_id" uuid NOT NULL,
	"numero_item" integer NOT NULL,
	"codigo_produto" varchar(60),
	"descricao" text,
	"gtin" varchar(14),
	"ncm" varchar(8),
	"cest" varchar(7),
	"cfop" varchar(4),
	"codigo_servico" varchar(20),
	"nbs" varchar(12),
	"unidade" varchar(10),
	"quantidade" numeric(15, 4),
	"valor_unitario" numeric(21, 10),
	"valor_bruto" numeric(15, 2),
	"valor_desconto" numeric(15, 2),
	"valor_frete" numeric(15, 2),
	"valor_seguro" numeric(15, 2),
	"valor_outras_despesas" numeric(15, 2),
	"valor_total" numeric(15, 2),
	"dados_especificos" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_fiscais_itens_numero_unico" UNIQUE("extracao_id","numero_item"),
	CONSTRAINT "documentos_fiscais_itens_id_extracao_unico" UNIQUE("id","extracao_id"),
	CONSTRAINT "documentos_fiscais_itens_numero_positivo" CHECK ("documentos_fiscais_itens"."numero_item" >= 1),
	CONSTRAINT "documentos_fiscais_itens_valores_nao_negativos" CHECK (coalesce("documentos_fiscais_itens"."quantidade", 0) >= 0
        and coalesce("documentos_fiscais_itens"."valor_unitario", 0) >= 0
        and coalesce("documentos_fiscais_itens"."valor_bruto", 0) >= 0
        and coalesce("documentos_fiscais_itens"."valor_desconto", 0) >= 0
        and coalesce("documentos_fiscais_itens"."valor_frete", 0) >= 0
        and coalesce("documentos_fiscais_itens"."valor_seguro", 0) >= 0
        and coalesce("documentos_fiscais_itens"."valor_outras_despesas", 0) >= 0
        and coalesce("documentos_fiscais_itens"."valor_total", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "documentos_fiscais_partes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extracao_id" uuid NOT NULL,
	"papel" varchar(30) NOT NULL,
	"sequencia" integer DEFAULT 1 NOT NULL,
	"tipo_identificacao" varchar(20),
	"identificacao" varchar(20),
	"nome" varchar(300),
	"nome_fantasia" varchar(300),
	"inscricao_estadual" varchar(20),
	"inscricao_municipal" varchar(20),
	"regime_tributario" varchar(4),
	"logradouro" varchar(255),
	"numero" varchar(60),
	"complemento" varchar(255),
	"bairro" varchar(120),
	"codigo_municipio" varchar(7),
	"municipio" varchar(120),
	"uf" varchar(2),
	"cep" varchar(8),
	"codigo_pais" varchar(4),
	"pais" varchar(60),
	"telefone" varchar(20),
	"email" varchar(255),
	"dados_especificos" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_fiscais_partes_papel_valido" CHECK ("documentos_fiscais_partes"."papel" in ('emitente', 'destinatario', 'transportador', 'prestador', 'tomador',
        'intermediario', 'remetente', 'expedidor', 'recebedor', 'autorizado', 'outro')),
	CONSTRAINT "documentos_fiscais_partes_sequencia_positiva" CHECK ("documentos_fiscais_partes"."sequencia" >= 1),
	CONSTRAINT "documentos_fiscais_partes_identificacao_coerente" CHECK (("documentos_fiscais_partes"."tipo_identificacao" is null) = ("documentos_fiscais_partes"."identificacao" is null)),
	CONSTRAINT "documentos_fiscais_partes_identificacao_valida" CHECK ("documentos_fiscais_partes"."tipo_identificacao" is null
        or ("documentos_fiscais_partes"."tipo_identificacao" = 'cnpj' and "documentos_fiscais_partes"."identificacao" ~ '^[0-9A-Z]{12}[0-9]{2}$')
        or ("documentos_fiscais_partes"."tipo_identificacao" = 'cpf' and "documentos_fiscais_partes"."identificacao" ~ '^[0-9]{11}$')
        or "documentos_fiscais_partes"."tipo_identificacao" = 'estrangeiro')
);
--> statement-breakpoint
CREATE TABLE "documentos_fiscais_tributos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extracao_id" uuid NOT NULL,
	"item_id" uuid,
	"tributo" varchar(30) NOT NULL,
	"retido" boolean DEFAULT false NOT NULL,
	"codigo_situacao" varchar(4),
	"classificacao_tributaria" varchar(10),
	"base_calculo" numeric(15, 2),
	"aliquota_percentual" numeric(9, 4),
	"valor" numeric(15, 2),
	"dados_especificos" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_fiscais_tributos_tributo_formato" CHECK ("documentos_fiscais_tributos"."tributo" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "documentos_fiscais_tributos_base_nao_negativa" CHECK (coalesce("documentos_fiscais_tributos"."base_calculo", 0) >= 0),
	CONSTRAINT "documentos_fiscais_tributos_aliquota_nao_negativa" CHECK (coalesce("documentos_fiscais_tributos"."aliquota_percentual", 0) >= 0)
);
--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_empresa_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_cliente_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_enviado_por_fk" FOREIGN KEY ("enviado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_revisado_por_fk" FOREIGN KEY ("revisado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_excluido_por_fk" FOREIGN KEY ("excluido_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_arquivos" ADD CONSTRAINT "documentos_fiscais_arquivos_documento_fk" FOREIGN KEY ("documento_fiscal_id","empresa_id") REFERENCES "public"."documentos_fiscais"("id","empresa_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_arquivos" ADD CONSTRAINT "documentos_fiscais_arquivos_evento_fk" FOREIGN KEY ("evento_fiscal_id","documento_fiscal_id") REFERENCES "public"."documentos_fiscais_eventos"("id","documento_fiscal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_arquivos" ADD CONSTRAINT "documentos_fiscais_arquivos_enviado_por_fk" FOREIGN KEY ("enviado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_eventos" ADD CONSTRAINT "documentos_fiscais_eventos_documento_fk" FOREIGN KEY ("documento_fiscal_id") REFERENCES "public"."documentos_fiscais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_eventos" ADD CONSTRAINT "documentos_fiscais_eventos_registrado_por_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_extracoes" ADD CONSTRAINT "documentos_fiscais_extracoes_documento_fk" FOREIGN KEY ("documento_fiscal_id") REFERENCES "public"."documentos_fiscais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_extracoes" ADD CONSTRAINT "documentos_fiscais_extracoes_arquivo_fk" FOREIGN KEY ("arquivo_id","documento_fiscal_id") REFERENCES "public"."documentos_fiscais_arquivos"("id","documento_fiscal_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_extracoes" ADD CONSTRAINT "documentos_fiscais_extracoes_criada_por_fk" FOREIGN KEY ("criada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_itens" ADD CONSTRAINT "documentos_fiscais_itens_extracao_fk" FOREIGN KEY ("extracao_id") REFERENCES "public"."documentos_fiscais_extracoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_partes" ADD CONSTRAINT "documentos_fiscais_partes_extracao_fk" FOREIGN KEY ("extracao_id") REFERENCES "public"."documentos_fiscais_extracoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_tributos" ADD CONSTRAINT "documentos_fiscais_tributos_extracao_fk" FOREIGN KEY ("extracao_id") REFERENCES "public"."documentos_fiscais_extracoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais_tributos" ADD CONSTRAINT "documentos_fiscais_tributos_item_fk" FOREIGN KEY ("item_id","extracao_id") REFERENCES "public"."documentos_fiscais_itens"("id","extracao_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_fiscais_chave_unica" ON "documentos_fiscais" USING btree ("empresa_id","chave_acesso",coalesce("cliente_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "documentos_fiscais"."chave_acesso" is not null;--> statement-breakpoint
CREATE INDEX "documentos_fiscais_empresa_emissao_idx" ON "documentos_fiscais" USING btree ("empresa_id","data_emissao");--> statement-breakpoint
CREATE INDEX "documentos_fiscais_cliente_emissao_idx" ON "documentos_fiscais" USING btree ("cliente_id","data_emissao");--> statement-breakpoint
CREATE INDEX "documentos_fiscais_empresa_revisao_idx" ON "documentos_fiscais" USING btree ("empresa_id","status_revisao");--> statement-breakpoint
CREATE INDEX "documentos_fiscais_processamento_idx" ON "documentos_fiscais" USING btree ("status_processamento","created_at") WHERE "documentos_fiscais"."status_processamento" in ('pendente', 'processando');--> statement-breakpoint
CREATE INDEX "documentos_fiscais_emitente_idx" ON "documentos_fiscais" USING btree ("empresa_id","emitente_identificacao");--> statement-breakpoint
CREATE INDEX "documentos_fiscais_destinatario_idx" ON "documentos_fiscais" USING btree ("empresa_id","destinatario_identificacao");--> statement-breakpoint
CREATE INDEX "documentos_fiscais_arquivos_empresa_hash_idx" ON "documentos_fiscais_arquivos" USING btree ("empresa_id","sha256");--> statement-breakpoint
CREATE INDEX "documentos_fiscais_arquivos_documento_idx" ON "documentos_fiscais_arquivos" USING btree ("documento_fiscal_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_fiscais_eventos_unico" ON "documentos_fiscais_eventos" USING btree ("documento_fiscal_id","tipo",coalesce("codigo_evento", ''),"sequencia");--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_fiscais_extracoes_vigente_unica" ON "documentos_fiscais_extracoes" USING btree ("documento_fiscal_id") WHERE "documentos_fiscais_extracoes"."vigente";--> statement-breakpoint
CREATE INDEX "documentos_fiscais_extracoes_documento_idx" ON "documentos_fiscais_extracoes" USING btree ("documento_fiscal_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_fiscais_partes_papel_unico" ON "documentos_fiscais_partes" USING btree ("extracao_id","papel","sequencia");--> statement-breakpoint
CREATE INDEX "documentos_fiscais_tributos_extracao_idx" ON "documentos_fiscais_tributos" USING btree ("extracao_id","tributo");--> statement-breakpoint
CREATE INDEX "documentos_fiscais_tributos_item_idx" ON "documentos_fiscais_tributos" USING btree ("item_id");
--> statement-breakpoint
INSERT INTO "permissoes" ("nome", "descricao") VALUES
  ('documentos_fiscais.visualizar', 'Visualizar documentos fiscais'),
  ('documentos_fiscais.enviar', 'Enviar documentos fiscais'),
  ('documentos_fiscais.revisar', 'Revisar documentos fiscais'),
  ('documentos_fiscais.editar', 'Editar dados de documentos fiscais'),
  ('documentos_fiscais.baixar', 'Baixar arquivos originais de documentos fiscais'),
  ('documentos_fiscais.excluir', 'Excluir documentos fiscais'),
  ('documentos_fiscais.integracoes', 'Gerenciar integrações fiscais')
ON CONFLICT ("nome") DO NOTHING;
--> statement-breakpoint
INSERT INTO "perfis_permissoes" ("perfil_id", "permissao_id")
SELECT pf."id", pm."id"
FROM (VALUES
  ('profissional', 'documentos_fiscais.visualizar'),
  ('profissional', 'documentos_fiscais.enviar'),
  ('profissional', 'documentos_fiscais.revisar'),
  ('profissional', 'documentos_fiscais.editar'),
  ('profissional', 'documentos_fiscais.baixar'),
  ('profissional', 'documentos_fiscais.excluir'),
  ('profissional', 'documentos_fiscais.integracoes'),
  ('contador', 'documentos_fiscais.visualizar'),
  ('contador', 'documentos_fiscais.enviar'),
  ('contador', 'documentos_fiscais.revisar'),
  ('contador', 'documentos_fiscais.editar'),
  ('contador', 'documentos_fiscais.baixar'),
  ('contador', 'documentos_fiscais.excluir'),
  ('contador', 'documentos_fiscais.integracoes'),
  ('colaborador', 'documentos_fiscais.visualizar'),
  ('colaborador', 'documentos_fiscais.enviar'),
  ('colaborador', 'documentos_fiscais.baixar')
) AS c("perfil", "permissao")
INNER JOIN "perfis" pf ON pf."nome" = c."perfil"
INNER JOIN "permissoes" pm ON pm."nome" = c."permissao"
ON CONFLICT DO NOTHING;
