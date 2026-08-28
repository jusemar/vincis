import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  oportunidadePropostas,
  oportunidades,
  perfisProfissionais,
} from '@/db/schema'
import { prestadorHabilitado } from '@/features/usuarios/lib/prestador'
import { ehPrivada, type CategoriaOportunidade } from '../constants/oportunidade'
import { categoriasCompativeisDoPrestador } from './compatibilidade'
import { oportunidadeExpirada } from './vigencia'

export type VinculoOportunidade = 'cliente' | 'prestador'

/**
 * Quem pode olhar uma oportunidade, e em que qualidade.
 *
 * Um lugar só, porque vários caminhos precisam da mesma resposta: a vitrine do
 * prestador, a lista do Cliente, o download de um anexo, o "não tenho
 * interesse". Se o download tivesse regra própria, bastaria conhecer o id de um
 * arquivo para ler o anexo de uma solicitação que a pessoa não alcança — que é
 * exatamente a forma mais comum de IDOR.
 *
 * Duas portas, e só duas:
 *
 * - **cliente**: é o dono da solicitação;
 * - **prestador**: está habilitado a operar **e** a categoria da solicitação é
 *   compatível com o cadastro dele. Conhecer o id não basta, e a compatibilidade
 *   é a mesma função que decide a difusão — um contador não alcança uma
 *   solicitação exclusivamente jurídica por UI, por URL, por Server Action nem
 *   por chamada direta, porque todas passam por aqui.
 *
 * ## Solicitação privada: a categoria deixa de bastar
 *
 * Numa solicitação dirigida a um Profissional, compatibilidade é condição
 * necessária e **não** suficiente: o prestador precisa ser aquele destinatário.
 * Outro contador, igualmente compatível e igualmente habilitado, não entra —
 * nem na vitrine, nem no download de anexo, nem no "não tenho interesse", nem
 * no envio de proposta, porque todos esses caminhos perguntam aqui. Trocar o
 * `destinatario_id` no payload não ajuda: a coluna é lida do banco, não da
 * requisição.
 *
 * ## Fechado o acordo, os concorrentes saem
 *
 * Compatibilidade abre a porta enquanto a solicitação está **disputável**.
 * Depois que existe acordo (ou que o prazo venceu), quem não fechou perde o
 * acesso: a solicitação sai da vitrine dele e os anexos que o Cliente enviou
 * deixam de ser alcançáveis. Só continua entrando quem tem a proposta aceita —
 * e esse acesso é o que sustenta a leitura do próprio acordo.
 *
 * Nenhuma informação sobre **quem** venceu, por quanto ou se foi pago chega ao
 * concorrente: para ele a solicitação simplesmente deixa de existir.
 */
export async function obterVinculoComOportunidade(
  oportunidadeId: string,
  usuarioId: string,
): Promise<VinculoOportunidade | null> {
  const [oportunidade] = await db
    .select({
      categoria: oportunidades.categoria,
      clienteUsuarioId: oportunidades.clienteUsuarioId,
      status: oportunidades.status,
      expiraEm: oportunidades.expiraEm,
      visibilidade: oportunidades.visibilidade,
      destinatarioId: oportunidades.destinatarioId,
    })
    .from(oportunidades)
    .where(eq(oportunidades.id, oportunidadeId))
    .limit(1)

  if (!oportunidade) return null
  if (oportunidade.clienteUsuarioId === usuarioId) return 'cliente'

  // Privada: só o escolhido segue adiante. A verificação vem antes de qualquer
  // consulta ao cadastro — quem não é o destinatário nem chega a ser avaliado.
  if (
    ehPrivada(oportunidade.visibilidade) &&
    oportunidade.destinatarioId !== usuarioId
  ) {
    return null
  }

  const [perfil] = await db
    .select({
      tipoPrestador: perfisProfissionais.tipoPrestador,
      tipoProfissional: perfisProfissionais.tipoProfissional,
      statusAnalise: perfisProfissionais.statusAnalise,
      areasAtuacao: perfisProfissionais.areasAtuacao,
      especialidades: perfisProfissionais.especialidades,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, usuarioId))
    .limit(1)

  if (!prestadorHabilitado(perfil ?? null)) return null
  if (
    !categoriasCompativeisDoPrestador(perfil ?? null).includes(
      oportunidade.categoria as CategoriaOportunidade,
    )
  ) {
    return null
  }

  const disputavel =
    oportunidade.status === 'aberta' && !oportunidadeExpirada(oportunidade)
  if (disputavel) return 'prestador'

  // Encerrada, expirada ou cancelada: só quem fechou o acordo continua dentro.
  return (await venceuADisputa(oportunidadeId, usuarioId)) ? 'prestador' : null
}

/** O prestador tem a proposta aceita desta oportunidade? */
async function venceuADisputa(oportunidadeId: string, prestadorId: string) {
  const [proposta] = await db
    .select({ id: oportunidadePropostas.id })
    .from(oportunidadePropostas)
    .where(
      and(
        eq(oportunidadePropostas.oportunidadeId, oportunidadeId),
        eq(oportunidadePropostas.prestadorId, prestadorId),
        eq(oportunidadePropostas.status, 'aceita'),
      ),
    )
    .limit(1)

  return Boolean(proposta)
}
