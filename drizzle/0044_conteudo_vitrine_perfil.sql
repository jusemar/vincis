CREATE TABLE "perfil_casos_sucesso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prestador_id" uuid NOT NULL,
	"tipo" varchar(60) NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"descricao" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perfil_experiencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prestador_id" uuid NOT NULL,
	"periodo" varchar(60) NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"descricao" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perfil_perguntas_frequentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prestador_id" uuid NOT NULL,
	"pergunta" varchar(300) NOT NULL,
	"resposta" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "sobre_titulo" varchar(160);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "sobre_texto" text;--> statement-breakpoint
ALTER TABLE "perfil_casos_sucesso" ADD CONSTRAINT "perfil_casos_sucesso_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_experiencias" ADD CONSTRAINT "perfil_experiencias_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfil_perguntas_frequentes" ADD CONSTRAINT "perfil_perguntas_frequentes_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "perfil_casos_sucesso_prestador_idx" ON "perfil_casos_sucesso" USING btree ("prestador_id","ordem");--> statement-breakpoint
CREATE INDEX "perfil_experiencias_prestador_idx" ON "perfil_experiencias" USING btree ("prestador_id","ordem");--> statement-breakpoint
CREATE INDEX "perfil_perguntas_frequentes_prestador_idx" ON "perfil_perguntas_frequentes" USING btree ("prestador_id","ordem");