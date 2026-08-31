-- O Histórico do Atendimento ordena por `created_at`, e `now()` é o relógio da
-- transação: não anda enquanto ela dura. Como um mesmo ato grava mais de um
-- evento na mesma transação — aceitar um pedido de ajuste grava "aceito" e, em
-- seguida, "reaberto" —, os dois recebiam o mesmo instante e a ordem exibida
-- passava a depender do plano de execução. `clock_timestamp()` anda dentro da
-- transação e devolve a ordem real dos fatos.
--
-- Só o padrão muda: nenhuma linha existente é reescrita, e nada além da ordem
-- de exibição depende desta coluna.
ALTER TABLE "atendimento_eventos" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();