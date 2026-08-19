import { alias } from 'drizzle-orm/pg-core'
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  clientes,
  colaboracoesCliente,
  empresas,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import {
  condicaoAcessoInternoCliente,
  listarEmpresasAdministradas,
} from '../lib/acesso-cliente'

const remetente = alias(usuarios, 'remetente_colaboracao')
const destinatario = alias(usuarios, 'destinatario_colaboracao')
const perfilDestinatario = alias(perfisProfissionais, 'perfil_destinatario')
const perfilRemetente = alias(perfisProfissionais, 'perfil_remetente')

const colunas = {
  id: colaboracoesCliente.id,
  status: colaboracoesCliente.status,
  escopo: colaboracoesCliente.escopo,
  servicoId: colaboracoesCliente.servicoId,
  origem: colaboracoesCliente.origem,
  expiraEm: colaboracoesCliente.expiraEm,
  respondidoEm: colaboracoesCliente.respondidoEm,
  revogadoEm: colaboracoesCliente.revogadoEm,
  createdAt: colaboracoesCliente.createdAt,
  clienteId: clientes.id,
  clienteNome: clientes.nome,
  clienteCodigo: clientes.codigo,
  empresaOrigemNome: empresas.nome,
  remetenteId: remetente.id,
  remetenteNome: remetente.nome,
  remetenteEmail: remetente.email,
  remetenteProfissao: perfilRemetente.tipoProfissional,
  destinatarioId: destinatario.id,
  destinatarioNome: destinatario.nome,
  destinatarioEmail: destinatario.email,
  destinatarioProfissao: perfilDestinatario.tipoProfissional,
}

function consultaBase() {
  return db
    .select(colunas)
    .from(colaboracoesCliente)
    .innerJoin(clientes, eq(clientes.id, colaboracoesCliente.clienteId))
    .innerJoin(remetente, eq(remetente.id, colaboracoesCliente.remetenteId))
    .innerJoin(
      destinatario,
      eq(destinatario.id, colaboracoesCliente.destinatarioId),
    )
    .leftJoin(empresas, eq(empresas.id, colaboracoesCliente.empresaOrigemId))
    .leftJoin(perfilRemetente, eq(perfilRemetente.usuarioId, remetente.id))
    .leftJoin(
      perfilDestinatario,
      eq(perfilDestinatario.usuarioId, destinatario.id),
    )
}

export type ColaboracaoCliente = Awaited<
  ReturnType<typeof listarColaboracoesRecebidas>
>[number]

/** Colaborações em que o usuário é o convidado. */
export async function listarColaboracoesRecebidas(usuarioId: string) {
  return consultaBase()
    .where(eq(colaboracoesCliente.destinatarioId, usuarioId))
    .orderBy(desc(colaboracoesCliente.createdAt))
}

/**
 * Colaborações concedidas em clientes sob responsabilidade interna do usuário.
 * Inclui as que ele mesmo enviou e as enviadas por outros membros nos clientes
 * que ele administra, para que a revogação seja possível pela gestão.
 */
export async function listarColaboracoesConcedidas(usuarioId: string) {
  const empresasAdministradas = await listarEmpresasAdministradas(usuarioId)

  return consultaBase()
    .where(
      or(
        eq(colaboracoesCliente.remetenteId, usuarioId),
        condicaoAcessoInternoCliente(usuarioId, empresasAdministradas),
      ),
    )
    .orderBy(desc(colaboracoesCliente.createdAt))
}

/**
 * Clientes em que o usuário pode conceder colaboração externa.
 *
 * Acesso interno e permissão de compartilhar coincidem na matriz
 * (`PERMISSOES_POR_NIVEL`): os três níveis internos compartilham, o colaborador
 * externo não. Por isso a condição reaproveitada é a de acesso interno.
 */
export async function listarClientesParaColaboracao(usuarioId: string) {
  const empresasAdministradas = await listarEmpresasAdministradas(usuarioId)

  return db
    .select({
      id: clientes.id,
      codigo: clientes.codigo,
      nome: clientes.nome,
      empresaId: clientes.empresaId,
    })
    .from(clientes)
    .where(
      and(
        condicaoAcessoInternoCliente(usuarioId, empresasAdministradas),
        isNull(clientes.arquivadoEm),
      ),
    )
    .orderBy(clientes.nome)
}

/** Colaborações vivas (pendentes ou aceitas e não revogadas) de um cliente. */
export async function listarColaboracoesVivasDoCliente(clienteId: string) {
  return consultaBase().where(
    and(
      eq(colaboracoesCliente.clienteId, clienteId),
      sql`${colaboracoesCliente.status} in ('pendente', 'aceito')`,
      isNull(colaboracoesCliente.revogadoEm),
    ),
  )
}
