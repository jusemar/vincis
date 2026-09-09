-- A Gestão pode recusar um saque, e o dinheiro volta ao parceiro.
--
-- Segura para a base existente: duas colunas nuláveis e a troca de um índice
-- por uma versão parcial dele. Nenhuma linha é reescrita, nenhum valor muda e
-- nenhuma tabela de outro domínio é tocada.
--
-- O índice deixa de ser incondicional e passa a valer só enquanto a reserva
-- vale (`where liberado_em is null`). Sem isso a recusa devolveria o saldo na
-- conta e travaria o próximo saque: a comissão liberada voltaria a ser
-- elegível, mas o insert do item novo colidiria com a reserva antiga — dinheiro
-- visível e impossível de sacar.
--
-- Recriar o índice é seguro aqui: toda linha existente tem `liberado_em` nulo,
-- então o conjunto coberto é exatamente o mesmo de antes.
--
-- `recusado_em` é simétrico a `pago_em`: os dois desfechos do saque ficam
-- igualmente explícitos no histórico. O motivo administrativo reusa a coluna
-- `observacao`, que já existia.

DROP INDEX "parceiro_saque_itens_comissao_unica";--> statement-breakpoint
ALTER TABLE "parceiro_saque_itens" ADD COLUMN "liberado_em" timestamp;--> statement-breakpoint
ALTER TABLE "parceiro_saques" ADD COLUMN "recusado_em" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "parceiro_saque_itens_comissao_unica" ON "parceiro_saque_itens" USING btree ("comissao_id") WHERE liberado_em is null;