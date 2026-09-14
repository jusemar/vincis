import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  assinaturaPagamentos,
  assinaturas,
  parceiroAtribuicoes,
  parceiroBonus,
  parceiroCampanhaContribuicoes,
  parceiroCampanhaRecompensas,
  parceiroCampanhas,
  parceiroComissoes,
  parceiroPontosLancamentos,
  parceiroSaqueItens,
  parceiros,
  usuarios,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIMEZONE_PADRAO } from '@/features/consultorias/constants/consultoria'
import { dataLocalDoInstante, dataLocalValida } from '@/features/consultorias/lib/tempo'
import {
  metaEmDinheiro,
  situacaoDaCampanha,
  tipoMetaValido,
  type SituacaoCampanha,
  type TipoMeta,
} from '../constants/campanha'
import { retirarDaReservaDeSaque } from './reserva-de-saque'

/*
  Campanhas do Programa de Parceiros: meta, progresso, recompensa.

  Nenhum alvo, valor, ponto ou data mora aqui — tudo vem da campanha que a
  Gestão configurou. O que mora aqui é o que conta como fato de negócio:

  - novos clientes recorrentes: assinatura originada pelo parceiro, ativada e
    com pagamento confirmado, com a ativação no período;
  - serviços avulsos: comissão avulsa liberada (serviço concluído) no período —
    o mesmo evento que libera a comissão de 10%;
  - valor gerado: valor desses serviços + pagamentos confirmados de assinaturas
    originadas, no período.

  O progresso é sempre reconciliado com essa verdade (`sincronizarCampanhaDoParceiro`):
  fatos novos entram, fatos que deixaram de valer (pagamento estornado) saem,
  e a recompensa acompanha — concedida uma vez ao atingir, desfeita se a meta
  deixa de estar sustentada antes do pagamento.
*/

type Banco = typeof db
type Transacao = Parameters<Parameters<Banco['transaction']>[0]>[0]
type ComTransacao = {
  transaction: <T>(fn: (tx: Transacao) => Promise<T>) => Promise<T>
}

/** Limites de sanidade — não são regra comercial. */
const LIMITE_ALVO_UNIDADES = 100_000
const LIMITE_ALVO_CENTAVOS = 2_000_000_000
const LIMITE_BONUS_CENTAVOS = 10_000_000
const LIMITE_PONTOS = 1_000_000

export const MOTIVO_SAQUE_CANCELADO_POR_BONUS =
  'Cancelado automaticamente: o bônus de campanha que sustentava este saque deixou de valer.'

export type OrigemDaContribuicao =
  | 'assinatura_ativada'
  | 'servico_avulso_concluido'
  | 'pagamento_assinatura'

/** Hoje, como dia do calendário de São Paulo. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return dataLocalDoInstante(agora, TIMEZONE_PADRAO)
}

/* ------------------------------------------------------------ configuração */

export type DadosDaCampanha = {
  titulo: string
  descricao: string
  tipoMeta: string
  /** Na unidade do tipo: clientes, serviços ou centavos. */
  alvo: number
  bonusCentavos: number
  pontos: number
  /** `AAAA-MM-DD`, dia de São Paulo. */
  inicio: string
  fim: string
}

export function validarDadosDaCampanha(dados: DadosDaCampanha): string | null {
  const titulo = dados.titulo.trim()
  if (titulo.length < 3 || titulo.length > 120) {
    return 'O título precisa ter entre 3 e 120 caracteres.'
  }
  if (dados.descricao.trim().length > 280) return 'A descrição curta aceita até 280 caracteres.'
  if (!tipoMetaValido(dados.tipoMeta)) return 'Escolha um tipo de meta disponível.'
  const emDinheiro = metaEmDinheiro(dados.tipoMeta)
  if (
    !Number.isInteger(dados.alvo) ||
    dados.alvo <= 0 ||
    dados.alvo > (emDinheiro ? LIMITE_ALVO_CENTAVOS : LIMITE_ALVO_UNIDADES)
  ) {
    return emDinheiro
      ? 'Informe o valor-alvo em reais, maior que zero.'
      : 'Informe a quantidade-alvo: um número inteiro maior que zero.'
  }
  if (
    !Number.isInteger(dados.bonusCentavos) ||
    dados.bonusCentavos < 0 ||
    dados.bonusCentavos > LIMITE_BONUS_CENTAVOS
  ) {
    return 'Bônus em dinheiro inválido.'
  }
  if (!Number.isInteger(dados.pontos) || dados.pontos < 0 || dados.pontos > LIMITE_PONTOS) {
    return 'Pontos inválidos: use um número inteiro.'
  }
  if (dados.bonusCentavos === 0 && dados.pontos === 0) {
    return 'Defina ao menos uma recompensa: bônus em dinheiro, pontos ou os dois.'
  }
  if (!dataLocalValida(dados.inicio) || !dataLocalValida(dados.fim)) {
    return 'Informe as datas de início e de fim.'
  }
  if (dados.fim < dados.inicio) return 'O fim não pode ser anterior ao início.'
  return null
}

export type ResultadoDaGestao = { ok: true; id: string } | { ok: false; mensagem: string }

function valoresDaCampanha(dados: DadosDaCampanha) {
  return {
    titulo: dados.titulo.trim(),
    descricao: dados.descricao.trim(),
    tipoMeta: dados.tipoMeta,
    alvo: dados.alvo,
    bonusCentavos: dados.bonusCentavos,
    pontos: dados.pontos,
    inicio: dados.inicio,
    fim: dados.fim,
  }
}

export async function criarRascunhoDeCampanha(
  dados: DadosDaCampanha,
  autorId: string,
): Promise<ResultadoDaGestao> {
  const erro = validarDadosDaCampanha(dados)
  if (erro) return { ok: false, mensagem: erro }
  return db.transaction(async (tx) => {
    const [criada] = await tx
      .insert(parceiroCampanhas)
      .values({ ...valoresDaCampanha(dados), criadaPor: autorId })
      .returning({ id: parceiroCampanhas.id })
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.campanhaParceiroCriada,
        entidade: 'parceiro_campanhas',
        registroAfetado: criada.id,
        autorId,
        origem: 'gestao_vincis',
        metadados: { ...valoresDaCampanha(dados), descricao: undefined },
      },
      tx,
    )
    return { ok: true as const, id: criada.id }
  })
}

/** Só rascunho se edita: campanha publicada tem a regra congelada. */
export async function editarRascunhoDeCampanha(
  id: string,
  dados: DadosDaCampanha,
  autorId: string,
): Promise<ResultadoDaGestao> {
  const erro = validarDadosDaCampanha(dados)
  if (erro) return { ok: false, mensagem: erro }
  return db.transaction(async (tx) => {
    const [editada] = await tx
      .update(parceiroCampanhas)
      .set({ ...valoresDaCampanha(dados), updatedAt: new Date() })
      .where(and(eq(parceiroCampanhas.id, id), eq(parceiroCampanhas.status, 'rascunho')))
      .returning({ id: parceiroCampanhas.id })
    if (!editada) {
      return {
        ok: false as const,
        mensagem:
          'Só rascunhos podem ser editados. A regra de campanha publicada fica congelada — para mudá-la, crie outra campanha.',
      }
    }
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.campanhaParceiroEditada,
        entidade: 'parceiro_campanhas',
        registroAfetado: id,
        autorId,
        origem: 'gestao_vincis',
        metadados: { ...valoresDaCampanha(dados), descricao: undefined },
      },
      tx,
    )
    return { ok: true as const, id }
  })
}

/**
 * Coloca a campanha no ar e congela a regra.
 *
 * O início não pode estar no passado: a campanha só conta o que acontece a
 * partir de quando os parceiros podem conhecê-la, sem prêmio retroativo.
 */
export async function publicarCampanha(
  id: string,
  autorId: string,
  agora: Date = new Date(),
): Promise<ResultadoDaGestao> {
  return db.transaction(async (tx) => {
    const [campanha] = await tx
      .select()
      .from(parceiroCampanhas)
      .where(eq(parceiroCampanhas.id, id))
      .limit(1)
      .for('update')
    if (!campanha) return { ok: false as const, mensagem: 'Campanha não encontrada.' }
    if (campanha.status !== 'rascunho') {
      return { ok: false as const, mensagem: 'Esta campanha já foi publicada ou cancelada.' }
    }
    const erro = validarDadosDaCampanha(campanha)
    if (erro) return { ok: false as const, mensagem: erro }
    if (campanha.inicio < hojeEmSaoPaulo(agora)) {
      return {
        ok: false as const,
        mensagem: 'O início já passou. Ajuste as datas do rascunho para hoje ou depois antes de publicar.',
      }
    }
    await tx
      .update(parceiroCampanhas)
      .set({ status: 'publicada', publicadaEm: agora, publicadaPor: autorId, updatedAt: agora })
      .where(and(eq(parceiroCampanhas.id, id), eq(parceiroCampanhas.status, 'rascunho')))
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.campanhaParceiroPublicada,
        entidade: 'parceiro_campanhas',
        registroAfetado: id,
        autorId,
        origem: 'gestao_vincis',
        metadados: {
          tipoMeta: campanha.tipoMeta,
          alvo: campanha.alvo,
          bonusCentavos: campanha.bonusCentavos,
          pontos: campanha.pontos,
          inicio: campanha.inicio,
          fim: campanha.fim,
        },
      },
      tx,
    )
    return { ok: true as const, id }
  })
}

/** Cancela rascunho, ou publicada enquanto ninguém ganhou a recompensa. */
export async function cancelarCampanha(
  id: string,
  autorId: string,
  agora: Date = new Date(),
): Promise<ResultadoDaGestao> {
  return db.transaction(async (tx) => {
    const [campanha] = await tx
      .select({ id: parceiroCampanhas.id, status: parceiroCampanhas.status })
      .from(parceiroCampanhas)
      .where(eq(parceiroCampanhas.id, id))
      .limit(1)
      .for('update')
    if (!campanha) return { ok: false as const, mensagem: 'Campanha não encontrada.' }
    if (campanha.status === 'cancelada') {
      return { ok: false as const, mensagem: 'Esta campanha já está cancelada.' }
    }
    const [premiada] = await tx
      .select({ id: parceiroCampanhaRecompensas.id })
      .from(parceiroCampanhaRecompensas)
      .where(
        and(
          eq(parceiroCampanhaRecompensas.campanhaId, id),
          eq(parceiroCampanhaRecompensas.status, 'concedida'),
        ),
      )
      .limit(1)
    if (premiada) {
      return {
        ok: false as const,
        mensagem: 'Não é possível cancelar: há parceiros que já ganharam a recompensa desta campanha.',
      }
    }
    await tx
      .update(parceiroCampanhas)
      .set({ status: 'cancelada', canceladaEm: agora, canceladaPor: autorId, updatedAt: agora })
      .where(eq(parceiroCampanhas.id, id))
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.campanhaParceiroCancelada,
        entidade: 'parceiro_campanhas',
        registroAfetado: id,
        autorId,
        origem: 'gestao_vincis',
        metadados: { statusAnterior: campanha.status },
      },
      tx,
    )
    return { ok: true as const, id }
  })
}

/* --------------------------------------------------------------- progresso */

type Campanha = typeof parceiroCampanhas.$inferSelect

type Fonte = {
  origemTipo: OrigemDaContribuicao
  origemId: string
  clienteUsuarioId: string | null
  valorCentavos: number
  ocorridoEm: Date
}

/** Os fatos de negócio do parceiro que valem para esta campanha, agora. */
async function fontesElegiveis(tx: Transacao, campanha: Campanha, parceiroId: string) {
  const noPeriodo = (instante: Date | null): instante is Date => {
    if (!instante) return false
    const dia = dataLocalDoInstante(instante, TIMEZONE_PADRAO)
    return dia >= campanha.inicio && dia <= campanha.fim
  }
  const fontes: Fonte[] = []

  if (campanha.tipoMeta === 'novos_clientes_recorrentes') {
    // A atribuição de assinatura só existe na primeira assinatura ativada da
    // conta originada pelo parceiro — a regra da origem, reaproveitada.
    const ativadas = await tx
      .select({
        id: assinaturas.id,
        cliente: assinaturas.clienteUsuarioId,
        ativadaEm: assinaturas.vigenciaInicio,
      })
      .from(parceiroAtribuicoes)
      .innerJoin(assinaturas, eq(assinaturas.id, parceiroAtribuicoes.assinaturaId))
      .where(
        and(
          eq(parceiroAtribuicoes.parceiroId, parceiroId),
          isNotNull(assinaturas.vigenciaInicio),
          sql`exists (
            select 1 from assinatura_pagamentos p
            where p.assinatura_id = ${assinaturas.id} and p.status = 'confirmado'
          )`,
        ),
      )
    for (const linha of ativadas) {
      if (noPeriodo(linha.ativadaEm)) {
        fontes.push({
          origemTipo: 'assinatura_ativada',
          origemId: linha.id,
          clienteUsuarioId: linha.cliente,
          valorCentavos: 0,
          ocorridoEm: linha.ativadaEm,
        })
      }
    }
  }

  if (campanha.tipoMeta === 'servicos_avulsos' || campanha.tipoMeta === 'valor_gerado') {
    // Liberada = serviço concluído: o mesmo evento da comissão avulsa.
    const servicos = await tx
      .select({
        id: parceiroComissoes.id,
        cliente: parceiroComissoes.clienteUsuarioId,
        valor: parceiroComissoes.valorBaseCentavos,
        liberadaEm: parceiroComissoes.disponivelEm,
      })
      .from(parceiroComissoes)
      .where(
        and(
          eq(parceiroComissoes.parceiroId, parceiroId),
          eq(parceiroComissoes.tipo, 'avulso'),
          inArray(parceiroComissoes.status, ['disponivel', 'paga']),
        ),
      )
    for (const linha of servicos) {
      if (noPeriodo(linha.liberadaEm)) {
        fontes.push({
          origemTipo: 'servico_avulso_concluido',
          origemId: linha.id,
          clienteUsuarioId: linha.cliente,
          valorCentavos: linha.valor,
          ocorridoEm: linha.liberadaEm,
        })
      }
    }
  }

  if (campanha.tipoMeta === 'valor_gerado') {
    const pagamentos = await tx
      .select({
        id: assinaturaPagamentos.id,
        valor: assinaturaPagamentos.valorCentavos,
        confirmadoEm: assinaturaPagamentos.confirmadoEm,
        cliente: assinaturas.clienteUsuarioId,
      })
      .from(assinaturaPagamentos)
      .innerJoin(assinaturas, eq(assinaturas.id, assinaturaPagamentos.assinaturaId))
      .innerJoin(parceiroAtribuicoes, eq(parceiroAtribuicoes.assinaturaId, assinaturas.id))
      .where(
        and(
          eq(parceiroAtribuicoes.parceiroId, parceiroId),
          eq(assinaturaPagamentos.status, 'confirmado'),
        ),
      )
    for (const linha of pagamentos) {
      if (noPeriodo(linha.confirmadoEm)) {
        fontes.push({
          origemTipo: 'pagamento_assinatura',
          origemId: linha.id,
          clienteUsuarioId: linha.cliente,
          valorCentavos: linha.valor,
          ocorridoEm: linha.confirmadoEm,
        })
      }
    }
  }

  return fontes
}

/** Progresso a partir das contribuições válidas, na unidade do tipo. */
export function progressoDasContribuicoes(
  tipo: TipoMeta,
  validas: { origemId: string; clienteUsuarioId: string | null; valorCentavos: number }[],
): number {
  if (tipo === 'novos_clientes_recorrentes') {
    return new Set(validas.map((c) => c.clienteUsuarioId ?? c.origemId)).size
  }
  if (tipo === 'servicos_avulsos') return validas.length
  return validas.reduce((total, c) => total + c.valorCentavos, 0)
}

export type ProgressoDaCampanha = {
  campanhaId: string
  progresso: number
  alvo: number
  atingida: boolean
}

/**
 * Reconcilia o progresso de um parceiro numa campanha e ajusta a recompensa.
 *
 * ## Idempotente
 *
 * Fatos novos entram (o índice único impede a mesma origem duas vezes), fatos
 * que deixaram de valer viram `revertida`, e rodar de novo sem novidade não
 * muda nada. A recompensa nasce uma vez ao atingir e é desfeita se a meta cai
 * abaixo do alvo antes de o dinheiro ser pago.
 *
 * ## Travas
 *
 * A campanha fica em `for share` (cancelar espera) e o par campanha+parceiro
 * numa trava consultiva da transação: duas reconciliações simultâneas do mesmo
 * parceiro fazem fila, e nenhuma recompensa sai em dobro.
 */
export async function sincronizarCampanhaDoParceiro(
  tx: Transacao,
  campanhaId: string,
  parceiroId: string,
  agora: Date = new Date(),
): Promise<ProgressoDaCampanha | null> {
  const [campanha] = await tx
    .select()
    .from(parceiroCampanhas)
    .where(eq(parceiroCampanhas.id, campanhaId))
    .limit(1)
    .for('share')
  if (!campanha || campanha.status !== 'publicada' || campanha.inicio > hojeEmSaoPaulo(agora)) {
    return null
  }
  if (!tipoMetaValido(campanha.tipoMeta)) return null

  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`campanha:${campanhaId}:${parceiroId}`}, 0))`,
  )

  const fontes = await fontesElegiveis(tx, campanha, parceiroId)
  const chave = (tipo: string, id: string) => `${tipo}:${id}`
  const porChave = new Map(fontes.map((f) => [chave(f.origemTipo, f.origemId), f]))

  const existentes = await tx
    .select({
      id: parceiroCampanhaContribuicoes.id,
      origemTipo: parceiroCampanhaContribuicoes.origemTipo,
      origemId: parceiroCampanhaContribuicoes.origemId,
      status: parceiroCampanhaContribuicoes.status,
    })
    .from(parceiroCampanhaContribuicoes)
    .where(
      and(
        eq(parceiroCampanhaContribuicoes.campanhaId, campanhaId),
        eq(parceiroCampanhaContribuicoes.parceiroId, parceiroId),
      ),
    )
  const jaRegistradas = new Set(existentes.map((e) => chave(e.origemTipo, e.origemId)))

  const novas = fontes.filter((f) => !jaRegistradas.has(chave(f.origemTipo, f.origemId)))
  if (novas.length) {
    await tx
      .insert(parceiroCampanhaContribuicoes)
      .values(novas.map((f) => ({ campanhaId, parceiroId, ...f })))
      .onConflictDoNothing()
  }
  for (const existente of existentes) {
    const vale = porChave.has(chave(existente.origemTipo, existente.origemId))
    if (vale && existente.status === 'revertida') {
      await tx
        .update(parceiroCampanhaContribuicoes)
        .set({ status: 'valida', revertidaEm: null, updatedAt: agora })
        .where(eq(parceiroCampanhaContribuicoes.id, existente.id))
    } else if (!vale && existente.status === 'valida') {
      await tx
        .update(parceiroCampanhaContribuicoes)
        .set({ status: 'revertida', revertidaEm: agora, updatedAt: agora })
        .where(eq(parceiroCampanhaContribuicoes.id, existente.id))
    }
  }

  const validas = await tx
    .select({
      origemId: parceiroCampanhaContribuicoes.origemId,
      clienteUsuarioId: parceiroCampanhaContribuicoes.clienteUsuarioId,
      valorCentavos: parceiroCampanhaContribuicoes.valorCentavos,
    })
    .from(parceiroCampanhaContribuicoes)
    .where(
      and(
        eq(parceiroCampanhaContribuicoes.campanhaId, campanhaId),
        eq(parceiroCampanhaContribuicoes.parceiroId, parceiroId),
        eq(parceiroCampanhaContribuicoes.status, 'valida'),
      ),
    )
  const progresso = progressoDasContribuicoes(campanha.tipoMeta, validas)
  const atingida = progresso >= campanha.alvo

  const [concedida] = await tx
    .select()
    .from(parceiroCampanhaRecompensas)
    .where(
      and(
        eq(parceiroCampanhaRecompensas.campanhaId, campanhaId),
        eq(parceiroCampanhaRecompensas.parceiroId, parceiroId),
        eq(parceiroCampanhaRecompensas.status, 'concedida'),
      ),
    )
    .limit(1)
    .for('update')

  if (atingida && !concedida) await concederRecompensa(tx, campanha, parceiroId, agora)
  if (!atingida && concedida) await desfazerRecompensa(tx, campanha, concedida, agora)

  return { campanhaId, progresso, alvo: campanha.alvo, atingida }
}

async function usuarioDoParceiro(tx: Transacao, parceiroId: string) {
  const [linha] = await tx
    .select({ usuarioId: parceiros.usuarioId })
    .from(parceiros)
    .where(eq(parceiros.id, parceiroId))
    .limit(1)
  return linha?.usuarioId ?? null
}

async function concederRecompensa(
  tx: Transacao,
  campanha: Campanha,
  parceiroId: string,
  agora: Date,
) {
  const [recompensa] = await tx
    .insert(parceiroCampanhaRecompensas)
    .values({
      campanhaId: campanha.id,
      parceiroId,
      bonusCentavos: campanha.bonusCentavos,
      pontos: campanha.pontos,
      concedidaEm: agora,
    })
    .onConflictDoNothing()
    .returning({ id: parceiroCampanhaRecompensas.id })
  if (!recompensa) return

  const usuarioId = await usuarioDoParceiro(tx, parceiroId)
  if (campanha.bonusCentavos > 0) {
    // Todos os fatos que sustentam a meta já são definitivos no domínio: o
    // bônus nasce disponível. Invalidação posterior é tratada na reconciliação.
    await tx.insert(parceiroBonus).values({
      recompensaId: recompensa.id,
      parceiroId,
      campanhaId: campanha.id,
      valorCentavos: campanha.bonusCentavos,
      status: 'disponivel',
      disponivelEm: agora,
    })
  }
  if (campanha.pontos > 0) {
    await tx.insert(parceiroPontosLancamentos).values({
      parceiroId,
      pontos: campanha.pontos,
      tipo: 'credito',
      campanhaId: campanha.id,
      recompensaId: recompensa.id,
      descricao: campanha.titulo,
    })
    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.pontosParceiroCreditados,
        entidade: 'parceiro_pontos_lancamentos',
        registroAfetado: recompensa.id,
        usuarioId,
        origem: 'sistema',
        metadados: { parceiroId, campanhaId: campanha.id, pontos: campanha.pontos },
      },
      tx,
    )
  }
  await registrarEventoAuditoria(
    {
      acao: ACOES_AUDITORIA.recompensaCampanhaConcedida,
      entidade: 'parceiro_campanha_recompensas',
      registroAfetado: recompensa.id,
      usuarioId,
      origem: 'sistema',
      metadados: {
        parceiroId,
        campanhaId: campanha.id,
        bonusCentavos: campanha.bonusCentavos,
        pontos: campanha.pontos,
      },
    },
    tx,
  )
}

async function desfazerRecompensa(
  tx: Transacao,
  campanha: Campanha,
  recompensa: typeof parceiroCampanhaRecompensas.$inferSelect,
  agora: Date,
) {
  const usuarioId = await usuarioDoParceiro(tx, recompensa.parceiroId)
  const [bonus] = await tx
    .select()
    .from(parceiroBonus)
    .where(eq(parceiroBonus.recompensaId, recompensa.id))
    .limit(1)
    .for('update')

  // Dinheiro já pago: nenhum débito automático. Sinaliza a compensação e mantém
  // a recompensa (e os pontos) como estão.
  if (bonus?.status === 'paga') {
    if (!bonus.compensacaoPendenteEm) {
      await tx
        .update(parceiroBonus)
        .set({ compensacaoPendenteEm: agora, updatedAt: agora })
        .where(eq(parceiroBonus.id, bonus.id))
      await tx
        .update(parceiroCampanhaRecompensas)
        .set({ compensacaoPendenteEm: agora, updatedAt: agora })
        .where(eq(parceiroCampanhaRecompensas.id, recompensa.id))
      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.recompensaCampanhaPagaInvalidada,
          entidade: 'parceiro_campanha_recompensas',
          registroAfetado: recompensa.id,
          usuarioId,
          origem: 'sistema',
          metadados: {
            parceiroId: recompensa.parceiroId,
            campanhaId: campanha.id,
            bonusId: bonus.id,
            valorCentavos: bonus.valorCentavos,
            compensacao: 'pendente',
          },
        },
        tx,
      )
    }
    return
  }

  if (bonus?.status === 'disponivel') {
    await retirarDaReservaDeSaque(
      tx,
      { bonusId: bonus.id },
      {
        valorCentavos: bonus.valorCentavos,
        observacaoSeEsvaziar: MOTIVO_SAQUE_CANCELADO_POR_BONUS,
        metadados: {
          parceiroId: recompensa.parceiroId,
          bonusId: bonus.id,
          campanhaId: campanha.id,
          motivo: 'bonus_de_campanha_invalidado',
        },
      },
    )
    await tx
      .update(parceiroBonus)
      .set({ status: 'cancelada', canceladaEm: agora, updatedAt: agora })
      .where(and(eq(parceiroBonus.id, bonus.id), eq(parceiroBonus.status, 'disponivel')))
  }

  const [credito] = await tx
    .select()
    .from(parceiroPontosLancamentos)
    .where(
      and(
        eq(parceiroPontosLancamentos.recompensaId, recompensa.id),
        eq(parceiroPontosLancamentos.tipo, 'credito'),
      ),
    )
    .limit(1)
  if (credito) {
    const [reversao] = await tx
      .insert(parceiroPontosLancamentos)
      .values({
        parceiroId: recompensa.parceiroId,
        pontos: -credito.pontos,
        tipo: 'reversao',
        campanhaId: campanha.id,
        recompensaId: recompensa.id,
        lancamentoRevertidoId: credito.id,
        descricao: `Reversão — ${campanha.titulo}`.slice(0, 160),
      })
      .onConflictDoNothing()
      .returning({ id: parceiroPontosLancamentos.id })
    if (reversao) {
      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.pontosParceiroRevertidos,
          entidade: 'parceiro_pontos_lancamentos',
          registroAfetado: reversao.id,
          usuarioId,
          origem: 'sistema',
          metadados: {
            parceiroId: recompensa.parceiroId,
            campanhaId: campanha.id,
            pontos: -credito.pontos,
          },
        },
        tx,
      )
    }
  }

  await tx
    .update(parceiroCampanhaRecompensas)
    .set({
      status: 'revertida',
      revertidaEm: agora,
      motivoReversao: 'meta_deixou_de_ser_atingida',
      updatedAt: agora,
    })
    .where(eq(parceiroCampanhaRecompensas.id, recompensa.id))
  await registrarEventoAuditoria(
    {
      acao: ACOES_AUDITORIA.recompensaCampanhaRevertida,
      entidade: 'parceiro_campanha_recompensas',
      registroAfetado: recompensa.id,
      usuarioId,
      origem: 'sistema',
      metadados: {
        parceiroId: recompensa.parceiroId,
        campanhaId: campanha.id,
        bonusCancelado: bonus?.status === 'disponivel',
        pontosRevertidos: credito?.pontos ?? 0,
      },
    },
    tx,
  )
}

/** Todas as campanhas publicadas já iniciadas, para um parceiro. */
export async function sincronizarCampanhasDoParceiro(
  tx: Transacao,
  parceiroId: string,
  agora: Date = new Date(),
): Promise<ProgressoDaCampanha[]> {
  const hoje = hojeEmSaoPaulo(agora)
  const campanhas = await tx
    .select({ id: parceiroCampanhas.id })
    .from(parceiroCampanhas)
    .where(and(eq(parceiroCampanhas.status, 'publicada'), sql`${parceiroCampanhas.inicio} <= ${hoje}`))
  const resultados: ProgressoDaCampanha[] = []
  for (const campanha of campanhas) {
    const resultado = await sincronizarCampanhaDoParceiro(tx, campanha.id, parceiroId, agora)
    if (resultado) resultados.push(resultado)
  }
  return resultados
}

/**
 * O mesmo, num ponto de salvamento: pagamento e conclusão de serviço não podem
 * falhar porque a campanha tropeçou. A próxima reconciliação refaz.
 */
export async function sincronizarCampanhasSemDerrubar(
  executor: ComTransacao,
  parceiroId: string,
): Promise<void> {
  try {
    await executor.transaction((interna) => sincronizarCampanhasDoParceiro(interna, parceiroId))
  } catch (erro) {
    console.error('[PARCEIROS] falha ao reconciliar campanhas', {
      parceiroId,
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
  }
}

async function parceiroDaAssinatura(tx: Transacao, assinaturaId: string) {
  const [atribuida] = await tx
    .select({ parceiroId: parceiroAtribuicoes.parceiroId })
    .from(parceiroAtribuicoes)
    .where(eq(parceiroAtribuicoes.assinaturaId, assinaturaId))
    .limit(1)
  return atribuida?.parceiroId ?? null
}

/** Reconciliação depois de pagamento confirmado: tolerante a falha. */
export async function sincronizarCampanhasDaAssinaturaSemDerrubar(
  tx: Transacao,
  assinaturaId: string,
): Promise<void> {
  const parceiroId = await parceiroDaAssinatura(tx, assinaturaId)
  if (parceiroId) await sincronizarCampanhasSemDerrubar(tx, parceiroId)
}

/**
 * Reconciliação depois de estorno: dentro da transação, sem ponto de
 * salvamento — bônus sobre dinheiro que voltou não pode sobreviver a uma falha.
 */
export async function sincronizarCampanhasDaAssinatura(
  tx: Transacao,
  assinaturaId: string,
): Promise<void> {
  const parceiroId = await parceiroDaAssinatura(tx, assinaturaId)
  if (parceiroId) await sincronizarCampanhasDoParceiro(tx, parceiroId)
}

/* ----------------------------------------------------------------- leitura */

export type RecompensaDoParceiro = {
  status: 'concedida' | 'revertida'
  bonusCentavos: number
  pontos: number
  bonusStatus: 'disponivel' | 'paga' | 'cancelada' | null
  bonusReservadoEmSaque: boolean
  compensacaoPendente: boolean
  concedidaEm: Date
}

export type CampanhaDoParceiro = {
  id: string
  titulo: string
  descricao: string
  tipoMeta: TipoMeta
  alvo: number
  bonusCentavos: number
  pontos: number
  inicio: string
  fim: string
  situacao: SituacaoCampanha
  progresso: number
  atingida: boolean
  recompensa: RecompensaDoParceiro | null
}

/**
 * As campanhas que o parceiro vê, com progresso real — reconciliado agora.
 *
 * Agendadas, ativas e encerradas. Encerradas antigas só aparecem se o parceiro
 * tem recompensa nelas. Rascunho e cancelada não aparecem.
 */
export async function listarCampanhasDoParceiro(
  parceiroId: string,
  agora: Date = new Date(),
): Promise<CampanhaDoParceiro[]> {
  try {
    await db.transaction((tx) => sincronizarCampanhasDoParceiro(tx, parceiroId, agora))
  } catch (erro) {
    console.error('[PARCEIROS] falha ao reconciliar campanhas na leitura', {
      parceiroId,
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
  }

  const hoje = hojeEmSaoPaulo(agora)
  const campanhas = await db
    .select()
    .from(parceiroCampanhas)
    .where(eq(parceiroCampanhas.status, 'publicada'))
    .orderBy(asc(parceiroCampanhas.fim))
  if (!campanhas.length) return []
  const ids = campanhas.map((c) => c.id)

  const validas = await db
    .select({
      campanhaId: parceiroCampanhaContribuicoes.campanhaId,
      origemId: parceiroCampanhaContribuicoes.origemId,
      clienteUsuarioId: parceiroCampanhaContribuicoes.clienteUsuarioId,
      valorCentavos: parceiroCampanhaContribuicoes.valorCentavos,
    })
    .from(parceiroCampanhaContribuicoes)
    .where(
      and(
        inArray(parceiroCampanhaContribuicoes.campanhaId, ids),
        eq(parceiroCampanhaContribuicoes.parceiroId, parceiroId),
        eq(parceiroCampanhaContribuicoes.status, 'valida'),
      ),
    )

  const recompensas = await db
    .select({
      campanhaId: parceiroCampanhaRecompensas.campanhaId,
      status: parceiroCampanhaRecompensas.status,
      bonusCentavos: parceiroCampanhaRecompensas.bonusCentavos,
      pontos: parceiroCampanhaRecompensas.pontos,
      concedidaEm: parceiroCampanhaRecompensas.concedidaEm,
      compensacaoPendenteEm: parceiroCampanhaRecompensas.compensacaoPendenteEm,
      bonusStatus: parceiroBonus.status,
      bonusReservado: sql<boolean>`exists (
        select 1 from parceiro_saque_itens i
        where i.bonus_id = ${parceiroBonus.id} and i.liberado_em is null
      )`,
    })
    .from(parceiroCampanhaRecompensas)
    .leftJoin(parceiroBonus, eq(parceiroBonus.recompensaId, parceiroCampanhaRecompensas.id))
    .where(
      and(
        inArray(parceiroCampanhaRecompensas.campanhaId, ids),
        eq(parceiroCampanhaRecompensas.parceiroId, parceiroId),
      ),
    )
    .orderBy(desc(parceiroCampanhaRecompensas.concedidaEm))

  const ORDEM: Record<SituacaoCampanha, number> = {
    ativa: 0,
    agendada: 1,
    encerrada: 2,
    rascunho: 3,
    cancelada: 4,
  }

  return campanhas
    .filter((c) => tipoMetaValido(c.tipoMeta))
    .map((campanha) => {
      const tipoMeta = campanha.tipoMeta as TipoMeta
      const progresso = progressoDasContribuicoes(
        tipoMeta,
        validas.filter((v) => v.campanhaId === campanha.id),
      )
      // A concedida manda; sem ela, a mais recente (revertida) conta a história.
      const daCampanha = recompensas.filter((r) => r.campanhaId === campanha.id)
      const recompensa = daCampanha.find((r) => r.status === 'concedida') ?? daCampanha[0] ?? null
      return {
        id: campanha.id,
        titulo: campanha.titulo,
        descricao: campanha.descricao,
        tipoMeta,
        alvo: campanha.alvo,
        bonusCentavos: campanha.bonusCentavos,
        pontos: campanha.pontos,
        inicio: campanha.inicio,
        fim: campanha.fim,
        situacao: situacaoDaCampanha(campanha, hoje),
        progresso,
        atingida: recompensa?.status === 'concedida',
        recompensa: recompensa
          ? {
              status: recompensa.status as 'concedida' | 'revertida',
              bonusCentavos: recompensa.bonusCentavos,
              pontos: recompensa.pontos,
              bonusStatus: (recompensa.bonusStatus as RecompensaDoParceiro['bonusStatus']) ?? null,
              bonusReservadoEmSaque: Boolean(recompensa.bonusReservado),
              compensacaoPendente: recompensa.compensacaoPendenteEm !== null,
              concedidaEm: recompensa.concedidaEm,
            }
          : null,
      }
    })
    .filter((c) => c.situacao !== 'encerrada' || c.recompensa !== null || c.progresso > 0)
    .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao])
}

export type ExtratoDePontos = {
  saldo: number
  lancamentos: {
    id: string
    pontos: number
    tipo: 'credito' | 'reversao'
    descricao: string
    criadoEm: Date
  }[]
}

/** Saldo (soma dos lançamentos) e extrato, do mais recente ao mais antigo. */
export async function obterExtratoDePontos(
  parceiroId: string,
  limite = 50,
): Promise<ExtratoDePontos> {
  const [soma] = await db
    .select({
      saldo: sql<number>`coalesce(sum(${parceiroPontosLancamentos.pontos}), 0)`.mapWith(Number),
    })
    .from(parceiroPontosLancamentos)
    .where(eq(parceiroPontosLancamentos.parceiroId, parceiroId))
  const lancamentos = await db
    .select({
      id: parceiroPontosLancamentos.id,
      pontos: parceiroPontosLancamentos.pontos,
      tipo: parceiroPontosLancamentos.tipo,
      descricao: parceiroPontosLancamentos.descricao,
      criadoEm: parceiroPontosLancamentos.createdAt,
    })
    .from(parceiroPontosLancamentos)
    .where(eq(parceiroPontosLancamentos.parceiroId, parceiroId))
    .orderBy(desc(parceiroPontosLancamentos.createdAt))
    .limit(limite)
  return {
    saldo: soma?.saldo ?? 0,
    lancamentos: lancamentos.map((l) => ({ ...l, tipo: l.tipo as 'credito' | 'reversao' })),
  }
}

export type ParticipanteDaCampanha = {
  parceiroId: string
  nome: string
  codigo: string
  progresso: number
  atingiu: boolean
  recompensaStatus: 'concedida' | 'revertida' | null
  bonusStatus: string | null
}

export type CampanhaParaGestao = {
  id: string
  titulo: string
  descricao: string
  tipoMeta: TipoMeta
  alvo: number
  bonusCentavos: number
  pontos: number
  inicio: string
  fim: string
  status: string
  situacao: SituacaoCampanha
  publicadaEm: Date | null
  participantes: ParticipanteDaCampanha[]
}

/** Campanhas para a Gestão, com participantes e quem atingiu. */
export async function listarCampanhasParaGestao(
  agora: Date = new Date(),
): Promise<CampanhaParaGestao[]> {
  const hoje = hojeEmSaoPaulo(agora)
  const campanhas = await db
    .select()
    .from(parceiroCampanhas)
    .orderBy(desc(parceiroCampanhas.createdAt))
  if (!campanhas.length) return []
  const ids = campanhas.map((c) => c.id)

  const contribuicoes = await db
    .select({
      campanhaId: parceiroCampanhaContribuicoes.campanhaId,
      parceiroId: parceiroCampanhaContribuicoes.parceiroId,
      origemId: parceiroCampanhaContribuicoes.origemId,
      clienteUsuarioId: parceiroCampanhaContribuicoes.clienteUsuarioId,
      valorCentavos: parceiroCampanhaContribuicoes.valorCentavos,
    })
    .from(parceiroCampanhaContribuicoes)
    .where(
      and(
        inArray(parceiroCampanhaContribuicoes.campanhaId, ids),
        eq(parceiroCampanhaContribuicoes.status, 'valida'),
      ),
    )
  const recompensas = await db
    .select({
      campanhaId: parceiroCampanhaRecompensas.campanhaId,
      parceiroId: parceiroCampanhaRecompensas.parceiroId,
      status: parceiroCampanhaRecompensas.status,
      bonusStatus: parceiroBonus.status,
    })
    .from(parceiroCampanhaRecompensas)
    .leftJoin(parceiroBonus, eq(parceiroBonus.recompensaId, parceiroCampanhaRecompensas.id))
    .where(inArray(parceiroCampanhaRecompensas.campanhaId, ids))
    .orderBy(desc(parceiroCampanhaRecompensas.concedidaEm))

  const parceiroIds = Array.from(
    new Set([...contribuicoes.map((c) => c.parceiroId), ...recompensas.map((r) => r.parceiroId)]),
  )
  const nomes = parceiroIds.length
    ? await db
        .select({ id: parceiros.id, codigo: parceiros.codigo, nome: usuarios.nome })
        .from(parceiros)
        .innerJoin(usuarios, eq(usuarios.id, parceiros.usuarioId))
        .where(inArray(parceiros.id, parceiroIds))
    : []

  return campanhas
    .filter((c) => tipoMetaValido(c.tipoMeta))
    .map((campanha) => {
      const tipoMeta = campanha.tipoMeta as TipoMeta
      const daCampanha = contribuicoes.filter((c) => c.campanhaId === campanha.id)
      const recompensasDaCampanha = recompensas.filter((r) => r.campanhaId === campanha.id)
      const envolvidos = Array.from(
        new Set([...daCampanha.map((c) => c.parceiroId), ...recompensasDaCampanha.map((r) => r.parceiroId)]),
      )
      const participantes = envolvidos
        .map((parceiroId) => {
          const recompensa =
            recompensasDaCampanha.find((r) => r.parceiroId === parceiroId && r.status === 'concedida') ??
            recompensasDaCampanha.find((r) => r.parceiroId === parceiroId) ??
            null
          const pessoa = nomes.find((n) => n.id === parceiroId)
          return {
            parceiroId,
            nome: pessoa?.nome ?? 'Parceiro',
            codigo: pessoa?.codigo ?? '',
            progresso: progressoDasContribuicoes(
              tipoMeta,
              daCampanha.filter((c) => c.parceiroId === parceiroId),
            ),
            atingiu: recompensa?.status === 'concedida',
            recompensaStatus: (recompensa?.status as ParticipanteDaCampanha['recompensaStatus']) ?? null,
            bonusStatus: recompensa?.bonusStatus ?? null,
          }
        })
        .sort((a, b) => b.progresso - a.progresso)
      return {
        id: campanha.id,
        titulo: campanha.titulo,
        descricao: campanha.descricao,
        tipoMeta,
        alvo: campanha.alvo,
        bonusCentavos: campanha.bonusCentavos,
        pontos: campanha.pontos,
        inicio: campanha.inicio,
        fim: campanha.fim,
        status: campanha.status,
        situacao: situacaoDaCampanha(campanha, hoje),
        publicadaEm: campanha.publicadaEm,
        participantes,
      }
    })
}

/** Reconcilia uma campanha para todos os parceiros — "Recalcular progresso". */
export async function recalcularCampanhaParaTodos(
  campanhaId: string,
  agora: Date = new Date(),
): Promise<number> {
  const todos = await db.select({ id: parceiros.id }).from(parceiros)
  let processados = 0
  for (const { id } of todos) {
    const resultado = await db.transaction((tx) =>
      sincronizarCampanhaDoParceiro(tx, campanhaId, id, agora),
    )
    if (resultado) processados += 1
  }
  return processados
}

/** Bônus livres (disponíveis e fora de saque) — para o saldo. */
export async function bonusLivresDoParceiro(parceiroId: string) {
  return db
    .select({ id: parceiroBonus.id, valorCentavos: parceiroBonus.valorCentavos })
    .from(parceiroBonus)
    .leftJoin(
      parceiroSaqueItens,
      and(eq(parceiroSaqueItens.bonusId, parceiroBonus.id), isNull(parceiroSaqueItens.liberadoEm)),
    )
    .where(
      and(
        eq(parceiroBonus.parceiroId, parceiroId),
        eq(parceiroBonus.status, 'disponivel'),
        isNull(parceiroSaqueItens.id),
      ),
    )
}
