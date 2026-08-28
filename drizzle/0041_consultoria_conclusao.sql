ALTER TABLE "consultoria_agendamentos" DROP CONSTRAINT "consultoria_agendamentos_status_valido";--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD COLUMN "concluido_em" timestamp;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD COLUMN "concluido_por" uuid;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD CONSTRAINT "consultoria_agendamentos_concluido_por_fk" FOREIGN KEY ("concluido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD CONSTRAINT "consultoria_agendamentos_conclusao_coerente" CHECK ((status = 'concluida' and concluido_em is not null and concluido_por is not null)
          or (status <> 'concluida' and concluido_em is null and concluido_por is null));--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD CONSTRAINT "consultoria_agendamentos_status_valido" CHECK (status in ('agendada', 'cancelada', 'concluida'));