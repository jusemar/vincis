ALTER TABLE "oportunidades" ADD COLUMN "visibilidade" varchar(10) DEFAULT 'publica' NOT NULL;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD COLUMN "destinatario_id" uuid;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_destinatario_id_usuarios_id_fk" FOREIGN KEY ("destinatario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oportunidades_destinatario_idx" ON "oportunidades" USING btree ("destinatario_id","status","created_at");--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_visibilidade_destinatario" CHECK ((visibilidade = 'publica' and destinatario_id is null) or (visibilidade = 'privada' and destinatario_id is not null));