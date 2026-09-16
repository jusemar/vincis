ALTER TABLE "documentos_fiscais" DROP CONSTRAINT "documentos_fiscais_sentido_valido";--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "tipo_identificacao_fiscal" varchar(20);--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "identificacao_fiscal" varchar(20);--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "tipo_identificacao_fiscal" varchar(20);--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "identificacao_fiscal" varchar(20);--> statement-breakpoint
CREATE INDEX "clientes_identificacao_fiscal_idx" ON "clientes" USING btree ("empresa_id","identificacao_fiscal");--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_identificacao_fiscal_coerente" CHECK (("clientes"."tipo_identificacao_fiscal" is null) = ("clientes"."identificacao_fiscal" is null));--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_identificacao_fiscal_valida" CHECK ("clientes"."tipo_identificacao_fiscal" is null
        or ("clientes"."tipo_identificacao_fiscal" = 'cnpj' and "clientes"."identificacao_fiscal" ~ '^[0-9A-Z]{12}[0-9]{2}$')
        or ("clientes"."tipo_identificacao_fiscal" = 'cpf' and "clientes"."identificacao_fiscal" ~ '^[0-9]{11}$')
        or "clientes"."tipo_identificacao_fiscal" = 'estrangeiro');--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_sentido_valido" CHECK ("documentos_fiscais"."sentido" is null or "documentos_fiscais"."sentido" in ('emitido', 'recebido', 'nao_determinado'));--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_identificacao_fiscal_coerente" CHECK (("empresas"."tipo_identificacao_fiscal" is null) = ("empresas"."identificacao_fiscal" is null));--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_identificacao_fiscal_valida" CHECK ("empresas"."tipo_identificacao_fiscal" is null
        or ("empresas"."tipo_identificacao_fiscal" = 'cnpj' and "empresas"."identificacao_fiscal" ~ '^[0-9A-Z]{12}[0-9]{2}$')
        or ("empresas"."tipo_identificacao_fiscal" = 'cpf' and "empresas"."identificacao_fiscal" ~ '^[0-9]{11}$')
        or "empresas"."tipo_identificacao_fiscal" = 'estrangeiro');