import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { perfisProfissionais, usuarios } from '@/db/schema'
import { condicaoPrestadorHabilitado } from '@/features/usuarios/lib/prestador'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'

export type DestinoProfissional = {
  /** O identificador que a URL do perfil já usa. Não aparece na interface. */
  prestadorId: string
  nome: string
  codigoPublico: string
}

/**
 * Os profissionais que o parceiro pode escolher como destino do link.
 *
 * Os mesmos critérios da busca pública — conta ativa, verificada e prestador
 * habilitado. Divulgar quem a plataforma não mostra levaria a pessoa indicada a
 * um perfil que ela não deveria alcançar, e a culpa cairia no parceiro.
 *
 * Sai o nome e o código público; o `prestadorId` vai junto porque é ele que a
 * URL do perfil já usa há muito tempo, mas nenhuma tela o exibe — quem o
 * parceiro lê para conferir a pessoa é o `PRO-XXXXXX`.
 *
 * Sem código público a linha fica de fora: é cadastro anterior à coluna, e um
 * item de lista sem identificador conferível convida a escolher a pessoa errada.
 */
export async function listarDestinosProfissionais(): Promise<
  DestinoProfissional[]
> {
  const linhas = await db
    .select({
      prestadorId: perfisProfissionais.usuarioId,
      nome: usuarios.nome,
      codigoPublico: perfisProfissionais.codigoPublico,
    })
    .from(perfisProfissionais)
    .innerJoin(usuarios, eq(usuarios.id, perfisProfissionais.usuarioId))
    .where(
      and(
        eq(usuarios.status, 'ativo'),
        condicaoContaVerificada(),
        condicaoPrestadorHabilitado(),
        isNotNull(perfisProfissionais.codigoPublico),
      ),
    )
    .orderBy(asc(usuarios.nome))

  return linhas.filter(
    (linha): linha is DestinoProfissional => linha.codigoPublico !== null,
  )
}
