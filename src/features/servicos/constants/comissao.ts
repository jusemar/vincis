/**
 * Comissão da Vincis nos serviços avulsos pagos pela plataforma.
 *
 * O Cliente paga o serviço à Vincis; a Vincis retém a comissão e o restante é
 * do profissional. O percentual **não** mora no código: é decisão da Gestão,
 * guardada em `configuracoes_plataforma` sob a chave abaixo, em milésimos
 * (200 = 20,0%). Sem valor configurado não existe padrão — a contratação paga
 * fica indisponível e a Gestão vê "configuração pendente".
 *
 * Não confundir com a comissão do parceiro indicador (Programa de Parceiros,
 * níveis Bronze/Prata/Ouro): são regras independentes, e nenhuma lê a outra.
 */
export const CHAVE_COMISSAO_SERVICOS_AVULSOS = 'servicos_avulsos.comissao_vincis_milesimos'

/** 0,1% a 99,9%: sempre há comissão, e o profissional sempre recebe algo. */
export const COMISSAO_MINIMA_MILESIMOS = 1
export const COMISSAO_MAXIMA_MILESIMOS = 999

export const MENSAGEM_COMISSAO_PENDENTE =
  'A contratação deste serviço pela Vincis está temporariamente indisponível. Tente novamente mais tarde.'

/** Texto guardado → milésimos válidos, ou `null` (ausente ou ilegível). */
export function interpretarComissaoMilesimos(valor: string | null | undefined): number | null {
  const texto = (valor ?? '').trim()
  if (!/^\d+$/.test(texto)) return null
  const numero = Number(texto)
  return numero >= COMISSAO_MINIMA_MILESIMOS && numero <= COMISSAO_MAXIMA_MILESIMOS ? numero : null
}

export function formatarPercentualMilesimos(milesimos: number): string {
  return `${(milesimos / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/**
 * Divide o valor pago entre Vincis e profissional.
 *
 * Arredonda a comissão para o centavo mais próximo; o profissional fica com o
 * resto exato, então as duas partes sempre somam o valor pago.
 */
export function calcularComissaoVincis(valorCentavos: number, milesimos: number) {
  const comissaoCentavos = Math.round((valorCentavos * milesimos) / 1000)
  return {
    milesimos,
    comissaoCentavos,
    profissionalCentavos: valorCentavos - comissaoCentavos,
  }
}
