import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { oportunidadeArquivos } from '@/db/schema'
import { obterVinculoComOportunidade } from '../lib/autorizacao'

/**
 * Um anexo da oportunidade, já com o acesso conferido.
 *
 * Duas conferências, não uma: a pessoa precisa ter vínculo com a oportunidade
 * **e** o arquivo precisa pertencer àquela oportunidade. Sem a segunda, trocar
 * o id do arquivo na URL leria o anexo de outra solicitação a partir de uma
 * solicitação legítima.
 */
export async function obterArquivoDaOportunidade({
  oportunidadeId,
  arquivoId,
  usuarioId,
}: {
  oportunidadeId: string
  arquivoId: string
  usuarioId: string
}) {
  const vinculo = await obterVinculoComOportunidade(oportunidadeId, usuarioId)
  if (!vinculo) return null

  const [arquivo] = await db
    .select({
      chave: oportunidadeArquivos.chave,
      nome: oportunidadeArquivos.nome,
      tipoMime: oportunidadeArquivos.tipoMime,
    })
    .from(oportunidadeArquivos)
    .where(
      and(
        eq(oportunidadeArquivos.id, arquivoId),
        eq(oportunidadeArquivos.oportunidadeId, oportunidadeId),
      ),
    )
    .limit(1)

  return arquivo ?? null
}
