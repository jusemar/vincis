CREATE TABLE "atendimento_leituras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"escopo" varchar(20) NOT NULL,
	"recurso_id" uuid NOT NULL,
	"canal" varchar(20) NOT NULL,
	"ultima_mensagem_lida_id" uuid,
	"lido_ate" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"destinatario_id" uuid NOT NULL,
	"autor_id" uuid,
	"tipo" varchar(40) NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"resumo" varchar(240) NOT NULL,
	"recurso_tipo" varchar(20) NOT NULL,
	"recurso_id" uuid NOT NULL,
	"atendimento_id" uuid,
	"protocolo" varchar(12),
	"destino" jsonb NOT NULL,
	"lida_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendimento_convite_mensagens" ADD COLUMN "valor_anterior_centavos" integer;--> statement-breakpoint
ALTER TABLE "atendimento_leituras" ADD CONSTRAINT "atendimento_leituras_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_destinatario_id_usuarios_id_fk" FOREIGN KEY ("destinatario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "atendimento_leituras_unico" ON "atendimento_leituras" USING btree ("usuario_id","escopo","recurso_id","canal");--> statement-breakpoint
CREATE INDEX "atendimento_leituras_usuario_idx" ON "atendimento_leituras" USING btree ("usuario_id","escopo");--> statement-breakpoint
CREATE INDEX "notificacoes_caixa_idx" ON "notificacoes" USING btree ("destinatario_id","lida_em","created_at");--> statement-breakpoint
CREATE INDEX "notificacoes_recurso_idx" ON "notificacoes" USING btree ("recurso_tipo","recurso_id");