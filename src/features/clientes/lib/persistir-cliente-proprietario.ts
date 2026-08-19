import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { clientes } from '@/db/schema'
import {
  permissoesCliente,
  type AcessoCliente,
} from './acesso-cliente'
import {
  converterValorParaCentavos,
  type ClienteValidado,
} from '../schemas/cliente'

/**
 * Escrita de cliente.
 *
 * Estas funções recebem o acesso já resolvido por `resolverAcessoCliente` e
 * consultam a matriz `PERMISSOES_POR_NIVEL`. Antes cada uma carregava o próprio
 * `where` de autorização — inclusive uma cópia literal do SQL de acesso, que
 * ficou defasada quando a regra mudou. Agora existe uma regra só.
 */

export async function atualizarClienteDoProfissional(
  acesso: AcessoCliente,
  valor: ClienteValidado,
) {
  if (!permissoesCliente(acesso).editar) return null

  const [atualizado] = await db
    .update(clientes)
    .set({
      nome: valor.nome,
      email: valor.email.toLowerCase(),
      telefone: valor.telefone,
      empresaNome: valor.empresaNome || null,
      area: valor.area,
      status: valor.status,
      tipoAtendimento: valor.area === 'juridico' ? 'mensal' : valor.tipoAtendimento,
      valorReferenciaCentavos:
        valor.area === 'juridico'
          ? 0
          : converterValorParaCentavos(valor.valorReferencia),
      observacoes: valor.observacoes || null,
      cep: valor.cep,
      logradouro: valor.logradouro,
      numero: valor.numero,
      complemento: valor.complemento || null,
      bairro: valor.bairro,
      cidade: valor.cidade,
      estado: valor.estado,
      updatedAt: new Date(),
    })
    // Cliente arquivado não é editado: primeiro restaura-se, depois altera-se.
    .where(and(eq(clientes.id, acesso.clienteId), isNull(clientes.arquivadoEm)))
    .returning({ id: clientes.id })

  return atualizado ?? null
}

export async function arquivarClienteDoProfissional(acesso: AcessoCliente) {
  if (!permissoesCliente(acesso).arquivar) return null

  const agora = new Date()
  const [arquivado] = await db
    .update(clientes)
    .set({ status: 'inativo', arquivadoEm: agora, updatedAt: agora })
    .where(and(eq(clientes.id, acesso.clienteId), isNull(clientes.arquivadoEm)))
    .returning({ id: clientes.id })

  return arquivado ?? null
}

export async function restaurarClienteDoProfissional(acesso: AcessoCliente) {
  if (!permissoesCliente(acesso).restaurar) return null

  const [restaurado] = await db
    .update(clientes)
    .set({
      status: 'ativo',
      arquivadoEm: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(clientes.id, acesso.clienteId), isNotNull(clientes.arquivadoEm)),
    )
    .returning({ id: clientes.id })

  return restaurado ?? null
}
