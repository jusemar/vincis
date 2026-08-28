CREATE TABLE "consultoria_agendamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reserva_id" uuid NOT NULL,
	"configuracao_id" uuid NOT NULL,
	"prestador_id" uuid NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"inicio_em" timestamp NOT NULL,
	"fim_em" timestamp NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"valor_centavos" integer NOT NULL,
	"duracao_minutos" integer NOT NULL,
	"descricao" varchar(1000) NOT NULL,
	"status" varchar(20) DEFAULT 'agendada' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consultoria_agendamentos_status_valido" CHECK (status in ('agendada')),
	CONSTRAINT "consultoria_agendamentos_periodo_coerente" CHECK (fim_em > inicio_em),
	CONSTRAINT "consultoria_agendamentos_valor_positivo" CHECK (valor_centavos > 0)
);
--> statement-breakpoint
CREATE TABLE "consultoria_pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reserva_id" uuid NOT NULL,
	"agendamento_id" uuid NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"prestador_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"status" varchar(20) DEFAULT 'aprovado' NOT NULL,
	"origem" varchar(20) DEFAULT 'simulado' NOT NULL,
	"referencia" varchar(40) NOT NULL,
	"aprovado_em" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consultoria_pagamentos_valor_positivo" CHECK (valor_centavos > 0)
);
--> statement-breakpoint
ALTER TABLE "consultoria_reservas" DROP CONSTRAINT "consultoria_reservas_status_valido";--> statement-breakpoint
ALTER TABLE "atendimentos" ADD COLUMN "consultoria_agendamento_id" uuid;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD CONSTRAINT "consultoria_agendamentos_reserva_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."consultoria_reservas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD CONSTRAINT "consultoria_agendamentos_configuracao_fk" FOREIGN KEY ("configuracao_id") REFERENCES "public"."consultoria_configuracoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD CONSTRAINT "consultoria_agendamentos_prestador_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD CONSTRAINT "consultoria_agendamentos_cliente_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_pagamentos" ADD CONSTRAINT "consultoria_pagamentos_reserva_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."consultoria_reservas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_pagamentos" ADD CONSTRAINT "consultoria_pagamentos_agendamento_fk" FOREIGN KEY ("agendamento_id") REFERENCES "public"."consultoria_agendamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_pagamentos" ADD CONSTRAINT "consultoria_pagamentos_cliente_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_pagamentos" ADD CONSTRAINT "consultoria_pagamentos_prestador_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consultoria_agendamentos_reserva_unica" ON "consultoria_agendamentos" USING btree ("reserva_id");--> statement-breakpoint
CREATE INDEX "consultoria_agendamentos_agenda_idx" ON "consultoria_agendamentos" USING btree ("configuracao_id","status","inicio_em");--> statement-breakpoint
CREATE INDEX "consultoria_agendamentos_cliente_idx" ON "consultoria_agendamentos" USING btree ("cliente_usuario_id","inicio_em");--> statement-breakpoint
CREATE INDEX "consultoria_agendamentos_prestador_idx" ON "consultoria_agendamentos" USING btree ("prestador_id","inicio_em");--> statement-breakpoint
CREATE UNIQUE INDEX "consultoria_pagamentos_reserva_unica" ON "consultoria_pagamentos" USING btree ("reserva_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consultoria_pagamentos_agendamento_unico" ON "consultoria_pagamentos" USING btree ("agendamento_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consultoria_pagamentos_referencia_unica" ON "consultoria_pagamentos" USING btree ("referencia");--> statement-breakpoint
CREATE INDEX "consultoria_pagamentos_cliente_idx" ON "consultoria_pagamentos" USING btree ("cliente_usuario_id","created_at");--> statement-breakpoint
CREATE INDEX "consultoria_pagamentos_prestador_idx" ON "consultoria_pagamentos" USING btree ("prestador_id","created_at");--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_consultoria_agendamento_fk" FOREIGN KEY ("consultoria_agendamento_id") REFERENCES "public"."consultoria_agendamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "atendimentos_consultoria_unico" ON "atendimentos" USING btree ("consultoria_agendamento_id");--> statement-breakpoint
ALTER TABLE "consultoria_reservas" ADD CONSTRAINT "consultoria_reservas_status_valido" CHECK (status in ('ativa', 'expirada', 'liberada', 'confirmada'));