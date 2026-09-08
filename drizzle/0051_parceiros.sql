-- Fundação do Programa de Parceiros.
--
-- Somente aditiva: uma tabela nova e uma chave estrangeira. Nenhuma coluna,
-- restrição ou índice de tabela existente foi tocado, e a tabela nasce vazia —
-- nenhuma conta vira parceira por esta migration.
--
-- `parceiros.usuario_id` é único: a idempotência da ativação é garantida pelo
-- banco, não pela Server Action. `codigo` é único porque duas contas com o
-- mesmo código seriam duas donas da mesma indicação.
--
-- A cascata existe para não quebrar `excluir-usuario-seguro.ts`, que remove a
-- conta apagando uma a uma as tabelas que conhece: sem ela, excluir a conta de
-- um parceiro passaria a falhar.

CREATE TABLE "parceiros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"codigo" varchar(16) NOT NULL,
	"ativado_em" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parceiros_usuario_id_unique" UNIQUE("usuario_id"),
	CONSTRAINT "parceiros_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
ALTER TABLE "parceiros" ADD CONSTRAINT "parceiros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;