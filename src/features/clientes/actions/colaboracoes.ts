'use server'

import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import {
  clienteAtribuicoes,
  colaboracoesCliente,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { pesquisarProfissionaisReais } from '@/features/profissionais/queries/pesquisar-profissionais'
import { condicaoPrestadorHabilitado } from '@/features/usuarios/lib/prestador'
import { condicaoContaVerificada } from '@/features/usuarios/lib/condicao-verificacao'
import {
  SEM_AUTORIZACAO,
  SEM_AUTORIZACAO_COM_DADOS,
} from '@/features/usuarios/constants/autorizacao'
import { obterPrestadorClientes } from '../lib/obter-prestador-clientes'
import {
  podeConvidarColaborador,
  podeRevogarColaboracao,
  resolverAcessoCliente,
} from '../lib/acesso-cliente'
import {
  DIAS_VALIDADE_COLABORACAO,
  EnviarColaboracaoSchema,
  PesquisaColaboradorSchema,
  ResponderColaboracaoSchema,
  RevogarColaboracaoSchema,
} from '../schemas/colaboracao'
import {
  listarClientesParaColaboracao,
  listarColaboracoesConcedidas,
  listarColaboracoesRecebidas,
} from '../queries/colaboracoes'


/** Carrega tudo que a área de colaborações externas precisa exibir. */
export async function carregarColaboracoes() {
  const profissional = await obterPrestadorClientes()
  if (!profissional) return SEM_AUTORIZACAO_COM_DADOS

  const [recebidas, concedidas, clientesDisponiveis] = await Promise.all([
    listarColaboracoesRecebidas(profissional.usuarioId),
    listarColaboracoesConcedidas(profissional.usuarioId),
    listarClientesParaColaboracao(profissional.usuarioId),
  ])

  return {
    sucesso: true as const,
    mensagem: 'Colaborações carregadas.',
    dados: { recebidas, concedidas, clientesDisponiveis },
  }
}

/**
 * Pesquisa profissionais aprovados que podem receber convite de colaboração no
 * cliente informado. Exige acesso interno ao cliente — a listagem já é uma
 * informação sobre o cliente.
 */
export async function pesquisarProfissionaisColaboracao(entrada: unknown) {
  const profissional = await obterPrestadorClientes()
  if (!profissional) return SEM_AUTORIZACAO_COM_DADOS

  const validacao = PesquisaColaboradorSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Busca inválida.',
      dados: null,
    }
  }

  const acesso = await resolverAcessoCliente(
    profissional.usuarioId,
    validacao.data.clienteId,
  )
  if (!acesso || !podeConvidarColaborador(acesso)) {
    return SEM_AUTORIZACAO_COM_DADOS
  }

  const pesquisa = await pesquisarProfissionaisReais({
    busca: validacao.data.busca,
    profissao: validacao.data.profissao,
    estado: validacao.data.estado,
    cidade: validacao.data.cidade,
    pagina: 1,
    porPagina: 20,
  })

  const candidatos = pesquisa.profissionais.filter(
    ({ id }) => id !== profissional.usuarioId && id !== acesso.proprietarioId,
  )
  if (!candidatos.length) {
    return { sucesso: true as const, mensagem: 'Pesquisa concluída.', dados: [] }
  }

  const ids = candidatos.map(({ id }) => id)
  const [atribuidos, colaboracoesVivas] = await Promise.all([
    db
      .select({ profissionalId: clienteAtribuicoes.profissionalId })
      .from(clienteAtribuicoes)
      .where(
        and(
          eq(clienteAtribuicoes.clienteId, acesso.clienteId),
          inArray(clienteAtribuicoes.profissionalId, ids),
        ),
      ),
    db
      .select({
        destinatarioId: colaboracoesCliente.destinatarioId,
        status: colaboracoesCliente.status,
      })
      .from(colaboracoesCliente)
      .where(
        and(
          eq(colaboracoesCliente.clienteId, acesso.clienteId),
          sql`${colaboracoesCliente.status} in ('pendente', 'aceito')`,
          isNull(colaboracoesCliente.revogadoEm),
          inArray(colaboracoesCliente.destinatarioId, ids),
        ),
      ),
  ])

  const internos = new Set(atribuidos.map(({ profissionalId }) => profissionalId))
  const vivos = new Map(
    colaboracoesVivas.map(({ destinatarioId, status }) => [destinatarioId, status]),
  )

  return {
    sucesso: true as const,
    mensagem: 'Pesquisa concluída.',
    dados: candidatos.map((item) => ({
      usuarioId: item.id,
      nome: item.nome,
      avatarUrl: item.avatarUrl,
      tipoProfissional: item.profissao,
      cidade: item.cidade,
      estado: item.estado,
      formacao: item.formacao,
      numeroRegistro: item.numeroRegistro,
      especialidades: item.especialidades,
      situacao: internos.has(item.id)
        ? ('interno' as const)
        : vivos.get(item.id) === 'aceito'
          ? ('colaborando' as const)
          : vivos.get(item.id) === 'pendente'
            ? ('convite_pendente' as const)
            : ('disponivel' as const),
    })),
  }
}

/**
 * Convite de colaboração: acesso pontual e revogável a um cliente.
 * Nunca cria vínculo em `empresa_membros`.
 */
export async function enviarConviteColaboracao(entrada: unknown) {
  const profissional = await obterPrestadorClientes()
  if (!profissional) return SEM_AUTORIZACAO

  const validacao = EnviarColaboracaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Convite inválido.',
    }
  }

  const { clienteId, destinatarioId, servicoId } = validacao.data
  if (destinatarioId === profissional.usuarioId) {
    return {
      sucesso: false as const,
      mensagem: 'Você não pode convidar a si mesmo.',
    }
  }

  const acesso = await resolverAcessoCliente(profissional.usuarioId, clienteId)
  if (!acesso || !podeConvidarColaborador(acesso)) {
    return {
      sucesso: false as const,
      mensagem: 'Você não pode compartilhar este cliente.',
    }
  }

  const acessoDestinatario = await resolverAcessoCliente(
    destinatarioId,
    clienteId,
  )
  if (acessoDestinatario && acessoDestinatario.nivel !== 'colaborador_externo') {
    return {
      sucesso: false as const,
      mensagem: 'Este profissional já possui acesso interno a este cliente.',
    }
  }

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from clientes where id = ${clienteId} for update`,
      )

      // Qualquer prestador habilitado pode receber ajuda pontual: o Profissional
      // com cadastro aprovado e o Colaborador com cadastro ativo. A colaboração
      // externa não confere habilitação nenhuma — só acesso ao cliente.
      const [destinatario] = await tx
        .select({ id: usuarios.id })
        .from(usuarios)
        .innerJoin(
          perfisProfissionais,
          eq(perfisProfissionais.usuarioId, usuarios.id),
        )
        .where(
          and(
            eq(usuarios.id, destinatarioId),
            eq(usuarios.status, 'ativo'),
            condicaoContaVerificada(),
            condicaoPrestadorHabilitado(),
          ),
        )
        .limit(1)

      if (!destinatario) {
        return {
          sucesso: false as const,
          mensagem: 'Prestador indisponível para colaboração.',
        }
      }

      const agora = new Date()
      // Convites pendentes vencidos deixam de ocupar o índice de unicidade.
      await tx
        .update(colaboracoesCliente)
        .set({ status: 'expirado', updatedAt: agora })
        .where(
          and(
            eq(colaboracoesCliente.clienteId, clienteId),
            eq(colaboracoesCliente.destinatarioId, destinatarioId),
            eq(colaboracoesCliente.status, 'pendente'),
            lte(colaboracoesCliente.expiraEm, agora),
          ),
        )

      const [colaboracao] = await tx
        .insert(colaboracoesCliente)
        .values({
          clienteId,
          servicoId: servicoId ?? null,
          escopo: servicoId ? 'servico' : 'cliente',
          origem: acesso.empresaId ? 'escritorio' : 'individual',
          empresaOrigemId: acesso.empresaId,
          remetenteId: profissional.usuarioId,
          destinatarioId,
          expiraEm: new Date(
            agora.getTime() + DIAS_VALIDADE_COLABORACAO * 24 * 60 * 60 * 1000,
          ),
        })
        .onConflictDoNothing()
        .returning({ id: colaboracoesCliente.id })

      if (!colaboracao) {
        return {
          sucesso: false as const,
          mensagem:
            'Já existe uma colaboração pendente ou ativa para este profissional neste cliente.',
        }
      }

      revalidatePath('/admin')
      return {
        sucesso: true as const,
        mensagem: 'Convite de colaboração enviado.',
      }
    })
  } catch {
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível enviar o convite de colaboração.',
    }
  }
}

/** Somente o convidado responde, e apenas ao convite destinado a ele. */
export async function responderConviteColaboracao(entrada: unknown) {
  const profissional = await obterPrestadorClientes()
  if (!profissional) return SEM_AUTORIZACAO

  const validacao = ResponderColaboracaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Resposta inválida.',
    }
  }

  return db.transaction(async (tx) => {
    const [colaboracao] = await tx
      .select()
      .from(colaboracoesCliente)
      .where(
        and(
          eq(colaboracoesCliente.id, validacao.data.colaboracaoId),
          eq(colaboracoesCliente.destinatarioId, profissional.usuarioId),
        ),
      )
      .for('update')
      .limit(1)

    if (!colaboracao) {
      return { sucesso: false as const, mensagem: 'Colaboração não encontrada.' }
    }

    if (colaboracao.status === 'revogado' || colaboracao.revogadoEm) {
      return { sucesso: false as const, mensagem: 'Esta colaboração foi revogada.' }
    }

    if (colaboracao.status !== 'pendente') {
      return {
        sucesso: false as const,
        mensagem: 'Esta colaboração já foi respondida.',
      }
    }

    const agora = new Date()
    if (colaboracao.expiraEm <= agora) {
      await tx
        .update(colaboracoesCliente)
        .set({ status: 'expirado', updatedAt: agora })
        .where(eq(colaboracoesCliente.id, colaboracao.id))
      return { sucesso: false as const, mensagem: 'Este convite expirou.' }
    }

    // Aceitar concede apenas leitura do cliente: nenhuma linha em
    // empresa_membros é criada, nem a propriedade do cliente muda.
    await tx
      .update(colaboracoesCliente)
      .set({
        status: validacao.data.resposta === 'aceitar' ? 'aceito' : 'recusado',
        respondidoEm: agora,
        updatedAt: agora,
      })
      .where(
        and(
          eq(colaboracoesCliente.id, colaboracao.id),
          eq(colaboracoesCliente.status, 'pendente'),
        ),
      )

    revalidatePath('/admin')
    return {
      sucesso: true as const,
      mensagem:
        validacao.data.resposta === 'aceitar'
          ? 'Colaboração aceita. O acesso é restrito ao cliente compartilhado.'
          : 'Colaboração recusada.',
    }
  })
}

/** Revogação surte efeito imediato: o acesso é reavaliado a cada consulta. */
export async function revogarColaboracao(entrada: unknown) {
  const profissional = await obterPrestadorClientes()
  if (!profissional) return SEM_AUTORIZACAO

  const validacao = RevogarColaboracaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Colaboração inválida.',
    }
  }

  const [colaboracao] = await db
    .select({
      id: colaboracoesCliente.id,
      clienteId: colaboracoesCliente.clienteId,
      remetenteId: colaboracoesCliente.remetenteId,
      status: colaboracoesCliente.status,
    })
    .from(colaboracoesCliente)
    .where(eq(colaboracoesCliente.id, validacao.data.colaboracaoId))
    .limit(1)

  if (!colaboracao) {
    return { sucesso: false as const, mensagem: 'Colaboração não encontrada.' }
  }

  const acesso = await resolverAcessoCliente(
    profissional.usuarioId,
    colaboracao.clienteId,
  )
  if (
    !acesso ||
    !podeRevogarColaboracao(acesso, profissional.usuarioId, colaboracao.remetenteId)
  ) {
    return SEM_AUTORIZACAO
  }

  const agora = new Date()
  const [revogada] = await db
    .update(colaboracoesCliente)
    .set({
      status: 'revogado',
      revogadoEm: agora,
      revogadoPorId: profissional.usuarioId,
      updatedAt: agora,
    })
    .where(
      and(
        eq(colaboracoesCliente.id, colaboracao.id),
        sql`${colaboracoesCliente.status} in ('pendente', 'aceito')`,
      ),
    )
    .returning({ id: colaboracoesCliente.id })

  if (!revogada) {
    return {
      sucesso: false as const,
      mensagem: 'Esta colaboração já estava encerrada.',
    }
  }

  revalidatePath('/admin')
  return { sucesso: true as const, mensagem: 'Colaboração revogada.' }
}

/** Clientes visíveis ao usuário para escolher o escopo da colaboração. */
export async function listarClientesElegiveisColaboracao() {
  const profissional = await obterPrestadorClientes()
  if (!profissional) return SEM_AUTORIZACAO_COM_DADOS

  return {
    sucesso: true as const,
    mensagem: 'Clientes carregados.',
    dados: await listarClientesParaColaboracao(profissional.usuarioId),
  }
}
