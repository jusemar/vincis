CREATE TYPE "public"."empresa_membro_status" AS ENUM('ativo', 'bloqueado', 'removido');--> statement-breakpoint
CREATE TYPE "public"."empresa_segmento" AS ENUM('advocacia', 'contabilidade');--> statement-breakpoint
CREATE TABLE "empresa_membros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"status" "empresa_membro_status" DEFAULT 'ativo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "segmento" "empresa_segmento";--> statement-breakpoint
ALTER TABLE "empresa_membros" ADD CONSTRAINT "empresa_membros_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresa_membros" ADD CONSTRAINT "empresa_membros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "empresa_membros_empresa_usuario_unique" ON "empresa_membros" USING btree ("empresa_id","usuario_id");--> statement-breakpoint
CREATE INDEX "empresa_membros_empresa_status_idx" ON "empresa_membros" USING btree ("empresa_id","status");--> statement-breakpoint
CREATE INDEX "empresa_membros_usuario_status_idx" ON "empresa_membros" USING btree ("usuario_id","status");