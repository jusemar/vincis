import { and, desc, eq, inArray, notInArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import {
  atendimentos,
  consultoriaAgendamentos,
  consultoriaPagamentos,
  contratacoesServico,
  oportunidadePagamentos,
  perfis,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { emitirNotificacoes, resumirTexto } from '@/features/notificacoes/lib/emitir'
import { PERFIL_GESTOR_VINCIS } from '@/features/usuarios/constants/perfis'
import { STATUS_TERMINAIS } from '../constants/atendimento'
import {
  DIAS_INATIVO,
  DIAS_LEMBRETE,
  DIAS_REVISAO,
  ROTULO_SITUACAO,
  calcularAndamento,
  type Andamento,
} from './andamento'
import { obterAudienciaDoAtendimento } from './audiencia'
import { resumirInteracoes } from './interacoes'

const prestadorConta = alias(usuarios, 'prestador_parado')
const clienteConta = alias(usuarios, 'cliente_parado')

export type AtendimentoComAndamento = {
  id: string
  protocolo: string
  titulo: string
  status: string
  prazoEm: Date | null
  criadoEm: Date
  prestadorNome: string
  clienteNome: string
  clienteUsuarioId: string
  andamento: Andamento
}

/** Rota da fila da Gestão — destino do aviso de revisão. */
export const ROTA_ATENDIMENTOS_PARADOS = '/admin/atendimentos-parados'

/**
 * Todo Atendimento ainda aberto, com o andamento derivado.
 *
 * A base comum da rotina diária de inatividade e da fila da Gestão — as duas
 * precisam da mesma pergunta ("há quanto tempo ninguém interage, e quem precisa
 * agir?") e não podem respondê-la de jeitos diferentes.
 */
export async function listarAtendimentosAbertosComAndamento(
  agora = new Date(),
): Promise<AtendimentoComAndamento[]> {
  const registros = await db
    .select({
      id: atendimentos.id,
      protocolo: atendimentos.protocolo,
      titulo: atendimentos.titulo,
      status: atendimentos.status,
      prazoEm: atendimentos.prazoEm,
      criadoEm: atendimentos.createdAt,
      clienteUsuarioId: atendimentos.clienteUsuarioId,
      prestadorNome: prestadorConta.nome,
      clienteNome: clienteConta.nome,
      cobrancaId: contratacoesServico.cobrancaId,
      consultoriaPagamentoId: consultoriaPagamentos.id,
      pagamentoAcordoId: oportunidadePagamentos.id,
    })
    .from(atendimentos)
    .innerJoin(prestadorConta, eq(prestadorConta.id, atendimentos.prestadorId))
    .innerJoin(clienteConta, eq(clienteConta.id, atendimentos.clienteUsuarioId))
    .leftJoin(contratacoesServico, eq(contratacoesServico.id, atendimentos.contratacaoId))
    .leftJoin(
      consultoriaAgendamentos,
      eq(consultoriaAgendamentos.id, atendimentos.consultoriaAgendamentoId),
    )
    .leftJoin(
      consultoriaPagamentos,
      eq(consultoriaPagamentos.agendamentoId, consultoriaAgendamentos.id),
    )
    .leftJoin(
      oportunidadePagamentos,
      eq(oportunidadePagamentos.oportunidadeId, atendimentos.oportunidadeId),
    )
    .where(notInArray(atendimentos.status, STATUS_TERMINAIS))
    .orderBy(desc(atendimentos.createdAt))

  const interacoes = await resumirInteracoes(
    db,
    registros.map((r) => r.id),
  )
  return registros.map((registro) => ({
    id: registro.id,
    protocolo: registro.protocolo,
    titulo: registro.titulo,
    status: registro.status,
    prazoEm: registro.prazoEm,
    criadoEm: registro.criadoEm,
    prestadorNome: registro.prestadorNome,
    clienteNome: registro.clienteNome,
    clienteUsuarioId: registro.clienteUsuarioId,
    andamento: calcularAndamento({
      status: registro.status,
      criadoEm: registro.criadoEm,
      prazoEm: registro.prazoEm,
      interacoes: interacoes.get(registro.id) ?? { ultimaDoCliente: null, ultimaDoProfissional: null },
      pago: Boolean(registro.cobrancaId || registro.consultoriaPagamentoId || registro.pagamentoAcordoId),
      agora,
    }),
  }))
}

async function gestoresDaPlataforma(): Promise<string[]> {
  const linhas = await db
    .select({ id: usuariosPerfis.usuarioId })
    .from(usuariosPerfis)
    .innerJoin(perfis, eq(perfis.id, usuariosPerfis.perfilId))
    .innerJoin(usuarios, eq(usuarios.id, usuariosPerfis.usuarioId))
    .where(and(eq(perfis.nome, PERFIL_GESTOR_VINCIS), inArray(usuarios.status, ['ativo'])))
  return linhas.map((l) => l.id)
}

/**
 * A chave do aviso de inatividade.
 *
 * Inclui o instante da última interação: o mesmo degrau do mesmo período de
 * silêncio avisa **uma vez** (o índice único de `notificacoes` garante, mesmo
 * com duas execuções simultâneas), e uma interação nova abre um período novo —
 * se o caso voltar a parar, volta a avisar.
 */
export function chaveDeInatividade(
  atendimentoId: string,
  degrau: number,
  ultimaInteracaoEm: Date,
) {
  return `inatividade:${atendimentoId}:${degrau}:${ultimaInteracaoEm.getTime()}`
}

export type ResumoDaInatividade = {
  analisados: number
  lembretes: number
  inativos: number
  emRevisao: number
}

/**
 * A régua de inatividade, chamada pelo agendador diário.
 *
 * - **3 dias** sem interação: avisa de novo quem precisa agir — a equipe do
 *   caso, se está "Aguardando profissional"; o Cliente, se "Aguardando você".
 * - **7 dias**: o caso aparece como "Atendimento inativo" e a mesma pessoa
 *   recebe novo aviso.
 * - **14 dias**: "Em revisão pela Vincis" — a Gestão é avisada e o caso entra
 *   na fila `/admin/atendimentos-parados`.
 *
 * Nada aqui muda status, cancela, conclui ou mexe em dinheiro: a rotina só
 * avisa. O que aparece na tela (inativo, revisão) é derivado do relógio, não
 * gravado por ela.
 */
export async function processarInatividadeDosAtendimentos(
  agora = new Date(),
): Promise<ResumoDaInatividade> {
  const abertos = await listarAtendimentosAbertosComAndamento(agora)
  const resumo: ResumoDaInatividade = { analisados: abertos.length, lembretes: 0, inativos: 0, emRevisao: 0 }
  let gestores: string[] | null = null

  for (const item of abertos) {
    const { andamento } = item
    const degrau = andamento.degrauInatividade
    if (degrau < DIAS_LEMBRETE || !andamento.situacao) continue

    if (degrau === DIAS_REVISAO) {
      gestores ??= await gestoresDaPlataforma()
      const criadas = await emitirNotificacoes(db, {
        destinatarios: gestores,
        autorId: null,
        tipo: TIPOS_NOTIFICACAO.atendimentoEmRevisao,
        titulo: 'Atendimento em revisão pela Vincis',
        resumo: resumirTexto(
          `${item.protocolo} · ${item.titulo} · ${andamento.diasSemInteracao} dias sem movimentação · ${ROTULO_SITUACAO[andamento.situacao]}`,
          200,
        ),
        recursoTipo: 'atendimento',
        recursoId: item.id,
        atendimentoId: item.id,
        protocolo: item.protocolo,
        destino: { pagina: 'atendimentos', rota: ROTA_ATENDIMENTOS_PARADOS },
        chaveDedupe: chaveDeInatividade(item.id, DIAS_REVISAO, andamento.ultimaInteracaoEm),
      })
      if (criadas) resumo.emRevisao += 1
      continue
    }

    // 3 e 7 dias: quem precisa agir, e só essa pessoa.
    let destinatarios: string[]
    if (andamento.situacao === 'aguardando_voce') {
      destinatarios = [item.clienteUsuarioId]
    } else {
      const audiencia = await obterAudienciaDoAtendimento(db, item.id)
      destinatarios = audiencia?.equipe ?? []
    }
    const titulo =
      andamento.situacao === 'aguardando_voce'
        ? `O atendimento ${item.protocolo} aguarda sua resposta`
        : `Atendimento ${item.protocolo} aguardando sua ação`
    const criadas = await emitirNotificacoes(db, {
      destinatarios,
      autorId: null,
      tipo: TIPOS_NOTIFICACAO.atendimentoSemMovimentacao,
      titulo,
      resumo: resumirTexto(
        `${item.titulo} · ${andamento.diasSemInteracao} dias sem movimentação`,
        200,
      ),
      recursoTipo: 'atendimento',
      recursoId: item.id,
      atendimentoId: item.id,
      protocolo: item.protocolo,
      destino: { pagina: 'atendimentos', atendimento: item.protocolo, aba: 'conversa' },
      chaveDedupe: chaveDeInatividade(item.id, degrau, andamento.ultimaInteracaoEm),
    })
    if (criadas) {
      if (degrau === DIAS_INATIVO) resumo.inativos += 1
      else resumo.lembretes += 1
    }
  }
  return resumo
}
