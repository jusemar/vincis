import { and, asc, desc, eq, inArray, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import {
  atendimentoConviteMensagens,
  atendimentoConvites,
  atendimentos,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import type {
  StatusConviteAtendimento,
  TipoMensagemNegociacao,
} from '../constants/atendimento'
import { obterAcessoAtendimento } from '../lib/autorizacao'
import { expirarConvitesVencidos } from '../lib/convites'
import {
  calcularNaoLidas,
  chaveDaMarca,
  obterMarcasDeLeitura,
} from '../lib/leitura'

const remetenteConta = alias(usuarios, 'convite_remetente')
const destinatarioConta = alias(usuarios, 'convite_destinatario')
const autorLinha = alias(usuarios, 'negociacao_autor')

export type LinhaNegociacaoDTO = {
  id: string
  autorId: string
  autorNome: string
  /** Escrita por quem está lendo — a bolha alinha à direita, como na Conversa. */
  autoria: boolean
  tipo: TipoMensagemNegociacao
  conteudo: string
  valorCentavos: number | null
  /** Valor que esta linha substituiu. Presente só nas correções. */
  valorAnteriorCentavos: number | null
  criadoEm: string
}

export type ConviteAtendimentoDTO = {
  id: string
  atendimentoId: string
  /** Protocolo do Atendimento (`#AAAA-NNNN`) — como a equipe se refere a ele. */
  protocoloRotulo: string
  status: StatusConviteAtendimento
  escopo: string
  valorOferecidoCentavos: number | null
  valorContrapropostaCentavos: number | null
  valorAcordadoCentavos: number | null
  expiraEm: string
  respondidoEm: string | null
  criadoEm: string
  remetente: { id: string; nome: string }
  destinatario: {
    id: string
    nome: string
    tipoProfissional: string | null
    avatarUrl: string | null
  }
  /** Lado em que a pessoa que consultou está. */
  papel: 'remetente' | 'destinatario'
  negociacao: LinhaNegociacaoDTO[]
  /**
   * Situação legível da negociação.
   *
   * `em_negociacao` é derivado, não gravado: é um convite pendente que já teve
   * ida e volta. Serve para a tela dizer "esperando você" em vez de deixar tudo
   * como "Pendente" e obrigar a abrir para descobrir.
   */
  situacao:
    | 'pendente'
    | 'em_negociacao'
    | 'aceito'
    | 'recusado'
    | 'expirado'
    | 'revogado'
  /** Mensagens da negociação que esta pessoa ainda não leu. */
  naoLidas: number
  /** Primeira não lida — o alvo do clique vindo da notificação. */
  primeiraNaoLidaId: string | null
  /** Há contraproposta esperando decisão de quem convidou. */
  aguardandoDecisao: boolean
  /**
   * Convite recebido que esta pessoa nunca abriu.
   *
   * É o que o destaque do Dashboard chama de "novo": convite dirigido a ela,
   * ainda pendente, sem nenhuma marca de leitura na negociação — ou seja,
   * nunca analisado. Não é estado comercial: aceitar, recusar e expirar
   * continuam sendo o que sempre foram, e nada aqui os toca.
   *
   * Deriva da marca-d'água que a plataforma já grava quando a negociação é
   * aberta (`atendimento_leituras`, escopo `convite`, canal `negociacao`).
   * Nenhuma segunda semântica de "visto" foi inventada, e o sino continua com
   * a dele.
   */
  novoParaDestaque: boolean
}

/**
 * Monta os convites e as respectivas negociações a partir de linhas cruas.
 *
 * Compartilhado pelas duas consultas — a do painel de quem convida e a da caixa
 * de quem foi convidado — para que a negociação tenha uma forma só, e não duas
 * que precisem ser mantidas iguais na mão.
 */
async function carregarNegociacoes(conviteIds: string[], usuarioId: string) {
  if (!conviteIds.length) return new Map<string, LinhaNegociacaoDTO[]>()

  const linhas = await db
    .select({
      id: atendimentoConviteMensagens.id,
      conviteId: atendimentoConviteMensagens.conviteId,
      autorId: atendimentoConviteMensagens.autorId,
      autorNome: autorLinha.nome,
      tipo: atendimentoConviteMensagens.tipo,
      conteudo: atendimentoConviteMensagens.conteudo,
      valorCentavos: atendimentoConviteMensagens.valorCentavos,
      valorAnteriorCentavos: atendimentoConviteMensagens.valorAnteriorCentavos,
      criadoEm: atendimentoConviteMensagens.createdAt,
    })
    .from(atendimentoConviteMensagens)
    .innerJoin(
      autorLinha,
      eq(autorLinha.id, atendimentoConviteMensagens.autorId),
    )
    .where(inArray(atendimentoConviteMensagens.conviteId, conviteIds))
    .orderBy(asc(atendimentoConviteMensagens.createdAt))

  const porConvite = new Map<string, LinhaNegociacaoDTO[]>()
  for (const linha of linhas) {
    const lista = porConvite.get(linha.conviteId) ?? []
    lista.push({
      id: linha.id,
      autorId: linha.autorId,
      autorNome: linha.autorNome,
      autoria: linha.autorId === usuarioId,
      tipo: linha.tipo as TipoMensagemNegociacao,
      conteudo: linha.conteudo,
      valorCentavos: linha.valorCentavos,
      valorAnteriorCentavos: linha.valorAnteriorCentavos,
      criadoEm: linha.criadoEm.toISOString(),
    })
    porConvite.set(linha.conviteId, lista)
  }
  return porConvite
}

const CAMPOS_CONVITE = {
  id: atendimentoConvites.id,
  atendimentoId: atendimentoConvites.atendimentoId,
  protocoloRotulo: atendimentos.protocolo,
  status: atendimentoConvites.status,
  escopo: atendimentoConvites.escopo,
  valorOferecidoCentavos: atendimentoConvites.valorOferecidoCentavos,
  valorContrapropostaCentavos: atendimentoConvites.valorContrapropostaCentavos,
  valorAcordadoCentavos: atendimentoConvites.valorAcordadoCentavos,
  expiraEm: atendimentoConvites.expiraEm,
  respondidoEm: atendimentoConvites.respondidoEm,
  criadoEm: atendimentoConvites.createdAt,
  remetenteId: atendimentoConvites.remetenteId,
  remetenteNome: remetenteConta.nome,
  destinatarioId: atendimentoConvites.destinatarioId,
  destinatarioNome: destinatarioConta.nome,
  destinatarioTipoProfissional: perfisProfissionais.tipoProfissional,
  destinatarioAvatarUrl: perfisProfissionais.avatarUrl,
}

/** Linha crua de `CAMPOS_CONVITE`, como o Drizzle a devolve. */
type LinhaConvite = {
  id: string
  atendimentoId: string
  protocoloRotulo: string
  status: string
  escopo: string
  valorOferecidoCentavos: number | null
  valorContrapropostaCentavos: number | null
  valorAcordadoCentavos: number | null
  expiraEm: Date
  respondidoEm: Date | null
  criadoEm: Date
  remetenteId: string
  remetenteNome: string
  destinatarioId: string
  destinatarioNome: string
  destinatarioTipoProfissional: string | null
  destinatarioAvatarUrl: string | null
}

function montarConvite(
  linha: LinhaConvite,
  usuarioId: string,
  negociacao: LinhaNegociacaoDTO[],
  lidoAte?: Date,
): ConviteAtendimentoDTO {
  const status = linha.status as StatusConviteAtendimento
  const leitura = calcularNaoLidas(
    negociacao.map((item) => ({
      id: item.id,
      autorId: item.autorId,
      criadoEm: item.criadoEm,
    })),
    usuarioId,
    lidoAte,
  )
  // Pendente com mais de uma linha já é conversa em andamento — não é o mesmo
  // que um convite recém-enviado a que ninguém respondeu.
  const situacao =
    status === 'pendente' && negociacao.length > 1
      ? ('em_negociacao' as const)
      : status

  return {
    situacao,
    naoLidas: leitura.total,
    // Sem marca de leitura = a caixa de convites nunca foi aberta neste
    // convite. Quem enviou não recebe destaque: ele não tem o que analisar.
    novoParaDestaque:
      status === 'pendente' &&
      linha.destinatarioId === usuarioId &&
      lidoAte === undefined,
    primeiraNaoLidaId: leitura.primeiraNaoLidaId,
    // A bola está com quem convidou quando a contraproposta ainda não virou a
    // oferta vigente.
    aguardandoDecisao:
      status === 'pendente' &&
      linha.valorContrapropostaCentavos !== null &&
      linha.valorContrapropostaCentavos !== linha.valorOferecidoCentavos &&
      linha.remetenteId === usuarioId,
    id: linha.id,
    atendimentoId: linha.atendimentoId,
    protocoloRotulo: linha.protocoloRotulo,
    status,
    escopo: linha.escopo,
    valorOferecidoCentavos: linha.valorOferecidoCentavos,
    valorContrapropostaCentavos: linha.valorContrapropostaCentavos,
    valorAcordadoCentavos: linha.valorAcordadoCentavos,
    expiraEm: linha.expiraEm.toISOString(),
    respondidoEm: linha.respondidoEm?.toISOString() ?? null,
    criadoEm: linha.criadoEm.toISOString(),
    remetente: { id: linha.remetenteId, nome: linha.remetenteNome },
    destinatario: {
      id: linha.destinatarioId,
      nome: linha.destinatarioNome,
      tipoProfissional: linha.destinatarioTipoProfissional,
      avatarUrl: linha.destinatarioAvatarUrl,
    },
    papel: linha.remetenteId === usuarioId ? 'remetente' : 'destinatario',
    negociacao,
  }
}

/**
 * Convites de um Atendimento, para quem o administra.
 *
 * Traz também a negociação de cada um — mas apenas dos convites em que a pessoa
 * é uma das duas pontas. Na prática isso significa: quem enviou lê o que
 * enviou. Um responsável que não emitiu determinado convite vê que ele existe e
 * qual o status, sem ler a conversa alheia sobre valores.
 */
export async function listarConvitesDoAtendimento(
  atendimentoId: string,
  usuarioId: string,
): Promise<ConviteAtendimentoDTO[]> {
  const acesso = await obterAcessoAtendimento(atendimentoId, usuarioId)
  if (!acesso) return []
  if (acesso.vinculo !== 'prestador' && acesso.vinculo !== 'responsavel') {
    return []
  }

  await expirarConvitesVencidos()

  const linhas = await db
    .select(CAMPOS_CONVITE)
    .from(atendimentoConvites)
    .innerJoin(
      atendimentos,
      eq(atendimentos.id, atendimentoConvites.atendimentoId),
    )
    .innerJoin(
      remetenteConta,
      eq(remetenteConta.id, atendimentoConvites.remetenteId),
    )
    .innerJoin(
      destinatarioConta,
      eq(destinatarioConta.id, atendimentoConvites.destinatarioId),
    )
    .leftJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, atendimentoConvites.destinatarioId),
    )
    .where(eq(atendimentoConvites.atendimentoId, atendimentoId))
    .orderBy(desc(atendimentoConvites.createdAt))

  const meus = linhas.filter(
    (linha) =>
      linha.remetenteId === usuarioId || linha.destinatarioId === usuarioId,
  )
  const meusIds = meus.map((linha) => linha.id)
  const [negociacoes, marcas] = await Promise.all([
    carregarNegociacoes(meusIds, usuarioId),
    obterMarcasDeLeitura(usuarioId, 'convite', meusIds),
  ])

  return linhas.map((linha) =>
    montarConvite(
      linha,
      usuarioId,
      negociacoes.get(linha.id) ?? [],
      marcas.get(chaveDaMarca(linha.id, 'negociacao')),
    ),
  )
}

/**
 * Todos os convites em que a pessoa é uma das duas pontas.
 *
 * Recebidos **e** enviados, de propósito. Antes esta consulta trazia só os
 * recebidos, e quem convidava não tinha por onde acompanhar a resposta: o
 * Atendimento aparecia no quadro, mas a negociação ficava escondida atrás do
 * painel de participantes, um convite de cada vez. Quem envia também espera
 * resposta.
 *
 * Os respondidos continuam listados para que dê para reler o que foi
 * combinado; o recorte de exibição fica na tela.
 */
export async function listarConvitesDaPessoa(
  usuarioId: string,
): Promise<ConviteAtendimentoDTO[]> {
  await expirarConvitesVencidos()

  const linhas = await db
    .select(CAMPOS_CONVITE)
    .from(atendimentoConvites)
    .innerJoin(
      atendimentos,
      eq(atendimentos.id, atendimentoConvites.atendimentoId),
    )
    .innerJoin(
      remetenteConta,
      eq(remetenteConta.id, atendimentoConvites.remetenteId),
    )
    .innerJoin(
      destinatarioConta,
      eq(destinatarioConta.id, atendimentoConvites.destinatarioId),
    )
    .leftJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, atendimentoConvites.destinatarioId),
    )
    .where(
      and(
        or(
          eq(atendimentoConvites.destinatarioId, usuarioId),
          eq(atendimentoConvites.remetenteId, usuarioId),
        ),
        // Expirados somem da caixa: não há o que decidir neles.
        or(
          eq(atendimentoConvites.status, 'pendente'),
          eq(atendimentoConvites.status, 'aceito'),
          eq(atendimentoConvites.status, 'recusado'),
        ),
      ),
    )
    .orderBy(desc(atendimentoConvites.createdAt))

  const ids = linhas.map((linha) => linha.id)
  const [negociacoes, marcas] = await Promise.all([
    carregarNegociacoes(ids, usuarioId),
    obterMarcasDeLeitura(usuarioId, 'convite', ids),
  ])

  return linhas.map((linha) =>
    montarConvite(
      linha,
      usuarioId,
      negociacoes.get(linha.id) ?? [],
      marcas.get(chaveDaMarca(linha.id, 'negociacao')),
    ),
  )
}
