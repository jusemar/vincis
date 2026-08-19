'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { clientes, contratacoesServico, servicos, usuarios } from '@/db/schema'
import { garantirAtendimentoDaContratacao } from '@/features/atendimentos/lib/criar-atendimento-da-contratacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { tipoPrestadorDoPerfil } from '@/features/usuarios/lib/tipos-pessoa'
import { PERFIL_GESTOR_VINCIS } from '@/features/usuarios/constants/perfis'
import type { ModeloPreco } from '../schemas/servico'

const ContratarSchema = z.object({
  servicoId: z.string().uuid('Serviço inválido.'),
  /**
   * Recado do Cliente ao contratar.
   *
   * Opcional de propósito: exigir texto para contratar transformaria um
   * formulário em obstáculo de venda. Quando vem preenchido, vira a primeira
   * mensagem real da conversa do Atendimento.
   */
  mensagem: z.string().trim().max(4000).optional(),
})

/**
 * Status inicial da contratação.
 *
 * `sob_orcamento` nasce em `aguardando_orcamento` e **sem valor**: não existe
 * preço antes da proposta, e gravar zero seria inventar um. Os demais modelos
 * nascem `pendente` com o preço congelado.
 */
function estadoInicial(modeloPreco: ModeloPreco, valorCentavos: number | null) {
  if (modeloPreco === 'sob_orcamento') {
    return { status: 'aguardando_orcamento' as const, valor: null }
  }
  return { status: 'pendente' as const, valor: valorCentavos }
}

/**
 * Contratação direta de um serviço do catálogo.
 *
 * O Cliente vem **sempre da sessão** — nenhum id de cliente é aceito da
 * requisição. Só quem é Cliente contrata: Profissional, Colaborador e Gestor
 * são recusados no servidor, não apenas no botão.
 */
export async function contratarServico(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) {
    return {
      sucesso: false as const,
      mensagem: 'Entre na sua conta para contratar este serviço.',
      precisaEntrar: true,
    }
  }

  // Contratar é ato de Cliente. Prestadores e Gestor não se passam por cliente.
  if (
    sessao.perfilTipo === PERFIL_GESTOR_VINCIS ||
    tipoPrestadorDoPerfil(sessao.perfilTipo)
  ) {
    return {
      sucesso: false as const,
      mensagem: 'Apenas contas de Cliente podem contratar serviços.',
      precisaEntrar: false,
    }
  }

  const validacao = ContratarSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: 'Serviço inválido.',
      precisaEntrar: false,
    }
  }

  try {
    return await db.transaction(async (tx) => {
      // Trava o serviço para que preço e snapshot não corram com uma edição
      // simultânea do prestador.
      const [servico] = await tx
        .select()
        .from(servicos)
        .where(eq(servicos.id, validacao.data.servicoId))
        .for('update')
        .limit(1)

      if (!servico || !servico.ativo || !servico.publico) {
        return {
          sucesso: false as const,
          mensagem: 'Este serviço não está disponível.',
          precisaEntrar: false,
        }
      }
      if (servico.prestadorId === sessao.id) {
        return {
          sucesso: false as const,
          mensagem: 'Você não pode contratar o próprio serviço.',
          precisaEntrar: false,
        }
      }

      const modeloPreco = servico.modeloPreco as ModeloPreco
      const inicial = estadoInicial(modeloPreco, servico.valorCentavos)

      // Uma solicitação viva por serviço e cliente: clicar duas vezes não gera
      // duas contratações.
      const [existente] = await tx
        .select({ id: contratacoesServico.id })
        .from(contratacoesServico)
        .where(
          and(
            eq(contratacoesServico.servicoId, servico.id),
            eq(contratacoesServico.clienteUsuarioId, sessao.id),
            sql`${contratacoesServico.status} in ('pendente', 'em_andamento', 'aguardando_orcamento')`,
          ),
        )
        .limit(1)

      if (existente) {
        // Reprocessar a mesma solicitação não pode gerar um segundo
        // Atendimento — a chamada é idempotente e devolve o que já existe.
        const atendimento = await garantirAtendimentoDaContratacao(
          tx,
          existente.id,
        )
        return {
          sucesso: true as const,
          mensagem: 'Você já possui uma solicitação em andamento para este serviço.',
          precisaEntrar: false,
          dados: {
            contratacaoId: existente.id,
            jaExistia: true,
            atendimentoId: atendimento.id,
            protocolo: atendimento.protocolo,
          },
        }
      }

      const carteiraId = await garantirClienteNaCarteira(tx, {
        prestadorId: servico.prestadorId,
        clienteUsuarioId: sessao.id,
      })

      const [contratacao] = await tx
        .insert(contratacoesServico)
        .values({
          servicoId: servico.id,
          prestadorId: servico.prestadorId,
          clienteUsuarioId: sessao.id,
          clienteCarteiraId: carteiraId,
          // Snapshot: a contratação não muda quando o catálogo mudar.
          nomeServicoSnapshot: servico.nome,
          modeloPrecoSnapshot: modeloPreco,
          valorSnapshotCentavos: inicial.valor,
          prazoEstimadoDias: servico.prazoEstimadoDias,
          status: inicial.status,
        })
        .returning({ id: contratacoesServico.id })

      // Contratação e Atendimento nascem na mesma transação: ou os dois
      // existem, ou nenhum dos dois. Um trabalho contratado que não aparece no
      // Kanban é trabalho perdido.
      const atendimento = await garantirAtendimentoDaContratacao(
        tx,
        contratacao.id,
        validacao.data.mensagem,
      )

      revalidatePath('/cliente')
      revalidatePath('/admin')
      return {
        sucesso: true as const,
        mensagem:
          inicial.status === 'aguardando_orcamento'
            ? 'Solicitação de orçamento enviada ao profissional.'
            : 'Serviço contratado com sucesso.',
        precisaEntrar: false,
        dados: {
          contratacaoId: contratacao.id,
          jaExistia: false,
          atendimentoId: atendimento.id,
          protocolo: atendimento.protocolo,
        },
      }
    })
  } catch (error) {
    console.error('[CONTRATAR_SERVICO]', {
      nome: error instanceof Error ? error.name : 'Erro desconhecido',
    })
    return {
      sucesso: false as const,
      mensagem: 'Não foi possível concluir a contratação. Tente novamente.',
      precisaEntrar: false,
    }
  }
}

/**
 * Liga a conta do Cliente à carteira daquele prestador.
 *
 * A busca é por `usuario_id` — referência explícita —, nunca por e-mail ou
 * telefone: casar por contato juntaria pessoas diferentes em silêncio. Se o
 * prestador já tem esse cliente na carteira, reaproveita; senão cria uma vez.
 */
async function garantirClienteNaCarteira(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  { prestadorId, clienteUsuarioId }: { prestadorId: string; clienteUsuarioId: string },
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
      area: 'contabil',
      status: 'ativo',
      tipoAtendimento: 'avulso',
      valorReferenciaCentavos: 0,
    })
    .returning({ id: clientes.id })

  return criado.id
}
