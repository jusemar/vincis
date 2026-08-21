CREATE TABLE "oportunidade_dispensas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"prestador_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oportunidade_dispensas" ADD CONSTRAINT "oportunidade_dispensas_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_dispensas" ADD CONSTRAINT "oportunidade_dispensas_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oportunidade_dispensas_unica" ON "oportunidade_dispensas" USING btree ("oportunidade_id","prestador_id");--> statement-breakpoint
CREATE INDEX "oportunidade_dispensas_prestador_idx" ON "oportunidade_dispensas" USING btree ("prestador_id","created_at");