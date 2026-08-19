CREATE TABLE "atendimento_checklist_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"visibilidade" varchar(20) DEFAULT 'cliente' NOT NULL,
	"origem" varchar(20) DEFAULT 'catalogo' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"concluido" boolean DEFAULT false NOT NULL,
	"concluido_em" timestamp,
	"concluido_por" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "servicos" ADD COLUMN "checklist_modelo" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "atendimento_checklist_itens" ADD CONSTRAINT "atendimento_checklist_itens_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_checklist_itens" ADD CONSTRAINT "atendimento_checklist_itens_concluido_por_usuarios_id_fk" FOREIGN KEY ("concluido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atendimento_checklist_atendimento_idx" ON "atendimento_checklist_itens" USING btree ("atendimento_id","ordem");