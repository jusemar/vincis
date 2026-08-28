CREATE TABLE "consultoria_reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuracao_id" uuid NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"inicio_em" timestamp NOT NULL,
	"fim_em" timestamp NOT NULL,
	"expira_em" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'ativa' NOT NULL,
	"valor_centavos" integer NOT NULL,
	"duracao_minutos" integer NOT NULL,
	"timezone" varchar(64) NOT NULL,
	"descricao" varchar(1000) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consultoria_reservas_status_valido" CHECK (status in ('ativa', 'expirada', 'liberada')),
	CONSTRAINT "consultoria_reservas_periodo_coerente" CHECK (fim_em > inicio_em),
	CONSTRAINT "consultoria_reservas_valor_positivo" CHECK (valor_centavos > 0),
	CONSTRAINT "consultoria_reservas_duracao_valida" CHECK (duracao_minutos > 0 and duracao_minutos <= 480),
	CONSTRAINT "consultoria_reservas_descricao_preenchida" CHECK (length(btrim(descricao)) > 0)
);
--> statement-breakpoint
ALTER TABLE "consultoria_reservas" ADD CONSTRAINT "consultoria_reservas_configuracao_fk" FOREIGN KEY ("configuracao_id") REFERENCES "public"."consultoria_configuracoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_reservas" ADD CONSTRAINT "consultoria_reservas_cliente_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consultoria_reservas_horario_unico" ON "consultoria_reservas" USING btree ("configuracao_id","inicio_em") WHERE status = 'ativa';--> statement-breakpoint
CREATE INDEX "consultoria_reservas_agenda_idx" ON "consultoria_reservas" USING btree ("configuracao_id","status","expira_em");--> statement-breakpoint
CREATE INDEX "consultoria_reservas_cliente_idx" ON "consultoria_reservas" USING btree ("cliente_usuario_id","status");