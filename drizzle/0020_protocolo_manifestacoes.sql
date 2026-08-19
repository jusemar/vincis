CREATE TABLE "atendimento_manifestacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"papel_autor" varchar(20) NOT NULL,
	"conteudo" text NOT NULL,
	"visibilidade" varchar(30) DEFAULT 'autor_e_cliente' NOT NULL,
	"responde_manifestacao_id" uuid,
	"arquivo_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendimento_manifestacoes" ADD CONSTRAINT "atendimento_manifestacoes_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_manifestacoes" ADD CONSTRAINT "atendimento_manifestacoes_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_manifestacoes" ADD CONSTRAINT "atendimento_manifestacoes_responde_manifestacao_id_atendimento_manifestacoes_id_fk" FOREIGN KEY ("responde_manifestacao_id") REFERENCES "public"."atendimento_manifestacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_manifestacoes" ADD CONSTRAINT "atendimento_manifestacoes_arquivo_id_atendimento_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."atendimento_arquivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atendimento_manifestacoes_protocolo_idx" ON "atendimento_manifestacoes" USING btree ("atendimento_id","created_at");--> statement-breakpoint
CREATE INDEX "atendimento_manifestacoes_autor_idx" ON "atendimento_manifestacoes" USING btree ("autor_id");