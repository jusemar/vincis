ALTER TABLE "perfis_profissionais" ADD COLUMN "tipo_prestador" varchar(20) DEFAULT 'profissional' NOT NULL;--> statement-breakpoint
CREATE INDEX "perfis_profissionais_tipo_prestador_idx" ON "perfis_profissionais" USING btree ("tipo_prestador","status_analise");--> statement-breakpoint
-- Catálogo de tipos de pessoa: o Colaborador passa a existir ao lado do
-- Profissional. Sem esta linha o cadastro de colaborador não tem perfil para
-- vincular em `usuarios_perfis`, que é a fonte de verdade do tipo da pessoa.
INSERT INTO "perfis" ("nome", "descricao") VALUES ('colaborador', 'Prestador com conhecimento técnico, sem habilitação regulamentada') ON CONFLICT ("nome") DO NOTHING;