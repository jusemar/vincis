'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { db } from '@/db/connection'
import { atendimentos, contratacoesServico, servicos, usuarios } from '@/db/schema'
import { EXPIRACAO_PIX_SEGUNDOS } from '@/features/pagamentos/constants/cobranca'
import {
  abrirCobrancaPix,
  cobrancaDoCliente,
  paraDTO,
  sincronizarCobranca,
} from '@/features/pagamentos/lib/cobrancas'
import { COOKIE_INDICACAO } from '@/features/parceiros/constants/indicacao'
import { prestadorCobraDiretamente } from '@/features/profissionais/lib/honorarios'
import { podeAgirComoCliente } from '@/features/usuarios/lib/capacidades'
import { obterEstadoDaContaDaSessao } from '@/features/usuarios/lib/estado-da-conta-da-sessao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { calcularComissaoVincis, MENSAGEM_COMISSAO_PENDENTE } from '../constants/comissao'
import { lerComissaoServicosAvulsos } from '../queries/comissao-vincis'
import type { ModeloPreco } from '../schemas/servico'
import type {
  ContextoCobrancaServico,
  ResultadoContratacaoServico,
  ResumoContratacaoServicoDTO,
} from '../types/contratacao'

/**
 * Contratação paga de um serviço avulso do catálogo.
 *
 * ## O fluxo, e onde cada coisa nasce
 *
 * `Detalhes → Pagamento → Concluído`, como a agenda:
 *
 * 1. `prepararContratacaoDoServico` — confere sessão, papel e serviço, e
 *    devolve o resumo relido do banco. Não grava nada.
 * 2. `iniciarPagamentoDoServico` — emite (ou reaproveita) o Pix na Efí. Grava
 *    só a cobrança; **não** existe contratação, Atendimento nem protocolo.
 * 3. A Efí confirma (webhook, polling ou reconciliação → consulta autenticada)
 *    e o núcleo de pagamentos chama `efetivarContratacaoPaga`, que cria a
 *    contratação e o Atendimento numa transação, uma vez só.
 *
 * ## Modelos de preço
 *
 * - `fixo`: segue para o Pix pelo valor do catálogo, lido no servidor;
 * - `a_partir_de` e `sob_orcamento`: **não** são cobrados aqui — "a partir de
 *   R$ 100" não é preço final. Vão para a Solicitação de orçamento privada, que
 *   já tem proposta com valor, aceite e pagamento;
 * - `por_hora`: é a Consultoria Agendada, com horário e reserva.
 *
 * ## O que o navegador pode dizer
 *
 * O id do serviço e o recado. Preço, Profissional e Cliente vêm do banco e da
 * sessão — um preço enviado pela tela seria ignorado, por isso nem é aceito.
 */

const ServicoSchema = z.object({ servicoId: z.string().uuid('Serviço inválido.') })

const IniciarSchema = ServicoSchema.extend({
  /** Recado opcional: vira a primeira mensagem do Atendimento, se o Pix for pago. */
  mensagem: z.string().trim().max(4000).optional().default(''),
})

const AcompanharSchema = z.object({ cobrancaId: z.string().uuid('Cobrança inválida.') })

type Sessao = NonNullable<Awaited<ReturnType<typeof obterSessaoServidor>>>
type Recusa = Exclude<ResultadoContratacaoServico, { situacao: 'pronto' | 'cobranca' }>

async function exigirCliente(): Promise<{ sessao: Sessao } | { recusa: Recusa }> {
  const sessao = await obterSessaoServidor()
  if (!sessao) {
    const estado = await obterEstadoDaContaDaSessao()
    return {
      recusa:
        estado === 'nao_confirmada'
          ? { situacao: 'conta_nao_confirmada', mensagem: 'Confirme sua conta para contratar.' }
          : { situacao: 'precisa_entrar', mensagem: 'Entre ou crie sua conta para contratar este serviço.' },
    }
  }
  // Contratar é ato de Cliente; a exceção do Gestor mora em `capacidades.ts`.
  if (!podeAgirComoCliente(sessao)) {
    return {
      recusa: { situacao: 'nao_permitido', mensagem: 'Apenas contas de Cliente podem contratar serviços.' },
    }
  }
  return { sessao }
}

/** Serviço contratável por esta sessão, já com o modelo de preço decidido. */
async function servicoContratavel(
  servicoId: string,
  sessao: Sessao,
): Promise<
  | { servico: typeof servicos.$inferSelect; resumo: ResumoContratacaoServicoDTO; comissaoMilesimos: number }
  | { recusa: Recusa }
> {
  const [linha] = await db
    .select({ servico: servicos, prestadorNome: usuarios.nome })
    .from(servicos)
    .innerJoin(usuarios, eq(usuarios.id, servicos.prestadorId))
    .where(eq(servicos.id, servicoId))
    .limit(1)

  if (!linha || !linha.servico.ativo || !linha.servico.publico) {
    return { recusa: { situacao: 'indisponivel', mensagem: 'Este serviço não está disponível.' } }
  }
  const { servico } = linha
  if (servico.prestadorId === sessao.id) {
    return { recusa: { situacao: 'nao_permitido', mensagem: 'Você não pode contratar o próprio serviço.' } }
  }

  // Advogado: qualquer serviço, inclusive o de preço fixo, segue pelo pedido
  // de orçamento — honorário jurídico é combinado direto, nunca pelo Pix da Vincis.
  if (await prestadorCobraDiretamente(db, servico.prestadorId)) {
    return {
      recusa: {
        situacao: 'requer_orcamento',
        mensagem: 'Os honorários deste serviço são combinados diretamente com o profissional. Envie uma solicitação de orçamento.',
      },
    }
  }

  const modelo = servico.modeloPreco as ModeloPreco
  if (modelo === 'sob_orcamento' || modelo === 'a_partir_de') {
    return {
      recusa: {
        situacao: 'requer_orcamento',
        mensagem:
          modelo === 'a_partir_de'
            ? 'O valor final deste serviço depende do seu caso. Envie uma solicitação de orçamento ao profissional.'
            : 'Este serviço é sob orçamento. Envie uma solicitação ao profissional.',
      },
    }
  }
  if (modelo === 'por_hora') {
    return {
      recusa: { situacao: 'requer_agenda', mensagem: 'Este serviço é cobrado por hora: agende um horário na agenda do profissional.' },
    }
  }
  if (!servico.valorCentavos || servico.valorCentavos <= 0) {
    return { recusa: { situacao: 'indisponivel', mensagem: 'Este serviço está sem preço definido.' } }
  }

  /*
    Comissão da Vincis: configuração da Gestão, sem padrão no código. Sem ela
    não há como dividir o valor entre Vincis e profissional — a cobrança não
    nasce, em vez de nascer com divisão inventada. Vale para todo profissional
    que vende avulso pela Vincis, Autônomo inclusive.
  */
  const comissaoMilesimos = await lerComissaoServicosAvulsos()
  if (comissaoMilesimos === null) {
    console.warn('[SERVICO_AVULSO_SEM_COMISSAO]', { servicoId: servico.id })
    return { recusa: { situacao: 'indisponivel', mensagem: MENSAGEM_COMISSAO_PENDENTE } }
  }

  // Uma contratação viva por serviço e Cliente — a regra de sempre.
  const [viva] = await db
    .select({ atendimentoId: atendimentos.id, protocolo: atendimentos.protocolo })
    .from(contratacoesServico)
    .leftJoin(atendimentos, eq(atendimentos.contratacaoId, contratacoesServico.id))
    .where(
      and(
        eq(contratacoesServico.servicoId, servico.id),
        eq(contratacoesServico.clienteUsuarioId, sessao.id),
        inArray(contratacoesServico.status, ['pendente', 'em_andamento', 'aguardando_orcamento']),
      ),
    )
    .limit(1)
  if (viva) {
    return {
      recusa: {
        situacao: 'ja_contratado',
        mensagem: 'Você já contratou este serviço e ele está em andamento.',
        protocolo: viva.protocolo,
        atendimentoId: viva.atendimentoId,
      },
    }
  }

  return {
    servico,
    comissaoMilesimos,
    resumo: {
      servicoId: servico.id,
      nome: servico.nome,
      descricao: servico.descricaoCurta,
      prestadorNome: linha.prestadorNome,
      valorCentavos: servico.valorCentavos,
      prazoEstimadoDias: servico.prazoEstimadoDias,
    },
  }
}

/** Etapa "Detalhes": o que exatamente está sendo contratado, do banco. */
export async function prepararContratacaoDoServico(
  entrada: unknown,
): Promise<ResultadoContratacaoServico> {
  const validacao = ServicoSchema.safeParse(entrada)
  if (!validacao.success) return { situacao: 'indisponivel', mensagem: 'Serviço inválido.' }
  const porta = await exigirCliente()
  if ('recusa' in porta) return porta.recusa
  const contratavel = await servicoContratavel(validacao.data.servicoId, porta.sessao)
  if ('recusa' in contratavel) return contratavel.recusa
  return { situacao: 'pronto', resumo: contratavel.resumo }
}

/** Etapa "Pagamento": emite ou reaproveita o Pix. Não cria contratação. */
export async function iniciarPagamentoDoServico(
  entrada: unknown,
): Promise<ResultadoContratacaoServico> {
  const validacao = IniciarSchema.safeParse(entrada)
  if (!validacao.success) return { situacao: 'indisponivel', mensagem: 'Dados inválidos.' }
  const porta = await exigirCliente()
  if ('recusa' in porta) return porta.recusa
  const { sessao } = porta

  const contratavel = await servicoContratavel(validacao.data.servicoId, sessao)
  if ('recusa' in contratavel) return contratavel.recusa
  const { servico, resumo, comissaoMilesimos } = contratavel

  // Lido aqui porque o efeito roda no webhook, sem cookie nenhum.
  const visitanteToken = (await cookies()).get(COOKIE_INDICACAO)?.value ?? null
  const contexto: ContextoCobrancaServico = {
    nomeServico: servico.nome,
    modeloPreco: 'fixo',
    prazoEstimadoDias: servico.prazoEstimadoDias,
    mensagem: validacao.data.mensagem,
    visitanteToken,
    // O retrato da divisão viaja com a cobrança: o efeito roda no webhook e
    // grava exatamente o que valia quando o Pix foi emitido.
    comissaoVincis: calcularComissaoVincis(resumo.valorCentavos, comissaoMilesimos),
  }

  const aberta = await abrirCobrancaPix({
    finalidade: 'servico',
    referenciaId: servico.id,
    clienteUsuarioId: sessao.id,
    prestadorId: servico.prestadorId,
    valorCentavos: resumo.valorCentavos,
    descricao: `Vincis · ${servico.nome}`,
    contexto,
    expiracaoSegundos: EXPIRACAO_PIX_SEGUNDOS.servico,
  })

  if (aberta.situacao === 'gerando') return { situacao: 'gerando', mensagem: aberta.mensagem }
  if (aberta.situacao !== 'ok') return { situacao: 'indisponivel', mensagem: aberta.mensagem }
  return { situacao: 'cobranca', resumo, cobranca: aberta.cobranca }
}

/**
 * A situação do Pix do serviço — o que a tela pergunta enquanto espera.
 *
 * A cobrança de outro Cliente não é encontrada. Quem decide se pagou é a Efí,
 * consultada pelo servidor; a tela só mostra.
 */
export async function acompanharPagamentoDoServico(
  entrada: unknown,
): Promise<ResultadoContratacaoServico> {
  const validacao = AcompanharSchema.safeParse(entrada)
  if (!validacao.success) return { situacao: 'indisponivel', mensagem: 'Cobrança inválida.' }
  const porta = await exigirCliente()
  if ('recusa' in porta) return porta.recusa

  const cobranca = await cobrancaDoCliente(validacao.data.cobrancaId, porta.sessao.id)
  if (!cobranca || cobranca.finalidade !== 'servico') {
    return { situacao: 'indisponivel', mensagem: 'Cobrança não encontrada.' }
  }
  const atual = (await sincronizarCobranca(cobranca.id)) ?? cobranca
  const contexto = atual.contexto as ContextoCobrancaServico
  return {
    situacao: 'cobranca',
    resumo: {
      servicoId: atual.referenciaId,
      nome: contexto.nomeServico,
      descricao: '',
      prestadorNome: '',
      valorCentavos: atual.valorCentavos,
      prazoEstimadoDias: contexto.prazoEstimadoDias,
    },
    cobranca: paraDTO(atual),
  }
}
