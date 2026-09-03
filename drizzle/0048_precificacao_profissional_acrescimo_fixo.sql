-- Uma opção de atendimento pode cobrar em reais, e não só em porcentagem.
--
-- A menor alteração possível: um `check` que aceita mais um valor em `tipo`.
-- Nenhuma coluna nova, nenhuma linha criada, alterada ou removida — inclusive
-- as que já estavam gravadas, que continuam sendo lidas exatamente como antes.
-- A forma de cobrar é dita pela **existência** de uma linha `acrescimo_fixo` ao
-- lado da linha `fator`; sem ela, vale o percentual, que é o caso de todo mundo
-- que configurou preço até aqui.
--
-- `precificacao_*` — a precificação da Vincis — não é tocada por esta migration.

ALTER TABLE "precificacao_profissional_valores" DROP CONSTRAINT "precificacao_profissional_valores_tipo_conhecido";--> statement-breakpoint
ALTER TABLE "precificacao_profissional_valores" ADD CONSTRAINT "precificacao_profissional_valores_tipo_conhecido" CHECK ("precificacao_profissional_valores"."tipo" in ('preco_base', 'faixa', 'fator', 'acrescimo_fixo'));