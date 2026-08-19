CREATE TABLE "atendimento_convite_mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"convite_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"tipo" varchar(20) DEFAULT 'mensagem' NOT NULL,
	"conteudo" text NOT NULL,
	"valor_centavos" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendimento_convites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"remetente_id" uuid NOT NULL,
	"destinatario_id" uuid NOT NULL,
	"escopo" text NOT NULL,
	"valor_oferecido_centavos" integer,
	"valor_contraproposta_centavos" integer,
	"valor_acordado_centavos" integer,
	"status" varchar(20) DEFAULT 'pendente' NOT NULL,
	"expira_em" timestamp NOT NULL,
	"respondido_em" timestamp,
	"revogado_em" timestamp,
	"revogado_por_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendimento_participantes" ADD COLUMN "convite_id" uuid;--> statement-breakpoint
ALTER TABLE "atendimento_convite_mensagens" ADD CONSTRAINT "atendimento_convite_mensagens_convite_id_atendimento_convites_id_fk" FOREIGN KEY ("convite_id") REFERENCES "public"."atendimento_convites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_convite_mensagens" ADD CONSTRAINT "atendimento_convite_mensagens_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_convites" ADD CONSTRAINT "atendimento_convites_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_convites" ADD CONSTRAINT "atendimento_convites_remetente_id_usuarios_id_fk" FOREIGN KEY ("remetente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_convites" ADD CONSTRAINT "atendimento_convites_destinatario_id_usuarios_id_fk" FOREIGN KEY ("destinatario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_convites" ADD CONSTRAINT "atendimento_convites_revogado_por_id_usuarios_id_fk" FOREIGN KEY ("revogado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atendimento_convite_mensagens_negociacao_idx" ON "atendimento_convite_mensagens" USING btree ("convite_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "atendimento_convites_vivo_unico" ON "atendimento_convites" USING btree ("atendimento_id","destinatario_id") WHERE "atendimento_convites"."status" in ('pendente', 'aceito');--> statement-breakpoint
CREATE INDEX "atendimento_convites_atendimento_idx" ON "atendimento_convites" USING btree ("atendimento_id","status");--> statement-breakpoint
CREATE INDEX "atendimento_convites_destinatario_idx" ON "atendimento_convites" USING btree ("destinatario_id","status");--> statement-breakpoint
ALTER TABLE "atendimento_participantes" ADD CONSTRAINT "atendimento_participantes_convite_id_atendimento_convites_id_fk" FOREIGN KEY ("convite_id") REFERENCES "public"."atendimento_convites"("id") ON DELETE set null ON UPDATE no action;