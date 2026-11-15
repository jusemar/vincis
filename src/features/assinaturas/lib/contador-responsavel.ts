import { eq, sql } from 'drizzle-orm'
import { assinaturaContadorAlocacoes, assinaturas, perfisProfissionais } from '@/db/schema'
import type { TransacaoDb } from '@/features/atendimentos/lib/executor'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { contadorComVagaPara } from '@/features/profissionais/queries/contadores-parceiros'
import { planoTemContadorResponsavel, type OrigemAlocacao } from '../constants/contador-responsavel'

export class AlocacaoRecusada extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'AlocacaoRecusada'
  }
}

/**
 * Define o contador parceiro responsável por um plano contábil.
 *
 * O único caminho que escreve `assinaturas.prestador_id` desses planos — usado
 * pela contratação (escolha do cliente) e pela Gestão (alocar ou trocar).
 *
 * ## O que muda, e o que não muda
 *
 * Muda **só** o responsável. Cliente, plano, valores, competências, pagamentos
 * e histórico continuam onde estavam: nenhuma outra coluna é tocada. A troca
 * entra no histórico (`assinatura_contador_alocacoes`, só inserção) e no log de
 * auditoria, com o anterior, o novo, quem decidiu e o motivo.
 *
 * ## Portas
 *
 * - plano com contador (os da vitrine), não cancelado nem encerrado;
 * - contador elegível **agora** (contabilidade, aprovado, `modelo = vincis`):
 *   Autônomo nunca vira responsável de plano da Vincis;
 * - contador de destino com vaga (ativos + reservas abaixo da capacidade);
 * - a linha da assinatura é travada (`for update`): duas trocas simultâneas
 *   não registram um "anterior" que já não era o atual.
 */
export async function definirContadorResponsavel(
  tx: TransacaoDb,
  entrada: {
    assinaturaId: string
    contadorId: string
    origem: OrigemAlocacao
    alteradoPorId: string
    motivo?: string | null
    ip?: string | null
  },
): Promise<{ anteriorId: string | null; alterou: boolean }> {
  const [assinatura] = await tx
    .select({
      id: assinaturas.id,
      planoCodigo: assinaturas.planoCodigo,
      status: assinaturas.status,
      clienteUsuarioId: assinaturas.clienteUsuarioId,
      prestadorId: assinaturas.prestadorId,
    })
    .from(assinaturas)
    .where(eq(assinaturas.id, entrada.assinaturaId))
    .for('update')
    .limit(1)

  if (!assinatura) throw new AlocacaoRecusada('Plano não encontrado.')
  if (!planoTemContadorResponsavel(assinatura.planoCodigo)) {
    throw new AlocacaoRecusada('Este plano não tem contador responsável.')
  }
  if (assinatura.status === 'cancelada' || assinatura.status === 'encerrada') {
    throw new AlocacaoRecusada('O plano não está mais vigente.')
  }
  // Trava o cadastro do contador de destino: duas alocações simultâneas para
  // ele contam a capacidade uma depois da outra, nunca as duas com a mesma vaga.
  await tx
    .select({ id: perfisProfissionais.id })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, entrada.contadorId))
    .for('update')
  const { contador, temVaga } = await contadorComVagaPara(
    tx,
    entrada.contadorId,
    assinatura.clienteUsuarioId,
    assinatura.id,
  )
  if (!contador) {
    throw new AlocacaoRecusada('Escolha um contador parceiro da Vincis apto.')
  }
  if (assinatura.prestadorId === entrada.contadorId) {
    return { anteriorId: assinatura.prestadorId, alterou: false }
  }
  /*
    Capacidade: ocupação = clientes ativos + planos pendentes já alocados (a
    reserva de vaga). Novo cliente só entra abaixo do limite; o cliente que já
    ocupa vaga com ele (outro plano) não ocupa outra. A trava olha só o destino:
    retirar clientes de um contador no limite continua livre, e a vaga de quem
    sai (ativa ou reservada) é liberada no mesmo `update` que troca o
    responsável.
  */
  if (!temVaga) {
    throw new AlocacaoRecusada(
      `${contador.nome} está no limite: ${contador.ocupados} de ${contador.capacidade} vagas ocupadas ou reservadas. Escolha outro contador.`,
    )
  }

  await tx
    .update(assinaturas)
    .set({ prestadorId: entrada.contadorId, updatedAt: sql`now()` })
    .where(eq(assinaturas.id, assinatura.id))

  const motivo = entrada.motivo?.trim() || null
  await tx.insert(assinaturaContadorAlocacoes).values({
    assinaturaId: assinatura.id,
    contadorAnteriorId: assinatura.prestadorId,
    contadorNovoId: entrada.contadorId,
    origem: entrada.origem,
    alteradoPorId: entrada.alteradoPorId,
    motivo,
  })

  await registrarEventoAuditoria(
    {
      acao: ACOES_AUDITORIA.contadorResponsavelAlterado,
      entidade: 'assinaturas',
      registroAfetado: assinatura.id,
      autorId: entrada.alteradoPorId,
      usuarioId: assinatura.clienteUsuarioId,
      origem: entrada.origem === 'gestor' ? 'gestao_vincis' : 'admin',
      ip: entrada.ip ?? null,
      metadados: {
        anterior: assinatura.prestadorId,
        novo: entrada.contadorId,
        origem: entrada.origem,
        motivo,
      },
    },
    tx,
  )

  return { anteriorId: assinatura.prestadorId, alterou: true }
}

/**
 * O cliente devolve a escolha do contador à Vincis num plano **pendente**.
 *
 * Caso de uso único: o Pix do plano venceu (a reserva de vaga foi liberada) e,
 * ao pedir um novo, o contador escolhido lotou. O plano fica sem responsável —
 * "Aguardando alocação de contador" — e a Gestão aloca depois. Histórico (com
 * novo nulo) e auditoria, como em qualquer troca. Nada mais muda no plano.
 */
export async function devolverEscolhaAVincis(
  tx: TransacaoDb,
  entrada: { assinaturaId: string; clienteUsuarioId: string; ip?: string | null },
): Promise<void> {
  const [assinatura] = await tx
    .select({
      id: assinaturas.id,
      status: assinaturas.status,
      prestadorId: assinaturas.prestadorId,
      clienteUsuarioId: assinaturas.clienteUsuarioId,
    })
    .from(assinaturas)
    .where(eq(assinaturas.id, entrada.assinaturaId))
    .for('update')
    .limit(1)
  if (!assinatura || assinatura.clienteUsuarioId !== entrada.clienteUsuarioId) {
    throw new AlocacaoRecusada('Plano não encontrado.')
  }
  if (assinatura.status !== 'aguardando_pagamento') {
    throw new AlocacaoRecusada('Só um plano aguardando pagamento pode mudar de contador por aqui.')
  }

  await tx
    .update(assinaturas)
    .set({ prestadorId: null, escolhaContador: 'vincis', updatedAt: sql`now()` })
    .where(eq(assinaturas.id, assinatura.id))
  if (!assinatura.prestadorId) return

  await tx.insert(assinaturaContadorAlocacoes).values({
    assinaturaId: assinatura.id,
    contadorAnteriorId: assinatura.prestadorId,
    contadorNovoId: null,
    origem: 'cliente',
    alteradoPorId: entrada.clienteUsuarioId,
    motivo: 'Contador sem vaga ao gerar novo Pix; cliente deixou a Vincis escolher.',
  })
  await registrarEventoAuditoria(
    {
      acao: ACOES_AUDITORIA.contadorResponsavelAlterado,
      entidade: 'assinaturas',
      registroAfetado: assinatura.id,
      autorId: entrada.clienteUsuarioId,
      usuarioId: entrada.clienteUsuarioId,
      origem: 'admin',
      ip: entrada.ip ?? null,
      metadados: { anterior: assinatura.prestadorId, novo: null, origem: 'cliente', motivo: 'sem_vaga' },
    },
    tx,
  )
}
