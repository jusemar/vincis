import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { parceiroRecebimentos } from '@/db/schema'
import {
  mascararChavePix,
  tipoChaveValido,
  type TipoChavePix,
} from '../constants/recebimento'

export type RecebimentoDoParceiro = {
  metodo: string
  tipoChave: TipoChavePix
  /** Já mascarada. O valor inteiro não sai desta consulta. */
  chaveMascarada: string
  titular: string
  atualizadoEm: Date
}

/**
 * Os dados de recebimento de um parceiro, prontos para a tela dele.
 *
 * A chave sai **mascarada**. Quem abre a página de configurações precisa
 * reconhecer a própria chave, não relê-la inteira — e uma tela que exibe o
 * valor completo por padrão o expõe a qualquer pessoa que passe pela mesa.
 * Editar não precisa do valor antigo: quem troca a chave digita a nova.
 *
 * O valor inteiro só é lido onde há motivo para pagar: o retrato congelado no
 * saque, que o Gestor abre para transferir.
 */
export async function obterRecebimentoDoParceiro(
  parceiroId: string,
): Promise<RecebimentoDoParceiro | null> {
  const [linha] = await db
    .select({
      metodo: parceiroRecebimentos.metodo,
      tipoChave: parceiroRecebimentos.tipoChave,
      chave: parceiroRecebimentos.chave,
      titular: parceiroRecebimentos.titular,
      atualizadoEm: parceiroRecebimentos.updatedAt,
    })
    .from(parceiroRecebimentos)
    .where(eq(parceiroRecebimentos.parceiroId, parceiroId))
    .limit(1)

  if (!linha || !tipoChaveValido(linha.tipoChave)) return null

  return {
    metodo: linha.metodo,
    tipoChave: linha.tipoChave,
    chaveMascarada: mascararChavePix(linha.tipoChave, linha.chave),
    titular: linha.titular,
    atualizadoEm: linha.atualizadoEm,
  }
}
