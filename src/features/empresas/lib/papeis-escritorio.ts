import type { TipoPrestador } from '@/features/usuarios/constants/prestador'
import { funcaoAceitaTipo } from './compatibilidade-convite'
import type { FuncaoEquipe } from '../schemas/equipe'

/**
 * Matriz de papéis do escritório — a única fonte da regra de "quem administra".
 *
 * Papel é vínculo, não tipo de pessoa. Um Colaborador pode exercer o papel
 * Administrador sem deixar de ser Colaborador; um Profissional pode ser apenas
 * membro. O tipo da pessoa vive em `perfis_profissionais.tipo_prestador` e é
 * resolvido por `tipos-pessoa.ts`.
 *
 * Este arquivo é puro de propósito (nenhum import de Drizzle ou do schema), para
 * que os componentes de `use client` possam decidir o que renderizar com
 * exatamente a mesma tabela que o servidor usa para autorizar.
 */

export const PAPEIS_ESCRITORIO = [
  'proprietario',
  'administrador',
  'profissional',
  'colaborador',
] as const

export type PapelEscritorio = (typeof PAPEIS_ESCRITORIO)[number]

/** Formato mínimo de vínculo aceito pelas funções deste módulo. */
export type VinculoEscritorio = {
  empresaId: string
  funcao: string | null
  empresaLegadaId: string | null
}

export type PermissoesEscritorio = {
  /** Abre as funções administrativas do escritório. */
  administrar: boolean
  /** Envia convite de vínculo permanente. */
  convidarMembro: boolean
  /** Atribui e remove atribuição de clientes do escritório. */
  atribuirCliente: boolean
  /** Remove membros permanentes (nunca o Proprietário). */
  removerMembro: boolean
  /** Altera o papel de um membro (nunca de/para Proprietário). */
  alterarPapel: boolean
  /** Gerencia as colaborações externas concedidas nos clientes do escritório. */
  gerenciarColaboracoes: boolean
  /** Transfere a propriedade do escritório — exclusivo do Proprietário. */
  transferirPropriedade: boolean
}

const NENHUMA: PermissoesEscritorio = {
  administrar: false,
  convidarMembro: false,
  atribuirCliente: false,
  removerMembro: false,
  alterarPapel: false,
  gerenciarColaboracoes: false,
  transferirPropriedade: false,
}

/**
 * A matriz literal. Preferimos uma tabela a `if` espalhados porque a diferença
 * entre Proprietário e Administrador precisa ser lida de uma olhada: elas são
 * idênticas exceto por `transferirPropriedade`.
 */
export const PERMISSOES_POR_PAPEL: Record<PapelEscritorio, PermissoesEscritorio> =
  {
    proprietario: {
      administrar: true,
      convidarMembro: true,
      atribuirCliente: true,
      removerMembro: true,
      alterarPapel: true,
      gerenciarColaboracoes: true,
      transferirPropriedade: true,
    },
    administrador: {
      administrar: true,
      convidarMembro: true,
      atribuirCliente: true,
      removerMembro: true,
      alterarPapel: true,
      gerenciarColaboracoes: true,
      // Única diferença para o Proprietário: administrar não é ser dono.
      transferirPropriedade: false,
    },
    profissional: { ...NENHUMA },
    colaborador: { ...NENHUMA },
  }

export const SEM_PERMISSAO_ESCRITORIO: PermissoesEscritorio = { ...NENHUMA }

function ehPapelConhecido(valor: string | null): valor is PapelEscritorio {
  return (
    valor !== null && (PAPEIS_ESCRITORIO as readonly string[]).includes(valor)
  )
}

/**
 * Papel efetivo de um vínculo ativo.
 *
 * Contas antigas gravaram `empresa_membros.funcao = null`. Nesses casos o dono
 * é reconhecido pelo vínculo legado `usuarios.empresa_id`, que só o criador do
 * escritório possuía. Sem esta ponte, um proprietário antigo perderia o próprio
 * escritório — e nada garante que exista outro.
 */
export function papelDoVinculo(
  vinculo: VinculoEscritorio | null,
): PapelEscritorio | null {
  if (!vinculo) return null
  if (ehPapelConhecido(vinculo.funcao)) return vinculo.funcao
  if (!vinculo.funcao && vinculo.empresaLegadaId === vinculo.empresaId) {
    return 'proprietario'
  }
  return null
}

/** Permissões administrativas do vínculo. Sem vínculo, nenhuma. */
export function permissoesEscritorio(
  vinculo: VinculoEscritorio | null,
): PermissoesEscritorio {
  const papel = papelDoVinculo(vinculo)
  return papel ? PERMISSOES_POR_PAPEL[papel] : SEM_PERMISSAO_ESCRITORIO
}

/**
 * Remoção de membro permanente.
 *
 * O Proprietário é intocável: removê-lo deixaria o escritório sem responsável
 * habilitado, e a transferência de propriedade não existe nesta etapa. Também
 * não faz sentido alguém se auto-remover pela tela de administração.
 */
export function podeRemoverMembro(
  ator: VinculoEscritorio | null,
  alvoPapel: PapelEscritorio | null,
  alvoEhOAtor: boolean,
): boolean {
  if (!permissoesEscritorio(ator).removerMembro) return false
  if (alvoEhOAtor) return false
  return alvoPapel !== 'proprietario'
}

/**
 * Alteração de papel de um membro.
 *
 * Três recusas, todas verificadas no servidor:
 * 1. `proprietario` nunca é destino — virar dono exige transferência legítima.
 * 2. O papel do Proprietário não é alterado por ninguém.
 * 3. O papel novo tem de aceitar o tipo da pessoa (`funcaoAceitaTipo`), a mesma
 *    regra do convite: um Colaborador não vira Profissional por mudança de papel.
 */
export function podeAlterarPapelMembro(
  ator: VinculoEscritorio | null,
  alvoPapel: PapelEscritorio | null,
  novoPapel: PapelEscritorio,
  tipoAlvo: TipoPrestador | null,
): boolean {
  if (!permissoesEscritorio(ator).alterarPapel) return false
  if (novoPapel === 'proprietario') return false
  if (alvoPapel === 'proprietario') return false
  if (!alvoPapel || !tipoAlvo) return false
  if (alvoPapel === novoPapel) return false
  return funcaoAceitaTipo(novoPapel as FuncaoEquipe, tipoAlvo)
}

/** Motivo explícito da recusa — nunca falhar em silêncio. */
export function mensagemPapelRecusado(
  alvoPapel: PapelEscritorio | null,
  novoPapel: PapelEscritorio,
  tipoAlvo: TipoPrestador | null,
): string {
  if (novoPapel === 'proprietario') {
    return 'Não é possível tornar alguém Proprietário por aqui. A propriedade do escritório pertence ao Profissional habilitado que o criou.'
  }
  if (alvoPapel === 'proprietario') {
    return 'O papel do Proprietário não pode ser alterado.'
  }
  if (alvoPapel === novoPapel) {
    return 'Este membro já exerce essa função.'
  }
  if (tipoAlvo && !funcaoAceitaTipo(novoPapel as FuncaoEquipe, tipoAlvo)) {
    const rotulo = tipoAlvo === 'profissional' ? 'Profissional' : 'Colaborador'
    return `A função selecionada não aceita uma conta do tipo ${rotulo}.`
  }
  return 'Você não pode alterar a função deste membro.'
}
