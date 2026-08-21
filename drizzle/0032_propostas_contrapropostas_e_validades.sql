CREATE TABLE "configuracoes_plataforma" (
	"chave" varchar(60) PRIMARY KEY NOT NULL,
	"valor" text NOT NULL,
	"atualizado_por" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oportunidade_contrapropostas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposta_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"mensagem" text,
	"status" varchar(20) DEFAULT 'pendente' NOT NULL,
	"respondida_em" timestamp,
	"respondida_por" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "chave_dedupe" varchar(120);--> statement-breakpoint
ALTER TABLE "oportunidade_propostas" ADD COLUMN "valida_ate" timestamp;--> statement-breakpoint
ALTER TABLE "oportunidade_propostas" ADD COLUMN "aceita_em" timestamp;--> statement-breakpoint
ALTER TABLE "oportunidade_propostas" ADD COLUMN "valor_acordado_centavos" integer;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD COLUMN "expira_em" timestamp;--> statement-breakpoint
ALTER TABLE "configuracoes_plataforma" ADD CONSTRAINT "configuracoes_plataforma_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_contrapropostas" ADD CONSTRAINT "oportunidade_contrapropostas_proposta_id_oportunidade_propostas_id_fk" FOREIGN KEY ("proposta_id") REFERENCES "public"."oportunidade_propostas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_contrapropostas" ADD CONSTRAINT "oportunidade_contrapropostas_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_contrapropostas" ADD CONSTRAINT "oportunidade_contrapropostas_respondida_por_usuarios_id_fk" FOREIGN KEY ("respondida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oportunidade_contrapropostas_pendente_unica" ON "oportunidade_contrapropostas" USING btree ("proposta_id") WHERE status = 'pendente';--> statement-breakpoint
CREATE INDEX "oportunidade_contrapropostas_proposta_idx" ON "oportunidade_contrapropostas" USING btree ("proposta_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notificacoes_dedupe_unico" ON "notificacoes" USING btree ("destinatario_id","chave_dedupe") WHERE chave_dedupe is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "oportunidade_propostas_acordo_unico" ON "oportunidade_propostas" USING btree ("oportunidade_id") WHERE status = 'aceita';