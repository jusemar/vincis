ALTER TABLE "atendimento_arquivos" ADD COLUMN "finalidade" varchar(20) DEFAULT 'anexo' NOT NULL;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD COLUMN "concluido_em" timestamp;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD COLUMN "concluido_por" uuid;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD COLUMN "observacao_final" text;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_concluido_por_usuarios_id_fk" FOREIGN KEY ("concluido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atendimento_arquivos_finalidade_idx" ON "atendimento_arquivos" USING btree ("atendimento_id","finalidade");