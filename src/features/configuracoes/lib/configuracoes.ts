/**
 * Configurações da plataforma, definidas pela Gestão Vincis.
 *
 * Um registro por parâmetro em `configuracoes_plataforma`, com o significado e
 * os limites declarados aqui — o banco guarda texto, e é este arquivo que diz o
 * que aquele texto quer dizer. O `padrao` existe porque a plataforma precisa
 * funcionar antes de a Gestão abrir a tela pela primeira vez; ele não é a
 * regra, é o ponto de partida dela.
 */

export const CHAVE_PRAZO_OPORTUNIDADE = 'oportunidade_prazo_horas' as const

export const CONFIGURACOES = {
  [CHAVE_PRAZO_OPORTUNIDADE]: {
    rotulo: 'Prazo máximo da oportunidade pública',
    ajuda:
      'Tempo, a partir da publicação, em que uma solicitação pode receber propostas e fechar acordo. Depois disso ela expira.',
    unidade: 'horas',
    /** Ponto de partida técnico. A Gestão pode alterar a qualquer momento. */
    padrao: 48,
    minimo: 1,
    maximo: 720,
  },
} as const

export type ChaveConfiguracao = keyof typeof CONFIGURACOES

/** Texto guardado → número válido. Valor corrompido cai no padrão. */
export function lerNumero(chave: ChaveConfiguracao, valor: string | null | undefined) {
  const definicao = CONFIGURACOES[chave]
  const numero = Number.parseInt((valor ?? '').trim(), 10)
  if (!Number.isFinite(numero)) return definicao.padrao
  if (numero < definicao.minimo || numero > definicao.maximo) return definicao.padrao
  return numero
}
