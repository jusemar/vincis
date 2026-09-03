-- Conversa e aceite do fluxo direto.
--
-- `oportunidade_mensagens` existe porque `atendimento_mensagens` tem
-- `atendimento_id not null references atendimentos`: a conversa do Atendimento é
-- do Atendimento, e um Atendimento só nasce de pagamento aprovado. Abrir um
-- protocolo fictício só para reaproveitar a tabela mentiria para o Kanban, para
-- a avaliação e para a cobrança.
--
-- `interesse_em` é o aceite sem preço: uma data, sem valor, prazo ou validade.
-- Gravá-lo como proposta criaria o objeto comercial cuja existência destranca
-- acordo, pagamento e Atendimento no resto do módulo.
--
-- Nada aqui toca a Oportunidade tradicional: a coluna nasce nula e a tabela
-- nasce vazia.
CREATE TABLE "oportunidade_mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"conteudo" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oportunidades" ADD COLUMN "interesse_em" timestamp;--> statement-breakpoint
ALTER TABLE "oportunidade_mensagens" ADD CONSTRAINT "oportunidade_mensagens_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_mensagens" ADD CONSTRAINT "oportunidade_mensagens_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oportunidade_mensagens_conversa_idx" ON "oportunidade_mensagens" USING btree ("oportunidade_id","created_at");