CREATE TABLE "atendimento_arquivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"nome" varchar(255) NOT NULL,
	"tipo_mime" varchar(120) NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"origem" varchar(20) NOT NULL,
	"remetente_id" uuid NOT NULL,
	"chave" varchar(500) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendimento_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"tipo" varchar(40) NOT NULL,
	"descricao" varchar(240) NOT NULL,
	"autor_id" uuid,
	"metadados" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendimento_participantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"atendimento_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel" varchar(20) DEFAULT 'convidado' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocolo_ano" integer NOT NULL,
	"protocolo_sequencia" integer NOT NULL,
	"protocolo" varchar(12) GENERATED ALWAYS AS (('#' || protocolo_ano::text || '-' || lpad(protocolo_sequencia::text, 4, '0'))) STORED NOT NULL,
	"contratacao_id" uuid,
	"prestador_id" uuid NOT NULL,
	"responsavel_id" uuid NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"cliente_carteira_id" uuid,
	"empresa_id" uuid,
	"titulo" varchar(160) NOT NULL,
	"categoria" varchar(30) NOT NULL,
	"status" varchar(30) DEFAULT 'novo' NOT NULL,
	"prioridade" varchar(10) DEFAULT 'media' NOT NULL,
	"acesso" varchar(20) DEFAULT 'privado' NOT NULL,
	"prazo_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atendimentos_sequencia_protocolo" (
	"ano" integer PRIMARY KEY NOT NULL,
	"ultimo_numero" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendimento_arquivos" ADD CONSTRAINT "atendimento_arquivos_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_arquivos" ADD CONSTRAINT "atendimento_arquivos_remetente_id_usuarios_id_fk" FOREIGN KEY ("remetente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_eventos" ADD CONSTRAINT "atendimento_eventos_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_eventos" ADD CONSTRAINT "atendimento_eventos_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_participantes" ADD CONSTRAINT "atendimento_participantes_atendimento_id_atendimentos_id_fk" FOREIGN KEY ("atendimento_id") REFERENCES "public"."atendimentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimento_participantes" ADD CONSTRAINT "atendimento_participantes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_contratacao_id_contratacoes_servico_id_fk" FOREIGN KEY ("contratacao_id") REFERENCES "public"."contratacoes_servico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_responsavel_id_usuarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_cliente_usuario_id_usuarios_id_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_cliente_carteira_id_clientes_id_fk" FOREIGN KEY ("cliente_carteira_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atendimento_arquivos_atendimento_idx" ON "atendimento_arquivos" USING btree ("atendimento_id","created_at");--> statement-breakpoint
CREATE INDEX "atendimento_eventos_linha_do_tempo_idx" ON "atendimento_eventos" USING btree ("atendimento_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "atendimento_participantes_unico" ON "atendimento_participantes" USING btree ("atendimento_id","usuario_id");--> statement-breakpoint
CREATE INDEX "atendimento_participantes_usuario_idx" ON "atendimento_participantes" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "atendimentos_protocolo_unico" ON "atendimentos" USING btree ("protocolo");--> statement-breakpoint
CREATE UNIQUE INDEX "atendimentos_protocolo_sequencia_unico" ON "atendimentos" USING btree ("protocolo_ano","protocolo_sequencia");--> statement-breakpoint
CREATE UNIQUE INDEX "atendimentos_contratacao_unico" ON "atendimentos" USING btree ("contratacao_id");--> statement-breakpoint
CREATE INDEX "atendimentos_prestador_idx" ON "atendimentos" USING btree ("prestador_id","status");--> statement-breakpoint
CREATE INDEX "atendimentos_cliente_idx" ON "atendimentos" USING btree ("cliente_usuario_id");