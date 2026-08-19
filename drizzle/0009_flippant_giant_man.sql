CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profissional_id" uuid NOT NULL,
	"empresa_id" uuid,
	"nome" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"telefone" varchar(20) NOT NULL,
	"empresa_nome" varchar(255),
	"area" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'ativo' NOT NULL,
	"observacoes" text,
	"arquivado_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_profissional_id_usuarios_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_profissional_status_idx" ON "clientes" USING btree ("profissional_id","status");--> statement-breakpoint
CREATE INDEX "clientes_profissional_criacao_idx" ON "clientes" USING btree ("profissional_id","created_at");--> statement-breakpoint
CREATE INDEX "clientes_empresa_idx" ON "clientes" USING btree ("empresa_id");