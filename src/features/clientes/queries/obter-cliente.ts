import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { clientes, usuarios } from '@/db/schema'
import {
  colunaNivelAcesso,
  condicaoAcessoCliente,
  listarEmpresasAdministradas,
  permissoesDoNivel,
} from '../lib/acesso-cliente'

/**
 * Detalhe do cliente pelo id. Usa exatamente o mesmo predicado da listagem —
 * é isto que impede que um id copiado à mão alcance um cliente que não aparece
 * na lista.
 */
export async function obterClienteDoProfissional(
  profissionalId: string,
  clienteId: string,
) {
  const empresasAdministradas = await listarEmpresasAdministradas(profissionalId)
  const [cliente] = await db
    .select({
      id: clientes.id,
      codigo: clientes.codigo,
      profissionalId: clientes.profissionalId,
      empresaId: clientes.empresaId,
      nome: clientes.nome,
      email: clientes.email,
      telefone: clientes.telefone,
      empresaNome: clientes.empresaNome,
      area: clientes.area,
      status: clientes.status,
      tipoAtendimento: clientes.tipoAtendimento,
      valorReferenciaCentavos: clientes.valorReferenciaCentavos,
      observacoes: clientes.observacoes,
      cep: clientes.cep,
      logradouro: clientes.logradouro,
      numero: clientes.numero,
      complemento: clientes.complemento,
      bairro: clientes.bairro,
      cidade: clientes.cidade,
      estado: clientes.estado,
      arquivadoEm: clientes.arquivadoEm,
      createdAt: clientes.createdAt,
      updatedAt: clientes.updatedAt,
      responsavelNome: usuarios.nome,
      nivelAcesso: colunaNivelAcesso(profissionalId, empresasAdministradas),
    })
    .from(clientes)
    .innerJoin(usuarios, eq(usuarios.id, clientes.profissionalId))
    .where(
      and(
        eq(clientes.id, clienteId),
        condicaoAcessoCliente(profissionalId, empresasAdministradas),
      ),
    )
    .limit(1)

  if (!cliente) return null

  return { ...cliente, permissoes: permissoesDoNivel(cliente.nivelAcesso) }
}
