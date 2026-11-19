CREATE TABLE "conhecimento_artigo_versoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artigo_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"status" varchar(30) DEFAULT 'rascunho' NOT NULL,
	"titulo" varchar(180) NOT NULL,
	"resumo" varchar(320) DEFAULT '' NOT NULL,
	"conteudo" jsonb NOT NULL,
	"categoria_id" uuid,
	"capa_url" text,
	"capa_alt" varchar(180),
	"fontes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"titulo_seo" varchar(180),
	"descricao_seo" varchar(320),
	"observacao_moderacao" text,
	"criada_por_id" uuid,
	"enviada_em" timestamp,
	"decidida_em" timestamp,
	"decidida_por_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conhecimento_versoes_status_valido" CHECK ("conhecimento_artigo_versoes"."status" in ('rascunho', 'aguardando_aprovacao', 'devolvida', 'rejeitada', 'aprovada', 'descartada'))
);
--> statement-breakpoint
CREATE TABLE "conhecimento_artigos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"autor_id" uuid NOT NULL,
	"tipo_autoria" varchar(20) NOT NULL,
	"responsavel_editorial_id" uuid,
	"slug" varchar(160) NOT NULL,
	"status_publicacao" varchar(20) DEFAULT 'nao_publicado' NOT NULL,
	"versao_publicada_id" uuid,
	"destaque" boolean DEFAULT false NOT NULL,
	"publicado_em" timestamp,
	"atualizado_publico_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conhecimento_artigos_tipo_autoria_valido" CHECK ("conhecimento_artigos"."tipo_autoria" in ('profissional', 'institucional')),
	CONSTRAINT "conhecimento_artigos_status_publicacao_valido" CHECK ("conhecimento_artigos"."status_publicacao" in ('nao_publicado', 'publicado', 'despublicado', 'arquivado')),
	CONSTRAINT "conhecimento_artigos_publicado_tem_versao" CHECK ("conhecimento_artigos"."status_publicacao" <> 'publicado' or "conhecimento_artigos"."versao_publicada_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "conhecimento_categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(80) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"descricao" varchar(300),
	"area_busca" varchar(20),
	"chamada_conversao" varchar(200),
	"ativa" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conhecimento_categorias_area_valida" CHECK ("conhecimento_categorias"."area_busca" is null or "conhecimento_categorias"."area_busca" in ('contabilidade', 'advocacia'))
);
--> statement-breakpoint
CREATE TABLE "conhecimento_decisoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artigo_id" uuid NOT NULL,
	"versao_id" uuid,
	"acao" varchar(40) NOT NULL,
	"executor_id" uuid,
	"observacao" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "slug_publico" varchar(160);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "oculto_vitrine_em" timestamp;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "motivo_ocultacao_vitrine" varchar(255);--> statement-breakpoint
ALTER TABLE "conhecimento_artigo_versoes" ADD CONSTRAINT "conhecimento_artigo_versoes_artigo_id_conhecimento_artigos_id_fk" FOREIGN KEY ("artigo_id") REFERENCES "public"."conhecimento_artigos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conhecimento_artigo_versoes" ADD CONSTRAINT "conhecimento_artigo_versoes_categoria_id_conhecimento_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."conhecimento_categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conhecimento_artigo_versoes" ADD CONSTRAINT "conhecimento_artigo_versoes_criada_por_id_usuarios_id_fk" FOREIGN KEY ("criada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conhecimento_artigo_versoes" ADD CONSTRAINT "conhecimento_artigo_versoes_decidida_por_id_usuarios_id_fk" FOREIGN KEY ("decidida_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conhecimento_artigos" ADD CONSTRAINT "conhecimento_artigos_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conhecimento_artigos" ADD CONSTRAINT "conhecimento_artigos_responsavel_editorial_id_usuarios_id_fk" FOREIGN KEY ("responsavel_editorial_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conhecimento_artigos" ADD CONSTRAINT "conhecimento_artigos_versao_publicada_id_conhecimento_artigo_versoes_id_fk" FOREIGN KEY ("versao_publicada_id") REFERENCES "public"."conhecimento_artigo_versoes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conhecimento_decisoes" ADD CONSTRAINT "conhecimento_decisoes_artigo_id_conhecimento_artigos_id_fk" FOREIGN KEY ("artigo_id") REFERENCES "public"."conhecimento_artigos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conhecimento_decisoes" ADD CONSTRAINT "conhecimento_decisoes_versao_id_conhecimento_artigo_versoes_id_fk" FOREIGN KEY ("versao_id") REFERENCES "public"."conhecimento_artigo_versoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conhecimento_decisoes" ADD CONSTRAINT "conhecimento_decisoes_executor_id_usuarios_id_fk" FOREIGN KEY ("executor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conhecimento_versoes_artigo_numero_unique" ON "conhecimento_artigo_versoes" USING btree ("artigo_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "conhecimento_versoes_uma_em_aberto" ON "conhecimento_artigo_versoes" USING btree ("artigo_id") WHERE "conhecimento_artigo_versoes"."status" in ('rascunho', 'aguardando_aprovacao', 'devolvida');--> statement-breakpoint
CREATE INDEX "conhecimento_versoes_fila_idx" ON "conhecimento_artigo_versoes" USING btree ("status","enviada_em");--> statement-breakpoint
CREATE INDEX "conhecimento_versoes_categoria_idx" ON "conhecimento_artigo_versoes" USING btree ("categoria_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conhecimento_artigos_slug_unique" ON "conhecimento_artigos" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "conhecimento_artigos_publicacao_idx" ON "conhecimento_artigos" USING btree ("status_publicacao","publicado_em");--> statement-breakpoint
CREATE INDEX "conhecimento_artigos_autor_idx" ON "conhecimento_artigos" USING btree ("autor_id","status_publicacao");--> statement-breakpoint
CREATE UNIQUE INDEX "conhecimento_categorias_slug_unique" ON "conhecimento_categorias" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "conhecimento_categorias_ativa_ordem_idx" ON "conhecimento_categorias" USING btree ("ativa","ordem");--> statement-breakpoint
CREATE INDEX "conhecimento_decisoes_artigo_idx" ON "conhecimento_decisoes" USING btree ("artigo_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "perfis_profissionais_slug_publico_unique" ON "perfis_profissionais" USING btree ("slug_publico");