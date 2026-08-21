CREATE TABLE "oportunidade_pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"proposta_id" uuid NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"prestador_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"status" varchar(20) DEFAULT 'aprovado' NOT NULL,
	"origem" varchar(20) DEFAULT 'simulado' NOT NULL,
	"referencia" varchar(40) NOT NULL,
	"aprovado_em" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oportunidade_pagamentos_valor_positivo" CHECK (valor_centavos > 0)
);
--> statement-breakpoint
ALTER TABLE "atendimentos" ADD COLUMN "oportunidade_id" uuid;--> statement-breakpoint
ALTER TABLE "oportunidade_pagamentos" ADD CONSTRAINT "oportunidade_pagamentos_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_pagamentos" ADD CONSTRAINT "oportunidade_pagamentos_proposta_id_oportunidade_propostas_id_fk" FOREIGN KEY ("proposta_id") REFERENCES "public"."oportunidade_propostas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_pagamentos" ADD CONSTRAINT "oportunidade_pagamentos_cliente_usuario_id_usuarios_id_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oportunidade_pagamentos" ADD CONSTRAINT "oportunidade_pagamentos_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oportunidade_pagamentos_unico" ON "oportunidade_pagamentos" USING btree ("oportunidade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oportunidade_pagamentos_referencia_unica" ON "oportunidade_pagamentos" USING btree ("referencia");--> statement-breakpoint
CREATE INDEX "oportunidade_pagamentos_cliente_idx" ON "oportunidade_pagamentos" USING btree ("cliente_usuario_id","created_at");--> statement-breakpoint
CREATE INDEX "oportunidade_pagamentos_prestador_idx" ON "oportunidade_pagamentos" USING btree ("prestador_id","created_at");--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_oportunidade_id_oportunidades_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "atendimentos_oportunidade_unico" ON "atendimentos" USING btree ("oportunidade_id");