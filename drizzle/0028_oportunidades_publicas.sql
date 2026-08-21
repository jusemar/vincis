CREATE TABLE "oportunidade_propostas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"prestador_id" uuid NOT NULL,
	"mensagem" text NOT NULL,
	"valor_centavos" integer,
	"prazo_estimado_dias" integer,
	"status" varchar(20) DEFAULT 'enviada' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oportunidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"categoria" varchar(30) NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"descricao" text NOT NULL,
	"cidade" varchar(120) NOT NULL,
	"estado" varchar(2) NOT NULL,
	"status" varchar(20) DEFAULT 'aberta' NOT NULL,
	"encerrada_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oportunidade_propostas" ADD CONSTRAINT "oportunidade_propostas_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_propostas" ADD CONSTRAINT "oportunidade_propostas_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_cliente_usuario_id_usuarios_id_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oportunidade_propostas_unica" ON "oportunidade_propostas" USING btree ("oportunidade_id","prestador_id");--> statement-breakpoint
CREATE INDEX "oportunidade_propostas_oportunidade_idx" ON "oportunidade_propostas" USING btree ("oportunidade_id","created_at");--> statement-breakpoint
CREATE INDEX "oportunidade_propostas_prestador_idx" ON "oportunidade_propostas" USING btree ("prestador_id","created_at");--> statement-breakpoint
CREATE INDEX "oportunidades_vitrine_idx" ON "oportunidades" USING btree ("categoria","status","created_at");--> statement-breakpoint
CREATE INDEX "oportunidades_cliente_idx" ON "oportunidades" USING btree ("cliente_usuario_id","created_at");