CREATE TABLE "oportunidade_arquivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"nome" varchar(255) NOT NULL,
	"tipo_mime" varchar(120) NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"remetente_id" uuid NOT NULL,
	"chave" varchar(500) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oportunidades" ADD COLUMN "especialidades" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD COLUMN "abrangencia" varchar(2) DEFAULT 'BR' NOT NULL;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD COLUMN "valor_pretendido_centavos" integer;--> statement-breakpoint
ALTER TABLE "oportunidade_arquivos" ADD CONSTRAINT "oportunidade_arquivos_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_arquivos" ADD CONSTRAINT "oportunidade_arquivos_remetente_id_usuarios_id_fk" FOREIGN KEY ("remetente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oportunidade_arquivos_oportunidade_idx" ON "oportunidade_arquivos" USING btree ("oportunidade_id","created_at");--> statement-breakpoint
-- Backfill da abrangência a partir do estado da primeira versão. Roda antes de
-- `cidade`/`estado` serem removidas (migration seguinte) para que nenhuma
-- solicitação já existente perca o recorte geográfico que tinha. Linhas sem
-- estado permanecem em `BR`, que é o default da coluna.
UPDATE "oportunidades" SET "abrangencia" = upper("estado") WHERE "estado" IS NOT NULL AND "estado" <> '';
