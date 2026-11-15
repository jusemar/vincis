import { eq, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { assinaturas } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import type { OrigemCancelamento } from '../constants/cancelamento'
import { planoTemContadorResponsavel } from '../constants/contador-responsavel'
import { cancelarCompetenciasNaoPrestadas } from './competencias'

export class CancelamentoRecusado extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'CancelamentoRecusado'
  }
}

export type ResultadoDoCancelamento = {
  /** O plano já estava cancelado: nada mudou agora (idempotente). */
  jaEstavaCancelado: boolean
  estadoAnterior: string
  canceladoEm: Date
  competenciasCanceladas: number
}

/**
 * Cancela um plano recorrente contábil da Vincis — o único caminho.
 *
 * ## O que muda
 *
 * - `status` vai para `cancelada` (estado que já existia no contrato), com
 *   `cancelado_em` e `cancelamento_motivo`;
 * - meses ainda `prevista` viram `cancelada` (`cancelarCompetenciasNaoPrestadas`,
 *   a estrutura que já existia para isso): nada de cobrança, Pix ou mês novo.
 *   Num período pago adiantado, os meses futuros também deixam de ser
 *   prestados, mas o dinheiro e as alocações ficam como histórico para uma
 *   futura política de estorno — nada é devolvido nem apagado aqui;
 * - a vaga do contador é liberada sozinha: a contagem de capacidade só olha
 *   planos `ativa`/`aguardando_pagamento`.
 *
 * ## O que não muda
 *
 * Conta do cliente, `prestador_id` (o contador fica como histórico), histórico
 * de alocações, pagamentos e suas alocações, cobranças, meses cumpridos e o mês
 * em andamento (já pago, pode ser concluído), comissões já apuradas. Sem estorno.
 *
 * ## Corrida e repetição
 *
 * A linha do plano é travada (`for update`) — a mesma trava da confirmação de
 * pagamento. Pix confirmado antes do cancelamento ativa o plano e o
 * cancelamento cancela o plano ativo; Pix confirmado depois é recusado pela
 * confirmação (plano não pagável) e fica como `conflito` para a equipe tratar,
 * sem reativar nada. Cancelar de novo devolve `jaEstavaCancelado` sem gravar.
 */
export async function cancelarPlano(entrada: {
  assinaturaId: string
  origem: OrigemCancelamento
  autorId: string
  /** Cliente: só o dono cancela. Gestor: omitido. */
  clienteUsuarioId?: string
  motivo?: string | null
  ip?: string | null
}): Promise<ResultadoDoCancelamento> {
  return db.transaction(async (tx) => {
    const [plano] = await tx
      .select({
        id: assinaturas.id,
        status: assinaturas.status,
        planoCodigo: assinaturas.planoCodigo,
        clienteUsuarioId: assinaturas.clienteUsuarioId,
        prestadorId: assinaturas.prestadorId,
        canceladoEm: assinaturas.canceladoEm,
      })
      .from(assinaturas)
      .where(eq(assinaturas.id, entrada.assinaturaId))
      .for('update')
      .limit(1)

    if (!plano || (entrada.clienteUsuarioId && plano.clienteUsuarioId !== entrada.clienteUsuarioId)) {
      throw new CancelamentoRecusado('Plano não encontrado.')
    }
    // Só o plano contábil recorrente da Vincis. Perfil Pro e armazenamento
    // (pagamentos do profissional) e a relação direta do Autônomo ficam fora.
    if (!planoTemContadorResponsavel(plano.planoCodigo)) {
      throw new CancelamentoRecusado('Este plano não pode ser cancelado por aqui.')
    }
    if (plano.status === 'cancelada') {
      return {
        jaEstavaCancelado: true,
        estadoAnterior: 'cancelada',
        canceladoEm: plano.canceladoEm ?? new Date(),
        competenciasCanceladas: 0,
      }
    }
    if (plano.status !== 'aguardando_pagamento' && plano.status !== 'ativa') {
      throw new CancelamentoRecusado('Este plano já está encerrado.')
    }

    const motivo = entrada.motivo?.trim() || null
    const competenciasCanceladas = await cancelarCompetenciasNaoPrestadas(tx, plano.id)
    const [atualizado] = await tx
      .update(assinaturas)
      .set({ status: 'cancelada', canceladoEm: sql`now()`, cancelamentoMotivo: motivo, updatedAt: sql`now()` })
      .where(eq(assinaturas.id, plano.id))
      .returning({ canceladoEm: assinaturas.canceladoEm })

    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.assinaturaCancelada,
        entidade: 'assinaturas',
        registroAfetado: plano.id,
        autorId: entrada.autorId,
        usuarioId: plano.clienteUsuarioId,
        origem: entrada.origem === 'gestor' ? 'gestao_vincis' : 'admin',
        ip: entrada.ip ?? null,
        metadados: {
          origem: entrada.origem,
          estadoAnterior: plano.status,
          estadoPosterior: 'cancelada',
          motivo,
          contadorResponsavel: plano.prestadorId,
          competenciasCanceladas,
        },
      },
      tx,
    )

    return {
      jaEstavaCancelado: false,
      estadoAnterior: plano.status,
      canceladoEm: atualizado.canceladoEm ?? new Date(),
      competenciasCanceladas,
    }
  })
}
