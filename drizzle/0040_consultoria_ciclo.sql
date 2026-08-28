ALTER TABLE "consultoria_agendamentos" DROP CONSTRAINT "consultoria_agendamentos_status_valido";--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD COLUMN "cancelado_em" timestamp;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD COLUMN "cancelado_por" uuid;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD COLUMN "motivo_cancelamento" varchar(500);--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD COLUMN "remarcado_em" timestamp;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD COLUMN "remarcacoes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD CONSTRAINT "consultoria_agendamentos_cancelado_por_fk" FOREIGN KEY ("cancelado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD CONSTRAINT "consultoria_agendamentos_cancelamento_coerente" CHECK ((status = 'cancelada' and cancelado_em is not null and cancelado_por is not null)
          or (status <> 'cancelada' and cancelado_em is null and cancelado_por is null));--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD CONSTRAINT "consultoria_agendamentos_status_valido" CHECK (status in ('agendada', 'cancelada'));