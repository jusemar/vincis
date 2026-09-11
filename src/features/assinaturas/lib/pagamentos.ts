import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  assinaturaCompetencias,
  assinaturaPagamentoAlocacoes,
  assinaturaPagamentos,
  assinaturas,
  parceiroAtribuicoes,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIMEZONE_PADRAO } from '@/features/consultorias/constants/consultoria'
import { dataLocalDoInstante } from '@/features/consultorias/lib/tempo'
import { recalcularNivelSemDerrubar } from '@/features/parceiros/lib/niveis'
import { registrarAtribuicaoDaAssinatura } from '@/features/parceiros/lib/registrar-atribuicao'
import {
  garantirComissaoRecorrenteSemDerrubar,
  revogarComissaoRecorrentePorEstorno,
  type DesfechoDoEstorno,
} from '@/features/parceiros/lib/comissao-recorrente'
import {
  MOEDA_ASSINATURA,
  PROVEDOR_HOMOLOGACAO,
  PROVEDORES_PAGAMENTO_ASSINATURA,
  type ProvedorPagamentoAssinatura,
} from '../constants/pagamento'
import { ambientePermiteConfirmacaoManual } from './ambiente'
import { periodoDaCompetencia } from './calendario'
import { materializarCompetenciaMensal } from './competencias'

type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Leitor = Pick<typeof db, 'select'>

/** Contratos que ainda aceitam dinheiro. Cancelado e encerrado, não. */
const ASSINATURA_PAGAVEL = ['aguardando_pagamento', 'ativa']

/**
 * Um evento financeiro que diz: este dinheiro foi confirmado.
 *
 * Hoje só a confirmação manual de homologação produz um. Quando existir
 * gateway, é o webhook validado que o monta — nunca o navegador, a query
 * string ou o redirect de sucesso.
 */
export type PagamentoConfirmado = {
  assinaturaId: string
  provedor: ProvedorPagamentoAssinatura
  /** Identificador do pagamento no provedor, quando houver. */
  idExterno?: string | null
  /** Chave de quem confirmou, quando não houver identificador externo. */
  chaveIdempotencia?: string | null
  /** O valor que o provedor confirmou. Precisa bater com o devido. */
  valorCentavos: number
  moeda?: string
  /** O instante da confirmação no provedor. Padrão: agora. */
  confirmadoEm?: Date
  /** Quem acionou, para a auditoria. Nulo quando é o sistema. */
  autorId?: string | null
}

export type MotivoDaRecusa =
  | 'provedor_invalido'
  | 'ambiente_nao_permitido'
  | 'identificacao_ausente'
  | 'valor_invalido'
  | 'moeda_invalida'
  | 'data_invalida'
  | 'assinatura_inexistente'
  | 'assinatura_nao_pagavel'
  | 'evento_de_outra_assinatura'
  | 'pagamento_nao_confirmavel'
  | 'sem_competencia_a_cobrir'
  | 'valor_divergente'

export type ResultadoDaConfirmacao =
  | {
      ok: true
      pagamentoId: string
      /** O evento já tinha sido processado: nada mudou agora. */
      repetido: boolean
      /** Este pagamento começou a vigência do contrato. */
      ativou: boolean
      /** Os números das competências que ele cobre. */
      competencias: number[]
    }
  | { ok: false; motivo: MotivoDaRecusa }

/** Interrompe a transação inteira: recusa não deixa rastro no banco. */
class Recusa extends Error {
  readonly motivo: MotivoDaRecusa
  constructor(motivo: MotivoDaRecusa) {
    super(motivo)
    this.motivo = motivo
  }
}

/**
 * Quanto de cada competência já está coberto por dinheiro confirmado.
 *
 * É a leitura que a comissão futura vai usar: só conta pagamento `confirmado`,
 * então um estorno descobre o mês sem apagar nada. Pagamento simulado de
 * oportunidade ou consultoria não entra — não está nesta tabela.
 */
export async function coberturaDasCompetencias(
  executor: Leitor,
  assinaturaId: string,
): Promise<Map<string, number>> {
  const linhas = await executor
    .select({
      competenciaId: assinaturaPagamentoAlocacoes.competenciaId,
      coberto: sql<number>`sum(${assinaturaPagamentoAlocacoes.valorCentavos})`.mapWith(
        Number,
      ),
    })
    .from(assinaturaPagamentoAlocacoes)
    .innerJoin(
      assinaturaPagamentos,
      eq(assinaturaPagamentos.id, assinaturaPagamentoAlocacoes.pagamentoId),
    )
    .where(
      and(
        eq(assinaturaPagamentoAlocacoes.assinaturaId, assinaturaId),
        eq(assinaturaPagamentos.status, 'confirmado'),
      ),
    )
    .groupBy(assinaturaPagamentoAlocacoes.competenciaId)
  return new Map(linhas.map((linha) => [linha.competenciaId, linha.coberto]))
}

type Alvo = { id: string; numero: number; aCobrir: number }

/**
 * Os meses que este pagamento vai cobrir, com quanto falta em cada um.
 *
 * - Prazo fechado: todos os meses ainda não cobertos (e não cancelados) — o
 *   pagamento antecipado do semestre ou do ano.
 * - Mensal: o primeiro mês não coberto; se todos os existentes já estão pagos,
 *   o mês seguinte é materializado agora — a renovação. Sem horizonte: um mês.
 *
 * O valor de cada mês é o congelado na competência. A tabela de preços de hoje
 * não é consultada.
 */
async function competenciasACobrir(
  tx: Transacao,
  assinatura: { id: string; periodicidade: string; status: string },
): Promise<Alvo[]> {
  const cobertura = await coberturaDasCompetencias(tx, assinatura.id)
  const listar = async () =>
    (
      await tx
        .select({
          id: assinaturaCompetencias.id,
          numero: assinaturaCompetencias.numero,
          valor: assinaturaCompetencias.valorBaseCentavos,
          status: assinaturaCompetencias.status,
        })
        .from(assinaturaCompetencias)
        .where(eq(assinaturaCompetencias.assinaturaId, assinatura.id))
        .orderBy(asc(assinaturaCompetencias.numero))
    )
      .filter((c) => c.status !== 'cancelada')
      .map((c) => ({
        id: c.id,
        numero: c.numero,
        aCobrir: c.valor - (cobertura.get(c.id) ?? 0),
      }))

  const todas = await listar()
  const abertas = todas.filter((c) => c.aCobrir > 0)
  if (assinatura.periodicidade !== 'mensal') return abertas
  if (abertas.length) return [abertas[0]]

  // Mensal em dia: este dinheiro é o do próximo mês. Só para contrato ativo —
  // o primeiro mês de um mensal nasce com a contratação.
  if (assinatura.status !== 'ativa' || !todas.length) return []
  const proximo = Math.max(...todas.map((c) => c.numero)) + 1
  const resultado = await materializarCompetenciaMensal(tx, {
    assinaturaId: assinatura.id,
    numero: proximo,
  })
  if (resultado !== 'criada') return []
  return (await listar()).filter((c) => c.numero === proximo && c.aCobrir > 0)
}

/**
 * Começa a vigência: o contrato vira `ativa` e os meses ganham datas.
 *
 * O início é o instante da confirmação do primeiro pagamento — não o aceite,
 * não a criação —, lido como dia de São Paulo. Cada mês é datado pelo
 * calendário da Fatia 2, ancorado no dia original. O primeiro mês passa a
 * `em_andamento`, porque a prestação começa agora; os demais seguem `prevista`.
 * Nenhum fica `cumprida`: pagar adiantado não presta serviço.
 */
async function iniciarVigencia(tx: Transacao, assinaturaId: string, inicio: Date) {
  const agora = new Date()
  await tx
    .update(assinaturas)
    .set({ status: 'ativa', vigenciaInicio: inicio, updatedAt: agora })
    .where(
      and(
        eq(assinaturas.id, assinaturaId),
        eq(assinaturas.status, 'aguardando_pagamento'),
      ),
    )

  const diaInicial = dataLocalDoInstante(inicio, TIMEZONE_PADRAO)
  const semData = await tx
    .select({ id: assinaturaCompetencias.id, numero: assinaturaCompetencias.numero })
    .from(assinaturaCompetencias)
    .where(
      and(
        eq(assinaturaCompetencias.assinaturaId, assinaturaId),
        isNull(assinaturaCompetencias.periodoInicio),
      ),
    )
  for (const competencia of semData) {
    const { inicio: periodoInicio, fim: periodoFim } = periodoDaCompetencia(
      diaInicial,
      competencia.numero,
    )
    await tx
      .update(assinaturaCompetencias)
      .set({ periodoInicio, periodoFim, updatedAt: agora })
      .where(eq(assinaturaCompetencias.id, competencia.id))
  }

  await tx
    .update(assinaturaCompetencias)
    .set({ status: 'em_andamento', updatedAt: agora })
    .where(
      and(
        eq(assinaturaCompetencias.assinaturaId, assinaturaId),
        eq(assinaturaCompetencias.numero, 1),
        eq(assinaturaCompetencias.status, 'prevista'),
      ),
    )
}

/** Os meses que um pagamento cobre, pelo id. */
async function competenciasDoPagamento(tx: Leitor, pagamentoId: string) {
  return (
    await tx
      .select({ id: assinaturaPagamentoAlocacoes.competenciaId })
      .from(assinaturaPagamentoAlocacoes)
      .where(eq(assinaturaPagamentoAlocacoes.pagamentoId, pagamentoId))
  ).map((linha) => linha.id)
}

/** O parceiro que originou a assinatura, se houver, tem o nível refeito. */
async function recalcularNivelDaAssinatura(tx: Transacao, assinaturaId: string) {
  const [atribuida] = await tx
    .select({ parceiroId: parceiroAtribuicoes.parceiroId })
    .from(parceiroAtribuicoes)
    .where(eq(parceiroAtribuicoes.assinaturaId, assinaturaId))
    .limit(1)
  if (atribuida) await recalcularNivelSemDerrubar(tx, atribuida.parceiroId)
}

/** Deadlock ou serialização: a transação inteira pode ser tentada de novo. */
function ehConflitoDeTrava(erro: unknown): boolean {
  const codigo = (e: unknown) =>
    typeof e === 'object' && e !== null && 'code' in e
      ? (e as { code?: string }).code
      : undefined
  const causa =
    typeof erro === 'object' && erro !== null && 'cause' in erro
      ? (erro as { cause?: unknown }).cause
      : undefined
  return ['40P01', '40001'].includes(codigo(erro) ?? codigo(causa) ?? '')
}

function limpar(valor: string | null | undefined) {
  const texto = valor?.trim()
  return texto ? texto : null
}

/**
 * Registra dinheiro confirmado para uma assinatura.
 *
 * ## O único caminho
 *
 * É a única função que escreve `confirmado`. Não é Server Action, não tem rota
 * e nenhuma tela a chama: cliente nenhum alcança isto. Hoje quem a aciona é o
 * script de homologação; amanhã, o webhook validado do gateway.
 *
 * ## O valor precisa bater
 *
 * O devido é apurado aqui, das competências congeladas: o semestre inteiro, o
 * ano inteiro, ou o mês do mensal. Valor diferente é recusado — sem pagamento
 * parcial silencioso. A tabela, porém, não obriga um pagamento a cobrir o
 * contrato: complemento e ajuste continuam possíveis no futuro.
 *
 * ## O que acontece, tudo ou nada
 *
 * Numa transação, com a assinatura travada (`for update`): o pagamento nasce
 * `confirmado` (ou o pendente de mesma identidade é confirmado), as alocações
 * cobrem os meses e, se for o primeiro, a vigência começa. Qualquer recusa
 * desfaz tudo — inclusive o mês que o mensal teria materializado.
 *
 * ## Idempotente
 *
 * O mesmo evento (`provedor` + `id_externo`, ou `provedor` + chave) devolve o
 * pagamento que já existe, sem ativar de novo, alocar de novo ou datar de novo.
 * Duas confirmações simultâneas da mesma assinatura fazem fila no `for update`;
 * a mesma identidade em assinaturas diferentes esbarra no índice único.
 *
 * ## O que ela não faz
 *
 * Não cumpre competência e não mexe em saldo, saque, oportunidade ou pagamento
 * simulado. Do programa de parceiros, só duas coisas: a primeira ativação da
 * conta registra o parceiro de origem, e os meses cobertos que já estavam
 * cumpridos ganham a comissão recorrente.
 */
export async function confirmarPagamentoDeAssinatura(
  evento: PagamentoConfirmado,
): Promise<ResultadoDaConfirmacao> {
  const recusa = (motivo: MotivoDaRecusa) => ({ ok: false as const, motivo })

  if (!(PROVEDORES_PAGAMENTO_ASSINATURA as readonly string[]).includes(evento.provedor)) {
    return recusa('provedor_invalido')
  }
  if (evento.provedor === PROVEDOR_HOMOLOGACAO && !ambientePermiteConfirmacaoManual()) {
    return recusa('ambiente_nao_permitido')
  }
  const idExterno = limpar(evento.idExterno)
  const chaveIdempotencia = limpar(evento.chaveIdempotencia)
  if (!idExterno && !chaveIdempotencia) return recusa('identificacao_ausente')
  if (!Number.isInteger(evento.valorCentavos) || evento.valorCentavos <= 0) {
    return recusa('valor_invalido')
  }
  if ((evento.moeda ?? MOEDA_ASSINATURA) !== MOEDA_ASSINATURA) {
    return recusa('moeda_invalida')
  }
  const confirmadoEm = evento.confirmadoEm ?? new Date()
  if (Number.isNaN(confirmadoEm.getTime())) return recusa('data_invalida')

  const identidade = idExterno
    ? eq(assinaturaPagamentos.idExterno, idExterno)
    : eq(assinaturaPagamentos.chaveIdempotencia, chaveIdempotencia!)
  const buscarDoEvento = async (tx: Leitor) => {
    const [linha] = await tx
      .select({
        id: assinaturaPagamentos.id,
        assinaturaId: assinaturaPagamentos.assinaturaId,
        valorCentavos: assinaturaPagamentos.valorCentavos,
        status: assinaturaPagamentos.status,
      })
      .from(assinaturaPagamentos)
      .where(and(eq(assinaturaPagamentos.provedor, evento.provedor), identidade))
      .limit(1)
    return linha ?? null
  }
  const numerosAlocados = async (tx: Leitor, pagamentoId: string) =>
    (
      await tx
        .select({ numero: assinaturaCompetencias.numero })
        .from(assinaturaPagamentoAlocacoes)
        .innerJoin(
          assinaturaCompetencias,
          eq(assinaturaCompetencias.id, assinaturaPagamentoAlocacoes.competenciaId),
        )
        .where(eq(assinaturaPagamentoAlocacoes.pagamentoId, pagamentoId))
        .orderBy(asc(assinaturaCompetencias.numero))
    ).map((linha) => linha.numero)

  try {
    return await db.transaction(async (tx) => {
      const [assinatura] = await tx
        .select({
          id: assinaturas.id,
          clienteUsuarioId: assinaturas.clienteUsuarioId,
          periodicidade: assinaturas.periodicidade,
          status: assinaturas.status,
          planoNome: assinaturas.planoNome,
        })
        .from(assinaturas)
        .where(eq(assinaturas.id, evento.assinaturaId))
        .limit(1)
        .for('update')
      if (!assinatura) throw new Recusa('assinatura_inexistente')

      // Lido depois da trava: a confirmação concorrente já terminou.
      const existente = await buscarDoEvento(tx)
      if (existente) {
        if (existente.assinaturaId !== assinatura.id) {
          throw new Recusa('evento_de_outra_assinatura')
        }
        if (existente.valorCentavos !== evento.valorCentavos) {
          throw new Recusa('valor_divergente')
        }
        if (existente.status === 'confirmado') {
          const competencias = await numerosAlocados(tx, existente.id)
          // Reprocessar também refaz a pergunta da comissão — idempotente, e
          // conserta uma comissão que tenha falhado da primeira vez.
          for (const id of await competenciasDoPagamento(tx, existente.id)) {
            await garantirComissaoRecorrenteSemDerrubar(tx, id)
          }
          return {
            ok: true as const,
            pagamentoId: existente.id,
            repetido: true,
            ativou: false,
            competencias,
          }
        }
        if (existente.status !== 'pendente') {
          throw new Recusa('pagamento_nao_confirmavel')
        }
      }

      if (!ASSINATURA_PAGAVEL.includes(assinatura.status)) {
        throw new Recusa('assinatura_nao_pagavel')
      }

      const alvo = await competenciasACobrir(tx, assinatura)
      if (!alvo.length) throw new Recusa('sem_competencia_a_cobrir')
      const devido = alvo.reduce((total, c) => total + c.aCobrir, 0)
      if (evento.valorCentavos !== devido) throw new Recusa('valor_divergente')

      const agora = new Date()
      let pagamentoId: string
      if (existente) {
        await tx
          .update(assinaturaPagamentos)
          .set({ status: 'confirmado', confirmadoEm, updatedAt: agora })
          .where(
            and(
              eq(assinaturaPagamentos.id, existente.id),
              eq(assinaturaPagamentos.status, 'pendente'),
            ),
          )
        pagamentoId = existente.id
      } else {
        const [criado] = await tx
          .insert(assinaturaPagamentos)
          .values({
            assinaturaId: assinatura.id,
            valorCentavos: evento.valorCentavos,
            moeda: MOEDA_ASSINATURA,
            status: 'confirmado',
            provedor: evento.provedor,
            idExterno,
            chaveIdempotencia,
            confirmadoEm,
          })
          .onConflictDoNothing()
          .returning({ id: assinaturaPagamentos.id })
        // A mesma identidade acabou de ser gravada por outra assinatura.
        if (!criado) throw new Recusa('evento_de_outra_assinatura')
        pagamentoId = criado.id
      }

      await tx.insert(assinaturaPagamentoAlocacoes).values(
        alvo.map((competencia) => ({
          pagamentoId,
          competenciaId: competencia.id,
          assinaturaId: assinatura.id,
          valorCentavos: competencia.aCobrir,
        })),
      )

      const ativou = assinatura.status === 'aguardando_pagamento'
      if (ativou) {
        await iniciarVigencia(tx, assinatura.id, confirmadoEm)
        /*
          A primeira assinatura ativada da conta é a que o parceiro de origem
          originou — e é aqui, e não na contratação, que a origem é consumida.
          Antes das comissões: um mês já cumprido que esperava este dinheiro
          precisa encontrar o parceiro.
        */
        await registrarAtribuicaoDaAssinatura(tx, {
          assinaturaId: assinatura.id,
          usuarioId: assinatura.clienteUsuarioId,
          nome: assinatura.planoNome,
        })
      }

      /*
        O mês que já estava cumprido e esperava o dinheiro ganha a comissão
        agora. Os demais — o caso comum do pagamento antecipado — respondem
        "não cumprida" e esperam o cumprimento.
      */
      for (const competencia of alvo) {
        await garantirComissaoRecorrenteSemDerrubar(tx, competencia.id)
      }
      // O mês coberto agora pode mudar a contagem de clientes ativos.
      await recalcularNivelDaAssinatura(tx, assinatura.id)

      const numeros = alvo.map((competencia) => competencia.numero)
      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.assinaturaPagamentoConfirmado,
          entidade: 'assinatura_pagamentos',
          registroAfetado: pagamentoId,
          autorId: evento.autorId ?? null,
          usuarioId: assinatura.clienteUsuarioId,
          origem: 'sistema',
          metadados: {
            assinaturaId: assinatura.id,
            provedor: evento.provedor,
            valorCentavos: evento.valorCentavos,
            moeda: MOEDA_ASSINATURA,
            competencias: numeros,
          },
        },
        tx,
      )
      if (ativou) {
        await registrarEventoAuditoria(
          {
            acao: ACOES_AUDITORIA.assinaturaAtivada,
            entidade: 'assinaturas',
            registroAfetado: assinatura.id,
            autorId: evento.autorId ?? null,
            usuarioId: assinatura.clienteUsuarioId,
            origem: 'sistema',
            metadados: {
              pagamentoId,
              vigenciaInicio: confirmadoEm.toISOString(),
            },
          },
          tx,
        )
      }

      return {
        ok: true as const,
        pagamentoId,
        repetido: false,
        ativou,
        competencias: numeros,
      }
    })
  } catch (erro) {
    if (erro instanceof Recusa) return recusa(erro.motivo)
    throw erro
  }
}

/** Um evento financeiro que diz: este dinheiro confirmado voltou. */
export type PagamentoEstornado = {
  provedor: ProvedorPagamentoAssinatura
  idExterno?: string | null
  chaveIdempotencia?: string | null
  estornadoEm?: Date
  autorId?: string | null
}

export type ResultadoDoEstorno =
  | {
      ok: true
      pagamentoId: string
      /** O estorno já tinha sido processado: nada mudou agora. */
      repetido: boolean
      /** O que aconteceu com a comissão de cada mês coberto. */
      comissoes: DesfechoDoEstorno[]
    }
  | {
      ok: false
      motivo:
        | 'provedor_invalido'
        | 'ambiente_nao_permitido'
        | 'identificacao_ausente'
        | 'data_invalida'
        | 'pagamento_inexistente'
        | 'pagamento_nao_estornavel'
    }

/**
 * Registra que o dinheiro confirmado de uma assinatura voltou.
 *
 * ## Só a verdade financeira e as comissões
 *
 * O pagamento vira `estornado` — a linha e as alocações ficam, e a cobertura
 * dos meses, que só conta confirmado, deixa de existir. Cada mês coberto por
 * ele passa pela revogação da comissão recorrente (`revogarComissaoRecorrente
 * PorEstorno`): nenhuma comissão fica disponível sobre dinheiro que voltou, e
 * a que já estava num saque solicitado sai dele.
 *
 * Não cancela o contrato, não mexe nos meses nem calcula devolução ao cliente:
 * isso é o fluxo de cancelamento e reembolso, fatia futura.
 *
 * ## Tudo ou nada, e de novo se preciso
 *
 * Uma transação, com o pagamento travado. Se cruzar com o pagamento de um
 * saque e o banco derrubar a transação por deadlock, ela é tentada de novo do
 * zero — o que foi feito na tentativa anterior foi desfeito. O mesmo evento
 * processado duas vezes devolve `repetido`.
 *
 * Mesma porta da confirmação: a origem `homologacao_manual` só em homologação.
 */
export async function estornarPagamentoDeAssinatura(
  evento: PagamentoEstornado,
): Promise<ResultadoDoEstorno> {
  const recusa = (motivo: Extract<ResultadoDoEstorno, { ok: false }>['motivo']) => ({
    ok: false as const,
    motivo,
  })

  if (!(PROVEDORES_PAGAMENTO_ASSINATURA as readonly string[]).includes(evento.provedor)) {
    return recusa('provedor_invalido')
  }
  if (evento.provedor === PROVEDOR_HOMOLOGACAO && !ambientePermiteConfirmacaoManual()) {
    return recusa('ambiente_nao_permitido')
  }
  const idExterno = limpar(evento.idExterno)
  const chaveIdempotencia = limpar(evento.chaveIdempotencia)
  if (!idExterno && !chaveIdempotencia) return recusa('identificacao_ausente')
  const estornadoEm = evento.estornadoEm ?? new Date()
  if (Number.isNaN(estornadoEm.getTime())) return recusa('data_invalida')

  const identidade = idExterno
    ? eq(assinaturaPagamentos.idExterno, idExterno)
    : eq(assinaturaPagamentos.chaveIdempotencia, chaveIdempotencia!)

  for (let tentativa = 1; ; tentativa++) {
    try {
      return await db.transaction(async (tx) => {
        const [pagamento] = await tx
          .select({
            id: assinaturaPagamentos.id,
            assinaturaId: assinaturaPagamentos.assinaturaId,
            valorCentavos: assinaturaPagamentos.valorCentavos,
            status: assinaturaPagamentos.status,
          })
          .from(assinaturaPagamentos)
          .where(and(eq(assinaturaPagamentos.provedor, evento.provedor), identidade))
          .limit(1)
          .for('update')
        if (!pagamento) return recusa('pagamento_inexistente')
        if (pagamento.status === 'estornado') {
          return { ok: true as const, pagamentoId: pagamento.id, repetido: true, comissoes: [] }
        }
        if (pagamento.status !== 'confirmado') return recusa('pagamento_nao_estornavel')

        await tx
          .update(assinaturaPagamentos)
          .set({ status: 'estornado', estornadoEm, updatedAt: new Date() })
          .where(eq(assinaturaPagamentos.id, pagamento.id))

        const comissoes: DesfechoDoEstorno[] = []
        for (const competenciaId of await competenciasDoPagamento(tx, pagamento.id)) {
          comissoes.push(
            await revogarComissaoRecorrentePorEstorno(tx, competenciaId, pagamento.id),
          )
        }
        // Sem o dinheiro, o cliente pode deixar de contar como ativo.
        await recalcularNivelDaAssinatura(tx, pagamento.assinaturaId)

        const [contrato] = await tx
          .select({ clienteUsuarioId: assinaturas.clienteUsuarioId })
          .from(assinaturas)
          .where(eq(assinaturas.id, pagamento.assinaturaId))
          .limit(1)
        await registrarEventoAuditoria(
          {
            acao: ACOES_AUDITORIA.assinaturaPagamentoEstornado,
            entidade: 'assinatura_pagamentos',
            registroAfetado: pagamento.id,
            autorId: evento.autorId ?? null,
            usuarioId: contrato?.clienteUsuarioId ?? null,
            origem: 'sistema',
            metadados: {
              assinaturaId: pagamento.assinaturaId,
              provedor: evento.provedor,
              valorCentavos: pagamento.valorCentavos,
              comissoes,
            },
          },
          tx,
        )

        return { ok: true as const, pagamentoId: pagamento.id, repetido: false, comissoes }
      })
    } catch (erro) {
      if (tentativa < 3 && ehConflitoDeTrava(erro)) continue
      throw erro
    }
  }
}
