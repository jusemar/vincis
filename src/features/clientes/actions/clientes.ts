'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { clientes } from '@/db/schema'
import {
  SEM_AUTORIZACAO,
  SEM_AUTORIZACAO_COM_DADOS,
  semPermissaoPara,
} from '@/features/usuarios/constants/autorizacao'
import { obterPrestadorClientes } from '../lib/obter-prestador-clientes'
import {
  permissoesCliente,
  resolverAcessoCliente,
  type AcessoCliente,
  type PermissoesCliente,
} from '../lib/acesso-cliente'
import {
  arquivarClienteDoProfissional,
  atualizarClienteDoProfissional,
  restaurarClienteDoProfissional,
} from '../lib/persistir-cliente-proprietario'
import {
  ClienteIdSchema,
  ClienteSchema,
  FiltrosClientesSchema,
  converterValorParaCentavos,
  type ClienteDTO,
  type FiltrosClientesDTO,
} from '../schemas/cliente'
import {
  contarClientesAtivosProfissional,
  listarClientesProfissional,
} from '../queries/listar-clientes'
import { obterClienteDoProfissional } from '../queries/obter-cliente'

const NAO_ENCONTRADO = {
  sucesso: false as const,
  mensagem: 'Cliente não encontrado.',
}

/**
 * Porta comum de toda ação sobre um cliente específico.
 *
 * Resolve a sessão, valida o id e devolve o acesso real com as permissões já
 * calculadas. Distinguir "não existe" de "existe mas não é seu" é intencional:
 * mascarar recusa de permissão como "não encontrado" escondia o motivo real de
 * cada falha e dificultava a auditoria.
 */
async function abrirCliente(clienteId: string): Promise<
  | { ok: true; usuarioId: string; acesso: AcessoCliente; permissoes: PermissoesCliente }
  | { ok: false; resposta: { sucesso: false; mensagem: string } }
> {
  const prestador = await obterPrestadorClientes()
  const id = ClienteIdSchema.safeParse(clienteId)
  if (!prestador || !id.success) return { ok: false, resposta: SEM_AUTORIZACAO }

  const acesso = await resolverAcessoCliente(prestador.usuarioId, id.data)
  if (!acesso) return { ok: false, resposta: NAO_ENCONTRADO }

  return {
    ok: true,
    usuarioId: prestador.usuarioId,
    acesso,
    permissoes: permissoesCliente(acesso),
  }
}

export async function listarMeusClientes(filtros: FiltrosClientesDTO = {}) {
  const prestador = await obterPrestadorClientes()
  if (!prestador) return SEM_AUTORIZACAO_COM_DADOS

  const validacao = FiltrosClientesSchema.safeParse(filtros)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: 'Filtros inválidos.',
      dados: null,
    }
  }

  return {
    sucesso: true as const,
    mensagem: 'Clientes carregados.',
    dados: await listarClientesProfissional(
      prestador.usuarioId,
      validacao.data,
    ),
  }
}

export async function obterMeuCliente(clienteId: string) {
  const prestador = await obterPrestadorClientes()
  const id = ClienteIdSchema.safeParse(clienteId)
  if (!prestador || !id.success) return SEM_AUTORIZACAO_COM_DADOS

  // A consulta usa o mesmo predicado da listagem: um id copiado à mão não
  // alcança nada que a lista já não mostrasse.
  const cliente = await obterClienteDoProfissional(prestador.usuarioId, id.data)
  if (!cliente) return { ...NAO_ENCONTRADO, dados: null }

  return { sucesso: true as const, mensagem: 'Cliente encontrado.', dados: cliente }
}

export async function criarCliente(dados: ClienteDTO) {
  const prestador = await obterPrestadorClientes()
  if (!prestador) return SEM_AUTORIZACAO

  const validacao = ClienteSchema.safeParse(dados)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem:
        validacao.error.issues[0]?.message ?? 'Revise os dados do cliente.',
      erros: validacao.error.flatten().fieldErrors,
    }
  }

  const valor = validacao.data
  // Todo prestador habilitado pode ter clientes próprios — Profissional e
  // Colaborador, atuando sozinhos ou dentro de um escritório.
  await db.insert(clientes).values({
    profissionalId: prestador.usuarioId,
    empresaId: prestador.empresaId,
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
  })

  revalidatePath('/admin')
  return {
    sucesso: true as const,
    mensagem: 'Cliente cadastrado com sucesso.',
    erros: undefined,
  }
}

export async function atualizarCliente(clienteId: string, dados: ClienteDTO) {
  const aberto = await abrirCliente(clienteId)
  if (!aberto.ok) return { ...aberto.resposta, erros: undefined }
  if (!aberto.permissoes.editar) {
    return { ...semPermissaoPara('editar este cliente'), erros: undefined }
  }

  const validacao = ClienteSchema.safeParse(dados)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem:
        validacao.error.issues[0]?.message ?? 'Revise os dados do cliente.',
      erros: validacao.error.flatten().fieldErrors,
    }
  }

  const atualizado = await atualizarClienteDoProfissional(
    aberto.acesso,
    validacao.data,
  )

  if (!atualizado) {
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível atualizar: o cliente está arquivado.',
      erros: undefined,
    }
  }

  revalidatePath('/admin')
  return {
    sucesso: true as const,
    mensagem: 'Cliente atualizado com sucesso.',
    erros: undefined,
  }
}

export async function arquivarCliente(clienteId: string) {
  const aberto = await abrirCliente(clienteId)
  if (!aberto.ok) return aberto.resposta
  if (!aberto.permissoes.arquivar) {
    return semPermissaoPara('arquivar este cliente')
  }

  const arquivado = await arquivarClienteDoProfissional(aberto.acesso)
  if (!arquivado) {
    return { sucesso: false as const, mensagem: 'Este cliente já está arquivado.' }
  }

  revalidatePath('/admin')
  return { sucesso: true as const, mensagem: 'Cliente arquivado com segurança.' }
}

export async function contarMeusClientesAtivos() {
  const prestador = await obterPrestadorClientes()
  if (!prestador) return 0
  return contarClientesAtivosProfissional(prestador.usuarioId)
}

export async function restaurarCliente(clienteId: string) {
  const aberto = await abrirCliente(clienteId)
  if (!aberto.ok) return aberto.resposta
  if (!aberto.permissoes.restaurar) {
    return semPermissaoPara('restaurar este cliente')
  }

  const restaurado = await restaurarClienteDoProfissional(aberto.acesso)
  if (!restaurado) {
    return { sucesso: false as const, mensagem: 'Este cliente não está arquivado.' }
  }

  revalidatePath('/admin')
  return { sucesso: true as const, mensagem: 'Cliente restaurado com sucesso.' }
}
