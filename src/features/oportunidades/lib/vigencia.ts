/**
 * Os dois relógios da negociação.
 *
 * 1. **prazo global da oportunidade** (`expira_em`), definido pela Gestão: é o
 *    tempo que o Cliente dá ao mercado para fechar com ele;
 * 2. **validade da proposta** (`valida_ate`), definida por quem propõe: é o
 *    tempo que aquele prestador sustenta aquele preço.
 *
 * O segundo nunca pode passar do primeiro — uma proposta aceitável depois de a
 * solicitação expirar seria um acordo fechado fora do prazo que o próprio
 * Cliente publicou. Quem garante isso é `limitarValidade`, e não a interface.
 *
 * Este arquivo é **puro**: sem Drizzle, sem `db`. É o que permite ao formulário
 * do prestador oferecer as validades sem arrastar o driver do PostgreSQL para o
 * bundle do navegador. A parte que fala com o banco vive em `vigencia-sql.ts`,
 * mesma separação que `tipos-pessoa`/`prestador` já usa.
 */

export function oportunidadeExpirada(oportunidade: {
  status: string
  expiraEm: Date | null
}) {
  if (oportunidade.status === 'expirada') return true
  return (
    oportunidade.status === 'aberta' &&
    oportunidade.expiraEm !== null &&
    oportunidade.expiraEm.getTime() <= Date.now()
  )
}

/** Status a exibir: `aberta` vencida já se lê como `expirada`. */
export function statusVisivel(oportunidade: {
  status: string
  expiraEm: Date | null
}) {
  return oportunidadeExpirada(oportunidade) ? 'expirada' : oportunidade.status
}

/** Opções de validade oferecidas ao prestador. */
export const VALIDADES_PROPOSTA = [
  { horas: 24, rotulo: '24 horas' },
  { horas: 48, rotulo: '48 horas' },
  { horas: 72, rotulo: '3 dias' },
  { horas: 168, rotulo: '7 dias' },
] as const

export type HorasValidade = (typeof VALIDADES_PROPOSTA)[number]['horas']

export const VALIDADE_PADRAO_HORAS: HorasValidade = 48

/**
 * Converte a escolha do prestador em data, sem ultrapassar a oportunidade.
 *
 * Devolve também se houve corte, para que a tela possa dizer isso — encurtar em
 * silêncio faria o prestador acreditar numa validade que ele não tem.
 */
export function limitarValidade(
  horas: number,
  expiraEmOportunidade: Date | null,
  agora = new Date(),
) {
  const escolhida = new Date(agora.getTime() + horas * 60 * 60 * 1000)
  if (expiraEmOportunidade && escolhida > expiraEmOportunidade) {
    return { validaAte: expiraEmOportunidade, limitada: true }
  }
  return { validaAte: escolhida, limitada: false }
}

/** A proposta ainda pode ser aceita? */
export function propostaVigente(proposta: {
  validaAte: Date | null
  status: string
}) {
  if (proposta.status !== 'enviada') return false
  // Propostas anteriores a esta etapa não têm validade própria: valem enquanto
  // a oportunidade viver.
  if (!proposta.validaAte) return true
  return proposta.validaAte.getTime() > Date.now()
}
