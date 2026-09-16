-- Central Fiscal — upload seguro de XML (Etapa 1 / Fase 1.2).
--
-- Somente aditiva: uma coluna nulável, um índice único parcial e um check em
-- `documentos_fiscais`. Nenhuma linha existente é alterada (a coluna nasce nula
-- e o índice só alcança linhas com hash).
--
-- `sha256_original` repete o SHA-256 do arquivo que originou o documento. A
-- perspectiva fiscal (empresa + cliente) mora nesta tabela, então é aqui que o
-- banco consegue recusar o mesmo XML duas vezes para o mesmo contribuinte —
-- inclusive em uploads simultâneos, que uma consulta antes do insert não
-- impediria. Mesma técnica de `documentos_fiscais_chave_unica`: o `coalesce`
-- faz o documento sem cliente colidir consigo mesmo. Clientes diferentes do
-- mesmo escritório continuam podendo ter o mesmo arquivo.

ALTER TABLE "documentos_fiscais" ADD COLUMN "sha256_original" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_fiscais_origem_unica" ON "documentos_fiscais" USING btree ("empresa_id","sha256_original",coalesce("cliente_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "documentos_fiscais"."sha256_original" is not null;--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_sha256_original_formato" CHECK ("documentos_fiscais"."sha256_original" is null or "documentos_fiscais"."sha256_original" ~ '^[0-9a-f]{64}$');