import {
  FORMATO_CNPJ,
  FORMATO_CPF,
  type SentidoDocumentoFiscal,
  type TipoIdentificacaoParte,
} from '../constants/dominio'
import type { DocumentoFiscalInterpretado } from '../schemas/documento-interpretado'

/**
 * Identidade fiscal: como a Vincis compara CNPJ, CPF e identificador
 * estrangeiro — **o único lugar** onde essa comparação acontece.
 *
 * ## Por que centralizar
 *
 * `replace(/\D/g, '')` espalhado pelo código quebraria na virada do CNPJ
 * alfanumérico, em que as doze primeiras posições podem ser letras. Aqui a
 * normalização tira só o que é máscara (`.`, `-`, `/` e espaço), mantém letras,
 * sobe a caixa e recusa o que sobrar fora de `[0-9A-Z]`. Identificador fiscal
 * nunca vira `number`: zeros à esquerda e letras se perderiam.
 *
 * ## O que ela decide
 *
 * Com a identidade do contribuinte e as partes lidas do XML, decide se a NF-e
 * foi emitida ou recebida por ele. Sem identidade cadastrada, ou sem
 * correspondência, a resposta é `nao_determinado` — nada é deduzido por nome,
 * razão social aproximada, e-mail, telefone ou CFOP.
 */

export type IdentidadeFiscal = {
  tipo: TipoIdentificacaoParte
  /** Normalizado: sem máscara, em caixa alta. */
  identificacao: string
}

/** Só separadores de máscara saem; letra é conteúdo, não ruído. */
export function normalizarIdentificacaoFiscal(valor: string | null | undefined): string | null {
  if (!valor) return null
  const limpo = valor.replace(/[.\-/\s]/g, '').toUpperCase()
  return /^[0-9A-Z]+$/.test(limpo) ? limpo : null
}

/** Formato manda: 14 posições alfanuméricas são CNPJ; 11 dígitos, CPF. */
export function classificarIdentificacaoFiscal(
  valor: string | null | undefined,
): TipoIdentificacaoParte | null {
  const normalizado = normalizarIdentificacaoFiscal(valor)
  if (!normalizado) return null
  if (FORMATO_CNPJ.test(normalizado)) return 'cnpj'
  if (FORMATO_CPF.test(normalizado)) return 'cpf'
  return 'estrangeiro'
}

/**
 * Identidade utilizável, ou `null`. O tipo informado pelo cadastro vale; quando
 * falta, o formato decide.
 */
export function lerIdentidadeFiscal(entrada: {
  identificacao?: string | null
  tipo?: string | null
}): IdentidadeFiscal | null {
  const identificacao = normalizarIdentificacaoFiscal(entrada.identificacao)
  if (!identificacao) return null
  const informado = entrada.tipo?.trim().toLowerCase()
  const tipo =
    informado === 'cnpj' || informado === 'cpf' || informado === 'estrangeiro'
      ? informado
      : classificarIdentificacaoFiscal(identificacao)
  return tipo ? { tipo, identificacao } : null
}

/**
 * Valor canônico → texto para ler na tela: `12.345.678/0001-95`,
 * `123.456.789-09`.
 *
 * A máscara é **posicional**, então serve igual para o CNPJ alfanumérico
 * (`12.ABC.345/01DE-35`) sem destruir letra nenhuma. O que não for CPF nem CNPJ
 * volta como está — identificador estrangeiro não tem forma fixa. Formatar é só
 * apresentação: o valor guardado e comparado continua o canônico.
 */
export function formatarIdentificacaoFiscal(valor: string | null | undefined): string {
  const normalizado = normalizarIdentificacaoFiscal(valor)
  if (!normalizado) return valor?.trim() ?? ''
  if (FORMATO_CPF.test(normalizado)) {
    return `${normalizado.slice(0, 3)}.${normalizado.slice(3, 6)}.${normalizado.slice(6, 9)}-${normalizado.slice(9)}`
  }
  if (FORMATO_CNPJ.test(normalizado)) {
    return `${normalizado.slice(0, 2)}.${normalizado.slice(2, 5)}.${normalizado.slice(5, 8)}/${normalizado.slice(8, 12)}-${normalizado.slice(12)}`
  }
  return normalizado
}

/** Mesmo contribuinte: mesmo identificador normalizado e mesmo tipo. */
export function mesmaIdentidadeFiscal(
  a: IdentidadeFiscal | null,
  b: IdentidadeFiscal | null,
): boolean {
  if (!a || !b) return false
  return a.identificacao === b.identificacao && a.tipo === b.tipo
}

/**
 * Sentido da NF-e para o contribuinte dono do documento.
 *
 * A identidade fiscal é a referência: CFOP e natureza da operação podem ajudar
 * análises contábeis mais tarde, mas não decidem isto. Correspondência dos dois
 * lados (o contribuinte é emitente **e** destinatário) é ambígua de verdade e
 * fica `nao_determinado` em vez de virar palpite.
 */
export function determinarSentidoFiscal(
  documento: DocumentoFiscalInterpretado,
  contribuinte: IdentidadeFiscal | null,
): SentidoDocumentoFiscal {
  if (!contribuinte) return 'nao_determinado'
  const emitente = lerIdentidadeFiscal({
    identificacao: documento.emitente.identificacao,
    tipo: documento.emitente.tipoIdentificacao,
  })
  const destinatario = documento.destinatario
    ? lerIdentidadeFiscal({
        identificacao: documento.destinatario.identificacao,
        tipo: documento.destinatario.tipoIdentificacao,
      })
    : null

  const ehEmitente = mesmaIdentidadeFiscal(emitente, contribuinte)
  const ehDestinatario = mesmaIdentidadeFiscal(destinatario, contribuinte)
  if (ehEmitente && ehDestinatario) return 'nao_determinado'
  if (ehEmitente) return 'emitido'
  if (ehDestinatario) return 'recebido'
  return 'nao_determinado'
}
