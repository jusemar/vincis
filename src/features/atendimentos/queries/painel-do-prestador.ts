/**
 * Números do Dashboard do prestador.
 *
 * O que **não** está mais aqui conta metade da história: a lista de
 * "Atividades recentes" saía deste arquivo, montada a partir de
 * `atendimento_eventos`. Ela foi retirada porque a área do Dashboard com esse
 * nome passou a ser mural institucional da Vincis (ver `features/comunicados`).
 * A trilha operacional não sumiu — ela continua no Histórico de cada
 * Atendimento, que é onde uma auditoria é útil: junto do protocolo a que ela
 * pertence, e não espalhada num resumo global.
 */
import { and, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentoMensagens, atendimentos } from '@/db/schema'
import { contarNaoLidasDoUsuario } from '@/features/notificacoes/queries/listar-notificacoes'
import { condicaoAlcanceAtendimento } from '../lib/autorizacao'
import { obterMarcasDeLeitura, chaveDaMarca, calcularNaoLidas } from '../lib/leitura'
import { contarPendenciasDeConvite } from '../lib/pendencias-convite'
import { listarConvitesDaPessoa } from './convites-do-atendimento'

/**
 * Indicadores reais do Dashboard.
 *
 * Só coisas que a plataforma sabe de verdade. Faturamento, meta e avaliação
 * continuam mockados na tela porque não existem no banco — inventar um número
 * ali seria pior do que deixar o mock visível e identificável.
 */
export type ResumoDoPainelDTO = {
  atendimentosAtivos: number
  atendimentosNovos: number
  mensagensNaoLidas: number
  convitesPendentes: number
  protocolosAguardandoAcao: number
  prazosProximos: number
  prazosVencidos: number
  notificacoesNaoLidas: number
}

const UM_DIA = 24 * 60 * 60 * 1000

/** "Vence em breve" é o mesmo recorte de 3 dias que o badge do card usa. */
export const JANELA_PRAZO_PROXIMO_DIAS = 3

/**
 * Números reais para os cards do Dashboard.
 *
 * Uma consulta por pergunta, todas com o mesmo recorte de alcance. As mensagens
 * não lidas são calculadas com as mesmas funções que o badge do card usa — o
 * número do Dashboard e o número do Kanban não podem discordar.
 */
export async function obterResumoDoPainel(
  usuarioId: string,
  agora = new Date(),
): Promise<ResumoDoPainelDTO> {
  const limiteProximo = new Date(
    agora.getTime() + JANELA_PRAZO_PROXIMO_DIAS * UM_DIA,
  )

  const [porStatus, prazos, convites, notificacoesNaoLidas] = await Promise.all([
    db
      .select({
        status: atendimentos.status,
        total: sql<number>`count(*)::int`,
      })
      .from(atendimentos)
      .where(condicaoAlcanceAtendimento(usuarioId))
      .groupBy(atendimentos.status),
    db
      .select({
        // As datas entram como texto ISO com `::timestamp` explícito: um objeto
        // `Date` cru dentro de um `sql` template não é serializável pelo driver
        // — ele só converte parâmetros de colunas tipadas.
        vencidos: sql<number>`count(*) filter (where ${atendimentos.prazoEm} < ${agora.toISOString()}::timestamp)::int`,
        proximos: sql<number>`count(*) filter (where ${atendimentos.prazoEm} >= ${agora.toISOString()}::timestamp and ${atendimentos.prazoEm} <= ${limiteProximo.toISOString()}::timestamp)::int`,
      })
      .from(atendimentos)
      .where(
        and(
          condicaoAlcanceAtendimento(usuarioId),
          isNotNull(atendimentos.prazoEm),
          // Atendimento encerrado não tem prazo a cobrar.
          sql`${atendimentos.status} not in ('concluido', 'recusado', 'cancelado')`,
        ),
      ),
    listarConvitesDaPessoa(usuarioId),
    contarNaoLidasDoUsuario(usuarioId),
  ])

  const totalPorStatus = new Map(porStatus.map((l) => [l.status, l.total]))
  const soma = (...chaves: string[]) =>
    chaves.reduce((total, chave) => total + (totalPorStatus.get(chave) ?? 0), 0)

  return {
    atendimentosAtivos: soma(
      'novo',
      'em_andamento',
      'aguardando_cliente',
      'aguardando_assinatura',
    ),
    atendimentosNovos: soma('novo'),
    mensagensNaoLidas: await contarMensagensNaoLidas(usuarioId),
    convitesPendentes: contarPendenciasDeConvite(convites),
    // "Aguardando cliente" é o Atendimento parado esperando alguém de fora;
    // quem precisa agir aqui é a equipe, cobrando.
    protocolosAguardandoAcao: soma('aguardando_cliente', 'aguardando_assinatura'),
    prazosProximos: prazos[0]?.proximos ?? 0,
    prazosVencidos: prazos[0]?.vencidos ?? 0,
    notificacoesNaoLidas,
  }
}

/**
 * Total de mensagens da Conversa que a pessoa ainda não leu, em toda a carteira.
 *
 * Usa exatamente `calcularNaoLidas`, a mesma função do badge do card: se um dia
 * a regra mudar (uma nova exceção de autoria, por exemplo), os dois números
 * mudam juntos porque são o mesmo código.
 */
async function contarMensagensNaoLidas(usuarioId: string) {
  const alcancaveis = await db
    .select({ id: atendimentos.id })
    .from(atendimentos)
    .where(condicaoAlcanceAtendimento(usuarioId))
  const ids = alcancaveis.map(({ id }) => id)
  if (!ids.length) return 0

  const [mensagens, marcas] = await Promise.all([
    db
      .select({
        id: atendimentoMensagens.id,
        atendimentoId: atendimentoMensagens.atendimentoId,
        escopo: atendimentoMensagens.escopo,
        autorId: atendimentoMensagens.autorId,
        criadoEm: atendimentoMensagens.createdAt,
      })
      .from(atendimentoMensagens)
      .where(inArray(atendimentoMensagens.atendimentoId, ids)),
    obterMarcasDeLeitura(usuarioId, 'atendimento', ids),
  ])

  let total = 0
  for (const atendimentoId of ids) {
    for (const canal of ['cliente', 'interno'] as const) {
      const doCanal = mensagens.filter(
        (m) => m.atendimentoId === atendimentoId && m.escopo === canal,
      )
      total += calcularNaoLidas(
        doCanal,
        usuarioId,
        marcas.get(chaveDaMarca(atendimentoId, canal)),
      ).total
    }
  }
  return total
}
