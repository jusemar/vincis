import {
  PERFIL_PESSOA_COLABORADOR,
  PERFIS_PESSOA_PROFISSIONAL,
  STATUS_PRESTADOR_HABILITADO,
  type TipoPrestador,
} from '../constants/prestador'
import type { PerfilTipo } from '../types'

/**
 * Regras de tipo da pessoa, sem nenhuma dependência de banco.
 *
 * Fica separado de `prestador.ts` (que monta condições SQL) para que
 * componentes de cliente possam usar as mesmas regras sem arrastar o Drizzle e
 * o schema do banco para o bundle do navegador.
 */

export function ehPessoaProfissional(perfilTipo: PerfilTipo): boolean {
  return PERFIS_PESSOA_PROFISSIONAL.includes(perfilTipo)
}

export function ehPessoaColaborador(perfilTipo: PerfilTipo): boolean {
  return perfilTipo === PERFIL_PESSOA_COLABORADOR
}

/**
 * Converte o tipo da pessoa (perfil em `usuarios_perfis`) no tipo de prestador.
 * Devolve `null` para quem não é prestador (cliente, gestor da Vincis).
 */
export function tipoPrestadorDoPerfil(
  perfilTipo: PerfilTipo,
): TipoPrestador | null {
  if (ehPessoaProfissional(perfilTipo)) return 'profissional'
  if (ehPessoaColaborador(perfilTipo)) return 'colaborador'
  return null
}

/** O cadastro de prestador está completo e habilitado a operar. */
export function prestadorHabilitado(
  perfil:
    | { tipoPrestador: string | null; statusAnalise: string | null }
    | null
    | undefined,
): boolean {
  if (!perfil?.tipoPrestador) return false
  const exigido =
    STATUS_PRESTADOR_HABILITADO[perfil.tipoPrestador as TipoPrestador]
  return Boolean(exigido) && perfil.statusAnalise === exigido
}
