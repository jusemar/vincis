CREATE TABLE "consultoria_configuracoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prestador_id" uuid NOT NULL,
	"titulo" varchar(160) NOT NULL,
	"descricao_curta" varchar(280) NOT NULL,
	"modalidade" varchar(20) DEFAULT 'online' NOT NULL,
	"valor_centavos" integer NOT NULL,
	"duracao_minutos" integer NOT NULL,
	"intervalo_minutos" integer DEFAULT 0 NOT NULL,
	"antecedencia_minima_minutos" integer DEFAULT 120 NOT NULL,
	"horizonte_dias" integer DEFAULT 60 NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consultoria_configuracoes_valor_positivo" CHECK (valor_centavos > 0),
	CONSTRAINT "consultoria_configuracoes_duracao_valida" CHECK (duracao_minutos > 0 and duracao_minutos <= 480),
	CONSTRAINT "consultoria_configuracoes_intervalo_valido" CHECK (intervalo_minutos >= 0 and intervalo_minutos <= 240),
	CONSTRAINT "consultoria_configuracoes_antecedencia_valida" CHECK (antecedencia_minima_minutos >= 0 and antecedencia_minima_minutos <= 43200),
	CONSTRAINT "consultoria_configuracoes_horizonte_valido" CHECK (horizonte_dias > 0 and horizonte_dias <= 365),
	CONSTRAINT "consultoria_configuracoes_timezone_preenchido" CHECK (length(btrim(timezone)) > 0)
);
--> statement-breakpoint
CREATE TABLE "consultoria_disponibilidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuracao_id" uuid NOT NULL,
	"dia_semana" integer NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fim" time NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consultoria_disponibilidades_dia_valido" CHECK (dia_semana between 0 and 6),
	CONSTRAINT "consultoria_disponibilidades_faixa_coerente" CHECK (hora_inicio < hora_fim)
);
--> statement-breakpoint
CREATE TABLE "consultoria_excecoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuracao_id" uuid NOT NULL,
	"data" date NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"hora_inicio" time,
	"hora_fim" time,
	"motivo" varchar(240),
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consultoria_excecoes_tipo_coerente" CHECK ((tipo = 'indisponivel_dia' and hora_inicio is null and hora_fim is null)
          or (tipo in ('bloqueio_parcial', 'disponivel_extra')
              and hora_inicio is not null
              and hora_fim is not null
              and hora_inicio < hora_fim))
);
--> statement-breakpoint
ALTER TABLE "consultoria_configuracoes" ADD CONSTRAINT "consultoria_configuracoes_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_disponibilidades" ADD CONSTRAINT "consultoria_disponibilidades_configuracao_fk" FOREIGN KEY ("configuracao_id") REFERENCES "public"."consultoria_configuracoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultoria_excecoes" ADD CONSTRAINT "consultoria_excecoes_configuracao_fk" FOREIGN KEY ("configuracao_id") REFERENCES "public"."consultoria_configuracoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consultoria_configuracoes_prestador_unico" ON "consultoria_configuracoes" USING btree ("prestador_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consultoria_disponibilidades_faixa_unica" ON "consultoria_disponibilidades" USING btree ("configuracao_id","dia_semana","hora_inicio") WHERE ativo;--> statement-breakpoint
CREATE INDEX "consultoria_disponibilidades_agenda_idx" ON "consultoria_disponibilidades" USING btree ("configuracao_id","dia_semana","hora_inicio");--> statement-breakpoint
CREATE INDEX "consultoria_excecoes_agenda_idx" ON "consultoria_excecoes" USING btree ("configuracao_id","data");