ALTER TABLE "consultoria_agendamentos" ADD COLUMN "daily_room_name" varchar(128);--> statement-breakpoint
ALTER TABLE "consultoria_agendamentos" ADD COLUMN "daily_room_criada_em" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "consultoria_agendamentos_daily_room_unica" ON "consultoria_agendamentos" USING btree ("daily_room_name");