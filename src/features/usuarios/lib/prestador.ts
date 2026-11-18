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

/**
 * Quem aparece em público (listagem, perfil, agenda): Profissional habilitado,
 * ou Colaborador habilitado que escolheu atuar como prestador público
 * (`vitrine_publica`). O colaborador interno de escritório continua fora —
 * ser colaborador não torna ninguém público automaticamente.
 */
export function condicaoPrestadorPublico(): SQL {
  return or(
    condicaoPrestadorHabilitadoDoTipo('profissional'),
    and(condicaoPrestadorHabilitadoDoTipo('colaborador'), eq(perfisProfissionais.vitrinePublica, true)),
  ) as SQL
}

/** Mesma regra, restrita a um tipo de prestador. */
export function condicaoPrestadorHabilitadoDoTipo(tipo: TipoPrestador): SQL {
  return and(
    eq(perfisProfissionais.tipoPrestador, tipo),
    eq(perfisProfissionais.statusAnalise, STATUS_PRESTADOR_HABILITADO[tipo]),
  ) as SQL
}

/** Prefixo das chaves de comprovante fictícias das contas de demonstração. */
const PREFIXO_COMPROVANTE_FICTICIO = 'demo/'

/**
 * Registro verificado = cadastro regulamentado aprovado COM comprovante do
 * registro guardado (o que a análise confere). Aprovação sem comprovante —
 * cadastros de teste local, legados — não comprova CRC ou OAB. A chave `demo/…`
 * é a do script de regularização das contas demo: fictícia, sem arquivo por trás
 * (scripts/desenvolvimento/regularizar-perfis-demo.ts). Colaborador não tem
 * registro a verificar. Regra única para o perfil público e os cards da vitrine.
 */
export function registroDoPrestadorVerificado(tipoPrestador: string, comprovanteRegistroChave: string | null): boolean {
  return (
    tipoPrestador === 'profissional' &&
    Boolean(comprovanteRegistroChave) &&
    !comprovanteRegistroChave!.startsWith(PREFIXO_COMPROVANTE_FICTICIO)
  )
}
