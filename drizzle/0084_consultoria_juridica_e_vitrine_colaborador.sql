ALTER TABLE "consultoria_agendamentos" DROP CONSTRAINT "consultoria_agendamentos_valor_positivo";--> statement-breakpoint
ALTER TABLE "consultoria_configuracoes" DROP CONSTRAINT "consultoria_configuracoes_valor_positivo";--> statement-breakpoint
ALTER TABLE "consultoria_reservas" DROP CONSTRAINT "consultoria_reservas_valor_positivo";--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ALTER COLUMN "valor_centavos" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consultoria_configuracoes" ALTER COLUMN "valor_centavos" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consultoria_reservas" ALTER COLUMN "valor_centavos" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "vitrine_publica" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD CONSTRAINT "consultoria_agendamentos_valor_positivo" CHECK (valor_centavos is null or valor_centavos > 0);--> statement-breakpoint
ALTER TABLE "consultoria_configuracoes" ADD CONSTRAINT "consultoria_configuracoes_valor_positivo" CHECK (valor_centavos is null or valor_centavos > 0);--> statement-breakpoint
ALTER TABLE "consultoria_reservas" ADD CONSTRAINT "consultoria_reservas_valor_positivo" CHECK (valor_centavos is null or valor_centavos > 0);