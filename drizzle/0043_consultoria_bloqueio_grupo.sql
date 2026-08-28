ALTER TABLE "consultoria_excecoes" ADD COLUMN "grupo_id" uuid;--> statement-breakpoint
CREATE INDEX "consultoria_excecoes_grupo_idx" ON "consultoria_excecoes" USING btree ("grupo_id");