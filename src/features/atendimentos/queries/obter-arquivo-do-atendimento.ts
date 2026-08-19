import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentoArquivos } from '@/db/schema'
import { obterAcessoAtendimento } from '../lib/autorizacao'

/**
 * Arquivo de um Atendimento, já com o acesso conferido.
 *
 * Duas conferências, não uma: a pessoa precisa ter vínculo com o Atendimento
 * **e** o arquivo precisa pertencer àquele Atendimento. Sem a segunda, trocar o
 * id do arquivo na URL leria o anexo de outro atendimento a partir de um
 * atendimento legítimo.
 */
export async function obterArquivoDoAtendimento({
  atendimentoId,
  arquivoId,
  usuarioId,
}: {
  atendimentoId: string
  arquivoId: string
  usuarioId: string
}) {
  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso) return null

  const [arquivo] = await db
    .select({
      chave: atendimentoArquivos.chave,
      nome: atendimentoArquivos.nome,
      tipoMime: atendimentoArquivos.tipoMime,
    })
    .from(atendimentoArquivos)
    .where(
      and(
        eq(atendimentoArquivos.id, arquivoId),
        eq(atendimentoArquivos.atendimentoId, atendimentoId),
      ),
    )
    .limit(1)

  return arquivo ?? null
}
