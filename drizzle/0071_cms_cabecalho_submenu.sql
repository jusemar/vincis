ALTER TABLE "cms_grupos_navegacao" DROP CONSTRAINT "cms_grupos_navegacao_local_valido";--> statement-breakpoint
ALTER TABLE "cms_itens_navegacao" ALTER COLUMN "pagina_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_itens_navegacao" ADD COLUMN "pai_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_itens_navegacao" ADD CONSTRAINT "cms_itens_navegacao_pai_id_cms_itens_navegacao_id_fk" FOREIGN KEY ("pai_id") REFERENCES "public"."cms_itens_navegacao"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_itens_navegacao_pai_idx" ON "cms_itens_navegacao" USING btree ("pai_id","ordem");--> statement-breakpoint
ALTER TABLE "cms_grupos_navegacao" ADD CONSTRAINT "cms_grupos_navegacao_local_valido" CHECK ("cms_grupos_navegacao"."local" in ('rodape', 'cabecalho'));--> statement-breakpoint
ALTER TABLE "cms_itens_navegacao" ADD CONSTRAINT "cms_itens_navegacao_destino_ou_texto" CHECK ("cms_itens_navegacao"."pagina_id" is not null or "cms_itens_navegacao"."texto" is not null);--> statement-breakpoint
ALTER TABLE "cms_itens_navegacao" ADD CONSTRAINT "cms_itens_navegacao_pai_diferente" CHECK ("cms_itens_navegacao"."pai_id" <> "cms_itens_navegacao"."id");