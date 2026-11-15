import { calcularComissaoVincis } from '@/features/servicos/constants/comissao'
import type { MotivoRevisao, SituacaoRepasse } from '../constants/repasse'

/**
 * Regras puras do repasse — sem banco, para serem testadas uma a uma.
 */

/** O estado da prestação que libera (ou trava) a parte do profissional. */
export type Prestacao =
  | { tipo: 'pendente' }
  | { tipo: 'concluida' }
  | { tipo: 'interrompida'; motivo: MotivoRevisao }

export type FatosDoRepasse = {
  /** Algum dinheiro de origem foi estornado. */
  estornado: boolean
  /** Bruto, percentual e partes vieram de um retrato válido do Pix. */
  divisao: 'ok' | 'sem_retrato' | 'divergente'
  prestacao: Prestacao
  /** O dinheiro confirmado cobre o valor inteiro da origem. */
  coberturaCompleta: boolean
  profissionalId: string | null
}

/**
 * A situação apurada de uma origem que **ainda não foi repassada**.
 *
 * Ordem das perguntas (a primeira que trava, decide):
 * 1. Estorno → revisão. Dinheiro que voltou não é repassado.
 * 2. Prestação interrompida (cancelamento, recusa, encerramento sem conclusão,
 *    mês futuro cancelado) → revisão. Nada é apropriado nem devolvido sozinho.
 * 3. Sem retrato do percentual → revisão. A Vincis nunca inventa a divisão.
 * 4. Prestada, paga por inteiro e com profissional → disponível.
 * 5. Prestada sem profissional → revisão.
 * 6. Todo o resto → aguardando liberação (inclusive o plano pago adiantado:
 *    cada mês só fica disponível quando for cumprido).
 */
export function decidirSituacao(fatos: FatosDoRepasse): {
  situacao: Exclude<SituacaoRepasse, 'repassado'>
  motivoRevisao: MotivoRevisao | null
} {
  const revisao = (motivo: MotivoRevisao) => ({ situacao: 'em_revisao' as const, motivoRevisao: motivo })
  if (fatos.estornado) return revisao('pagamento_estornado')
  if (fatos.prestacao.tipo === 'interrompida') return revisao(fatos.prestacao.motivo)
  if (fatos.divisao === 'sem_retrato') return revisao('sem_percentual_registrado')
  if (fatos.divisao === 'divergente') return revisao('percentuais_divergentes')
  if (fatos.prestacao.tipo === 'concluida' && fatos.coberturaCompleta) {
    return fatos.profissionalId
      ? { situacao: 'disponivel', motivoRevisao: null }
      : revisao('sem_profissional')
  }
  return { situacao: 'aguardando_liberacao', motivoRevisao: null }
}

export type Divisao = {
  milesimos: number
  comissaoCentavos: number
  profissionalCentavos: number
}

/**
 * A divisão de um mês de plano a partir das alocações de pagamento.
 *
 * Cada alocação usa o percentual gravado no Pix que a pagou, com o mesmo
 * arredondamento dos avulsos (`calcularComissaoVincis`): comissão arredondada,
 * profissional = valor − comissão. Por isso as partes **sempre** fecham com o
 * bruto em centavos. Num semestral, cada mês é arredondado por si — a soma das
 * comissões mensais pode diferir em centavos do arredondamento do total, mas
 * cada linha do livro fecha exatamente.
 *
 * Percentual ausente em qualquer alocação → `sem_retrato`; percentuais
 * diferentes no mesmo mês → `divergente` (a linha guarda um percentual só).
 */
export function dividirAlocacoes(
  alocacoes: { valorCentavos: number; milesimos: number | null }[],
): { tipo: 'ok'; divisao: Divisao } | { tipo: 'sem_retrato' } | { tipo: 'divergente' } {
  if (!alocacoes.length || alocacoes.some((a) => a.milesimos === null)) return { tipo: 'sem_retrato' }
  const percentuais = new Set(alocacoes.map((a) => a.milesimos))
  if (percentuais.size > 1) return { tipo: 'divergente' }
  const milesimos = alocacoes[0].milesimos as number
  let comissaoCentavos = 0
  let profissionalCentavos = 0
  for (const alocacao of alocacoes) {
    const parte = calcularComissaoVincis(alocacao.valorCentavos, milesimos)
    comissaoCentavos += parte.comissaoCentavos
    profissionalCentavos += parte.profissionalCentavos
  }
  return { tipo: 'ok', divisao: { milesimos, comissaoCentavos, profissionalCentavos } }
}

/**
 * O que sobra para a Vincis depois do parceiro indicador.
 *
 * A comissão do indicador sai **só** da parte da Vincis; a do profissional não
 * muda. Negativo significa que o indicador custou mais que a comissão — a tela
 * sinaliza para a Gestão, mas o repasse ao profissional não é afetado.
 */
export function liquidoDaVincis(comissaoVincisCentavos: number | null, indicadorCentavos: number): number | null {
  return comissaoVincisCentavos === null ? null : comissaoVincisCentavos - indicadorCentavos
}

/** Situação de um atendimento ligada à liberação de um avulso. */
export function prestacaoDoAtendimento(
  statusContratacao: string | null,
  statusAtendimento: string | null,
): Prestacao {
  // A contratação usa 'cancelado'; 'cancelada' é aceito por segurança.
  if (statusContratacao === 'cancelado' || statusContratacao === 'cancelada') {
    return { tipo: 'interrompida', motivo: 'contratacao_cancelada' }
  }
  switch (statusAtendimento) {
    case 'concluido':
      return { tipo: 'concluida' }
    case 'cancelado':
      return { tipo: 'interrompida', motivo: 'atendimento_cancelado' }
    case 'recusado':
      return { tipo: 'interrompida', motivo: 'atendimento_recusado' }
    case 'encerrado_sem_conclusao':
      return { tipo: 'interrompida', motivo: 'encerrado_sem_conclusao' }
    default:
      return { tipo: 'pendente' }
  }
}

/** Situação de uma consulta ligada à liberação do pagamento dela. */
export function prestacaoDaConsulta(statusAgendamento: string | null): Prestacao {
  if (statusAgendamento === 'concluida') return { tipo: 'concluida' }
  if (statusAgendamento === 'cancelada') return { tipo: 'interrompida', motivo: 'consulta_cancelada' }
  return { tipo: 'pendente' }
}

/** Situação de um mês de plano. */
export function prestacaoDaCompetencia(status: string): Prestacao {
  if (status === 'cumprida') return { tipo: 'concluida' }
  if (status === 'cancelada') return { tipo: 'interrompida', motivo: 'competencia_cancelada' }
  return { tipo: 'pendente' }
}
