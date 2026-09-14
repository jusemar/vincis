/**
 * Vocabulário das campanhas do Programa de Parceiros.
 *
 * Puro (sem banco, sem React): serve ao servidor, à Gestão e ao painel do
 * parceiro. Nenhum alvo, valor, ponto ou data mora aqui — tudo isso é
 * configurado pela Gestão em cada campanha. Aqui estão só os tipos que existem
 * e como falar deles.
 */

/** Tipos com motor: são os únicos que o servidor e o banco aceitam. */
export const TIPOS_META = [
  'novos_clientes_recorrentes',
  'servicos_avulsos',
  'valor_gerado',
] as const
export type TipoMeta = (typeof TIPOS_META)[number]

export const ROTULO_TIPO_META: Record<TipoMeta, string> = {
  novos_clientes_recorrentes: 'Novos clientes recorrentes',
  servicos_avulsos: 'Serviços avulsos',
  valor_gerado: 'Valor total gerado',
}

export const AJUDA_TIPO_META: Record<TipoMeta, string> = {
  novos_clientes_recorrentes:
    'Clientes originados pelo parceiro com assinatura ativada e paga no período.',
  servicos_avulsos:
    'Serviços avulsos originados pelo parceiro e concluídos no período.',
  valor_gerado:
    'Soma do valor de serviços avulsos concluídos e de pagamentos confirmados de assinaturas, no período.',
}

/**
 * Tipos anunciados, sem motor ainda. Aparecem desativados na Gestão, com
 * "Em breve"; o servidor e o banco recusam salvá-los.
 */
export const TIPOS_META_FUTUROS = [
  { codigo: 'meta_progressiva', rotulo: 'Meta progressiva' },
  { codigo: 'meta_combinada', rotulo: 'Meta combinada' },
] as const

export function tipoMetaValido(valor: string): valor is TipoMeta {
  return (TIPOS_META as readonly string[]).includes(valor)
}

/** O alvo desse tipo é dinheiro (centavos)? Os outros contam unidades. */
export function metaEmDinheiro(tipo: TipoMeta): boolean {
  return tipo === 'valor_gerado'
}

export type SituacaoCampanha = 'rascunho' | 'agendada' | 'ativa' | 'encerrada' | 'cancelada'

export const ROTULO_SITUACAO_CAMPANHA: Record<SituacaoCampanha, string> = {
  rascunho: 'Rascunho',
  agendada: 'Agendada',
  ativa: 'Ativa',
  encerrada: 'Encerrada',
  cancelada: 'Cancelada',
}

/**
 * A situação de uma campanha hoje, em datas locais de São Paulo
 * (`AAAA-MM-DD`, comparáveis como texto).
 */
export function situacaoDaCampanha(
  campanha: { status: string; inicio: string; fim: string },
  hoje: string,
): SituacaoCampanha {
  if (campanha.status === 'cancelada') return 'cancelada'
  if (campanha.status !== 'publicada') return 'rascunho'
  if (hoje < campanha.inicio) return 'agendada'
  if (hoje > campanha.fim) return 'encerrada'
  return 'ativa'
}

/** "R$ 150,00". Só exibição: o valor chega em centavos inteiros. */
export function reaisDeCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * "3.000", "3000,50", "R$ 150" em centavos inteiros, sem ponto flutuante.
 * Nulo quando o texto não é um valor em reais com até duas casas.
 */
export function lerReaisEmCentavos(texto: string): number | null {
  const limpo = texto.replace(/R\$/i, '').replace(/\s/g, '')
  if (!limpo) return null
  const semMilhar = /,\d{1,2}$/.test(limpo) ? limpo.replace(/\./g, '') : limpo.replace(/\.(?=\d{3}(\D|$))/g, '')
  const partes = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(semMilhar)
  if (!partes) return null
  return Number(partes[1]) * 100 + Number((partes[2] ?? '').padEnd(2, '0'))
}

/** Como o progresso é lido: "2 / 3 clientes", "R$ 1.850,00 / R$ 3.000,00". */
export function formatarProgresso(tipo: TipoMeta, valor: number, alvo: number): string {
  if (metaEmDinheiro(tipo)) return `${reaisDeCentavos(valor)} / ${reaisDeCentavos(alvo)}`
  const unidade = tipo === 'servicos_avulsos' ? 'serviços' : 'clientes'
  return `${valor} / ${alvo} ${unidade}`
}

/** Quanto falta, em texto: "Falta 1 cliente.", "Faltam R$ 1.150,00." */
export function textoDoQueFalta(tipo: TipoMeta, valor: number, alvo: number): string | null {
  const falta = Math.max(0, alvo - valor)
  if (falta === 0) return null
  if (metaEmDinheiro(tipo)) return `Faltam ${reaisDeCentavos(falta)}.`
  const [um, varios] =
    tipo === 'servicos_avulsos' ? ['serviço', 'serviços'] : ['cliente', 'clientes']
  return falta === 1 ? `Falta 1 ${um}.` : `Faltam ${falta} ${varios}.`
}

/** "R$ 150,00 + 300 pontos", "300 pontos", "R$ 150,00". */
export function descreverRecompensa(bonusCentavos: number, pontos: number): string {
  const partes = []
  if (bonusCentavos > 0) partes.push(reaisDeCentavos(bonusCentavos))
  if (pontos > 0) partes.push(`${pontos.toLocaleString('pt-BR')} pontos`)
  return partes.join(' + ')
}
