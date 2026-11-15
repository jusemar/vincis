ALTER TABLE "assinatura_contador_alocacoes" DROP CONSTRAINT "assinatura_contador_alocacoes_contador_anterior_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "assinatura_contador_alocacoes" DROP CONSTRAINT "assinatura_contador_alocacoes_contador_novo_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "assinatura_contador_alocacoes" DROP CONSTRAINT "assinatura_contador_alocacoes_alterado_por_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "assinatura_contador_alocacoes" ADD CONSTRAINT "assinatura_contador_alocacoes_anterior_fk" FOREIGN KEY ("contador_anterior_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_contador_alocacoes" ADD CONSTRAINT "assinatura_contador_alocacoes_novo_fk" FOREIGN KEY ("contador_novo_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinatura_contador_alocacoes" ADD CONSTRAINT "assinatura_contador_alocacoes_alterado_por_fk" FOREIGN KEY ("alterado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;