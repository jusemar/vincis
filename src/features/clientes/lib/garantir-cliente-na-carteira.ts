import { and, eq } from 'drizzle-orm'
import { clientes, usuarios } from '@/db/schema'
import type { ExecutorDb } from '@/features/atendimentos/lib/executor'
import type { AREAS_CLIENTE } from '../schemas/cliente'

/**
 * Liga a conta do Cliente à carteira daquele prestador.
 *
 * A busca é por `usuario_id` — referência explícita —, nunca por e-mail ou
 * telefone: casar por contato juntaria pessoas diferentes em silêncio. Se o
 * prestador já tem esse cliente na carteira, reaproveita; senão cria uma vez.
 *
 * Fica fora de `features/servicos` porque agora existem **duas** portas de
 * entrada para a carteira: a contratação de um serviço do catálogo e o acordo
 * fechado numa oportunidade pública. Duplicar a função faria as duas divergirem
 * — e a divergência apareceria como o mesmo Cliente duas vezes na carteira.
 */
export async function garantirClienteNaCarteira(
  tx: ExecutorDb,
  {
    prestadorId,
    clienteUsuarioId,
    /**
     * Área do registro na carteira, do vocabulário de `AREAS_CLIENTE`.
     *
     * O padrão `contabil` é o que a contratação de serviço sempre gravou e fica
     * como está — mudá-lo agora reescreveria o significado de registros antigos.
     * O acordo de uma oportunidade jurídica passa `juridico`, que é o dado
     * verdadeiro daquele vínculo.
     */
    area = 'contabil',
  }: {
    prestadorId: string
    clienteUsuarioId: string
    area?: (typeof AREAS_CLIENTE)[number]
  },
) {
  const [existente] = await tx
    .select({ id: clientes.id })
    .from(clientes)
    .where(
      and(
        eq(clientes.profissionalId, prestadorId),
        eq(clientes.usuarioId, clienteUsuarioId),
      ),
    )
    .limit(1)

  if (existente) return existente.id

  const [conta] = await tx
    .select({
      nome: usuarios.nome,
      email: usuarios.email,
      whatsapp: usuarios.whatsapp,
      empresaId: usuarios.empresaId,
    })
    .from(usuarios)
    .where(eq(usuarios.id, clienteUsuarioId))
    .limit(1)

  const [prestador] = await tx
    .select({ empresaId: usuarios.empresaId })
    .from(usuarios)
    .where(eq(usuarios.id, prestadorId))
    .limit(1)

  const [criado] = await tx
    .insert(clientes)
    .values({
      profissionalId: prestadorId,
      usuarioId: clienteUsuarioId,
      empresaId: prestador?.empresaId ?? null,
      nome: conta.nome,
      email: conta.email,
      telefone: conta.whatsapp ?? '',
      area,
      status: 'ativo',
      tipoAtendimento: 'avulso',
      valorReferenciaCentavos: 0,
    })
    .returning({ id: clientes.id })

  return criado.id
}
