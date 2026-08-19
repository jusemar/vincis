CREATE TABLE "perfis_permissoes" (
	"perfil_id" uuid NOT NULL,
	"permissao_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "perfis_permissoes_perfil_id_permissao_id_pk" PRIMARY KEY("perfil_id","permissao_id")
);
--> statement-breakpoint
CREATE TABLE "permissoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(100) NOT NULL,
	"descricao" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "permissoes_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "perfis_permissoes" ADD CONSTRAINT "perfis_permissoes_perfil_id_perfis_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfis_permissoes" ADD CONSTRAINT "perfis_permissoes_permissao_id_permissoes_id_fk" FOREIGN KEY ("permissao_id") REFERENCES "public"."permissoes"("id") ON DELETE no action ON UPDATE no action;