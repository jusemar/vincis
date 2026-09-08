import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { parceiros } from '@/db/schema'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { baseDoSite, montarLinkDoParceiro, type LinkDoParceiro } from '../lib/link-de-indicacao'

export type ParceiroDaConta = {
  id: string
  codigo: string
  ativadoEm: Date
  link: LinkDoParceiro
}

/** O parceiro de uma conta, ou `null` se ela ainda não ativou. */
export async function obterParceiroDoUsuario(
  usuarioId: string,
): Promise<ParceiroDaConta | null> {
  const [linha] = await db
    .select({
      id: parceiros.id,
      codigo: parceiros.codigo,
      ativadoEm: parceiros.ativadoEm,
    })
    .from(parceiros)
    .where(eq(parceiros.usuarioId, usuarioId))
    .limit(1)

  if (!linha) return null
  return { ...linha, link: montarLinkDoParceiro(linha.codigo, baseDoSite()) }
}

/**
 * O parceiro de quem está pedindo.
 *
 * A identidade vem da sessão e de mais lugar nenhum — nenhuma rota desta área
 * aceita `usuarioId` como parâmetro, porque um identificador vindo do navegador
 * seria uma autorização escrita por quem está sendo autorizado.
 *
 * `cache` do React vale por requisição: o Dashboard e a seção "Meu link"
 * perguntam o mesmo, e a segunda pergunta não paga outra consulta. Nada é
 * compartilhado entre pessoas.
 */
export const obterParceiroDaSessao = cache(
  async (): Promise<ParceiroDaConta | null> => {
    const usuario = await obterSessaoServidor()
    if (!usuario) return null
    return obterParceiroDoUsuario(usuario.id)
  },
)
