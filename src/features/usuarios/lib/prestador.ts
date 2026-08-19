import { and, eq, or, type SQL } from 'drizzle-orm'
import { perfisProfissionais } from '@/db/schema'
import {
  STATUS_PRESTADOR_HABILITADO,
  type TipoPrestador,
} from '../constants/prestador'

/**
 * Regras de prestador que dependem do banco.
 *
 * Toda autorização que antes perguntava "tem perfil profissional aprovado?"
 * passa a perguntar "é um prestador habilitado?", para que o Colaborador entre
 * pelas mesmas portas sem precisar fingir aprovação de habilitação técnica.
 *
 * Os predicados puros vivem em `tipos-pessoa.ts` e são reexportados aqui para
 * que o código de servidor tenha um único ponto de importação.
 */
export {
  ehPessoaColaborador,
  ehPessoaProfissional,
  prestadorHabilitado,
  tipoPrestadorDoPerfil,
} from './tipos-pessoa'

/**
 * Versão SQL de `prestadorHabilitado`, para as consultas que filtram
 * prestadores diretamente no banco.
 */
export function condicaoPrestadorHabilitado(): SQL {
  const condicoes = (
    Object.entries(STATUS_PRESTADOR_HABILITADO) as [TipoPrestador, string][]
  ).map(([tipo, status]) =>
    and(
      eq(perfisProfissionais.tipoPrestador, tipo),
      eq(perfisProfissionais.statusAnalise, status),
    ),
  )
  return or(...condicoes) as SQL
}

/** Mesma regra, restrita a um tipo de prestador. */
export function condicaoPrestadorHabilitadoDoTipo(tipo: TipoPrestador): SQL {
  return and(
    eq(perfisProfissionais.tipoPrestador, tipo),
    eq(perfisProfissionais.statusAnalise, STATUS_PRESTADOR_HABILITADO[tipo]),
  ) as SQL
}
