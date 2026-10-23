CREATE TABLE "cms_grupos_navegacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"titulo_publico" varchar(120) NOT NULL,
	"identificador" varchar(120) NOT NULL,
	"local" varchar(20) DEFAULT 'rodape' NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"atualizado_por_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_grupos_navegacao_local_valido" CHECK ("cms_grupos_navegacao"."local" in ('rodape'))
);
--> statement-breakpoint
CREATE TABLE "cms_itens_navegacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo_id" uuid NOT NULL,
	"pagina_id" uuid NOT NULL,
	"texto" varchar(180),
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_paginas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" varchar(180) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"conteudo" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'rascunho' NOT NULL,
	"titulo_seo" varchar(180),
	"descricao_seo" varchar(320),
	"publicada_em" timestamp,
	"autor_id" uuid,
	"atualizado_por_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_paginas_status_valido" CHECK ("cms_paginas"."status" in ('rascunho', 'publicada', 'arquivada'))
);
--> statement-breakpoint
ALTER TABLE "cms_grupos_navegacao" ADD CONSTRAINT "cms_grupos_navegacao_atualizado_por_id_usuarios_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_itens_navegacao" ADD CONSTRAINT "cms_itens_navegacao_grupo_id_cms_grupos_navegacao_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."cms_grupos_navegacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_itens_navegacao" ADD CONSTRAINT "cms_itens_navegacao_pagina_id_cms_paginas_id_fk" FOREIGN KEY ("pagina_id") REFERENCES "public"."cms_paginas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_paginas" ADD CONSTRAINT "cms_paginas_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_paginas" ADD CONSTRAINT "cms_paginas_atualizado_por_id_usuarios_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_grupos_navegacao_identificador_unique" ON "cms_grupos_navegacao" USING btree ("identificador");--> statement-breakpoint
CREATE INDEX "cms_grupos_navegacao_local_ordem_idx" ON "cms_grupos_navegacao" USING btree ("local","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_itens_navegacao_grupo_pagina_unique" ON "cms_itens_navegacao" USING btree ("grupo_id","pagina_id");--> statement-breakpoint
CREATE INDEX "cms_itens_navegacao_grupo_ordem_idx" ON "cms_itens_navegacao" USING btree ("grupo_id","ordem");--> statement-breakpoint
CREATE INDEX "cms_itens_navegacao_pagina_idx" ON "cms_itens_navegacao" USING btree ("pagina_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_paginas_slug_unique" ON "cms_paginas" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cms_paginas_status_idx" ON "cms_paginas" USING btree ("status","updated_at");