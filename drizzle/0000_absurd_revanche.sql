CREATE TYPE "public"."empresa_status" AS ENUM('ativo', 'bloqueado');--> statement-breakpoint
CREATE TYPE "public"."empresa_tipo" AS ENUM('cliente', 'prestadora');--> statement-breakpoint
CREATE TYPE "public"."usuario_status" AS ENUM('pendente_email', 'ativo', 'bloqueado');--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(255) NOT NULL,
	"tipo" "empresa_tipo" DEFAULT 'cliente' NOT NULL,
	"status" "empresa_status" DEFAULT 'ativo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perfis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(50) NOT NULL,
	"descricao" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "perfis_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"nome" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"whatsapp" varchar(20),
	"senha_hash" varchar(255) NOT NULL,
	"email_verificado" boolean DEFAULT false NOT NULL,
	"email_verificado_em" timestamp,
	"ultimo_login_em" timestamp,
	"status" "usuario_status" DEFAULT 'pendente_email' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "usuarios_perfis" (
	"usuario_id" uuid NOT NULL,
	"perfil_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_perfis_usuario_id_perfil_id_pk" PRIMARY KEY("usuario_id","perfil_id")
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_perfis" ADD CONSTRAINT "usuarios_perfis_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_perfis" ADD CONSTRAINT "usuarios_perfis_perfil_id_perfis_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis"("id") ON DELETE no action ON UPDATE no action;