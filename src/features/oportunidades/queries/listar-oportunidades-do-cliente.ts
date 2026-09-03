import { asc, desc, eq, inArray } from 'drizzle-orm'
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
import { naoLidasPorOportunidade } from '../lib/conversa'
import { ehFluxoDireto } from '../lib/fluxo-direto'
import { visualizacoesDosDestinatarios } from '../lib/visualizacao'
import type {
  OportunidadeDoClienteDTO,
  PropostaRecebidaDTO,
  SimulacaoDaOportunidade,
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
      motivoEncerramento: oportunidades.motivoEncerramento,
      expiraEm: oportunidades.expiraEm,
      criadoEm: oportunidades.createdAt,
      visibilidade: oportunidades.visibilidade,
      destinatarioId: oportunidades.destinatarioId,
      origem: oportunidades.origem,
      simulacao: oportunidades.simulacao,
      interesseEm: oportunidades.interesseEm,
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

  /**
   * Quem dispensou cada solicitação, e quando.
   *
   * As linhas cruas, e não só a contagem, porque as duas leituras convivem: na
   * **pública** o Cliente continua vendo apenas o número — quem dispensou não é
   * identificado, porque a decisão é sobre a agenda do prestador. Na
   * **privada** existe um destinatário só, escolhido pelo próprio Cliente, e
   * saber que aquela pessoa não vai propor é a diferença entre encerrar o
   * assunto e esperar por nada.
   */
  const dispensas = await db
    .select({
      oportunidadeId: oportunidadeDispensas.oportunidadeId,
      prestadorId: oportunidadeDispensas.prestadorId,
      criadoEm: oportunidadeDispensas.createdAt,
    })
    .from(oportunidadeDispensas)
    .where(inArray(oportunidadeDispensas.oportunidadeId, ids))

  /**
   * Quando o destinatário abriu a solicitação dele.
   *
   * Vem de `atendimento_leituras`, a mesma tabela que já responde "até onde
   * fulano leu" no Atendimento e no convite — nenhuma segunda contabilidade de
   * leitura nasceu para isto. Só as privadas entram na pergunta: numa pública
   * não existe um destinatário de quem falar.
   */
  const naoLidas = await naoLidasPorOportunidade(
    clienteUsuarioId,
    linhas.filter((linha) => ehFluxoDireto(linha.origem)).map(({ id }) => id),
  )

  const visualizacoes = await visualizacoesDosDestinatarios(
    linhas
      .filter((linha) => linha.destinatarioId !== null)
      .map((linha) => ({
        oportunidadeId: linha.id,
        destinatarioId: linha.destinatarioId as string,
      })),
  )

  const semInteressePorOportunidade = new Map<string, number>()
  const dispensaPorPar = new Map<string, Date>()
  for (const linha of dispensas) {
    semInteressePorOportunidade.set(
      linha.oportunidadeId,
      (semInteressePorOportunidade.get(linha.oportunidadeId) ?? 0) + 1,
    )
    dispensaPorPar.set(
      `${linha.oportunidadeId}:${linha.prestadorId}`,
      linha.criadoEm,
    )
  }

  /**
   * O cartão público de quem recebeu a solicitação privada.
   *
   * Mesmo recorte das propostas — nome, avatar, destaque e reputação real —,
   * resolvido pelo relacionamento e nunca copiado para a solicitação. Só é
   * consultado quando existe destinatário: numa lista só de públicas, nenhuma
   * consulta a mais acontece.
   */
  const destinatarioIds = [
    ...new Set(
      linhas
        .map((linha) => linha.destinatarioId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const destinatarios = destinatarioIds.length
    ? await db
        .select({
          id: usuarios.id,
          nome: usuarios.nome,
          avatarUrl: perfisProfissionais.avatarUrl,
          especialidades: perfisProfissionais.especialidades,
          areasAtuacao: perfisProfissionais.areasAtuacao,
        })
        .from(usuarios)
        .leftJoin(
          perfisProfissionais,
          eq(perfisProfissionais.usuarioId, usuarios.id),
        )
        .where(inArray(usuarios.id, destinatarioIds))
    : []
  const reputacaoDosDestinatarios =
    await obterReputacaoDosPrestadores(destinatarioIds)
  const destinatarioPorId = new Map(
    destinatarios.map((linha) => {
      const reputacao = reputacaoDosDestinatarios.get(linha.id)
      return [
        linha.id,
        {
          id: linha.id,
          nome: linha.nome,
          avatarUrl: linha.avatarUrl ?? null,
          destaque:
            linha.especialidades?.[0] ?? linha.areasAtuacao?.[0] ?? null,
          avaliacaoMedia:
            reputacao?.mediaEmDecimos != null
              ? reputacao.mediaEmDecimos / 10
              : null,
          totalAvaliacoes: reputacao?.total ?? 0,
          perfilUrl: `/perfil-profissional?prestador=${linha.id}`,
        },
      ]
    }),
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
      visibilidade: linha.visibilidade,
      origem: linha.origem,
      // Asserção num lugar só: o `jsonb` volta como `unknown`, e o formato é
      // desta plataforma — quem gravou foi ela.
      simulacao: (linha.simulacao as SimulacaoDaOportunidade | null) ?? null,
      interesseEm: linha.interesseEm?.toISOString() ?? null,
      mensagensNaoLidas: naoLidas.get(linha.id) ?? 0,
      // Só a marca **do destinatário** conta: numa pública não há de quem
      // falar, e contar quem abriu exporia a fila de terceiros a quem pediu.
      visualizadaEm: linha.destinatarioId
        ? (visualizacoes.get(linha.id)?.toISOString() ?? null)
        : null,
      destinatario: linha.destinatarioId
        ? (destinatarioPorId.get(linha.destinatarioId) ?? null)
        : null,
      // Só a dispensa **do destinatário** conta aqui: numa pública, mesmo que
      // dez prestadores tenham dispensado, o campo continua nulo.
      semInteresseEm: linha.destinatarioId
        ? (dispensaPorPar
            .get(`${linha.id}:${linha.destinatarioId}`)
            ?.toISOString() ?? null)
        : null,
      status,
      criadoEm: linha.criadoEm.toISOString(),
      expiraEm: linha.expiraEm?.toISOString() ?? null,
      ativa: status === 'aberta',
      anexos: anexos.get(linha.id) ?? [],
      totalPropostas: recebidas.length,
      totalSemInteresse: semInteressePorOportunidade.get(linha.id) ?? 0,
      propostas: recebidas,
      etapa: etapaComercial({
        motivoEncerramento: linha.motivoEncerramento,
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
