CREATE TABLE "cms_cards_home" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"selo" varchar(40),
	"titulo" varchar(80) NOT NULL,
	"descricao" varchar(240) NOT NULL,
	"texto_botao" varchar(40) NOT NULL,
	"estilo" varchar(20) NOT NULL,
	"destino_tipo" varchar(10) NOT NULL,
	"pagina_id" uuid,
	"rota" varchar(120),
	"ativo" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"excluido_em" timestamp,
	"atualizado_por_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_cards_home_estilo_valido" CHECK ("cms_cards_home"."estilo" in ('destaque', 'esmeralda', 'ambar')),
	CONSTRAINT "cms_cards_home_destino_valido" CHECK (("cms_cards_home"."destino_tipo" = 'pagina' and "cms_cards_home"."pagina_id" is not null and "cms_cards_home"."rota" is null) or ("cms_cards_home"."destino_tipo" = 'rota' and "cms_cards_home"."rota" is not null and "cms_cards_home"."pagina_id" is null))
);
--> statement-breakpoint
ALTER TABLE "cms_cards_home" ADD CONSTRAINT "cms_cards_home_pagina_id_cms_paginas_id_fk" FOREIGN KEY ("pagina_id") REFERENCES "public"."cms_paginas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_cards_home" ADD CONSTRAINT "cms_cards_home_atualizado_por_id_usuarios_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_cards_home_vitrine_idx" ON "cms_cards_home" USING btree ("excluido_em","ativo","ordem");--> statement-breakpoint
CREATE INDEX "cms_cards_home_pagina_idx" ON "cms_cards_home" USING btree ("pagina_id");