import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentos,
  oportunidadeDispensas,
  oportunidadePagamentos,
  oportunidadePropostas,
  oportunidades,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { obterReputacaoDosPrestadores } from '@/features/avaliacoes/queries/reputacao'
import { etapaComercial } from '@/features/pagamentos/lib/etapa-comercial'
import { LIMITE_OPORTUNIDADES_CARREGADAS } from '../constants/oportunidade'
import { propostaVigente, statusVisivel } from '../lib/vigencia-sql'
import type {
  OportunidadeDoClienteDTO,
  PropostaRecebidaDTO,
} from '../types/oportunidade'
import { obterNegociacoes } from './contrapropostas-da-proposta'
import { anexosDasOportunidades } from './listar-oportunidades-do-prestador'

/**
 * As solicitações de um Cliente, com as propostas recebidas.
 *
 * O `where` por `cliente_usuario_id` é a autorização inteira, e ela está no
 * SQL: não existe consulta aqui que traga a solicitação de outra pessoa, nem
 * passando o id dela. As propostas, as negociações e os contadores só são
 * buscados para as oportunidades que essa cláusula já devolveu.
 *
 * O cartão público de quem propôs é **resolvido pelo relacionamento**, e não
 * copiado para a proposta: nome, avatar e reputação mudam, e uma cópia
 * congelada mostraria um profissional que já não é aquele.
 */
export async function listarOportunidadesDoCliente(
  clienteUsuarioId: string,
  limite = LIMITE_OPORTUNIDADES_CARREGADAS,
): Promise<OportunidadeDoClienteDTO[]> {
  const linhas = await db
    .select({
      id: oportunidades.id,
      categoria: oportunidades.categoria,
      especialidades: oportunidades.especialidades,
      titulo: oportunidades.titulo,
      descricao: oportunidades.descricao,
      abrangencia: oportunidades.abrangencia,
      valorPretendidoCentavos: oportunidades.valorPretendidoCentavos,
      status: oportunidades.status,
      expiraEm: oportunidades.expiraEm,
      criadoEm: oportunidades.createdAt,
    })
    .from(oportunidades)
    .where(eq(oportunidades.clienteUsuarioId, clienteUsuarioId))
    .orderBy(desc(oportunidades.createdAt))
    .limit(limite)

  if (!linhas.length) return []

  const ids = linhas.map(({ id }) => id)
  const anexos = await anexosDasOportunidades(ids)

  const propostas = await db
    .select({
      id: oportunidadePropostas.id,
      oportunidadeId: oportunidadePropostas.oportunidadeId,
      prestadorId: oportunidadePropostas.prestadorId,
      prestadorNome: usuarios.nome,
      prestadorAvatar: perfisProfissionais.avatarUrl,
      prestadorCidade: perfisProfissionais.cidade,
      prestadorEstado: perfisProfissionais.estado,
      prestadorTipoProfissional: perfisProfissionais.tipoProfissional,
      prestadorEspecialidades: perfisProfissionais.especialidades,
      prestadorAreas: perfisProfissionais.areasAtuacao,
      mensagem: oportunidadePropostas.mensagem,
      valorCentavos: oportunidadePropostas.valorCentavos,
      prazoEstimadoDias: oportunidadePropostas.prazoEstimadoDias,
      status: oportunidadePropostas.status,
      validaAte: oportunidadePropostas.validaAte,
      aceitaEm: oportunidadePropostas.aceitaEm,
      valorAcordadoCentavos: oportunidadePropostas.valorAcordadoCentavos,
      criadoEm: oportunidadePropostas.createdAt,
    })
    .from(oportunidadePropostas)
    .innerJoin(usuarios, eq(usuarios.id, oportunidadePropostas.prestadorId))
    .leftJoin(
      perfisProfissionais,
      eq(perfisProfissionais.usuarioId, oportunidadePropostas.prestadorId),
    )
    .where(inArray(oportunidadePropostas.oportunidadeId, ids))
    .orderBy(asc(oportunidadePropostas.createdAt))

  // A mesma agregação de reputação que o card público e o perfil usam: uma
  // fonte só, para que a nota não divirja entre telas.
  const reputacoes = await obterReputacaoDosPrestadores(
    propostas.map(({ prestadorId }) => prestadorId),
  )
  const negociacoes = await obterNegociacoes(propostas.map(({ id }) => id))

  /** Quantos prestadores dispensaram cada solicitação. Só o número. */
  const dispensas = await db
    .select({
      oportunidadeId: oportunidadeDispensas.oportunidadeId,
      total: sql<number>`count(*)::int`,
    })
    .from(oportunidadeDispensas)
    .where(inArray(oportunidadeDispensas.oportunidadeId, ids))
    .groupBy(oportunidadeDispensas.oportunidadeId)

  const semInteressePorOportunidade = new Map(
    dispensas.map((linha) => [linha.oportunidadeId, linha.total]),
  )

  /**
   * Pagamento e Atendimento de cada solicitação.
   *
   * Duas consultas curtas em vez de dois `left join` na consulta principal: a
   * oportunidade já se multiplica por propostas e anexos, e juntar mais duas
   * cardinalidades ali obrigaria a desduplicar em memória o que o banco agrupa
   * de graça. Ambas só recebem ids que a cláusula de dono já devolveu.
   */
  const pagamentos = await db
    .select({
      oportunidadeId: oportunidadePagamentos.oportunidadeId,
      referencia: oportunidadePagamentos.referencia,
      valorCentavos: oportunidadePagamentos.valorCentavos,
      aprovadoEm: oportunidadePagamentos.aprovadoEm,
      origem: oportunidadePagamentos.origem,
    })
    .from(oportunidadePagamentos)
    .where(inArray(oportunidadePagamentos.oportunidadeId, ids))

  const pagamentoPorOportunidade = new Map(
    pagamentos.map((linha) => [
      linha.oportunidadeId,
      {
        referencia: linha.referencia,
        valorCentavos: linha.valorCentavos,
        aprovadoEm: linha.aprovadoEm.toISOString(),
        origem: linha.origem,
      },
    ]),
  )

  const protocolos = await db
    .select({
      oportunidadeId: atendimentos.oportunidadeId,
      id: atendimentos.id,
      protocolo: atendimentos.protocolo,
    })
    .from(atendimentos)
    .where(inArray(atendimentos.oportunidadeId, ids))

  const atendimentoPorOportunidade = new Map(
    protocolos
      .filter((linha) => linha.oportunidadeId !== null)
      .map((linha) => [
        linha.oportunidadeId as string,
        { id: linha.id, protocolo: linha.protocolo },
      ]),
  )

  /**
   * Uma proposta só é acionável se os **dois** relógios permitirem: a validade
   * dela e o prazo da solicitação. Sem esta junção, uma proposta com validade
   * longa continuaria "aceitável" numa oportunidade já expirada — e o aceite
   * seria recusado no servidor com a tela dizendo o contrário.
   */
  const ativaPorOportunidade = new Map(
    linhas.map((linha) => [linha.id, statusVisivel(linha) === 'aberta']),
  )

  const porOportunidade = new Map<string, PropostaRecebidaDTO[]>()
  for (const proposta of propostas) {
    const lista = porOportunidade.get(proposta.oportunidadeId) ?? []
    const reputacao = reputacoes.get(proposta.prestadorId)
    const negociacao = negociacoes.get(proposta.id)
    lista.push({
      id: proposta.id,
      prestadorId: proposta.prestadorId,
      prestadorNome: proposta.prestadorNome,
      prestadorCidade: proposta.prestadorCidade,
      prestadorEstado: proposta.prestadorEstado,
      prestadorTipoProfissional: proposta.prestadorTipoProfissional,
      perfilPublico: {
        nome: proposta.prestadorNome,
        avatarUrl: proposta.prestadorAvatar,
        destaque:
          proposta.prestadorEspecialidades?.[0] ??
          proposta.prestadorAreas?.[0] ??
          null,
        // `mediaEmDecimos` segue a convenção "valor / 10" das demais telas.
        avaliacaoMedia:
          reputacao?.mediaEmDecimos != null
            ? reputacao.mediaEmDecimos / 10
            : null,
        totalAvaliacoes: reputacao?.total ?? 0,
        // A rota é montada pela plataforma a partir do id de quem propôs — o
        // prestador não informa endereço de perfil em lugar nenhum.
        perfilUrl: `/perfil-profissional?prestador=${proposta.prestadorId}`,
      },
      mensagem: proposta.mensagem,
      valorCentavos: proposta.valorCentavos,
      prazoEstimadoDias: proposta.prazoEstimadoDias,
      status: proposta.status,
      criadoEm: proposta.criadoEm.toISOString(),
      validaAte: proposta.validaAte?.toISOString() ?? null,
      vigente:
        propostaVigente(proposta) &&
        (ativaPorOportunidade.get(proposta.oportunidadeId) ?? false),
      valorAcordadoCentavos: proposta.valorAcordadoCentavos,
      aceitaEm: proposta.aceitaEm?.toISOString() ?? null,
      contrapropostaPendente: negociacao?.pendente ?? null,
      historicoContrapropostas: negociacao?.historico ?? [],
    })
    porOportunidade.set(proposta.oportunidadeId, lista)
  }

  return linhas.map((linha) => {
    const recebidas = porOportunidade.get(linha.id) ?? []
    const status = statusVisivel(linha)
    const pagamento = pagamentoPorOportunidade.get(linha.id) ?? null
    const atendimento = atendimentoPorOportunidade.get(linha.id) ?? null
    return {
      id: linha.id,
      categoria: linha.categoria,
      especialidades: linha.especialidades ?? [],
      titulo: linha.titulo,
      descricao: linha.descricao,
      abrangencia: linha.abrangencia,
      valorPretendidoCentavos: linha.valorPretendidoCentavos,
      status,
      criadoEm: linha.criadoEm.toISOString(),
      expiraEm: linha.expiraEm?.toISOString() ?? null,
      ativa: status === 'aberta',
      anexos: anexos.get(linha.id) ?? [],
      totalPropostas: recebidas.length,
      totalSemInteresse: semInteressePorOportunidade.get(linha.id) ?? 0,
      propostas: recebidas,
      etapa: etapaComercial({
        status,
        temAcordo: recebidas.some((proposta) => proposta.status === 'aceita'),
        temPagamento: pagamento !== null,
        temAtendimento: atendimento !== null,
      }),
      pagamento,
      atendimento,
    }
  })
}
