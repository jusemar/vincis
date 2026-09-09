import { z } from 'zod'
import { TelefoneSchema } from '@/features/clientes/schemas/cliente'
import { cnpjValido, cpfValido, digitos, evpValida } from '../lib/documento'
import { TIPOS_CHAVE_PIX } from '../constants/recebimento'

/** A forma guardada da chave. Uma chave, uma escrita. */
export function normalizarChave(tipo: string, chave: string): string {
  const limpa = chave.trim()
  if (tipo === 'cpf' || tipo === 'cnpj' || tipo === 'telefone') {
    return digitos(limpa)
  }
  return limpa.toLowerCase()
}

/**
 * Os dados de recebimento do parceiro.
 *
 * ## A validação depende do tipo
 *
 * Uma chave Pix não tem um formato só: CPF é dígito verificador, e-mail é
 * formato, telefone segue a regra oficial da plataforma e EVP é UUID. Validar
 * tudo como "texto não vazio" deixaria passar exatamente o erro que só
 * apareceria na hora do pagamento — quando o dinheiro já saiu.
 *
 * ## Normalizar faz parte
 *
 * Documento e telefone são guardados **só com dígitos**, e-mail em minúsculas.
 * Guardar como a pessoa digitou faria a mesma chave existir de duas formas, e
 * qualquer comparação futura passaria a depender de sorte.
 *
 * ## O que esta validação **não** promete
 *
 * Que a chave existe, que está ativa e que pertence ao titular informado. Nada
 * disso é verificável sem consultar o arranjo de pagamentos, e a Vincis não
 * consulta. A tela diz isso ao parceiro, porque quem confere é ele.
 */
export const RecebimentoSchema = z
  .object({
    tipoChave: z.enum(TIPOS_CHAVE_PIX),
    chave: z.string().trim().min(1, 'Informe a chave Pix.').max(140),
    titular: z
      .string()
      .trim()
      .min(3, 'Informe o nome do titular da chave.')
      .max(120),
  })
  .superRefine((dados, contexto) => {
    const reclamar = (message: string) =>
      contexto.addIssue({ code: 'custom', path: ['chave'], message })

    if (dados.tipoChave === 'cpf' && !cpfValido(dados.chave)) {
      reclamar('Informe um CPF válido.')
    }
    if (dados.tipoChave === 'cnpj' && !cnpjValido(dados.chave)) {
      reclamar('Informe um CNPJ válido.')
    }
    if (
      dados.tipoChave === 'email' &&
      !z.string().email().safeParse(dados.chave).success
    ) {
      reclamar('Informe um e-mail válido.')
    }
    if (
      dados.tipoChave === 'telefone' &&
      // A regra oficial da plataforma, e não uma segunda definição de telefone.
      !TelefoneSchema.safeParse(dados.chave).success
    ) {
      reclamar('Informe um telefone brasileiro válido.')
    }
    if (dados.tipoChave === 'aleatoria' && !evpValida(dados.chave)) {
      reclamar('A chave aleatória do Pix tem o formato de um UUID.')
    }
  })
  .transform((dados) => ({
    ...dados,
    chave: normalizarChave(dados.tipoChave, dados.chave),
  }))

export type RecebimentoDTO = z.input<typeof RecebimentoSchema>
