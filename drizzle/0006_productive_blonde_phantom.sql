CREATE TABLE "perfis_profissionais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo_profissional" varchar(20) NOT NULL,
	"numero_registro" varchar(50),
	"estado_registro" varchar(2),
	"areas_atuacao" text[] DEFAULT '{}' NOT NULL,
	"apresentacao" text NOT NULL,
	"avatar_url" text,
	"nome_atuacao" varchar(255) NOT NULL,
	"modalidade_atuacao" varchar(20) NOT NULL,
	"cidade" varchar(120) NOT NULL,
	"estado" varchar(2) NOT NULL,
	"telefone_contato" varchar(20) NOT NULL,
	"email_profissional" varchar(255) NOT NULL,
	"status_analise" varchar(30) DEFAULT 'rascunho' NOT NULL,
	"enviado_em" timestamp,
	"analisado_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD CONSTRAINT "perfis_profissionais_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "perfis_profissionais_usuario_unique" ON "perfis_profissionais" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "perfis_profissionais_status_idx" ON "perfis_profissionais" USING btree ("status_analise");--> statement-breakpoint
CREATE INDEX "perfis_profissionais_tipo_idx" ON "perfis_profissionais" USING btree ("tipo_profissional");