import { sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentosSequenciaProtocolo } from '@/db/schema'

type Executor = Pick<typeof db, 'insert'>

export type ProtocoloReservado = { ano: number; sequencia: number }

/**
 * Reserva o próximo número de protocolo do ano.
 *
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` é uma única operação
 * atômica: o PostgreSQL trava a linha do ano, incrementa e devolve o valor já
 * incrementado. Duas criações simultâneas entram em fila e recebem números
 * diferentes — nunca o mesmo.
 *
 * O que **não** é feito, de propósito: contar registros existentes
 * (`max(sequencia) + 1`) empataria sob concorrência, e contar no navegador
 * daria ao cliente o poder de escolher o próprio protocolo.
 *
 * A numeração pode ter buracos quando uma transação que reservou um número
 * termina em rollback. Isso é o custo correto: sequência sem buraco exigiria
 * serializar as criações, e o requisito é unicidade, não continuidade.
 */
export async function reservarProtocolo(
  executor: Executor,
  ano: number = new Date().getFullYear(),
): Promise<ProtocoloReservado> {
  const [linha] = await executor
    .insert(atendimentosSequenciaProtocolo)
    .values({ ano, ultimoNumero: 1 })
    .onConflictDoUpdate({
      target: atendimentosSequenciaProtocolo.ano,
      set: {
        ultimoNumero: sql`${atendimentosSequenciaProtocolo.ultimoNumero} + 1`,
      },
    })
    .returning({ sequencia: atendimentosSequenciaProtocolo.ultimoNumero })

  return { ano, sequencia: linha.sequencia }
}

/**
 * Formato de exibição do protocolo (`#AAAA-NNNN`).
 *
 * O banco calcula a mesma expressão numa coluna gerada — esta função existe
 * para os testes e para quem precise formatar sem ir ao banco. A fonte da
 * verdade continua sendo a coluna `atendimentos.protocolo`.
 */
export function formatarProtocolo({ ano, sequencia }: ProtocoloReservado) {
  return `#${ano}-${String(sequencia).padStart(4, '0')}`
}
