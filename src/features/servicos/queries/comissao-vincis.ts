import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { configuracoesPlataforma } from '@/db/schema'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import { CHAVE_COMISSAO_SERVICOS_AVULSOS, interpretarComissaoMilesimos } from '../constants/comissao'

/**
 * Comissão vigente da Vincis nos serviços avulsos, em milésimos.
 *
 * `null` quando a Gestão ainda não configurou (ou o valor guardado é
 * ilegível): quem lê **não** inventa padrão — recusa a cobrança.
 */
export async function lerComissaoServicosAvulsos(executor: ExecutorDb = db): Promise<number | null> {
  const [linha] = await executor
    .select({ valor: configuracoesPlataforma.valor })
    .from(configuracoesPlataforma)
    .where(eq(configuracoesPlataforma.chave, CHAVE_COMISSAO_SERVICOS_AVULSOS))
    .limit(1)
  return interpretarComissaoMilesimos(linha?.valor)
}
