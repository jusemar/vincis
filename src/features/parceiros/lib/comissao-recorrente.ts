import { and, eq, isNull, sql } from 'drizzle-orm'
import type { db as Banco } from '@/db/connection'
import {
  assinaturaCompetencias,
  assinaturaPagamentoAlocacoes,
  assinaturaPagamentos,
  assinaturas,
  parceiroAtribuicoes,
  parceiroComissoes,
  parceiroSaqueItens,
  parceiroSaques,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { percentualEmTextoDecimal } from '../constants/programa'
import { ConfiguracaoDeNiveisIndisponivel, recalcularNivelDoParceiro } from './niveis'
import { calcularComissaoPorCentesimos } from './registrar-comissao'

type Transacao = Parameters<Parameters<typeof Banco.transaction>[0]>[0]

/** O motivo que o saque cancelado por estorno carrega em `observacao`. */
export const MOTIVO_SAQUE_CANCELADO_POR_ESTORNO =
  'Cancelado automaticamente: o pagamento que sustentava as comissões deste saque foi estornado.'

/**
 * A competência, travada até o fim da transação.
 *
 * É o ponto de encontro de três fluxos — cumprir o mês, confirmar o pagamento
 * e estornar o pagamento. Os três travam esta linha antes de decidir, e é isso
 * que impede um estorno de passar entre "a cobertura existe" e "a comissão foi
 * gravada".
 */
async function travarCompetencia(tx: Transacao, competenciaId: string) {
  const [linha] = await tx
    .select({
      id: assinaturaCompetencias.id,
      assinaturaId: assinaturaCompetencias.assinaturaId,
      numero: assinaturaCompetencias.numero,
      valorBaseCentavos: assinaturaCompetencias.valorBaseCentavos,
      status: assinaturaCompetencias.status,
    })
    .from(assinaturaCompetencias)
    .where(eq(assinaturaCompetencias.id, competenciaId))
    .limit(1)
    .for('update')
  return linha ?? null
}

/** Quanto do mês está coberto por dinheiro **confirmado**. Alocação sozinha não conta. */
async function coberturaConfirmada(tx: Transacao, competenciaId: string) {
  const [linha] = await tx
    .select({
      total: sql<number>`coalesce(sum(${assinaturaPagamentoAlocacoes.valorCentavos}), 0)`.mapWith(
        Number,
      ),
    })
    .from(assinaturaPagamentoAlocacoes)
    .innerJoin(
      assinaturaPagamentos,
      eq(assinaturaPagamentos.id, assinaturaPagamentoAlocacoes.pagamentoId),
    )
    .where(
      and(
        eq(assinaturaPagamentoAlocacoes.competenciaId, competenciaId),
        eq(assinaturaPagamentos.status, 'confirmado'),
      ),
    )
  return linha?.total ?? 0
}

export type MotivoSemComissaoRecorrente =
  | 'competencia_inexistente'
  | 'nao_cumprida'
  | 'sem_parceiro'
  | 'sem_cobertura_confirmada'
  | 'valor_zero'
  | 'configuracao_indisponivel'
  | 'ja_existia'
  | 'erro'

export type ResultadoDaComissaoRecorrente =
  | { criada: true; comissaoId: string; valorCentavos: number }
  | { criada: false; motivo: MotivoSemComissaoRecorrente }

/**
 * A comissão recorrente de um mês, se ele já tem direito a ela.
 *
 * ## As cinco condições, todas ao mesmo tempo
 *
 * 1. o mês existe e está `cumprida` — prestado, e não só previsto ou pago;
 * 2. a assinatura dele tem atribuição de parceiro — a primeira assinatura
 *    ativada da conta que nasceu pelo link, registrada na ativação;
 * 3. o valor do mês está coberto por pagamento `confirmado` — pendente,
 *    cancelado e estornado não contam;
 * 4. o valor dá ao menos um centavo de comissão;
 * 5. o mês ainda não tem comissão — o índice único de `competencia_id` é quem
 *    garante, não esta função.
 *
 * ## Chamada pelos dois lados
 *
 * Quem cumpre o mês chama; quem confirma o pagamento também. A ordem não
 * importa: o segundo evento encontra as cinco condições e a comissão nasce ali.
 * Chamar de novo não duplica.
 *
 * ## O valor
 *
 * O percentual do **nível do parceiro agora**, lido da configuração vigente
 * publicada pela Gestão — nunca de uma constante. O nível é refeito aqui, com a
 * linha do parceiro travada, então duas comissões nascendo juntas não
 * discordam. Incide sobre o valor **congelado na competência**, em inteiros.
 * Percentual, nível, versão da configuração, base e resultado ficam copiados
 * na linha: nível ou configuração futuros não reescrevem o mês que já passou.
 * Contratos antigos acompanham o nível nas competências seguintes, sem
 * atribuição nova. Sem configuração válida, nenhuma comissão nasce.
 *
 * Nasce `disponivel`, porque o serviço daquele mês já terminou e o dinheiro
 * dele já entrou — entra no saldo livre do parceiro como qualquer comissão.
 */
export async function garantirComissaoRecorrenteDaCompetencia(
  tx: Transacao,
  competenciaId: string,
): Promise<ResultadoDaComissaoRecorrente> {
  const nao = (motivo: MotivoSemComissaoRecorrente) => ({ criada: false as const, motivo })

  const competencia = await travarCompetencia(tx, competenciaId)
  if (!competencia) return nao('competencia_inexistente')
  if (competencia.status !== 'cumprida') return nao('nao_cumprida')

  const [atribuicao] = await tx
    .select({ id: parceiroAtribuicoes.id, parceiroId: parceiroAtribuicoes.parceiroId })
    .from(parceiroAtribuicoes)
    .where(eq(parceiroAtribuicoes.assinaturaId, competencia.assinaturaId))
    .limit(1)
  if (!atribuicao) return nao('sem_parceiro')

  const coberto = await coberturaConfirmada(tx, competencia.id)
  if (competencia.valorBaseCentavos <= 0 || coberto < competencia.valorBaseCentavos) {
    return nao('sem_cobertura_confirmada')
  }

  let nivel: Awaited<ReturnType<typeof recalcularNivelDoParceiro>>
  try {
    nivel = await recalcularNivelDoParceiro(tx, atribuicao.parceiroId)
  } catch (erro) {
    if (erro instanceof ConfiguracaoDeNiveisIndisponivel) {
      console.error('[PARCEIROS] comissão recorrente adiada: níveis indisponíveis', {
        competenciaId,
        motivo: erro.message,
      })
      return nao('configuracao_indisponivel')
    }
    throw erro
  }
  const centesimos = nivel.nivel.percentualCentesimos
  const valorCentavos = calcularComissaoPorCentesimos(
    competencia.valorBaseCentavos,
    centesimos,
  )
  if (valorCentavos <= 0) return nao('valor_zero')

  const [assinatura] = await tx
    .select({
      clienteUsuarioId: assinaturas.clienteUsuarioId,
      prestadorId: assinaturas.prestadorId,
    })
    .from(assinaturas)
    .where(eq(assinaturas.id, competencia.assinaturaId))
    .limit(1)

  const agora = new Date()
  const [criada] = await tx
    .insert(parceiroComissoes)
    .values({
      tipo: 'recorrente',
      parceiroId: atribuicao.parceiroId,
      atribuicaoId: atribuicao.id,
      competenciaId: competencia.id,
      clienteUsuarioId: assinatura.clienteUsuarioId,
      profissionalId: assinatura.prestadorId,
      servicoReferencia: null,
      valorBaseCentavos: competencia.valorBaseCentavos,
      percentual: percentualEmTextoDecimal(centesimos),
      nivelCodigo: nivel.nivel.codigo,
      nivelConfiguracaoVersao: nivel.configuracao.versao,
      valorCentavos,
      status: 'disponivel',
      geradaEm: agora,
      disponivelEm: agora,
    })
    .onConflictDoNothing({ target: parceiroComissoes.competenciaId })
    .returning({ id: parceiroComissoes.id })
  if (!criada) return nao('ja_existia')

  await registrarEventoAuditoria(
    {
      acao: ACOES_AUDITORIA.comissaoRecorrenteCriada,
      entidade: 'parceiro_comissoes',
      registroAfetado: criada.id,
      usuarioId: assinatura.clienteUsuarioId,
      origem: 'sistema',
      metadados: {
        parceiroId: atribuicao.parceiroId,
        assinaturaId: competencia.assinaturaId,
        competencia: competencia.numero,
        valorBaseCentavos: competencia.valorBaseCentavos,
        percentualCentesimos: centesimos,
        nivel: nivel.nivel.codigo,
        configuracaoVersao: nivel.configuracao.versao,
        valorCentavos,
        status: 'disponivel',
      },
    },
    tx,
  )

  return { criada: true, comissaoId: criada.id, valorCentavos }
}

/**
 * O mesmo, num ponto de salvamento próprio.
 *
 * Cumprir um mês e registrar dinheiro são fatos do contrato: não podem falhar
 * porque o programa de parceiros tropeçou. Uma falha aqui desfaz só a comissão,
 * vira log, e a próxima chamada — idempotente — tenta de novo.
 */
export async function garantirComissaoRecorrenteSemDerrubar(
  tx: Transacao,
  competenciaId: string,
): Promise<ResultadoDaComissaoRecorrente> {
  try {
    return await tx.transaction((interna) =>
      garantirComissaoRecorrenteDaCompetencia(interna, competenciaId),
    )
  } catch (erro) {
    console.error('[PARCEIROS] falha ao garantir comissão recorrente', {
      competenciaId,
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
    return { criada: false, motivo: 'erro' }
  }
}

export type DesfechoDoEstorno =
  | 'ainda_coberta'
  | 'sem_comissao'
  | 'ja_cancelada'
  | 'cancelada'
  | 'cancelada_saque_ajustado'
  | 'cancelada_saque_cancelado'
  | 'paga_sinalizada'

/**
 * O que acontece com a comissão de um mês cujo pagamento foi estornado.
 *
 * Roda **na transação do estorno**, e não num ponto de salvamento: uma comissão
 * disponível sobre dinheiro que voltou não pode sobreviver a uma falha.
 *
 * - O mês continua coberto por outro pagamento confirmado → nada muda.
 * - Comissão `disponivel` e livre → `cancelada`.
 * - Comissão `disponivel` reservada num saque `solicitado` → `cancelada`, o
 *   item sai da reserva e o saque passa a valer o que sobrou. Se não sobrar
 *   nada, o saque é `cancelado` com o motivo em `observacao` — nunca um pedido
 *   de R$ 0,00.
 * - Comissão `paga` → continua paga; `pagamento_estornado_em` sinaliza a
 *   compensação, que é trabalho futuro. Nenhuma reversão automática.
 *
 * ## Travas, sempre na mesma ordem
 *
 * Competência → comissão → saque. Pagar o saque trava o saque e depois as
 * comissões; se os dois se cruzarem, o Postgres derruba um e quem chamou tenta
 * de novo. Repetir é seguro: tudo aqui é condicionado ao estado atual.
 */
export async function revogarComissaoRecorrentePorEstorno(
  tx: Transacao,
  competenciaId: string,
  pagamentoId: string,
): Promise<DesfechoDoEstorno> {
  const competencia = await travarCompetencia(tx, competenciaId)
  if (!competencia) return 'sem_comissao'
  if (
    competencia.valorBaseCentavos > 0 &&
    (await coberturaConfirmada(tx, competencia.id)) >= competencia.valorBaseCentavos
  ) {
    return 'ainda_coberta'
  }

  const [comissao] = await tx
    .select({
      id: parceiroComissoes.id,
      status: parceiroComissoes.status,
      parceiroId: parceiroComissoes.parceiroId,
      valorCentavos: parceiroComissoes.valorCentavos,
      pagamentoEstornadoEm: parceiroComissoes.pagamentoEstornadoEm,
    })
    .from(parceiroComissoes)
    .where(eq(parceiroComissoes.competenciaId, competencia.id))
    .limit(1)
    .for('update')
  if (!comissao) return 'sem_comissao'
  if (comissao.status === 'cancelada') return 'ja_cancelada'

  const agora = new Date()
  const auditar = (acao: (typeof ACOES_AUDITORIA)[keyof typeof ACOES_AUDITORIA], entidade: string, registro: string, metadados: Record<string, unknown>) =>
    registrarEventoAuditoria(
      {
        acao,
        entidade,
        registroAfetado: registro,
        origem: 'sistema',
        metadados: {
          parceiroId: comissao.parceiroId,
          comissaoId: comissao.id,
          assinaturaId: competencia.assinaturaId,
          competencia: competencia.numero,
          pagamentoId,
          ...metadados,
        },
      },
      tx,
    )

  if (comissao.status === 'paga') {
    if (!comissao.pagamentoEstornadoEm) {
      await tx
        .update(parceiroComissoes)
        .set({ pagamentoEstornadoEm: agora, updatedAt: agora })
        .where(eq(parceiroComissoes.id, comissao.id))
      await auditar(
        ACOES_AUDITORIA.comissaoRecorrentePagaComEstorno,
        'parceiro_comissoes',
        comissao.id,
        { valorCentavos: comissao.valorCentavos, compensacao: 'pendente' },
      )
    }
    return 'paga_sinalizada'
  }

  const [reserva] = await tx
    .select({ itemId: parceiroSaqueItens.id, saqueId: parceiroSaqueItens.saqueId })
    .from(parceiroSaqueItens)
    .where(
      and(
        eq(parceiroSaqueItens.comissaoId, comissao.id),
        isNull(parceiroSaqueItens.liberadoEm),
      ),
    )
    .limit(1)

  let desfecho: DesfechoDoEstorno = 'cancelada'
  if (reserva) {
    const [saque] = await tx
      .select({ id: parceiroSaques.id, status: parceiroSaques.status })
      .from(parceiroSaques)
      .where(eq(parceiroSaques.id, reserva.saqueId))
      .limit(1)
      .for('update')

    if (saque?.status === 'solicitado') {
      await tx
        .update(parceiroSaqueItens)
        .set({ liberadoEm: agora })
        .where(eq(parceiroSaqueItens.id, reserva.itemId))

      const [restante] = await tx
        .select({
          total: sql<number>`coalesce(sum(${parceiroSaqueItens.valorCentavos}), 0)`.mapWith(
            Number,
          ),
        })
        .from(parceiroSaqueItens)
        .where(
          and(
            eq(parceiroSaqueItens.saqueId, saque.id),
            isNull(parceiroSaqueItens.liberadoEm),
          ),
        )

      if (restante.total > 0) {
        await tx
          .update(parceiroSaques)
          .set({ valorCentavos: restante.total, updatedAt: agora })
          .where(eq(parceiroSaques.id, saque.id))
        await auditar(
          ACOES_AUDITORIA.saqueParceiroAjustadoPorEstorno,
          'parceiro_saques',
          saque.id,
          { valorRetiradoCentavos: comissao.valorCentavos, novoValorCentavos: restante.total },
        )
        desfecho = 'cancelada_saque_ajustado'
      } else {
        // O valor fica como estava: é o retrato do que foi pedido, e o
        // `check` do saque não admite zero. O status diz que acabou.
        await tx
          .update(parceiroSaques)
          .set({
            status: 'cancelado',
            canceladoEm: agora,
            observacao: MOTIVO_SAQUE_CANCELADO_POR_ESTORNO,
            updatedAt: agora,
          })
          .where(eq(parceiroSaques.id, saque.id))
        await auditar(
          ACOES_AUDITORIA.saqueParceiroCanceladoPorEstorno,
          'parceiro_saques',
          saque.id,
          { valorRetiradoCentavos: comissao.valorCentavos, motivo: 'estorno_do_pagamento' },
        )
        desfecho = 'cancelada_saque_cancelado'
      }
    }
  }

  await tx
    .update(parceiroComissoes)
    .set({
      status: 'cancelada',
      canceladaEm: agora,
      pagamentoEstornadoEm: agora,
      updatedAt: agora,
    })
    .where(
      and(eq(parceiroComissoes.id, comissao.id), eq(parceiroComissoes.status, 'disponivel')),
    )
  await auditar(
    ACOES_AUDITORIA.comissaoRecorrenteCanceladaPorEstorno,
    'parceiro_comissoes',
    comissao.id,
    { valorCentavos: comissao.valorCentavos, desfecho },
  )

  return desfecho
}
