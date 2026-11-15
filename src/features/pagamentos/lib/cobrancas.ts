import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/db/connection'
import { cobrancasPix } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import {
  MENSAGEM_HONORARIOS_DIRETOS,
  prestadorCobraDiretamente,
} from '@/features/profissionais/lib/honorarios'
import { MENSAGEM_COMISSAO_PENDENTE } from '@/features/servicos/constants/comissao'
import { ErroEfi } from '@/integracoes/efi/cliente'
import { ConfiguracaoEfiAusente, variaveisEfiFaltando } from '@/integracoes/efi/configuracao'
import {
  consultarCobrancaPix,
  criarCobrancaPixImediata,
  gerarQrCodeLocal,
  gerarTxid,
  type PixRecebido,
} from '@/integracoes/efi/pix'
import {
  GERACAO_TRAVADA_APOS_MS,
  INTERVALO_MINIMO_CONSULTA_EFI_MS,
  MENSAGEM_PIX_INDISPONIVEL,
  MENSAGEM_PIX_NAO_CONFIGURADO,
  MENSAGEM_PIX_RECUSADO,
  type FinalidadeCobranca,
  type StatusCobranca,
} from '../constants/cobranca'
import { colunasDoRetrato, finalidadeAvulsa, retratoDoContexto } from './comissao-vincis'
import type { CobrancaPixDTO, ResultadoCobranca } from '../types/cobranca'
import type { ResultadoEfeito } from '../types/efeito'
import { aplicarEfeitoDaCobranca } from './efeitos'

/**
 * O núcleo da cobrança Pix — único para serviço, consultoria, acordo e plano.
 *
 * ## Divisão de responsabilidades
 *
 * - **Aqui**: emitir, reaproveitar, consultar e confirmar cobrança. Nenhuma
 *   regra de serviço, agenda ou plano.
 * - **No domínio**: decidir o valor (sempre do banco), quem pode pagar e o que
 *   o pagamento produz (`AplicarEfeito`).
 * - **Na tela**: mostrar. A tela nunca decide que algo foi pago.
 *
 * ## De onde vem a confirmação
 *
 * Só de `consultarCobrancaPix` — a API da Efí, autenticada por mTLS. Webhook,
 * polling do navegador e o job de reconciliação são três gatilhos da **mesma**
 * pergunta à Efí, e todos terminam em `confirmarPixRecebido`, que é idempotente
 * por trava de linha e índices únicos.
 */

type LinhaCobranca = typeof cobrancasPix.$inferSelect

export type PedidoDeCobranca = {
  finalidade: FinalidadeCobranca
  referenciaId: string
  clienteUsuarioId: string
  prestadorId: string | null
  /** Sempre apurado no servidor pelo domínio. */
  valorCentavos: number
  descricao: string
  contexto: Record<string, unknown>
  expiracaoSegundos: number
}

const CODIGO_UNICIDADE_POSTGRES = '23505'

/** O Drizzle embrulha o erro do Postgres: o código pode estar na `cause`. */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false
  if ((erro as { code?: string }).code === CODIGO_UNICIDADE_POSTGRES) return true
  return ehViolacaoDeUnicidade((erro as { cause?: unknown }).cause)
}

export function paraDTO(linha: LinhaCobranca): CobrancaPixDTO {
  return {
    id: linha.id,
    finalidade: linha.finalidade as FinalidadeCobranca,
    status: linha.status as StatusCobranca,
    valorCentavos: linha.valorCentavos,
    descricao: linha.descricao,
    pixCopiaECola: linha.status === 'aguardando_pagamento' ? linha.pixCopiaECola : null,
    qrCodeImagem: linha.status === 'aguardando_pagamento' ? linha.qrCodeImagem : null,
    expiraEm: linha.expiraEm,
    pagaEm: linha.pagaEm,
    efeito: (linha.efeito as CobrancaPixDTO['efeito']) ?? null,
    atendimentoId: linha.atendimentoId,
    protocolo: linha.protocolo,
  }
}

async function buscarPorId(id: string) {
  const [linha] = await db.select().from(cobrancasPix).where(eq(cobrancasPix.id, id)).limit(1)
  return linha ?? null
}

async function buscarViva(pedido: Pick<PedidoDeCobranca, 'finalidade' | 'referenciaId' | 'clienteUsuarioId'>) {
  const [linha] = await db
    .select()
    .from(cobrancasPix)
    .where(
      and(
        eq(cobrancasPix.finalidade, pedido.finalidade),
        eq(cobrancasPix.referenciaId, pedido.referenciaId),
        eq(cobrancasPix.clienteUsuarioId, pedido.clienteUsuarioId),
        inArray(cobrancasPix.status, ['gerando', 'aguardando_pagamento']),
      ),
    )
    .limit(1)
  return linha ?? null
}

/**
 * Por que a emissão falhou — gravado em `cobrancas_pix.erro` e traduzido numa
 * mensagem pública precisa. O detalhe técnico fica só no log do servidor.
 *
 * - `configuracao_efi_ausente`: o ambiente não tem a Efí configurada (ou a
 *   configuração é inválida). Nenhuma chamada à Efí aconteceu.
 * - `efi_recusou`: a Efí respondeu e recusou (4xx) — credencial, chave Pix,
 *   certificado ou dado da cobrança.
 * - `efi_indisponivel`: rede, tempo esgotado ou 5xx — transitório.
 */
function classificarFalha(erro: unknown) {
  if (erro instanceof ConfiguracaoEfiAusente) {
    return { codigo: 'configuracao_efi_ausente', mensagem: MENSAGEM_PIX_NAO_CONFIGURADO }
  }
  if (erro instanceof ErroEfi && !erro.transitorio) {
    return { codigo: 'efi_recusou', mensagem: MENSAGEM_PIX_RECUSADO }
  }
  return { codigo: 'efi_indisponivel', mensagem: MENSAGEM_PIX_INDISPONIVEL }
}

/** Erro técnico vira mensagem pública; o detalhe fica só no log do servidor. */
function registrarFalhaDaEfi(contexto: string, erro: unknown) {
  if (erro instanceof ConfiguracaoEfiAusente) {
    // Nomes das variáveis, nunca valores.
    console.error(`[${contexto}] Efí sem configuração`, {
      faltando: erro.variaveisFaltando.length ? erro.variaveisFaltando : variaveisEfiFaltando(),
      motivo: erro.message,
    })
    return
  }
  console.error(`[${contexto}]`, {
    nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
    status: erro instanceof ErroEfi ? (erro.status ?? null) : undefined,
    mensagem: erro instanceof Error ? erro.message.slice(0, 200) : undefined,
  })
}

/**
 * Chama a Efí para uma linha em `gerando` e grava o QR Code.
 *
 * O `PUT /v2/cob/{txid}` é idempotente pelo txid: retomar uma geração travada
 * reencontra a mesma cobrança na Efí em vez de criar outra.
 */
async function emitirNaEfi(linha: LinhaCobranca): Promise<ResultadoCobranca> {
  try {
    const criada = await criarCobrancaPixImediata({
      txid: linha.txid,
      valorCentavos: linha.valorCentavos,
      expiracaoSegundos: Number(
        (linha.contexto as { expiracaoSegundos?: number }).expiracaoSegundos ?? 3600,
      ),
      solicitacaoPagador: linha.descricao,
    })
    const [atualizada] = await db
      .update(cobrancasPix)
      .set({
        status: 'aguardando_pagamento',
        pixCopiaECola: criada.copiaECola,
        qrCodeImagem: criada.qrCodeImagem,
        expiraEm: criada.expiraEm,
        erro: null,
        updatedAt: new Date(),
      })
      .where(and(eq(cobrancasPix.id, linha.id), eq(cobrancasPix.status, 'gerando')))
      .returning()

    const final = atualizada ?? (await buscarPorId(linha.id))
    if (!final) return { situacao: 'nao_encontrada', mensagem: 'Cobrança não encontrada.' }

    if (atualizada) {
      await registrarEventoAuditoria({
        acao: ACOES_AUDITORIA.cobrancaPixCriada,
        entidade: 'cobrancas_pix',
        registroAfetado: linha.id,
        autorId: linha.clienteUsuarioId,
        usuarioId: linha.prestadorId,
        origem: 'sistema',
        metadados: {
          finalidade: linha.finalidade,
          referenciaId: linha.referenciaId,
          valorCentavos: linha.valorCentavos,
          expiraEm: criada.expiraEm.toISOString(),
        },
      })
    }
    return { situacao: 'ok', cobranca: paraDTO(final) }
  } catch (erro) {
    registrarFalhaDaEfi('EMITIR_COBRANCA_PIX', erro)
    const falha = classificarFalha(erro)
    // A linha morre como `falhou`: libera a vaga de cobrança viva e deixa a
    // próxima tentativa nascer limpa. Nada foi mostrado, nada pôde ser pago.
    await db
      .update(cobrancasPix)
      .set({ status: 'falhou', erro: falha.codigo, updatedAt: new Date() })
      .where(and(eq(cobrancasPix.id, linha.id), eq(cobrancasPix.status, 'gerando')))
    return { situacao: 'indisponivel', mensagem: falha.mensagem }
  }
}

/**
 * Cobrança viva emitida sem imagem de QR (antes do fallback local existir, ou
 * se a geração falhou) ganha a imagem a partir do BR Code já gravado. Não fala
 * com a Efí: o QR é só a representação gráfica do Copia e Cola.
 */
async function garantirQrCode(linha: LinhaCobranca): Promise<LinhaCobranca> {
  if (linha.qrCodeImagem || !linha.pixCopiaECola) return linha
  const qrCodeImagem = await gerarQrCodeLocal(linha.pixCopiaECola)
  if (!qrCodeImagem) return linha
  await db
    .update(cobrancasPix)
    .set({ qrCodeImagem, updatedAt: new Date() })
    .where(eq(cobrancasPix.id, linha.id))
  return { ...linha, qrCodeImagem }
}

/**
 * Abre — ou reaproveita — a cobrança viva deste pedido.
 *
 * Duplo clique, F5 e duas abas caem no índice `cobrancas_pix_viva_unica` e
 * recebem **a mesma** cobrança. Vencida pelo relógio, ela é conferida na Efí
 * antes de ser substituída: o Pix pago no último segundo não pode virar uma
 * segunda cobrança.
 */
export async function abrirCobrancaPix(pedido: PedidoDeCobranca): Promise<ResultadoCobranca> {
  if (!Number.isInteger(pedido.valorCentavos) || pedido.valorCentavos <= 0) {
    return { situacao: 'indisponivel', mensagem: 'Valor inválido para cobrança.' }
  }
  /*
    A porta final: nenhuma finalidade (serviço, consultoria, acordo, plano)
    emite Pix para advogado, venha a chamada da tela ou direto da action. Nada
    é gravado e a Efí não é chamada — honorário jurídico não passa pela Vincis.
  */
  if (await prestadorCobraDiretamente(db, pedido.prestadorId)) {
    return { situacao: 'indisponivel', mensagem: MENSAGEM_HONORARIOS_DIRETOS }
  }
  /*
    Serviço avulso pago pela Vincis sempre carrega a comissão Vincis. Quem
    chama (catálogo, acordo, consultoria) lê o percentual da Gestão e manda o
    retrato no contexto; sem ele — configuração pendente, ou uma porta que
    esqueceu — o Pix não nasce, em vez de nascer sem divisão.
  */
  if (
    finalidadeAvulsa(pedido.finalidade) &&
    !('comissaoVincisMilesimos' in colunasDoRetrato(retratoDoContexto(pedido.contexto), pedido.valorCentavos))
  ) {
    console.warn('[PIX_AVULSO_SEM_COMISSAO]', { finalidade: pedido.finalidade })
    return { situacao: 'indisponivel', mensagem: MENSAGEM_COMISSAO_PENDENTE }
  }

  const existente = await buscarViva(pedido)
  if (existente) {
    const agora = Date.now()
    if (existente.status === 'aguardando_pagamento') {
      if (existente.expiraEm && existente.expiraEm.getTime() > agora) {
        return { situacao: 'ok', cobranca: paraDTO(await garantirQrCode(existente)) }
      }
      // Vencida no relógio: pergunta à Efí antes de emitir outra.
      const conferida = await sincronizarCobranca(existente.id, { forcar: true })
      if (conferida?.status === 'paga') {
        return { situacao: 'ok', cobranca: paraDTO(conferida) }
      }
      // Ainda "aguardando" depois de vencida = a Efí não respondeu. Emitir
      // outra agora arriscaria duas cobranças vivas para a mesma coisa.
      if (!conferida || conferida.status === 'aguardando_pagamento') {
        return { situacao: 'indisponivel', mensagem: MENSAGEM_PIX_INDISPONIVEL }
      }
    } else if (existente.status === 'gerando') {
      if (agora - existente.updatedAt.getTime() < GERACAO_TRAVADA_APOS_MS) {
        return { situacao: 'gerando', mensagem: 'Gerando o Pix…' }
      }
      return emitirNaEfi(existente)
    }
  }

  const id = randomUUID()
  try {
    const [nova] = await db
      .insert(cobrancasPix)
      .values({
        id,
        txid: gerarTxid(id),
        finalidade: pedido.finalidade,
        referenciaId: pedido.referenciaId,
        clienteUsuarioId: pedido.clienteUsuarioId,
        prestadorId: pedido.prestadorId,
        valorCentavos: pedido.valorCentavos,
        descricao: pedido.descricao.slice(0, 140),
        contexto: { ...pedido.contexto, expiracaoSegundos: pedido.expiracaoSegundos },
        status: 'gerando',
      })
      .returning()
    return emitirNaEfi(nova)
  } catch (erro) {
    if (!ehViolacaoDeUnicidade(erro)) throw erro
    // Outra requisição venceu a corrida: devolve a dela.
    const vencedora = await buscarViva(pedido)
    if (vencedora?.status === 'aguardando_pagamento') {
      return { situacao: 'ok', cobranca: paraDTO(vencedora) }
    }
    return { situacao: 'gerando', mensagem: 'Gerando o Pix…' }
  }
}

/**
 * Pergunta à Efí pela cobrança e aplica o que ela disser.
 *
 * Usada pelo webhook (`forcar`), pelo polling da tela (com freio) e pela
 * reconciliação. Devolve a linha atualizada, ou `null` se a Efí não respondeu.
 */
export async function sincronizarCobranca(
  cobrancaId: string,
  { forcar = false }: { forcar?: boolean } = {},
): Promise<LinhaCobranca | null> {
  const linha = await buscarPorId(cobrancaId)
  if (!linha) return null
  // Só cobrança emitida e ainda sem desfecho tem o que perguntar. Expirada
  // também: o Pix pago no limite pode ter o aviso atrasado.
  if (!['aguardando_pagamento', 'expirada'].includes(linha.status)) return linha

  const agora = new Date()
  if (
    !forcar &&
    linha.ultimaConsultaEm &&
    agora.getTime() - linha.ultimaConsultaEm.getTime() < INTERVALO_MINIMO_CONSULTA_EFI_MS
  ) {
    return linha
  }

  // O freio é gravado antes da chamada: duas abas no mesmo segundo não viram
  // duas consultas à Efí.
  const [reservada] = await db
    .update(cobrancasPix)
    .set({ ultimaConsultaEm: agora })
    .where(
      forcar
        ? eq(cobrancasPix.id, linha.id)
        : and(
            eq(cobrancasPix.id, linha.id),
            or(
              isNull(cobrancasPix.ultimaConsultaEm),
              lt(
                cobrancasPix.ultimaConsultaEm,
                new Date(agora.getTime() - INTERVALO_MINIMO_CONSULTA_EFI_MS),
              ),
            ),
          ),
    )
    .returning({ id: cobrancasPix.id })
  if (!reservada) return linha

  let consulta
  try {
    consulta = await consultarCobrancaPix(linha.txid)
  } catch (erro) {
    registrarFalhaDaEfi('CONSULTAR_COBRANCA_PIX', erro)
    return linha
  }

  const recebido = consulta.pix.find((pix) => pix.txid === linha.txid && !pix.devolvido)
  if (recebido) {
    await confirmarPixRecebido(recebido)
    return buscarPorId(linha.id)
  }

  const status = String(consulta.status).toUpperCase()
  if (status.startsWith('REMOVIDA')) {
    await encerrarCobranca(linha.id, 'cancelada')
  } else if (status === 'CONCLUIDA') {
    // Concluída sem Pix conciliável (ex.: devolvido). Não confirma nada.
    console.error('[SINCRONIZAR_COBRANCA_PIX] concluída sem Pix válido', { cobrancaId: linha.id })
  } else if (linha.expiraEm && linha.expiraEm.getTime() <= agora.getTime()) {
    await encerrarCobranca(linha.id, 'expirada')
  }
  return buscarPorId(linha.id)
}

async function encerrarCobranca(id: string, status: 'expirada' | 'cancelada') {
  await db
    .update(cobrancasPix)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(cobrancasPix.id, id), inArray(cobrancasPix.status, ['aguardando_pagamento', 'expirada'])))
}

export type ResultadoConfirmacao =
  | { situacao: 'confirmado'; cobrancaId: string; novo: boolean; efeito: ResultadoEfeito['efeito'] }
  | { situacao: 'desconhecida' }
  | { situacao: 'divergente'; cobrancaId: string }

/**
 * Registra um Pix que **a Efí confirmou** e produz o efeito de negócio.
 *
 * Recebe apenas o que veio de `consultarCobrancaPix` — nunca o corpo do
 * webhook, nunca o navegador.
 *
 * ## Idempotência
 *
 * A linha é travada (`for update`); a segunda chamada espera a primeira e a
 * encontra `paga`. O efeito de cada domínio tem o próprio índice único
 * (contratação por cobrança, agendamento por reserva, pagamento por
 * oportunidade). Webhook repetido, polling e reconciliação convergem para um
 * pagamento, um efeito, um Atendimento.
 */
export async function confirmarPixRecebido(pix: PixRecebido): Promise<ResultadoConfirmacao> {
  const resultado = await db.transaction(async (tx) => {
    const [cobranca] = await tx
      .select()
      .from(cobrancasPix)
      .where(eq(cobrancasPix.txid, pix.txid))
      .for('update')
      .limit(1)
    if (!cobranca) return { situacao: 'desconhecida' as const }

    if (cobranca.status === 'paga') {
      return {
        situacao: 'confirmado' as const,
        cobrancaId: cobranca.id,
        novo: false,
        efeito: (cobranca.efeito ?? 'aplicado') as ResultadoEfeito['efeito'],
        posCommit: null,
      }
    }

    // A cobrança imediata não aceita valor diferente do original; se chegar
    // diferente, algo está muito errado — registra e não produz efeito.
    if (pix.valorCentavos !== cobranca.valorCentavos) {
      await tx
        .update(cobrancasPix)
        .set({ erro: 'valor_divergente', updatedAt: new Date() })
        .where(eq(cobrancasPix.id, cobranca.id))
      return { situacao: 'divergente' as const, cobrancaId: cobranca.id }
    }

    const [paga] = await tx
      .update(cobrancasPix)
      .set({
        status: 'paga',
        endToEndId: pix.endToEndId,
        valorPagoCentavos: pix.valorCentavos,
        pagaEm: pix.horario,
        updatedAt: new Date(),
      })
      .where(eq(cobrancasPix.id, cobranca.id))
      .returning()

    const efeito = await aplicarEfeitoDaCobranca(tx, paga)

    await tx
      .update(cobrancasPix)
      .set(
        efeito.efeito === 'aplicado'
          ? {
              efeito: 'aplicado',
              efeitoReferenciaId: efeito.referenciaId,
              atendimentoId: efeito.atendimentoId,
              protocolo: efeito.protocolo,
              erro: null,
              updatedAt: new Date(),
            }
          : { efeito: 'conflito', erro: efeito.motivo.slice(0, 300), updatedAt: new Date() },
      )
      .where(eq(cobrancasPix.id, cobranca.id))

    await registrarEventoAuditoria(
      {
        acao:
          efeito.efeito === 'aplicado'
            ? ACOES_AUDITORIA.pagamentoPixConfirmado
            : ACOES_AUDITORIA.pagamentoPixEmConflito,
        entidade: 'cobrancas_pix',
        registroAfetado: cobranca.id,
        autorId: cobranca.clienteUsuarioId,
        usuarioId: cobranca.prestadorId,
        origem: 'sistema',
        metadados: {
          finalidade: cobranca.finalidade,
          referenciaId: cobranca.referenciaId,
          valorCentavos: pix.valorCentavos,
          provedor: 'efi',
          efeito: efeito.efeito,
          ...(efeito.efeito === 'aplicado'
            ? { efeitoReferenciaId: efeito.referenciaId, protocolo: efeito.protocolo }
            : { motivo: efeito.motivo }),
        },
      },
      tx,
    )

    return {
      situacao: 'confirmado' as const,
      cobrancaId: cobranca.id,
      novo: true,
      efeito: efeito.efeito,
      posCommit: efeito.efeito === 'aplicado' && efeito.novo ? (efeito.aposConfirmar ?? null) : null,
    }
  })

  if (resultado.situacao !== 'confirmado') {
    if (resultado.situacao === 'divergente') {
      console.error('[CONFIRMAR_PIX] valor divergente', { cobrancaId: resultado.cobrancaId })
    }
    return resultado
  }

  const { posCommit, ...confirmado } = resultado
  if (confirmado.efeito === 'conflito') {
    console.error('[CONFIRMAR_PIX] pago sem efeito possível — estorno manual', {
      cobrancaId: confirmado.cobrancaId,
    })
  }
  // Avisos depois do commit. Falha de aviso não desfaz pagamento.
  if (posCommit) {
    await posCommit().catch((erro) =>
      console.error('[CONFIRMAR_PIX] aviso pós-pagamento falhou', {
        nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
      }),
    )
  }
  return confirmado
}

/** A cobrança, se for deste Cliente. Outro Cliente recebe "não encontrada". */
export async function cobrancaDoCliente(cobrancaId: string, clienteUsuarioId: string) {
  const [linha] = await db
    .select()
    .from(cobrancasPix)
    .where(and(eq(cobrancasPix.id, cobrancaId), eq(cobrancasPix.clienteUsuarioId, clienteUsuarioId)))
    .limit(1)
  return linha ?? null
}
