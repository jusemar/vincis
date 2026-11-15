ALTER TABLE "consultoria_pagamentos" ADD COLUMN "comissao_vincis_milesimos" integer;--> statement-breakpoint
ALTER TABLE "consultoria_pagamentos" ADD COLUMN "comissao_vincis_centavos" integer;--> statement-breakpoint
ALTER TABLE "consultoria_pagamentos" ADD COLUMN "valor_profissional_centavos" integer;--> statement-breakpoint
ALTER TABLE "oportunidade_pagamentos" ADD COLUMN "comissao_vincis_milesimos" integer;--> statement-breakpoint
ALTER TABLE "oportunidade_pagamentos" ADD COLUMN "comissao_vincis_centavos" integer;--> statement-breakpoint
ALTER TABLE "oportunidade_pagamentos" ADD COLUMN "valor_profissional_centavos" integer;--> statement-breakpoint
ALTER TABLE "oportunidade_propostas" ADD COLUMN "natureza" varchar(20) DEFAULT 'avulsa' NOT NULL;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "capacidade_clientes_recorrentes" integer;--> statement-breakpoint
CREATE INDEX "assinaturas_contador_idx" ON "assinaturas" USING btree ("prestador_id","status");--> statement-breakpoint
ALTER TABLE "consultoria_pagamentos" ADD CONSTRAINT "consultoria_pagamentos_comissao_coerente" CHECK (("consultoria_pagamentos"."comissao_vincis_milesimos" is null and "consultoria_pagamentos"."comissao_vincis_centavos" is null and "consultoria_pagamentos"."valor_profissional_centavos" is null)
        or ("consultoria_pagamentos"."comissao_vincis_milesimos" between 1 and 999
          and "consultoria_pagamentos"."comissao_vincis_centavos" >= 0
          and "consultoria_pagamentos"."valor_profissional_centavos" >= 0
          and "consultoria_pagamentos"."comissao_vincis_centavos" + "consultoria_pagamentos"."valor_profissional_centavos" = "consultoria_pagamentos"."valor_centavos"));--> statement-breakpoint
ALTER TABLE "oportunidade_pagamentos" ADD CONSTRAINT "oportunidade_pagamentos_comissao_coerente" CHECK (("oportunidade_pagamentos"."comissao_vincis_milesimos" is null and "oportunidade_pagamentos"."comissao_vincis_centavos" is null and "oportunidade_pagamentos"."valor_profissional_centavos" is null)
        or ("oportunidade_pagamentos"."comissao_vincis_milesimos" between 1 and 999
          and "oportunidade_pagamentos"."comissao_vincis_centavos" >= 0
          and "oportunidade_pagamentos"."valor_profissional_centavos" >= 0
          and "oportunidade_pagamentos"."comissao_vincis_centavos" + "oportunidade_pagamentos"."valor_profissional_centavos" = "oportunidade_pagamentos"."valor_centavos"));--> statement-breakpoint
ALTER TABLE "oportunidade_propostas" ADD CONSTRAINT "oportunidade_propostas_natureza_valida" CHECK ("oportunidade_propostas"."natureza" in ('avulsa', 'recorrente'));--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD CONSTRAINT "perfis_profissionais_capacidade_positiva" CHECK ("perfis_profissionais"."capacidade_clientes_recorrentes" is null or "perfis_profissionais"."capacidade_clientes_recorrentes" > 0);