-- A simulação de preços do Profissional vira Oportunidade.
--
-- Três colunas e um índice, na tabela que já existe. Nenhuma linha é reescrita:
-- `origem` nasce com o padrão que descreve tudo que já estava lá, e as outras
-- duas são nulas em toda solicitação anterior a esta etapa.
--
-- O índice é **parcial** de propósito: ele impede o clique repetido de criar
-- duas solicitações idênticas enquanto uma está aberta, e sai do caminho assim
-- que ela é encerrada — a mesma pessoa pode voltar meses depois.
ALTER TABLE "oportunidades" ADD COLUMN "origem" varchar(24) DEFAULT 'solicitacao' NOT NULL;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD COLUMN "simulacao" jsonb;--> statement-breakpoint
ALTER TABLE "oportunidades" ADD COLUMN "chave_intencao" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "oportunidades_intencao_unica" ON "oportunidades" USING btree ("cliente_usuario_id","destinatario_id","chave_intencao") WHERE chave_intencao is not null and status = 'aberta';--> statement-breakpoint
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_origem_simulacao" CHECK (origem <> 'simulacao_preco' or (simulacao is not null and visibilidade = 'privada'));