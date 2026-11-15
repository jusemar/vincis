'use server'

import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { assinaturas } from '@/db/schema'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { AlocacaoRecusada, definirContadorResponsavel, devolverEscolhaAVincis } from '../lib/contador-responsavel'
import { chaveDeIntencao, type OfertaContratada } from '../lib/oferta'
import { EscolhaDoPlanoPendenteSchema } from '../schemas/escolha-pendente'

async function ipDaRequisicao(): Promise<string | null> {
  try {
    return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

/** A chave nova, ou `null` se a oferta guardada não permitir recalcular. */
function novaChave(oferta: unknown, contador: string | 'vincis'): string | null {
  try {
    return chaveDeIntencao(oferta as OfertaContratada, contador)
  } catch {
    return null
  }
}

/**
 * Cliente escolhe outro contador — ou deixa a Vincis escolher — num plano
 * pendente cujo contador lotou depois que o Pix anterior venceu.
 *
 * Só o dono do plano, só `aguardando_pagamento`. A escolha de outro contador
 * passa pela mesma regra da contratação (`definirContadorResponsavel`: apto,
 * com vaga, trava no cadastro do destino, histórico e auditoria). Depois disso
 * a tela pede o Pix de novo.
 */
export async function escolherContadorDoPlanoPendente(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return { sucesso: false as const, mensagem: 'Entre na sua conta para continuar.' }

  const validacao = EscolhaDoPlanoPendenteSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false as const, mensagem: validacao.error.issues[0]?.message ?? 'Escolha um contador.' }
  }
  const { assinaturaId, contador } = validacao.data

  const [plano] = await db
    .select({ clienteUsuarioId: assinaturas.clienteUsuarioId, status: assinaturas.status, oferta: assinaturas.oferta })
    .from(assinaturas)
    .where(eq(assinaturas.id, assinaturaId))
    .limit(1)
  if (!plano || plano.clienteUsuarioId !== sessao.id) {
    return { sucesso: false as const, mensagem: 'Plano não encontrado.' }
  }
  if (plano.status !== 'aguardando_pagamento') {
    return { sucesso: false as const, mensagem: 'Este plano não está aguardando pagamento.' }
  }

  const ip = await ipDaRequisicao()
  const chave = novaChave(plano.oferta, contador.escolha === 'cliente' ? contador.contadorId : 'vincis')
  try {
    await db.transaction(async (tx) => {
      if (contador.escolha === 'cliente') {
        await definirContadorResponsavel(tx, {
          assinaturaId,
          contadorId: contador.contadorId,
          origem: 'cliente',
          alteradoPorId: sessao.id,
          motivo: 'Contador anterior sem vaga ao gerar novo Pix.',
          ip,
        })
        await tx.update(assinaturas).set({ escolhaContador: 'cliente' }).where(eq(assinaturas.id, assinaturaId))
      } else {
        await devolverEscolhaAVincis(tx, { assinaturaId, clienteUsuarioId: sessao.id, ip })
      }
      // A intenção acompanha a escolha (mesma regra da contratação).
      if (chave) await tx.update(assinaturas).set({ chaveIntencao: chave }).where(eq(assinaturas.id, assinaturaId))
    })
  } catch (erro) {
    if (erro instanceof AlocacaoRecusada) {
      return { sucesso: false as const, mensagem: 'Este contador não está disponível. Escolha outro ou deixe a Vincis escolher.' }
    }
    console.error('[ESCOLHER_CONTADOR_PLANO_PENDENTE]', { nome: erro instanceof Error ? erro.name : 'Erro desconhecido' })
    return {
      sucesso: false as const,
      mensagem: 'Você já tem outra contratação pendente com esta escolha, ou não foi possível salvar. Tente novamente.',
    }
  }

  revalidatePath('/cliente')
  revalidatePath('/admin/planos')
  return { sucesso: true as const, mensagem: 'Contador atualizado. Gerando o Pix…' }
}
