CREATE TABLE "contratacoes_servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"servico_id" uuid NOT NULL,
	"prestador_id" uuid NOT NULL,
	"cliente_usuario_id" uuid NOT NULL,
	"cliente_carteira_id" uuid,
	"nome_servico_snapshot" varchar(160) NOT NULL,
	"modelo_preco_snapshot" varchar(20) NOT NULL,
	"valor_snapshot_centavos" integer,
	"prazo_estimado_dias" integer,
	"status" varchar(30) DEFAULT 'pendente' NOT NULL,
	"observacoes" text,
	"concluido_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prestador_id" uuid NOT NULL,
	"nome" varchar(160) NOT NULL,
	"descricao_curta" varchar(280) NOT NULL,
	"descricao_detalhada" text,
	"categoria" varchar(30) DEFAULT 'contabil' NOT NULL,
	"itens_incluidos" text[] DEFAULT '{}' NOT NULL,
	"modelo_preco" varchar(20) DEFAULT 'fixo' NOT NULL,
	"valor_centavos" integer,
	"prazo_estimado_dias" integer,
	"ativo" boolean DEFAULT true NOT NULL,
	"publico" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "usuario_id" uuid;--> statement-breakpoint
ALTER TABLE "contratacoes_servico" ADD CONSTRAINT "contratacoes_servico_servico_id_servicos_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."servicos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratacoes_servico" ADD CONSTRAINT "contratacoes_servico_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratacoes_servico" ADD CONSTRAINT "contratacoes_servico_cliente_usuario_id_usuarios_id_fk" FOREIGN KEY ("cliente_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratacoes_servico" ADD CONSTRAINT "contratacoes_servico_cliente_carteira_id_clientes_id_fk" FOREIGN KEY ("cliente_carteira_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_prestador_id_usuarios_id_fk" FOREIGN KEY ("prestador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contratacoes_servico_prestador_idx" ON "contratacoes_servico" USING btree ("prestador_id","status");--> statement-breakpoint
CREATE INDEX "contratacoes_servico_cliente_idx" ON "contratacoes_servico" USING btree ("cliente_usuario_id","created_at");--> statement-breakpoint
CREATE INDEX "contratacoes_servico_servico_idx" ON "contratacoes_servico" USING btree ("servico_id");--> statement-breakpoint
CREATE INDEX "servicos_vitrine_idx" ON "servicos" USING btree ("prestador_id","ativo","publico","ordem");--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;