import { z } from 'zod'
import { FORMATO_CNPJ, FORMATO_CPF, TIPOS_IDENTIFICACAO_PARTE } from '../constants/dominio'
import { normalizarIdentificacaoFiscal } from '../lib/identidade-fiscal'

/**
 * Identidade fiscal em formulário — cliente e escritório usam este mesmo schema.
 *
 * Normaliza com a função de `lib/identidade-fiscal` (a mesma que compara
 * identidades na hora de decidir o sentido da NF-e), de modo que o valor que
 * chega ao banco já está canônico: sem máscara, em caixa alta, sem virar número.
 * Formulário, action e banco não têm cada um a sua regra.
 *
 * ## Por que a validação não é mais dura que isto
 *
 * Confere formato, não dígito verificador. O CNPJ alfanumérico entra em vigor
 * com regra própria de verificação, e travar hoje o cálculo numérico impediria
 * cadastrar amanhã um CNPJ legítimo. Quem é o contribuinte de verdade continua
 * sendo dito pelo documento fiscal, não por este campo.
 */

/** Mensagem única: o mesmo texto na tela e na action. */
export const MENSAGENS_IDENTIDADE_FISCAL = {
  tipoSemNumero: 'Informe o CPF/CNPJ ou deixe o tipo em branco.',
  numeroSemTipo: 'Selecione se o número informado é CPF ou CNPJ.',
  cpf: 'Informe um CPF com 11 números.',
  cnpj: 'Informe um CNPJ com 14 caracteres.',
  estrangeiro: 'Informe um identificador válido.',
} as const

export const TipoIdentificacaoFiscalSchema = z.enum(TIPOS_IDENTIFICACAO_PARTE)

/**
 * Campos crus do formulário (`''` quando em branco) → par canônico
 * `{ tipoIdentificacaoFiscal, identificacaoFiscal }`, ambos nulos quando não
 * informados.
 */
export const IdentidadeFiscalSchema = z
  .object({
    tipoIdentificacaoFiscal: z.union([TipoIdentificacaoFiscalSchema, z.literal('')]).optional().default(''),
    identificacaoFiscal: z.string().trim().max(30).optional().default(''),
  })
  .transform((dados) => ({
    tipo: dados.tipoIdentificacaoFiscal || null,
    valor: normalizarIdentificacaoFiscal(dados.identificacaoFiscal),
    informado: dados.identificacaoFiscal.trim(),
  }))
  .superRefine((dados, contexto) => {
    if (!dados.tipo && !dados.informado) return
    if (dados.tipo && !dados.informado) {
      contexto.addIssue({
        code: 'custom',
        path: ['identificacaoFiscal'],
        message: MENSAGENS_IDENTIDADE_FISCAL.tipoSemNumero,
      })
      return
    }
    if (!dados.tipo) {
      contexto.addIssue({
        code: 'custom',
        path: ['tipoIdentificacaoFiscal'],
        message: MENSAGENS_IDENTIDADE_FISCAL.numeroSemTipo,
      })
      return
    }
    const valido =
      dados.valor !== null &&
      (dados.tipo === 'cpf'
        ? FORMATO_CPF.test(dados.valor)
        : dados.tipo === 'cnpj'
          ? FORMATO_CNPJ.test(dados.valor)
          : dados.valor.length >= 3)
    if (!valido) {
      contexto.addIssue({
        code: 'custom',
        path: ['identificacaoFiscal'],
        message: MENSAGENS_IDENTIDADE_FISCAL[dados.tipo],
      })
    }
  })
  .transform((dados) => ({
    tipoIdentificacaoFiscal: dados.valor ? dados.tipo : null,
    identificacaoFiscal: dados.valor,
  }))

/**
 * Par canônico para gravar, a partir dos campos do formulário. Entrada inválida
 * vira o par vazio — quem grava sempre valida antes, com o mesmo schema.
 */
export function identidadeFiscalCanonica(dados: IdentidadeFiscalDTO): IdentidadeFiscalValidada {
  const resultado = IdentidadeFiscalSchema.safeParse(dados)
  return resultado.success ? resultado.data : { tipoIdentificacaoFiscal: null, identificacaoFiscal: null }
}

export type IdentidadeFiscalDTO = z.input<typeof IdentidadeFiscalSchema>
export type IdentidadeFiscalValidada = z.output<typeof IdentidadeFiscalSchema>
