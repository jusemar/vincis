import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { configuracoesPlataforma } from '@/db/schema'
import {
  CHAVE_PRAZO_OPORTUNIDADE,
  lerNumero,
  type ChaveConfiguracao,
} from '../lib/configuracoes'

/** Valor bruto guardado, ou `null` quando a Gestão nunca definiu. */
export async function obterConfiguracao(chave: ChaveConfiguracao) {
  const [linha] = await db
    .select({ valor: configuracoesPlataforma.valor })
    .from(configuracoesPlataforma)
    .where(eq(configuracoesPlataforma.chave, chave))
    .limit(1)
  return linha?.valor ?? null
}

/**
 * Prazo global da oportunidade, em horas.
 *
 * Ponto único de leitura: nenhum lugar do domínio conhece "48". Quem precisa do
 * prazo pergunta aqui, e a resposta reflete o que a Gestão configurou.
 */
export async function obterPrazoOportunidadeHoras() {
  return lerNumero(
    CHAVE_PRAZO_OPORTUNIDADE,
    await obterConfiguracao(CHAVE_PRAZO_OPORTUNIDADE),
  )
}
