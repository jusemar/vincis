import type { TipoPrestador } from '@/features/usuarios/constants/prestador'
import type { FuncaoEquipe } from '../schemas/equipe'

/**
 * Compatibilidade entre o papel no escritório e o tipo da pessoa convidada.
 *
 * Papel ≠ tipo. O papel é o que a pessoa exerce dentro daquele escritório; o
 * tipo é quem ela é na plataforma. A regra existe para que ninguém seja
 * convertido artificialmente: um Colaborador não vira Profissional por entrar
 * como "profissional membro", e um Profissional não é rebaixado a Colaborador.
 *
 * - `profissional`: exige pessoa do tipo Profissional.
 * - `colaborador`: exige pessoa do tipo Colaborador.
 * - `administrador`: papel administrativo, aberto aos dois tipos. É a única
 *   função em que o tipo da pessoa não determina o papel, porque administrar o
 *   escritório não pressupõe habilitação técnica regulamentada.
 *
 * `proprietario` não aparece aqui de propósito: proprietário não é convidado,
 * ele nasce com o escritório e é validado em `garantirProprietarioProfissional`.
 */
export const TIPOS_ACEITOS_POR_FUNCAO: Record<FuncaoEquipe, TipoPrestador[]> = {
  administrador: ['profissional', 'colaborador'],
  profissional: ['profissional'],
  colaborador: ['colaborador'],
}

export function funcaoAceitaTipo(
  funcao: FuncaoEquipe,
  tipoPrestador: TipoPrestador,
): boolean {
  return TIPOS_ACEITOS_POR_FUNCAO[funcao]?.includes(tipoPrestador) ?? false
}

/** Mensagem explícita de recusa — nunca falhar em silêncio. */
export function mensagemConviteIncompativel(
  funcao: FuncaoEquipe,
  tipoPrestador: TipoPrestador,
): string {
  const rotuloTipo =
    tipoPrestador === 'profissional' ? 'Profissional' : 'Colaborador'
  if (funcao === 'profissional') {
    return `A função Profissional exige uma pessoa do tipo Profissional. Esta conta é do tipo ${rotuloTipo} — convide-a como Colaborador.`
  }
  if (funcao === 'colaborador') {
    return `A função Colaborador exige uma pessoa do tipo Colaborador. Esta conta é do tipo ${rotuloTipo} — convide-a como Profissional ou Administrador.`
  }
  return `Esta conta não pode assumir a função selecionada.`
}
