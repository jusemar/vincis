import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
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
}

function textoDaAtuacao(perfil: PerfilParaCompatibilidade) {
  return [...(perfil.areasAtuacao ?? []), ...(perfil.especialidades ?? [])]
    .join(' ')
    .toLowerCase()
}

/**
 * As categorias que um prestador alcança.
 *
 * Profissional regulamentado casa pelos **tipos internos** que a categoria
 * pública agrupa, e nunca por comparação de texto com o nome dela: é isso que
 * faz uma solicitação de "Contabilidade" alcançar tanto o contador quanto o
 * especialista fiscal, sem que nenhum dos dois tipos precise ser renomeado ou
 * fundido no cadastro.
 *
 * O Colaborador não declara categoria (o cadastro grava sempre `colaborador`),
 * então quem responde por ele são as áreas de atuação e as especialidades que
 * ele escreveu. Colaborador sem nenhuma área reconhecível não recebe
 * oportunidade: é preferível a fila vazia à fila errada. A habilitação
 * regulamentada continua sendo a do cadastro — o Colaborador entra por atuação
 * compatível, não por equiparação a Profissional.
 */
export function categoriasCompativeisDoPrestador(
  perfil: PerfilParaCompatibilidade | null | undefined,
): CategoriaOportunidade[] {
  if (!perfil) return []

  const atuacao = textoDaAtuacao(perfil)

  return CATEGORIAS_OPORTUNIDADE.filter((categoria) => {
    const definicao = CATEGORIA_OPORTUNIDADE[categoria]
    if (
      perfil.tipoProfissional &&
      (definicao.tiposProfissionais as string[]).includes(
        perfil.tipoProfissional,
      )
    ) {
      return true
    }
    if (perfil.tipoPrestador !== 'colaborador') return false
    return definicao.termos.some((termo) => atuacao.includes(termo))
  })
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
  const porCategoriaDeclarada = inArray(
    perfisProfissionais.tipoProfissional,
    definicao.tiposProfissionais,
  )

  // O Colaborador é alcançado pelo texto da atuação, exatamente como na versão
  // em memória acima.
  const porAreaDeAtuacao = and(
    eq(perfisProfissionais.tipoPrestador, 'colaborador'),
    or(
      ...definicao.termos.map(
        (termo) =>
          sql`(${perfisProfissionais.areasAtuacao}::text ilike ${`%${termo}%`} or ${perfisProfissionais.especialidades}::text ilike ${`%${termo}%`})`,
      ),
    ),
  )

  return and(
    eq(usuarios.status, 'ativo'),
    condicaoContaVerificada(),
    condicaoPrestadorHabilitado(),
    or(porCategoriaDeclarada, porAreaDeAtuacao),
  ) as SQL
}
