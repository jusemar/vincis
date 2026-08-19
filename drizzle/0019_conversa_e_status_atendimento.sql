CREATE TABLE "atendimento_mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"escopo" varchar(10) DEFAULT 'cliente' NOT NULL,
	"conteudo" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendimento_eventos" ADD COLUMN "visivel_cliente" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "atendimento_mensagens" ADD CONSTRAINT "atendimento_mensagens_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_mensagens" ADD CONSTRAINT "atendimento_mensagens_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atendimento_mensagens_conversa_idx" ON "atendimento_mensagens" USING btree ("atendimento_id","escopo","created_at");