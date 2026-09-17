/**
 * Elegibilidade contábil — quem pode, por área de atuação, usar a Central
 * Fiscal.
 *
 * ## Por que existe, ao lado do RBAC
 *
 * Permissão responde "esta conta pode executar esta ação?". Elegibilidade
 * responde antes: "este módulo é do ofício desta pessoa?". Documentos Fiscais é
 * da atividade contábil; ser genericamente `profissional` não basta, e um
 * advogado que receba `documentos_fiscais.visualizar` por engano continua de
 * fora. As duas perguntas são feitas sempre, e nenhuma substitui a outra —
 * ainda falta a terceira, o escopo (escritório e cliente).
 *
 * ## De onde sai a área
 *
 * Do cadastro que já existe, sem inventar campo:
 *
 * - `perfis_profissionais.tipo_profissional` para o Profissional
 *   (`contabilidade`, `especialista_fiscal` e `advocacia` são o vocabulário da
 *   plataforma). As duas primeiras são atividade contábil-fiscal; `advocacia`
 *   não é.
 * - Para o Colaborador, o cadastro grava `tipo_profissional = 'colaborador'`
 *   de propósito — ele não é uma profissão regulamentada. Quem diz a área dele
 *   é o escritório a que está vinculado (`empresas.segmento`), que é
 *   exatamente o vínculo que a regra de negócio pede.
 *
 * Gestor da plataforma é a exceção administrativa prevista: passa pela
 * elegibilidade. Continua precisando de permissão e de vínculo com o
 * escritório — a exceção é de área, não de escopo.
 *
 * Arquivo puro: o servidor autoriza com ele e o menu se desenha com ele.
 */

/** Categorias de `perfis_profissionais.tipo_profissional` da área contábil. */
export const CATEGORIAS_PROFISSIONAIS_CONTABEIS = ['contabilidade', 'especialista_fiscal'] as const

/** `empresas.segmento` que caracteriza escritório contábil. */
export const SEGMENTO_EMPRESA_CONTABIL = 'contabilidade'

export function categoriaProfissionalEhContabil(tipoProfissional: string | null | undefined): boolean {
  return (CATEGORIAS_PROFISSIONAIS_CONTABEIS as readonly string[]).includes(tipoProfissional ?? '')
}

export type ContextoElegibilidadeFiscal = {
  ehGestor: boolean
  /** `profissional` ou `colaborador`; `null` para quem não presta serviço. */
  tipoPrestador: string | null
  /** `perfis_profissionais.tipo_profissional`. */
  tipoProfissional: string | null
  /** Segmento do escritório em questão, quando a decisão é sobre um deles. */
  segmentoDoEscritorio?: string | null
}

/**
 * A pessoa exerce atividade contábil (ou administra a plataforma)?
 *
 * Cliente e quem não presta serviço ficam de fora. Profissional entra pela
 * categoria do próprio cadastro; Colaborador, pelo segmento do escritório.
 */
export function elegivelParaCentralFiscal(contexto: ContextoElegibilidadeFiscal): boolean {
  if (contexto.ehGestor) return true
  if (contexto.tipoPrestador === 'profissional') {
    return categoriaProfissionalEhContabil(contexto.tipoProfissional)
  }
  if (contexto.tipoPrestador === 'colaborador') {
    // O Colaborador não declara profissão regulamentada — o cadastro grava
    // `tipo_profissional = 'colaborador'` de propósito. Quem diz a área dele é
    // o escritório contábil ao qual está vinculado, e só ele: aceitar também a
    // categoria do cadastro deixaria uma linha legada decidir área.
    return contexto.segmentoDoEscritorio === SEGMENTO_EMPRESA_CONTABIL
  }
  return false
}
