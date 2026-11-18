/**
 * Identificação profissional exibida nos cards — sempre a partir do cadastro
 * estruturado (`tipo_profissional` e se a pessoa se apresenta como escritório),
 * nunca de palavras da descrição ou das especialidades.
 *
 * - Individual: Contador, Advogado, Assistente Contábil e, para o cadastro
 *   legado `especialista_fiscal`, a identificação original "Especialista
 *   fiscal" (sem CRC, não é apresentado como contador).
 * - Escritório: Contabilidade ou Jurídico, conforme o tipo do responsável.
 */
export type TipoIdentificacao =
  | 'contador'
  | 'advogado'
  | 'assistente'
  | 'especialista_fiscal'
  | 'colaborador'
  | 'escritorio_contabil'
  | 'escritorio_juridico'

export type IdentificacaoProfissional = { tipo: TipoIdentificacao; rotulo: string }

export function identificacaoProfissional(
  tipoProfissional: string | null | undefined,
  ehEscritorio: boolean,
  /**
   * `publico`: só aparecem colaboradores com vitrine, que são Assistentes
   * Contábeis. `equipe`: a pesquisa interna do escritório também traz o
   * colaborador interno, que continua identificado como Colaborador.
   */
  contexto: 'publico' | 'equipe' = 'publico',
): IdentificacaoProfissional | null {
  if (ehEscritorio) {
    if (tipoProfissional === 'advocacia') return { tipo: 'escritorio_juridico', rotulo: 'Jurídico' }
    if (tipoProfissional === 'contabilidade' || tipoProfissional === 'especialista_fiscal')
      return { tipo: 'escritorio_contabil', rotulo: 'Contabilidade' }
    return null
  }
  switch (tipoProfissional) {
    case 'contabilidade':
      return { tipo: 'contador', rotulo: 'Contador' }
    case 'advocacia':
      return { tipo: 'advogado', rotulo: 'Advogado' }
    case 'colaborador':
      return contexto === 'publico'
        ? { tipo: 'assistente', rotulo: 'Assistente Contábil' }
        : { tipo: 'colaborador', rotulo: 'Colaborador' }
    case 'especialista_fiscal':
      return { tipo: 'especialista_fiscal', rotulo: 'Especialista fiscal' }
    default:
      return null
  }
}
