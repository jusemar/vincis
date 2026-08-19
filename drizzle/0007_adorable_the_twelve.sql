ALTER TABLE "perfis_profissionais" ADD COLUMN "cep" varchar(8);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "logradouro" varchar(255);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "numero" varchar(30);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "complemento" varchar(120);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "bairro" varchar(120);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "tempo_experiencia" integer;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "regimes_atendidos" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "comprovante_registro_chave" text;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "comprovante_registro_nome_original" varchar(255);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "comprovante_registro_tipo" varchar(100);--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "comprovante_registro_tamanho" integer;--> statement-breakpoint
ALTER TABLE "perfis_profissionais" ADD COLUMN "comprovante_registro_enviado_em" timestamp;