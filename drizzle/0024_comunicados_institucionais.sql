CREATE TABLE "comunicados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"resumo" text NOT NULL,
	"audiencia" varchar(20) DEFAULT 'todos' NOT NULL,
	"status" varchar(20) DEFAULT 'rascunho' NOT NULL,
	"publicado_em" timestamp,
	"autor_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comunicados" ADD CONSTRAINT "comunicados_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comunicados_mural_idx" ON "comunicados" USING btree ("status","audiencia","publicado_em");