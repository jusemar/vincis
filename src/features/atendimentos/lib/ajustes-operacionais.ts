import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentoEventos, atendimentos, usuarios } from '@/db/schema'
import {
  TIPOS_EVENTO_ATENDIMENTO,
  type PrioridadeAtendimento,
} from '../constants/atendimento'
import { obterAcessoAtendimento } from './autorizacao'

export type ResultadoAjuste =
  | { sucesso: true; alterado: boolean }
  | { sucesso: false; motivo: 'sem-acesso' | 'nao-encontrado' }

const ROTULO_PRIORIDADE: Record<PrioridadeAtendimento, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
}

/**
 * Converte o que veio do campo de data em prazo.
 *
 * `aaaa-mm-dd` sozinho é lido pelo JavaScript como meia-noite em UTC — e no
 * Brasil isso cai no dia anterior, fazendo o prazo aparecer um dia antes do que
 * a pessoa escolheu. Aqui a data solta vira meio-dia local, que é o mesmo dia em
 * qualquer fuso do país. Data com hora explícita é respeitada como veio.
 */
export function interpretarPrazo(valor: string): Date {
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim())
  if (!soData) return new Date(valor)
  const [, ano, mes, dia] = soData
  return new Date(Number(ano), Number(mes) - 1, Number(dia), 12, 0, 0, 0)
}

/** "Sem prazo definido" é o texto oficial da ausência de prazo. */
export const SEM_PRAZO_DEFINIDO = 'Sem prazo definido'

function rotuloPrazo(prazo: Date | null) {
  return prazo ? prazo.toLocaleDateString('pt-BR') : SEM_PRAZO_DEFINIDO
}

/**
 * Quem pode ajustar prioridade e prazo.
 *
 * A equipe: prestador dono, responsável e participantes autorizados. O Cliente
 * alcança o Atendimento — ele é dono do serviço —, mas prioridade e prazo são
 * decisões operacionais de quem executa. Esconder o controle na tela do Cliente
 * não bastaria: a recusa acontece aqui, antes de qualquer escrita, e vale
 * também para quem chamar a ação diretamente.
 */
async function exigirEquipe(atendimentoId: string, usuarioId: string) {
  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso || acesso.vinculo === 'cliente') return null
  return acesso
}

async function nomeDoAutor(usuarioId: string) {
  const [autor] = await db
    .select({ nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  return autor?.nome ?? 'Equipe'
}

/**
 * Define a prioridade do Atendimento.
 *
 * Prioridade é fila de trabalho da equipe: quem contrata não escolhe a própria
 * posição nela. A troca fica registrada com o valor anterior, o novo, o autor e
 * a hora — o histórico precisa responder "quem subiu isso para Alta, e quando".
 */
export async function definirPrioridadeDoAtendimento({
  atendimentoId,
  usuarioId,
  prioridade,
}: {
  atendimentoId: string
  usuarioId: string
  prioridade: PrioridadeAtendimento
}): Promise<ResultadoAjuste> {
  const acesso = await exigirEquipe(atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }

  const [atual] = await db
    .select({ prioridade: atendimentos.prioridade })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimentoId))
    .limit(1)
  if (!atual) return { sucesso: false, motivo: 'nao-encontrado' }

  const anterior = atual.prioridade as PrioridadeAtendimento
  // Repetir o mesmo valor não é uma alteração: não gera linha no histórico.
  if (anterior === prioridade) return { sucesso: true, alterado: false }

  const autor = await nomeDoAutor(usuarioId)

  await db.transaction(async (tx) => {
    await tx
      .update(atendimentos)
      .set({ prioridade, updatedAt: new Date() })
      .where(eq(atendimentos.id, atendimentoId))

    await tx.insert(atendimentoEventos).values({
      atendimentoId,
      tipo: TIPOS_EVENTO_ATENDIMENTO.prioridadeAlterada,
      descricao: `Prioridade alterada de ${ROTULO_PRIORIDADE[anterior]} para ${ROTULO_PRIORIDADE[prioridade]} por ${autor}`,
      autorId: usuarioId,
      // Organização interna da fila: o Cliente vê a prioridade atual no próprio
      // atendimento, mas o vaivém da priorização é assunto da equipe.
      visivelCliente: false,
      metadados: { de: anterior, para: prioridade },
    })
  })

  return { sucesso: true, alterado: true }
}

/**
 * Define o prazo operacional do Atendimento.
 *
 * O prazo nasce do catálogo — o serviço contratado traz os dias estimados — e a
 * partir daí é da equipe. `null` limpa o prazo e devolve o Atendimento ao
 * estado "sem prazo definido", que é a verdade quando o catálogo não informou
 * nada e ninguém decidiu ainda.
 */
export async function definirPrazoDoAtendimento({
  atendimentoId,
  usuarioId,
  prazoEm,
}: {
  atendimentoId: string
  usuarioId: string
  prazoEm: Date | null
}): Promise<ResultadoAjuste> {
  const acesso = await exigirEquipe(atendimentoId, usuarioId)
  if (!acesso) return { sucesso: false, motivo: 'sem-acesso' }

  const [atual] = await db
    .select({ prazoEm: atendimentos.prazoEm })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimentoId))
    .limit(1)
  if (!atual) return { sucesso: false, motivo: 'nao-encontrado' }

  const anterior = atual.prazoEm
  if ((anterior?.getTime() ?? null) === (prazoEm?.getTime() ?? null)) {
    return { sucesso: true, alterado: false }
  }

  const autor = await nomeDoAutor(usuarioId)
  const descricao = !prazoEm
    ? `Prazo removido por ${autor}`
    : anterior
      ? `Prazo alterado de ${rotuloPrazo(anterior)} para ${rotuloPrazo(prazoEm)} por ${autor}`
      : `Prazo definido para ${rotuloPrazo(prazoEm)} por ${autor}`

  await db.transaction(async (tx) => {
    await tx
      .update(atendimentos)
      .set({ prazoEm, updatedAt: new Date() })
      .where(eq(atendimentos.id, atendimentoId))

    await tx.insert(atendimentoEventos).values({
      atendimentoId,
      tipo: TIPOS_EVENTO_ATENDIMENTO.prazoDefinido,
      descricao,
      autorId: usuarioId,
      // Prazo é compromisso com o Cliente: mudou, ele precisa saber.
      visivelCliente: true,
      metadados: {
        de: anterior?.toISOString() ?? null,
        para: prazoEm?.toISOString() ?? null,
      },
    })
  })

  return { sucesso: true, alterado: true }
}
