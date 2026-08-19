import { db } from '@/db/connection'

/**
 * Transação Drizzle do projeto.
 *
 * O tipo é derivado do próprio `db` para não fixar os genéricos do driver à
 * mão: se a conexão mudar, isto acompanha.
 */
export type TransacaoDb = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Quem pode executar uma escrita: a conexão ou uma transação em andamento.
 *
 * Receber isto — em vez de importar `db` direto — é o que permite gravar o
 * Atendimento dentro da mesma transação que grava a contratação. Ou os dois
 * existem, ou nenhum dos dois.
 */
export type ExecutorDb = typeof db | TransacaoDb
