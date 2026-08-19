import { eq, or, type SQL } from 'drizzle-orm'
import { usuarios } from '@/db/schema'

/**
 * Versão SQL de `contaVerificada`, para as consultas que filtram no banco.
 *
 * Os predicados puros ficam em `verificacao-conta.ts` e são reexportados aqui
 * para que o código de servidor tenha um único ponto de importação — mesmo
 * arranjo já usado por `prestador.ts` e `tipos-pessoa.ts`.
 */
export {
  contaVerificada,
  metodosVerificacao,
  rotuloVerificacao,
  METODOS_VERIFICACAO,
  type EstadoVerificacao,
  type MetodoVerificacao,
} from './verificacao-conta'

/** A conta teve a identidade comprovada por e-mail ou pela Gestão via WhatsApp. */
export function condicaoContaVerificada(): SQL {
  return or(
    eq(usuarios.emailVerificado, true),
    eq(usuarios.whatsappVerificado, true),
  ) as SQL
}
