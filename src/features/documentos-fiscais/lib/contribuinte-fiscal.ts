import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { clientes, empresas } from '@/db/schema'
import { lerIdentidadeFiscal, type IdentidadeFiscal } from './identidade-fiscal'

/**
 * Quem é o contribuinte de um documento fiscal, do ponto de vista do cadastro.
 *
 * Com `clienteId`, é o cliente atendido; sem ele, o próprio escritório — a mesma
 * regra que decide a perspectiva do documento desde a fundação. Só o cadastro
 * responde: nada é inferido de nome, e-mail ou telefone, e nenhum serviço
 * externo é consultado.
 *
 * `null` significa "cadastro sem identidade fiscal": o documento é importado
 * normalmente e fica `nao_determinado`, até alguém preencher o CNPJ/CPF.
 */
export async function resolverContribuinteFiscal(
  empresaId: string,
  clienteId: string | null,
): Promise<IdentidadeFiscal | null> {
  if (clienteId) {
    const [cliente] = await db
      .select({
        identificacao: clientes.identificacaoFiscal,
        tipo: clientes.tipoIdentificacaoFiscal,
      })
      .from(clientes)
      .where(eq(clientes.id, clienteId))
      .limit(1)
    return cliente ? lerIdentidadeFiscal(cliente) : null
  }

  const [empresa] = await db
    .select({
      identificacao: empresas.identificacaoFiscal,
      tipo: empresas.tipoIdentificacaoFiscal,
    })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1)
  return empresa ? lerIdentidadeFiscal(empresa) : null
}
