'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db/connection'
import { assinaturas } from '@/db/schema'
import { gerarCompetenciasPrevistas } from '@/features/assinaturas/lib/competencias'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  BLOCO_EXTRA_CENTAVOS,
  NOME_PLANO_ARMAZENAMENTO_AUTONOMO,
  PLANO_ARMAZENAMENTO_AUTONOMO,
} from '../constants/franquia'
import { ehContadorAutonomo, franquiaDoAutonomo } from '../lib/franquia'

/** Só o próprio contador Autônomo. Vem da sessão — nenhum id de fora. */
async function exigirAutonomo() {
  const sessao = await obterSessaoServidor()
  if (!sessao) return null
  return (await ehContadorAutonomo(db, sessao.id)) ? sessao : null
}

/** O que a aba "Armazenamento" do Autônomo mostra. Só leitura. */
export async function obterMinhaFranquia() {
  const autonomo = await exigirAutonomo()
  if (!autonomo) return { ...SEM_AUTORIZACAO, dados: null }
  return { sucesso: true as const, mensagem: 'Armazenamento carregado.', dados: await franquiaDoAutonomo(db, autonomo.id) }
}

/**
 * Contrata um bloco de +5 GB (R$ 9,90/mês) — o Pix vem em seguida.
 *
 * Pagamento do Autônomo **à Vincis** pelo espaço; a relação dele com os
 * clientes continua direta. O espaço só soma depois que a Efí confirma o Pix
 * (vigência derivada das competências pagas, como no Perfil Pro); vale pelo
 * mês, sem renovação automática, e cada bloco pago e vigente soma exatamente
 * +5 GB.
 *
 * Idempotente: chave de intenção fixa + índice único de "pendente por chave"
 * — clique duplo e F5 devolvem o mesmo bloco aguardando pagamento.
 */
export async function contratarBlocoDeArmazenamento() {
  const autonomo = await exigirAutonomo()
  if (!autonomo) return SEM_AUTORIZACAO

  const existente = async () =>
    (
      await db
        .select({ id: assinaturas.id })
        .from(assinaturas)
        .where(
          and(
            eq(assinaturas.clienteUsuarioId, autonomo.id),
            eq(assinaturas.chaveIntencao, PLANO_ARMAZENAMENTO_AUTONOMO),
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
          clienteUsuarioId: autonomo.id,
          prestadorId: null,
          planoCodigo: PLANO_ARMAZENAMENTO_AUTONOMO,
          planoNome: NOME_PLANO_ARMAZENAMENTO_AUTONOMO,
          periodoCodigo: 'mensal',
          periodicidade: 'mensal',
          meses: 1,
          valorMensalCheioCentavos: BLOCO_EXTRA_CENTAVOS,
          descontoMilesimos: 0,
          valorMensalCentavos: BLOCO_EXTRA_CENTAVOS,
          valorTotalCentavos: BLOCO_EXTRA_CENTAVOS,
          oferta: { tipo: PLANO_ARMAZENAMENTO_AUTONOMO, gigabytes: 5, totalCentavos: BLOCO_EXTRA_CENTAVOS },
          chaveIntencao: PLANO_ARMAZENAMENTO_AUTONOMO,
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
    console.error('[CONTRATAR_BLOCO_ARMAZENAMENTO]', { nome: erro instanceof Error ? erro.name : 'Erro desconhecido' })
    return { sucesso: false as const, mensagem: 'Não foi possível iniciar a contratação. Tente novamente.' }
  }
}
