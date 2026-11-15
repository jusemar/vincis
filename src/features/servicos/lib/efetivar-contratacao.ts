import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { contratacoesServico, servicos } from '@/db/schema'
import { garantirAtendimentoDaContratacao } from '@/features/atendimentos/lib/criar-atendimento-da-contratacao'
import type { TransacaoDb } from '@/features/atendimentos/lib/executor'
import { garantirClienteNaCarteira } from '@/features/clientes/lib/garantir-cliente-na-carteira'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes, resumirTexto } from '@/features/notificacoes/lib/emitir'
import { colunasDoRetrato } from '@/features/pagamentos/lib/comissao-vincis'
import type { AplicarEfeito } from '@/features/pagamentos/types/efeito'
import { referenciaDePrazoDaCategoria } from '@/features/parceiros/constants/prazo'
import { registrarAtribuicaoDaContratacao } from '@/features/parceiros/lib/registrar-atribuicao'
import type { ContextoCobrancaServico } from '../types/contratacao'

/**
 * Cria a contratação **paga** de um serviço do catálogo e o Atendimento dela.
 *
 * ## Quando roda
 *
 * Só depois de a Efí confirmar o Pix — chamada pelo núcleo de pagamentos, na
 * mesma transação que marca a cobrança como paga. Antes disso não existe
 * contratação, nem Atendimento, nem protocolo: o QR Code não é contrato.
 *
 * ## O que ela confia
 *
 * Na cobrança. Valor, Cliente, Profissional e serviço foram gravados nela pelo
 * servidor, a partir do banco, quando o Pix foi emitido; o recado do Cliente e
 * a origem de indicação viajaram no `contexto` porque esta função roda longe da
 * requisição original (webhook, reconciliação). Nada aqui vem do navegador.
 *
 * ## Idempotência
 *
 * `contratacoes_servico_cobranca_unica`: uma cobrança, uma contratação. O
 * webhook repetido, o polling e a reconciliação reencontram a mesma, e o
 * Atendimento segue a regra de sempre (`atendimentos_contratacao_unico`).
 *
 * ## O preço pago é o da cobrança
 *
 * Se o Profissional reajustou o catálogo entre o QR Code e o pagamento, vale o
 * que o Cliente viu e pagou. Se desativou o serviço nesse meio-tempo, o pagamento
 * ainda é honrado: o Cliente pagou por algo que estava à venda.
 */
export const efetivarContratacaoPaga: AplicarEfeito = async (tx, cobranca) => {
  const contexto = cobranca.contexto as ContextoCobrancaServico

  const [jaExiste] = await tx
    .select({ id: contratacoesServico.id })
    .from(contratacoesServico)
    .where(eq(contratacoesServico.cobrancaId, cobranca.id))
    .limit(1)
  if (jaExiste) {
    const atendimento = await garantirAtendimentoDaContratacao(tx, jaExiste.id)
    return {
      efeito: 'aplicado',
      referenciaId: jaExiste.id,
      atendimentoId: atendimento.id,
      protocolo: atendimento.protocolo,
      novo: false,
    }
  }

  const [servico] = await tx
    .select({
      id: servicos.id,
      prestadorId: servicos.prestadorId,
      categoria: servicos.categoria,
    })
    .from(servicos)
    .where(eq(servicos.id, cobranca.referenciaId))
    .limit(1)

  if (!servico || servico.prestadorId !== cobranca.prestadorId) {
    return { efeito: 'conflito', motivo: 'Serviço pago não existe mais no catálogo.' }
  }

  const contratacaoId = await criarContratacao(tx, {
    cobrancaId: cobranca.id,
    servicoId: servico.id,
    prestadorId: servico.prestadorId,
    clienteUsuarioId: cobranca.clienteUsuarioId,
    valorCentavos: cobranca.valorCentavos,
    contexto,
  })

  const atendimento = await garantirAtendimentoDaContratacao(
    tx,
    contratacaoId,
    contexto.mensagem || null,
  )

  // Indicação de parceiro: o mesmo registro de sempre, agora com o token que
  // foi lido do cookie quando o Pix foi emitido. Não lança.
  await registrarAtribuicaoDaContratacao(tx, {
    contratacaoId,
    usuarioId: cobranca.clienteUsuarioId,
    visitanteToken: contexto.visitanteToken ?? undefined,
    servico: referenciaDePrazoDaCategoria(servico.categoria),
    nome: contexto.nomeServico,
    efetivada: true,
  })

  return {
    efeito: 'aplicado',
    referenciaId: contratacaoId,
    atendimentoId: atendimento.id,
    protocolo: atendimento.protocolo,
    novo: true,
    aposConfirmar: async () => {
      // O Profissional não estava olhando: é ele quem o sino precisa puxar.
      await emitirNotificacoes(db, {
        destinatarios: [servico.prestadorId],
        autorId: cobranca.clienteUsuarioId,
        tipo: TIPOS_NOTIFICACAO.servicoPago,
        titulo: 'Serviço contratado · pagamento confirmado',
        resumo: resumirTexto(`${atendimento.protocolo} · ${contexto.nomeServico}`, 200),
        recursoTipo: 'atendimento',
        recursoId: atendimento.id,
        atendimentoId: atendimento.id,
        protocolo: atendimento.protocolo,
        destino: { pagina: 'atendimentos', atendimento: atendimento.protocolo },
        chaveDedupe: `${TIPOS_NOTIFICACAO.servicoPago}:${cobranca.id}`,
      })
      revalidatePath('/cliente')
      revalidatePath('/admin')
    },
  }
}

/** Insere a contratação; na corrida, devolve a da vencedora. */
async function criarContratacao(
  tx: TransacaoDb,
  dados: {
    cobrancaId: string
    servicoId: string
    prestadorId: string
    clienteUsuarioId: string
    valorCentavos: number
    contexto: ContextoCobrancaServico
  },
): Promise<string> {
  const carteiraId = await garantirClienteNaCarteira(tx, {
    prestadorId: dados.prestadorId,
    clienteUsuarioId: dados.clienteUsuarioId,
  })

  const [criada] = await tx
    .insert(contratacoesServico)
    .values({
      servicoId: dados.servicoId,
      prestadorId: dados.prestadorId,
      clienteUsuarioId: dados.clienteUsuarioId,
      clienteCarteiraId: carteiraId,
      // Snapshot do momento do Pix: o catálogo pode mudar depois.
      nomeServicoSnapshot: dados.contexto.nomeServico,
      modeloPrecoSnapshot: dados.contexto.modeloPreco,
      valorSnapshotCentavos: dados.valorCentavos,
      prazoEstimadoDias: dados.contexto.prazoEstimadoDias,
      status: 'pendente',
      cobrancaId: dados.cobrancaId,
      // Retrato da comissão da Vincis no momento do Pix. Só gravado quando
      // fecha com o valor pago; cobrança antiga (sem retrato) fica sem.
      ...colunasDoRetrato(dados.contexto.comissaoVincis, dados.valorCentavos),
    })
    .onConflictDoNothing()
    .returning({ id: contratacoesServico.id })
  if (criada) return criada.id

  const [vencedora] = await tx
    .select({ id: contratacoesServico.id })
    .from(contratacoesServico)
    .where(eq(contratacoesServico.cobrancaId, dados.cobrancaId))
    .limit(1)
  if (!vencedora) throw new Error('Contratação não encontrada após conflito de unicidade.')
  return vencedora.id
}
