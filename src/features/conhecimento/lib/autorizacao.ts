import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { ehFotoPublicaValida } from '@/features/profissionais/lib/vitrine-publica'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import { obterPrestadorSessao } from '@/features/usuarios/lib/obter-prestador-sessao'
import { condicaoPrestadorPublico } from '@/features/usuarios/lib/prestador'
import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'

/**
 * Portas de servidor da Central de Conhecimento. Toda action e toda query
 * privada passa por uma delas — esconder botão não protege nada.
 *
 * **Autor profissional**: prestador habilitado da sessão (`obterPrestadorSessao`
 * relê sessão e cadastro) com perfil público. Para **criar** e **enviar** o
 * artigo o perfil precisa estar na vitrine (foto, não ocultado): é o perfil
 * que o artigo vai exibir e linkar. Para continuar editando um rascunho basta
 * ser prestador público — ninguém perde o texto por ter trocado a foto.
 *
 * **Moderador**: só o Gestor da Plataforma (mesma porta do CMS).
 */

export type AutorSessao = {
  usuarioId: string
  nome: string
  /** Perfil na vitrine (foto, não ocultado): pode criar e enviar artigos. */
  elegivelParaPublicar: boolean
}

export async function obterAutorDaSessao(): Promise<AutorSessao | null> {
  const prestador = await obterPrestadorSessao()
  if (!prestador) return null

  const [linha] = await db
    .select({
      identidadePublica: usuarios.identidadePublica,
      avatarUrl: perfisProfissionais.avatarUrl,
      fotoDestaqueUrl: perfisProfissionais.fotoDestaqueUrl,
      ocultoVitrineEm: perfisProfissionais.ocultoVitrineEm,
    })
    .from(usuarios)
    .innerJoin(perfisProfissionais, eq(perfisProfissionais.usuarioId, usuarios.id))
    .where(
      and(
        eq(usuarios.id, prestador.usuarioId),
        eq(usuarios.status, 'ativo'),
        condicaoContaVerificada(),
        condicaoPrestadorPublico(),
      ),
    )
    .limit(1)
  if (!linha) return null

  /*
    Pode criar/enviar quem tem foto pública e não foi ocultado. Para a
    identidade `pessoal` isso é exatamente estar na vitrine; a equipe Vincis
    (Gestor que também opera como prestador) fica fora da vitrine por regra,
    mas continua podendo escrever — e assina como equipe, não pelo cadastro.
  */
  const temFoto = ehFotoPublicaValida(linha.avatarUrl) || ehFotoPublicaValida(linha.fotoDestaqueUrl)
  return {
    usuarioId: prestador.usuarioId,
    nome: prestador.nome,
    elegivelParaPublicar: temFoto && !linha.ocultoVitrineEm,
  }
}

export const MENSAGEM_AUTOR_INELEGIVEL =
  'Para publicar artigos, seu perfil público precisa estar completo e visível na busca (com foto ou logotipo).'

export async function obterModeradorDaSessao() {
  return validarGestorVincis()
}
