'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { assinaturas } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { calcularPreco } from '@/features/precificacao/lib/motor'
import { obterTabelaDaVitrine } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type {
  ResultadoPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import { podeAgirComoCliente } from '@/features/usuarios/lib/capacidades'
import { obterEstadoDaContaDaSessao } from '@/features/usuarios/lib/estado-da-conta-da-sessao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { periodicidadeDosMeses } from '../constants/assinatura'
import { chaveDaOferta, montarOferta } from '../lib/oferta'
import { ContratarPlanoSchema } from '../schemas/contratacao'

const CONTA_NAO_CONFIRMADA =
  'Sua conta ainda não foi confirmada. Confirme pelo link enviado ao seu e-mail para contratar.'

const PRECISA_ENTRAR =
  'Entre ou crie sua conta para contratar. Seu plano e a sua simulação continuam aqui.'

/**
 * O que a tela diz depois de registrar. Nenhuma palavra sobre pagamento feito:
 * não houve, e o ambiente ainda não cobra.
 */
const REGISTRADA =
  'Contratação registrada. O pagamento ainda não está disponível neste ambiente.'

function recusa(mensagem: string) {
  return {
    sucesso: false as const,
    mensagem,
    precisaEntrar: false,
    contaNaoConfirmada: false,
  }
}

/**
 * O cliente contrata um plano da própria Vincis.
 *
 * ## Portas, todas no servidor
 *
 * 1. **sessão válida** — sem conta, sem contrato; assinatura anônima não
 *    existe;
 * 2. **ser Cliente** — prestador e Gestor não contratam a plataforma para si;
 * 3. **tabela publicada e coerente** — a mesma leitura de `/precos`. Se a
 *    vitrine não pode exibir preço, também não pode vendê-lo;
 * 4. **plano ativo e prazo contratável** — o prazo precisa ser um dos que a
 *    tabela oferece e durar 1, 6 ou 12 meses;
 * 5. **respostas que o motor aceita** — resposta inventada faz o motor recusar,
 *    e recusa aqui vira "refaça a simulação", não contrato.
 *
 * ## O preço é recalculado, nunca recebido
 *
 * O navegador manda plano, prazo e respostas. Mensal, desconto e total saem do
 * motor, aqui, sobre a tabela publicada — o mesmo motor da vitrine, então o
 * número congelado é o que a tela mostrou. Não existe campo por onde o cliente
 * pudesse escolher quanto paga.
 *
 * ## Uma contratação, não duas
 *
 * A consulta antes do insert devolve a assinatura pendente que já existe — o
 * cliente que volta do login e confirma de novo recebe a mesma, sem erro. O
 * clique **duplo**, em que as duas requisições passam da consulta antes de
 * qualquer uma gravar, quem barra é o índice único parcial do banco, tratado no
 * `catch`.
 *
 * ## O que ela não faz
 *
 * Não cobra, não confirma pagamento, não ativa a assinatura, não cria ciclo e
 * não gera comissão de parceiro. A linha nasce `aguardando_pagamento` e fica
 * assim até existir gateway real.
 */
export async function contratarPlanoVincis(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) {
    const estado = await obterEstadoDaContaDaSessao()
    return {
      sucesso: false as const,
      mensagem:
        estado === 'nao_confirmada' ? CONTA_NAO_CONFIRMADA : PRECISA_ENTRAR,
      precisaEntrar: estado !== 'nao_confirmada',
      contaNaoConfirmada: estado === 'nao_confirmada',
    }
  }

  if (!podeAgirComoCliente(sessao)) {
    return recusa('Apenas contas de Cliente podem contratar um plano.')
  }

  const validacao = ContratarPlanoSchema.safeParse(entrada)
  if (!validacao.success) {
    return recusa(validacao.error.issues[0]?.message ?? 'Contratação inválida.')
  }
  const { planoCodigo, periodoCodigo, respostas } = validacao.data

  let tabela: TabelaPrecificacao
  try {
    tabela = await obterTabelaDaVitrine()
  } catch {
    return recusa(
      'Os preços estão indisponíveis no momento. Tente novamente em instantes.',
    )
  }

  const servico = tabela.servicos.find(
    (candidato) => candidato.codigo === planoCodigo && candidato.ativo,
  )
  if (!servico) {
    return recusa('Este plano não está disponível para contratação.')
  }

  let resultado: ResultadoPrecificacao
  try {
    resultado = calcularPreco(tabela, planoCodigo, respostas)
  } catch {
    // A tabela mudou entre carregar a página e confirmar. Refazer é honesto;
    // congelar um cenário que o motor não aceita, não.
    return recusa('Os preços foram atualizados. Refaça a simulação para continuar.')
  }

  const periodo = resultado.periodos.find((p) => p.periodo === periodoCodigo)
  const periodicidade = periodo ? periodicidadeDosMeses(periodo.meses) : null
  if (!periodo || !periodicidade) {
    return recusa('Escolha um prazo de contratação válido.')
  }

  const oferta = montarOferta({ tabela, servico, resultado, periodo, respostas })
  const chaveIntencao = chaveDaOferta(oferta)

  const buscarPendente = async () => {
    const [linha] = await db
      .select({ id: assinaturas.id })
      .from(assinaturas)
      .where(
        and(
          eq(assinaturas.clienteUsuarioId, sessao.id),
          eq(assinaturas.chaveIntencao, chaveIntencao),
          eq(assinaturas.status, 'aguardando_pagamento'),
        ),
      )
      .limit(1)
    return linha ?? null
  }

  const existente = await buscarPendente()
  if (existente) {
    return {
      sucesso: true as const,
      mensagem: REGISTRADA,
      precisaEntrar: false,
      contaNaoConfirmada: false,
      dados: { assinaturaId: existente.id, repetida: true },
    }
  }

  let assinaturaId: string
  try {
    assinaturaId = await db.transaction(async (tx) => {
      const [criada] = await tx
        .insert(assinaturas)
        .values({
          clienteUsuarioId: sessao.id,
          prestadorId: null,
          planoCodigo: servico.codigo,
          planoNome: servico.nome,
          periodoCodigo: periodo.periodo,
          periodicidade,
          meses: periodo.meses,
          valorMensalCheioCentavos: resultado.mensalCentavos,
          descontoMilesimos: periodo.descontoMilesimos,
          valorMensalCentavos: periodo.mensalCentavos,
          valorTotalCentavos: periodo.totalPeriodoCentavos,
          oferta,
          chaveIntencao,
          status: 'aguardando_pagamento',
        })
        .returning({ id: assinaturas.id })

      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.assinaturaVincisContratada,
          entidade: 'assinaturas',
          registroAfetado: criada.id,
          autorId: sessao.id,
          usuarioId: sessao.id,
          origem: 'admin',
          metadados: {
            planoCodigo: servico.codigo,
            periodoCodigo: periodo.periodo,
            periodicidade,
            meses: periodo.meses,
            valorMensalCentavos: periodo.mensalCentavos,
            valorTotalCentavos: periodo.totalPeriodoCentavos,
            status: 'aguardando_pagamento',
          },
        },
        tx,
      )

      return criada.id
    })
  } catch (erro) {
    // O índice único parcial é o que sobrevive ao clique duplo: quando ele
    // dispara, a contratação já existe, e devolvê-la é o resultado certo.
    const gravada = await buscarPendente()
    if (gravada) {
      return {
        sucesso: true as const,
        mensagem: REGISTRADA,
        precisaEntrar: false,
        contaNaoConfirmada: false,
        dados: { assinaturaId: gravada.id, repetida: true },
      }
    }
    console.error('[CONTRATAR_PLANO_VINCIS]', {
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    })
    return recusa('Não foi possível registrar a contratação. Tente novamente.')
  }

  revalidatePath('/cliente')
  return {
    sucesso: true as const,
    mensagem: REGISTRADA,
    precisaEntrar: false,
    contaNaoConfirmada: false,
    dados: { assinaturaId, repetida: false },
  }
}
