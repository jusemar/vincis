'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { db } from '@/db/connection'
import { contratacoesServico, servicos } from '@/db/schema'
import { garantirClienteNaCarteira } from '@/features/clientes/lib/garantir-cliente-na-carteira'
import { garantirAtendimentoDaContratacao } from '@/features/atendimentos/lib/criar-atendimento-da-contratacao'
import { COOKIE_INDICACAO } from '@/features/parceiros/constants/indicacao'
import { referenciaDePrazoDaCategoria } from '@/features/parceiros/constants/prazo'
import { registrarAtribuicaoDaContratacao } from '@/features/parceiros/lib/registrar-atribuicao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { podeAgirComoCliente } from '@/features/usuarios/lib/capacidades'
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

  // Contratar é ato de Cliente: quem presta serviço não se passa por cliente.
  // A única exceção é o Gestor da Plataforma, e ela mora em `capacidades.ts`.
  if (!podeAgirComoCliente(sessao)) {
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

  /*
    Lido antes da transação: `cookies()` é da requisição, não do banco, e é o
    único lugar de onde a origem do visitante pode vir. Nenhum id de parceiro é
    aceito do cliente — quem resolve a indicação é o servidor.
  */
  const visitanteToken = (await cookies()).get(COOKIE_INDICACAO)?.value

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
        .select({ id: contratacoesServico.id, status: contratacoesServico.status })
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
        /*
          Também aqui, e não só na contratação nova.

          Quem clicou duas vezes, ou voltou depois de a atribuição falhar, tem o
          mesmo direito de quem clicou uma vez — e o índice único em
          `contratacao_id` garante que a segunda passagem não crie a segunda
          linha. Sem isto, uma contratação criada antes do parceiro existir
          jamais ganharia atribuição.
        */
        await registrarAtribuicaoDaContratacao(tx, {
          contratacaoId: existente.id,
          usuarioId: sessao.id,
          visitanteToken,
          servico: referenciaDePrazoDaCategoria(servico.categoria),
          nome: servico.nome,
          // O estado real da linha que já existe, não o que nasceria agora.
          efetivada: existente.status !== 'aguardando_orcamento',
        })
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

      /*
        Se este cliente veio de um parceiro, o negócio nasce sob ele.

        A função tem ponto de salvamento próprio e nunca lança: uma falha do
        programa de parceiros não pode derrubar a contratação de quem nem sabe
        que ele existe.
      */
      await registrarAtribuicaoDaContratacao(tx, {
        contratacaoId: contratacao.id,
        usuarioId: sessao.id,
        visitanteToken,
        servico: referenciaDePrazoDaCategoria(servico.categoria),
        nome: servico.nome,
        efetivada: inicial.status !== 'aguardando_orcamento',
      })

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
