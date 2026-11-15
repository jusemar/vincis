'use server'

import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/connection'
import { assinaturas, cobrancasPix, perfisProfissionais } from '@/db/schema'
import { EXPIRACAO_PIX_SEGUNDOS } from '@/features/pagamentos/constants/cobranca'
import {
  abrirCobrancaPix,
  paraDTO,
  sincronizarCobranca,
} from '@/features/pagamentos/lib/cobrancas'
import type { CobrancaPixDTO } from '@/features/pagamentos/types/cobranca'
import { retratoComissaoVigente } from '@/features/pagamentos/lib/comissao-vincis'
import { MENSAGEM_COMISSAO_PENDENTE } from '@/features/servicos/constants/comissao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  contadorComVagaPara,
  listarContadoresParceiros,
  type ContadorParceiroPublico,
} from '@/features/profissionais/queries/contadores-parceiros'
import { planoPagavel } from '../constants/assinatura'
import { MENSAGEM_CONTADOR_SEM_VAGA } from '../constants/contador-responsavel'
import { reservaDoPlanoLiberada } from '../queries/carteira-do-contador'
import { formatarPeriodoCurto } from '../constants/mensalidade'
import { valorDevidoAgora } from '../lib/pagamentos'
import { competenciaDaCobranca } from '../lib/pagamento-pix'
import {
  mensalidadeDevida,
  prepararMensalidadesDaAssinatura,
  type MensalidadeDevida,
} from '../lib/mensalidades'

const AssinaturaSchema = z.object({ assinaturaId: z.string().uuid('Assinatura inválida.') })

export type ResultadoPixPlano =
  | { situacao: 'cobranca'; cobranca: CobrancaPixDTO }
  | { situacao: 'pago' }
  | { situacao: 'gerando' | 'indisponivel' | 'recusado'; mensagem: string }
  /**
   * O Pix anterior venceu (vaga liberada) e o contador escolhido lotou: o Pix
   * novo só sai depois de o cliente escolher outro contador (com vaga) ou
   * deixar a Vincis escolher.
   */
  | { situacao: 'contador_sem_vaga'; mensagem: string; contadores: ContadorParceiroPublico[] }

/** A assinatura do Cliente da sessão — de outro Cliente, não existe. */
async function assinaturaDoCliente(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return null
  const validacao = AssinaturaSchema.safeParse(entrada)
  if (!validacao.success) return null
  const [assinatura] = await db
    .select({
      id: assinaturas.id,
      clienteUsuarioId: assinaturas.clienteUsuarioId,
      periodicidade: assinaturas.periodicidade,
      status: assinaturas.status,
      prestadorId: assinaturas.prestadorId,
      planoNome: assinaturas.planoNome,
      planoCodigo: assinaturas.planoCodigo,
    })
    .from(assinaturas)
    .where(and(eq(assinaturas.id, validacao.data.assinaturaId), eq(assinaturas.clienteUsuarioId, sessao.id)))
    .limit(1)
  return assinatura ?? null
}

/**
 * Emite (ou reaproveita) o Pix do plano contratado.
 *
 * ## Contratação e mensalidade
 *
 * O Pix imediato da Efí — o único meio comprovado no Nooo — é cobrança avulsa,
 * não débito automático. Ele paga o que está em aberto **agora**:
 *
 * - plano aguardando pagamento: o semestre ou o ano inteiro, ou o primeiro mês
 *   do mensal — e é isso que ativa o contrato;
 * - plano mensal ativo: a mensalidade devida (o mês mais antigo em aberto),
 *   por iniciativa do cliente em "Pagar mensalidade". Nada é debitado sozinho.
 *
 * O valor é apurado das competências congeladas, no servidor — o mesmo número
 * que a confirmação vai exigir que bata.
 */
export async function iniciarPagamentoDoPlano(entrada: unknown): Promise<ResultadoPixPlano> {
  const assinatura = await assinaturaDoCliente(entrada)
  if (!assinatura) return { situacao: 'recusado', mensagem: 'Assinatura não encontrada.' }
  // Contratações antigas de jurídico/combo continuam no banco, mas não são cobradas.
  if (!planoPagavel(assinatura.planoCodigo)) {
    return { situacao: 'recusado', mensagem: 'Este plano não está disponível para pagamento.' }
  }
  if (assinatura.status === 'ativa') {
    // Prazo fechado foi pago adiantado: não há mensalidade.
    return assinatura.periodicidade === 'mensal' ? pagarMensalidade(assinatura) : { situacao: 'pago' }
  }
  if (assinatura.status !== 'aguardando_pagamento') {
    return { situacao: 'recusado', mensagem: 'Esta assinatura não aceita pagamento.' }
  }

  const devido = await valorDevidoAgora(db, assinatura)
  if (devido <= 0) return { situacao: 'recusado', mensagem: 'Não há valor em aberto nesta assinatura.' }
  /*
    Divisão Vincis × contador congelada no Pix (mesmo retrato dos avulsos):
    o repasse de cada mês usa o percentual vigente quando o cliente pagou.
    Sem percentual configurado, nenhum Pix de plano é emitido.
  */
  const comissaoVincis = await retratoComissaoVigente(devido)
  if (!comissaoVincis) return { situacao: 'indisponivel', mensagem: MENSAGEM_COMISSAO_PENDENTE }

  const pedido = {
    finalidade: 'assinatura' as const,
    referenciaId: assinatura.id,
    clienteUsuarioId: assinatura.clienteUsuarioId,
    prestadorId: null,
    valorCentavos: devido,
    descricao: `Vincis · ${assinatura.planoNome}`,
    // O mensal paga o mês 1 — gravado para a confirmação cobrir exatamente ele.
    contexto: assinatura.periodicidade === 'mensal' ? { competenciaNumero: 1, comissaoVincis } : { comissaoVincis },
    expiracaoSegundos: EXPIRACAO_PIX_SEGUNDOS.assinatura,
  }

  /*
    Capacidade: o Pix anterior venceu, então a reserva de vaga foi liberada.
    Antes de emitir outro, a vaga é conferida de novo, com o cadastro do
    contador travado até o Pix novo existir — duas emissões não disputam a
    mesma última vaga. Sem vaga, nada é emitido e o cliente escolhe de novo.
  */
  if (assinatura.prestadorId && (await reservaDoPlanoLiberada(db, assinatura.id))) {
    const contadorId = assinatura.prestadorId
    const resultado = await db.transaction(async (tx) => {
      await tx
        .select({ id: perfisProfissionais.id })
        .from(perfisProfissionais)
        .where(eq(perfisProfissionais.usuarioId, contadorId))
        .for('update')
      const { temVaga } = await contadorComVagaPara(tx, contadorId, assinatura.clienteUsuarioId, assinatura.id)
      if (!temVaga) return null
      return abrirCobrancaPix(pedido)
    })
    if (!resultado) {
      const contadores = (await listarContadoresParceiros(db, { somenteComVaga: true }))
        .filter((c) => c.id !== contadorId)
        .map(({ id, nome, cidade, estado }) => ({ id, nome, cidade, estado }))
      return { situacao: 'contador_sem_vaga', mensagem: MENSAGEM_CONTADOR_SEM_VAGA, contadores }
    }
    return respostaDaCobranca(resultado)
  }

  return respostaDaCobranca(await abrirCobrancaPix(pedido))
}

type AssinaturaDoCliente = NonNullable<Awaited<ReturnType<typeof assinaturaDoCliente>>>

/**
 * O Pix da mensalidade de um plano mensal ativo.
 *
 * 1. Deixa o contrato em dia com o calendário (cria o mês cuja janela abriu,
 *    se a rotina diária ainda não o fez) — com a linha travada.
 * 2. Acha o mês devido: o mais antigo em aberto. Nenhum → já está pago.
 * 3. Emite ou reaproveita o Pix **desse mês**: valor do que falta nele e o
 *    número do mês no contexto, que a confirmação usa para cobrir exatamente
 *    ele. O índice de cobrança viva única impede dois Pix vivos.
 *
 * O contador não é reconferido: plano ativo já ocupa a vaga dele, e renovar
 * não é uma nova entrada na carteira.
 */
async function pagarMensalidade(assinatura: AssinaturaDoCliente): Promise<ResultadoPixPlano> {
  const agora = new Date()
  const devida = await db.transaction(async (tx) => {
    await prepararMensalidadesDaAssinatura(tx, assinatura.id, agora)
    return mensalidadeDevida(tx, assinatura.id, agora)
  })
  if (!devida) return { situacao: 'pago' }
  const comissaoVincis = await retratoComissaoVigente(devida.valorCentavos)
  if (!comissaoVincis) return { situacao: 'indisponivel', mensagem: MENSAGEM_COMISSAO_PENDENTE }

  /*
    Um Pix vivo de outro mês (o devido mudou porque o mês dele foi quitado por
    outro caminho) não pode ser devolvido como se fosse deste: o valor e o mês
    seriam outros. Ele é conferido na Efí; se continuar vivo, o cliente espera
    ele expirar, em vez de ganhar um segundo Pix ao mesmo tempo.
  */
  const [viva] = await db
    .select({ id: cobrancasPix.id, contexto: cobrancasPix.contexto })
    .from(cobrancasPix)
    .where(
      and(
        eq(cobrancasPix.finalidade, 'assinatura'),
        eq(cobrancasPix.referenciaId, assinatura.id),
        inArray(cobrancasPix.status, ['gerando', 'aguardando_pagamento']),
      ),
    )
    .limit(1)
  if (viva && competenciaDaCobranca(viva.contexto) !== devida.numero) {
    const conferida = await sincronizarCobranca(viva.id, { forcar: true })
    if (conferida?.status === 'paga') return { situacao: 'pago' }
    if (!conferida || ['gerando', 'aguardando_pagamento'].includes(conferida.status)) {
      return {
        situacao: 'indisponivel',
        mensagem: 'Há um Pix anterior deste plano ainda em aberto. Tente novamente depois que ele expirar.',
      }
    }
  }

  return respostaDaCobranca(
    await abrirCobrancaPix({
      finalidade: 'assinatura',
      referenciaId: assinatura.id,
      clienteUsuarioId: assinatura.clienteUsuarioId,
      prestadorId: null,
      valorCentavos: devida.valorCentavos,
      descricao: `Vincis · ${assinatura.planoNome} · mensalidade ${formatarPeriodoCurto(devida.periodoInicio, devida.periodoFim)}`,
      contexto: { ...contextoDaMensalidade(devida), comissaoVincis },
      expiracaoSegundos: EXPIRACAO_PIX_SEGUNDOS.assinatura,
    }),
  )
}

function contextoDaMensalidade(devida: MensalidadeDevida) {
  return {
    competenciaNumero: devida.numero,
    periodoInicio: devida.periodoInicio,
    periodoFim: devida.periodoFim,
  }
}

function respostaDaCobranca(aberta: Awaited<ReturnType<typeof abrirCobrancaPix>>): ResultadoPixPlano {
  if (aberta.situacao !== 'ok') {
    return { situacao: aberta.situacao === 'gerando' ? 'gerando' : 'indisponivel', mensagem: aberta.mensagem }
  }
  if (aberta.cobranca.status === 'paga') return { situacao: 'pago' }
  return { situacao: 'cobranca', cobranca: aberta.cobranca }
}

/** A situação do Pix do plano — o que a tela pergunta enquanto espera. */
export async function acompanharPagamentoDoPlano(entrada: unknown): Promise<ResultadoPixPlano> {
  const assinatura = await assinaturaDoCliente(entrada)
  if (!assinatura) return { situacao: 'recusado', mensagem: 'Assinatura não encontrada.' }

  const [ultima] = await db
    .select()
    .from(cobrancasPix)
    .where(and(eq(cobrancasPix.finalidade, 'assinatura'), eq(cobrancasPix.referenciaId, assinatura.id)))
    .orderBy(desc(cobrancasPix.createdAt))
    .limit(1)
  if (!ultima) {
    return assinatura.status === 'ativa'
      ? { situacao: 'pago' }
      : { situacao: 'indisponivel', mensagem: 'Nenhum Pix emitido para este plano.' }
  }

  const atual = (await sincronizarCobranca(ultima.id)) ?? ultima
  if (atual.status === 'paga') {
    return atual.efeito === 'conflito'
      ? {
          situacao: 'indisponivel',
          mensagem: 'Recebemos seu Pix, mas não foi possível ativar o plano. A equipe Vincis entrará em contato.',
        }
      : { situacao: 'pago' }
  }
  if (atual.status === 'gerando') return { situacao: 'gerando', mensagem: 'Gerando o Pix…' }
  if (atual.status !== 'aguardando_pagamento') {
    return { situacao: 'indisponivel', mensagem: 'O Pix expirou sem pagamento. Gere um novo para continuar.' }
  }
  return { situacao: 'cobranca', cobranca: paraDTO(atual) }
}
