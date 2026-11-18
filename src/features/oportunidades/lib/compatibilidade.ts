import { and, eq, inArray, type SQL } from 'drizzle-orm'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { condicaoPrestadorHabilitado } from '@/features/usuarios/lib/prestador'
import {
  CATEGORIAS_OPORTUNIDADE,
  CATEGORIA_OPORTUNIDADE,
  type CategoriaOportunidade,
} from '../constants/oportunidade'

/**
 * Quem enxerga uma oportunidade.
 *
 * Uma regra só, escrita uma vez, usada nas duas direções: a difusão (quais
 * prestadores avisar de uma solicitação nova) e a vitrine (quais solicitações
 * mostrar a um prestador). Duplicá-la faria as duas telas discordarem — alguém
 * receberia o aviso de uma oportunidade que a própria lista dele não traz.
 *
 * Nesta etapa não existe ranking, pontuação, rodízio nem distribuição paga:
 * **todo** prestador compatível com a categoria vê a solicitação, e a ordem é
 * a cronológica.
 *
 * As especialidades escolhidas pelo Cliente **não** entram na compatibilidade,
 * de propósito. Elas são opcionais e o vocabulário do Cliente é fechado,
 * enquanto o do prestador é texto livre: exigir casamento faria uma solicitação
 * com uma especialidade marcada sumir de todos os prestadores da categoria. Elas
 * viajam como informação para quem for responder.
 */

/** Cadastro do prestador, no recorte que a compatibilidade precisa. */
export type PerfilParaCompatibilidade = {
  tipoPrestador: string | null
  tipoProfissional: string | null
  statusAnalise: string | null
  areasAtuacao: string[] | null
  especialidades: string[] | null
  /** Colaborador que optou pela vitrine pública (Assistente Contábil). */
  vitrinePublica?: boolean | null
}

/**
 * O Assistente Contábil: Colaborador com perfil na vitrine pública.
 *
 * Profissional de apoio a escritórios de contabilidade, sem habilitação
 * regulamentada. O cadastro grava `colaborador` como tipo; o nome público da
 * categoria é "Assistente Contábil". O colaborador **interno** (sem vitrine)
 * não é Assistente Contábil e não recebe pedido público.
 */
export function ehAssistenteContabil(perfil: PerfilParaCompatibilidade | null | undefined) {
  return Boolean(
    perfil &&
      perfil.tipoPrestador === 'colaborador' &&
      perfil.tipoProfissional === 'colaborador' &&
      perfil.vitrinePublica,
  )
}

/**
 * As categorias que um prestador alcança — **pelo cadastro**.
 *
 * Profissional casa pelos tipos internos que a categoria agrupa (contador e
 * especialista fiscal → Contabilidade; advogado → Jurídico). O Assistente
 * Contábil casa pela categoria própria. Palavras da apresentação, das áreas ou
 * das especialidades **não** mudam a categoria de ninguém: um colaborador que
 * escreveu "fiscal" na atuação continua fora de Contabilidade.
 */
export function categoriasCompativeisDoPrestador(
  perfil: PerfilParaCompatibilidade | null | undefined,
): CategoriaOportunidade[] {
  if (!perfil) return []
  const assistente = ehAssistenteContabil(perfil)

  return CATEGORIAS_OPORTUNIDADE.filter((categoria) => {
    const definicao = CATEGORIA_OPORTUNIDADE[categoria]
    if (definicao.alcancaAssistenteContabil) return assistente
    return Boolean(
      perfil.tipoProfissional &&
        (definicao.tiposProfissionais as string[]).includes(perfil.tipoProfissional),
    )
  })
}

/**
 * As categorias em que um prestador recebe **solicitação privada**: as mesmas
 * do cadastro (`categoriasCompativeisDoPrestador`). Mantida como porta nomeada
 * porque criar, listar, abrir e responder o pedido privado a usam — uma regra
 * só para as quatro.
 */
export function categoriasParaSolicitacaoPrivada(
  perfil: PerfilParaCompatibilidade | null | undefined,
): CategoriaOportunidade[] {
  return categoriasCompativeisDoPrestador(perfil)
}

/**
 * As especialidades que o formulário privado oferece, por categoria: o
 * catálogo central da categoria do destinatário (contador → Contabilidade,
 * advogado → Jurídico, assistente → Assistente Contábil). Nunca o catálogo de
 * outra categoria. É a mesma lista que o servidor aceita ao gravar.
 */
export function especialidadesParaSolicitacaoPrivada(
  perfil: PerfilParaCompatibilidade | null | undefined,
): Partial<Record<CategoriaOportunidade, string[]>> {
  return Object.fromEntries(
    categoriasParaSolicitacaoPrivada(perfil).map((categoria) => [
      categoria,
      [...CATEGORIA_OPORTUNIDADE[categoria].especialidades],
    ]),
  )
}

/**
 * Versão SQL da mesma regra, do lado da categoria.
 *
 * Usada para descobrir quem avisar quando a solicitação nasce. Traz junto as
 * condições de conta ativa, conta verificada e prestador habilitado: quem não
 * pode operar na plataforma também não recebe trabalho por ela.
 *
 * Depende de `usuarios` e `perfis_profissionais` estarem no `from`/`join` da
 * consulta que a usa — mesma convenção de `condicaoPrestadorHabilitado`.
 */
export function condicaoPrestadorCompativel(
  categoria: CategoriaOportunidade,
): SQL {
  const definicao = CATEGORIA_OPORTUNIDADE[categoria]
  const alcance = definicao.alcancaAssistenteContabil
    ? and(
        eq(perfisProfissionais.tipoPrestador, 'colaborador'),
        eq(perfisProfissionais.tipoProfissional, 'colaborador'),
        eq(perfisProfissionais.vitrinePublica, true),
      )
    : inArray(perfisProfissionais.tipoProfissional, definicao.tiposProfissionais)

  return and(
    eq(usuarios.status, 'ativo'),
    condicaoContaVerificada(),
    condicaoPrestadorHabilitado(),
    alcance,
  ) as SQL
}
