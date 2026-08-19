CREATE TABLE "avaliacoes_atendimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"prestador_id" uuid NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"nota" integer NOT NULL,
	"comentario" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "avaliacoes_atendimento_nota_faixa" CHECK ("avaliacoes_atendimento"."nota" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "avaliacoes_atendimento" ADD CONSTRAINT "avaliacoes_atendimento_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes_atendimento" ADD CONSTRAINT "avaliacoes_atendimento_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes_atendimento" ADD CONSTRAINT "avaliacoes_atendimento_cliente_usuario_id_usuarios_id_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "avaliacoes_atendimento_unica" ON "avaliacoes_atendimento" USING btree ("atendimento_id","prestador_id");--> statement-breakpoint
CREATE INDEX "avaliacoes_atendimento_prestador_idx" ON "avaliacoes_atendimento" USING btree ("prestador_id","created_at");--> statement-breakpoint
CREATE INDEX "avaliacoes_atendimento_cliente_idx" ON "avaliacoes_atendimento" USING btree ("cliente_usuario_id");