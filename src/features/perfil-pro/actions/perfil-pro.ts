'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/connection'
import { assinaturas } from '@/db/schema'
import { gerarCompetenciasPrevistas } from '@/features/assinaturas/lib/competencias'
import { prestadorCobraDiretamente } from '@/features/profissionais/lib/honorarios'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  ARMAZENAMENTO_EXTRA_CENTAVOS,
  NOME_PLANO_ARMAZENAMENTO_EXTRA,
  NOME_PLANO_PERFIL_PRO,
  PLANO_ARMAZENAMENTO_EXTRA,
  PERIODOS_PERFIL_PRO,
  PLANO_PERFIL_PRO,
  type CodigoPeriodoPerfilPro,
} from '../constants/perfil-pro'
import {
  adicionaisDeArmazenamentoVigentes,
  armazenamentoDoPrestador,
  situacaoDocumentos,
} from '../lib/perfil-pro'

const ContratarSchema = z.object({
  periodo: z.enum(PERIODOS_PERFIL_PRO.map((p) => p.codigo) as [CodigoPeriodoPerfilPro, ...CodigoPeriodoPerfilPro[]], {
    message: 'Escolha o período.',
  }),
})

/** Só advogado, só a própria conta. Vem da sessão — nenhum id de fora. */
async function exigirAdvogado() {
  const sessao = await obterSessaoServidor()
  if (!sessao) return null
  return (await prestadorCobraDiretamente(db, sessao.id)) ? sessao : null
}

/**
 * O que a aba "Perfil Pro" do painel mostra. Só leitura: abrir a aba nunca
 * cria assinatura nem cobrança — e uma contratação pendente não é retomada
 * aqui (o Pix só aparece depois do clique em "Contratar").
 */
export async function obterMeuPerfilPro() {
  const advogado = await exigirAdvogado()
  if (!advogado) return { ...SEM_AUTORIZACAO, dados: null }

  const [situacao, armazenamento, adicionais] = await Promise.all([
    situacaoDocumentos(db, advogado.id),
    armazenamentoDoPrestador(db, advogado.id),
    adicionaisDeArmazenamentoVigentes(db, advogado.id),
  ])

  return {
    sucesso: true as const,
    mensagem: 'Perfil carregado.',
    dados: {
      nivel: situacao.nivel ?? 'essencial',
      proAte: situacao.proAte,
      armazenamento: { ...armazenamento, adicionais },
    },
  }
}

/**
 * Inicia a contratação do Perfil Pro — o Pix vem em seguida.
 *
 * Pagamento do advogado **à Vincis** pelo uso da plataforma; nada a ver com
 * honorários de clientes. Grava a assinatura em `aguardando_pagamento` com os
 * valores aprovados (lidos do servidor, nunca da tela) e as competências do
 * período; o Pro só vale depois que a Efí confirma o Pix
 * (o efeito do Pix confirmado data a vigência a partir do pagamento).
 *
 * Sem renovação automática: com o Pro vigente, uma nova contratação começaria a
 * contar do pagamento e sobreporia o período atual — por isso é recusada até o
 * vencimento.
 */
export async function contratarPerfilPro(entrada: unknown) {
  const advogado = await exigirAdvogado()
  if (!advogado) return SEM_AUTORIZACAO

  const validacao = ContratarSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: validacao.error.issues[0]?.message ?? 'Período inválido.' }
  }
  const periodo = PERIODOS_PERFIL_PRO.find((p) => p.codigo === validacao.data.periodo)!

  const situacao = await situacaoDocumentos(db, advogado.id)
  if (situacao.nivel === 'pro') {
    return {
      sucesso: false as const,
      mensagem: `Seu Perfil Pro já está ativo até ${situacao.proAte?.split('-').reverse().join('/')}.`,
    }
  }

  const chaveIntencao = `${PLANO_PERFIL_PRO}:${periodo.codigo}`
  const existente = async () =>
    (
      await db
        .select({ id: assinaturas.id })
        .from(assinaturas)
        .where(
          and(
            eq(assinaturas.clienteUsuarioId, advogado.id),
            eq(assinaturas.chaveIntencao, chaveIntencao),
            eq(assinaturas.status, 'aguardando_pagamento'),
          ),
        )
        .limit(1)
    )[0]

  const repetida = await existente()
  if (repetida) {
    return { sucesso: true as const, mensagem: 'Conclua o pagamento por Pix para ativar o Perfil Pro.', dados: { assinaturaId: repetida.id } }
  }

  // Desconto do prazo em milésimos, só para registro (o valor que vale é o aprovado).
  const mensalCheio = PERIODOS_PERFIL_PRO[0].mensalCentavos
  const descontoMilesimos = Math.round((1 - periodo.mensalCentavos / mensalCheio) * 1000)

  try {
    const assinaturaId = await db.transaction(async (tx) => {
      const [criada] = await tx
        .insert(assinaturas)
        .values({
          clienteUsuarioId: advogado.id,
          prestadorId: null,
          planoCodigo: PLANO_PERFIL_PRO,
          planoNome: NOME_PLANO_PERFIL_PRO,
          periodoCodigo: periodo.codigo,
          periodicidade: periodo.periodicidade,
          meses: periodo.meses,
          valorMensalCheioCentavos: mensalCheio,
          descontoMilesimos,
          valorMensalCentavos: periodo.mensalCentavos,
          valorTotalCentavos: periodo.totalCentavos,
          oferta: { tipo: PLANO_PERFIL_PRO, periodo: periodo.codigo, rotulo: periodo.rotulo, totalCentavos: periodo.totalCentavos },
          chaveIntencao,
          status: 'aguardando_pagamento',
        })
        .onConflictDoNothing()
        .returning({ id: assinaturas.id })
      if (!criada) return null
      await gerarCompetenciasPrevistas(tx, criada.id)
      return criada.id
    })
    const id = assinaturaId ?? (await existente())?.id
    if (!id) return { sucesso: false as const, mensagem: 'Não foi possível iniciar a contratação. Tente novamente.' }
    revalidatePath('/admin')
    return { sucesso: true as const, mensagem: 'Conclua o pagamento por Pix para ativar o Perfil Pro.', dados: { assinaturaId: id } }
  } catch (erro) {
    console.error('[CONTRATAR_PERFIL_PRO]', { nome: erro instanceof Error ? erro.name : 'Erro desconhecido' })
    return { sucesso: false as const, mensagem: 'Não foi possível iniciar a contratação. Tente novamente.' }
  }
}

/**
 * Contrata um adicional de +5 GB (R$ 9,90/mês) — o Pix vem em seguida.
 *
 * Única opção de espaço extra. Exige Perfil Pro vigente (sem Pro não há
 * documento pela Vincis). O espaço só soma depois que a Efí confirma o Pix;
 * cada adicional confirmado vale +5 GB pelo seu mês, sem renovação automática.
 *
 * Idempotente: a chave de intenção é fixa e o índice único de "pendente por
 * chave" garante um único adicional aguardando pagamento — duplo clique e F5
 * devolvem o mesmo. Depois de pago, um novo clique abre o próximo adicional.
 */
export async function contratarArmazenamentoExtra() {
  const advogado = await exigirAdvogado()
  if (!advogado) return SEM_AUTORIZACAO

  const situacao = await situacaoDocumentos(db, advogado.id)
  if (situacao.nivel !== 'pro') {
    return { sucesso: false as const, mensagem: 'O espaço adicional é exclusivo do Perfil Pro ativo.' }
  }

  const existente = async () =>
    (
      await db
        .select({ id: assinaturas.id })
        .from(assinaturas)
        .where(
          and(
            eq(assinaturas.clienteUsuarioId, advogado.id),
            eq(assinaturas.chaveIntencao, PLANO_ARMAZENAMENTO_EXTRA),
            eq(assinaturas.status, 'aguardando_pagamento'),
          ),
        )
        .limit(1)
    )[0]

  const MENSAGEM = 'Conclua o pagamento por Pix para adicionar +5 GB.'
  const repetida = await existente()
  if (repetida) return { sucesso: true as const, mensagem: MENSAGEM, dados: { assinaturaId: repetida.id } }

  try {
    const assinaturaId = await db.transaction(async (tx) => {
      const [criada] = await tx
        .insert(assinaturas)
        .values({
          clienteUsuarioId: advogado.id,
          prestadorId: null,
          planoCodigo: PLANO_ARMAZENAMENTO_EXTRA,
          planoNome: NOME_PLANO_ARMAZENAMENTO_EXTRA,
          periodoCodigo: 'mensal',
          periodicidade: 'mensal',
          meses: 1,
          valorMensalCheioCentavos: ARMAZENAMENTO_EXTRA_CENTAVOS,
          descontoMilesimos: 0,
          valorMensalCentavos: ARMAZENAMENTO_EXTRA_CENTAVOS,
          valorTotalCentavos: ARMAZENAMENTO_EXTRA_CENTAVOS,
          oferta: { tipo: PLANO_ARMAZENAMENTO_EXTRA, gigabytes: 5, totalCentavos: ARMAZENAMENTO_EXTRA_CENTAVOS },
          chaveIntencao: PLANO_ARMAZENAMENTO_EXTRA,
          status: 'aguardando_pagamento',
        })
        .onConflictDoNothing()
        .returning({ id: assinaturas.id })
      if (!criada) return null
      await gerarCompetenciasPrevistas(tx, criada.id)
      return criada.id
    })
    const id = assinaturaId ?? (await existente())?.id
    if (!id) return { sucesso: false as const, mensagem: 'Não foi possível iniciar a contratação. Tente novamente.' }
    revalidatePath('/admin')
    return { sucesso: true as const, mensagem: MENSAGEM, dados: { assinaturaId: id } }
  } catch (erro) {
    console.error('[CONTRATAR_ARMAZENAMENTO_EXTRA]', { nome: erro instanceof Error ? erro.name : 'Erro desconhecido' })
    return { sucesso: false as const, mensagem: 'Não foi possível iniciar a contratação. Tente novamente.' }
  }
}
