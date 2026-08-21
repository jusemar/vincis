/**
 * Formas que a Área do Cliente recebe do servidor.
 *
 * Ficam num arquivo próprio porque quatro seções as consomem — antes elas
 * viviam dentro do componente da página, o que obrigava qualquer seção nova a
 * importar a página inteira só para conhecer um tipo.
 */

export type ContratacaoCliente = {
  id: string
  nomeServico: string
  modeloPreco: string
  valorCentavos: number | null
  status: string
  criadoEm: string
  prestadorNome: string
}

export type DadosPortalCliente = {
  nome: string
  email: string
  whatsapp: string | null
  emailVerificado: boolean
  whatsappVerificado: boolean
  criadoEm: string
}

/** As quatro áreas do portal. A aba viaja na URL, e por isso é linkável. */
export const ABAS_PORTAL = [
  'visao',
  'orcamentos',
  'atendimentos',
  'conta',
] as const

export type AbaPortal = (typeof ABAS_PORTAL)[number]

export function abaValida(valor: string | null | undefined): AbaPortal {
  return (ABAS_PORTAL as readonly string[]).includes(valor ?? '')
    ? (valor as AbaPortal)
    : 'visao'
}
