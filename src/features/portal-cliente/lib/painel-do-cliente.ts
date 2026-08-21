import type { AtendimentoDoClienteDTO } from '@/features/atendimentos/types/atendimento'
import { ROTULO_STATUS_ATENDIMENTO } from '@/features/atendimentos/constants/atendimento'
import { calcularProgresso } from '@/features/atendimentos/lib/progresso-checklist'
import { rotuloDaCategoria } from '@/features/oportunidades/constants/oportunidade'
import type { OportunidadeDoClienteDTO } from '@/features/oportunidades/types/oportunidade'
import type { EventoDaLinhaDoTempo, Tom } from '../components/ui/primitivos'

/**
 * O que a Área do Cliente mostra na abertura.
 *
 * Tudo aqui é **derivado dos dados que o portal já carrega** — nenhuma consulta
 * nova, nenhuma tabela nova, nenhum número inventado. A regra de produto é uma
 * só: a home responde "o que precisa de mim agora?", e não "quantos registros
 * eu tenho". Por isso a lista de atenção só admite situação **acionável pelo
 * Cliente**; o que depende do profissional aparece como acompanhamento, não
 * como pendência dele.
 */

export type ItemDeAtencao = {
  id: string
  tom: Tom
  etiqueta: string
  titulo: string
  detalhe: string
  /** Aba do portal para onde o item leva. */
  aba: 'orcamentos' | 'atendimentos'
  acao: string
}

const dataCurta = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR').format(new Date(iso))

const dataHora = (iso: string) =>
  `${new Intl.DateTimeFormat('pt-BR').format(new Date(iso))} às ${new Intl.DateTimeFormat(
    'pt-BR',
    { hour: '2-digit', minute: '2-digit' },
  ).format(new Date(iso))}`

/** Uma proposta ainda esperando decisão do Cliente. */
function propostasAguardando(oportunidades: OportunidadeDoClienteDTO[]) {
  return oportunidades.flatMap((oportunidade) =>
    oportunidade.propostas
      .filter(
        (proposta) =>
          oportunidade.ativa &&
          proposta.vigente &&
          proposta.status !== 'aceita' &&
          // Contraproposta pendente é a vez do profissional, não do Cliente.
          !proposta.contrapropostaPendente,
      )
      .map((proposta) => ({ oportunidade, proposta })),
  )
}

export function montarItensDeAtencao({
  oportunidades,
  atendimentos,
}: {
  oportunidades: OportunidadeDoClienteDTO[]
  atendimentos: AtendimentoDoClienteDTO[]
}): ItemDeAtencao[] {
  const itens: ItemDeAtencao[] = []

  // 1. Proposta esperando decisão — o que mais depende do Cliente.
  for (const { oportunidade, proposta } of propostasAguardando(oportunidades)) {
    itens.push({
      id: `proposta-${proposta.id}`,
      tom: 'destaque',
      etiqueta: 'Proposta recebida',
      titulo: `${proposta.perfilPublico.nome} respondeu sua solicitação`,
      detalhe: proposta.validaAte
        ? `${oportunidade.titulo} · válida até ${dataHora(proposta.validaAte)}`
        : oportunidade.titulo,
      aba: 'orcamentos',
      acao: 'Ver proposta',
    })
  }

  // 2. Resposta do profissional à contraproposta, ainda não vista em ação.
  for (const oportunidade of oportunidades) {
    for (const proposta of oportunidade.propostas) {
      const ultima = proposta.historicoContrapropostas.at(-1)
      if (!ultima || proposta.status === 'aceita' || !oportunidade.ativa) continue
      if (ultima.status !== 'recusada' || !proposta.vigente) continue
      itens.push({
        id: `contraproposta-${ultima.id}`,
        tom: 'atencao',
        etiqueta: 'Contraproposta recusada',
        titulo: `${proposta.perfilPublico.nome} manteve a proposta original`,
        detalhe: `${oportunidade.titulo} · você pode aceitar ou propor outro valor`,
        aba: 'orcamentos',
        acao: 'Revisar',
      })
    }
  }

  // 3. Acordo fechado esperando pagamento — a pendência mais concreta que
  //    existe, porque nada começa antes dela.
  for (const oportunidade of oportunidades) {
    if (oportunidade.etapa !== 'aguardando_pagamento') continue
    const acordo = oportunidade.propostas.find(
      (proposta) => proposta.status === 'aceita',
    )
    if (!acordo) continue
    itens.push({
      id: `pagamento-${oportunidade.id}`,
      tom: 'atencao',
      etiqueta: 'Aguardando pagamento',
      titulo: `Conclua a contratação de ${acordo.perfilPublico.nome}`,
      detalhe: `${oportunidade.titulo} · o atendimento é aberto após o pagamento`,
      aba: 'orcamentos',
      acao: 'Pagar',
    })
  }

  // 4. Atendimento parado esperando o Cliente.
  for (const atendimento of atendimentos) {
    if (atendimento.status !== 'aguardando_cliente') continue
    itens.push({
      id: `atendimento-${atendimento.id}`,
      tom: 'atencao',
      etiqueta: 'Aguardando você',
      titulo: `${atendimento.protocolo} · ${atendimento.titulo}`,
      detalhe: `${atendimento.prestador.nome} precisa de um retorno seu`,
      aba: 'atendimentos',
      acao: 'Responder',
    })
  }

  // 5. Serviço entregue e ainda sem avaliação.
  for (const atendimento of atendimentos) {
    if (!atendimento.conclusao || atendimento.avaliacao) continue
    itens.push({
      id: `avaliacao-${atendimento.id}`,
      tom: 'info',
      etiqueta: 'Avaliação pendente',
      titulo: `Como foi o ${atendimento.protocolo}?`,
      detalhe: `Concluído em ${dataCurta(atendimento.conclusao.em)} por ${
        atendimento.conclusao.porNome ?? atendimento.prestador.nome
      }`,
      aba: 'atendimentos',
      acao: 'Avaliar',
    })
  }

  // 6. Pedido de ajuste já respondido pela equipe.
  for (const atendimento of atendimentos) {
    const ajuste = atendimento.ajuste
    if (!ajuste || ajuste.status === 'pendente') continue
    itens.push({
      id: `ajuste-${ajuste.id}`,
      tom: 'info',
      etiqueta: 'Ajuste analisado',
      titulo: `Seu pedido de ajuste no ${atendimento.protocolo} foi respondido`,
      detalhe: atendimento.titulo,
      aba: 'atendimentos',
      acao: 'Ver resposta',
    })
  }

  return itens
}

/** Os quatro números do topo. Contagens diretas, sem estimativa. */
export function montarIndicadores({
  oportunidades,
  atendimentos,
}: {
  oportunidades: OportunidadeDoClienteDTO[]
  atendimentos: AtendimentoDoClienteDTO[]
}) {
  const propostas = oportunidades.reduce(
    (total, oportunidade) => total + oportunidade.totalPropostas,
    0,
  )
  return [
    {
      rotulo: 'Solicitações ativas',
      valor: oportunidades.filter((item) => item.ativa).length,
    },
    { rotulo: 'Propostas recebidas', valor: propostas },
    {
      rotulo: 'Atendimentos ativos',
      valor: atendimentos.filter(
        (item) => !['concluido', 'recusado', 'cancelado'].includes(item.status),
      ).length,
    },
    {
      rotulo: 'Concluídos',
      valor: atendimentos.filter((item) => item.status === 'concluido').length,
    },
  ]
}

/**
 * Atividade recente, montada a partir dos eventos reais que já chegam ao portal.
 *
 * Duas origens, ambas existentes: o histórico de cada Atendimento
 * (`atendimento.eventos`) e os marcos das solicitações (publicação, proposta
 * recebida, acordo). Nada é gravado para alimentar esta lista — ela é uma
 * leitura, e some junto com os dados que a originaram.
 */
export function montarAtividade({
  oportunidades,
  atendimentos,
  limite = 8,
}: {
  oportunidades: OportunidadeDoClienteDTO[]
  atendimentos: AtendimentoDoClienteDTO[]
  limite?: number
}): EventoDaLinhaDoTempo[] {
  const eventos: (EventoDaLinhaDoTempo & { instante: number })[] = []

  for (const atendimento of atendimentos) {
    for (const evento of atendimento.eventos) {
      eventos.push({
        id: `evento-${evento.id}`,
        titulo: evento.descricao,
        detalhe: `${atendimento.protocolo} · ${atendimento.titulo}`,
        quando: dataHora(evento.criadoEm),
        tom: evento.tipo.includes('concluido') ? 'sucesso' : 'neutro',
        instante: new Date(evento.criadoEm).getTime(),
      })
    }
  }

  for (const oportunidade of oportunidades) {
    eventos.push({
      id: `solicitacao-${oportunidade.id}`,
      titulo: 'Você publicou uma solicitação de orçamento',
      detalhe: `${rotuloDaCategoria(oportunidade.categoria)} · ${oportunidade.titulo}`,
      quando: dataHora(oportunidade.criadoEm),
      tom: 'neutro',
      instante: new Date(oportunidade.criadoEm).getTime(),
    })
    for (const proposta of oportunidade.propostas) {
      eventos.push({
        id: `proposta-recebida-${proposta.id}`,
        titulo: `${proposta.perfilPublico.nome} enviou uma proposta`,
        detalhe: oportunidade.titulo,
        quando: dataHora(proposta.criadoEm),
        tom: 'destaque',
        instante: new Date(proposta.criadoEm).getTime(),
      })
      if (proposta.aceitaEm) {
        eventos.push({
          id: `acordo-${proposta.id}`,
          titulo: `Acordo fechado com ${proposta.perfilPublico.nome}`,
          detalhe: oportunidade.titulo,
          quando: dataHora(proposta.aceitaEm),
          tom: 'sucesso',
          instante: new Date(proposta.aceitaEm).getTime(),
        })
      }
    }
    if (oportunidade.pagamento) {
      eventos.push({
        id: `pagamento-${oportunidade.id}`,
        titulo: 'Pagamento aprovado',
        detalhe: oportunidade.atendimento
          ? `${oportunidade.titulo} · atendimento ${oportunidade.atendimento.protocolo} aberto`
          : oportunidade.titulo,
        quando: dataHora(oportunidade.pagamento.aprovadoEm),
        tom: 'sucesso',
        instante: new Date(oportunidade.pagamento.aprovadoEm).getTime(),
      })
    }
  }

  return eventos
    .sort((a, b) => b.instante - a.instante)
    .slice(0, limite)
    .map(({ instante: _instante, ...evento }) => evento)
}

/** O andamento visível de um Atendimento, para a lista e para a home. */
export function resumoDoAtendimento(atendimento: AtendimentoDoClienteDTO) {
  const progresso = calcularProgresso(atendimento.checklist)
  // O histórico chega do servidor do mais recente para o mais antigo: o
  // primeiro item é a última coisa que aconteceu.
  const ultimoEvento = atendimento.eventos[0] ?? null
  return {
    statusRotulo: ROTULO_STATUS_ATENDIMENTO[atendimento.status],
    tom: tomDoStatus(atendimento.status),
    progresso,
    aguardandoCliente: atendimento.status === 'aguardando_cliente',
    ultimaAtualizacao: ultimoEvento
      ? { descricao: ultimoEvento.descricao, quando: dataHora(ultimoEvento.criadoEm) }
      : null,
    prazo: atendimento.prazoEm ? dataCurta(atendimento.prazoEm) : null,
  }
}

export function tomDoStatus(status: string): Tom {
  if (status === 'concluido') return 'sucesso'
  if (status === 'aguardando_cliente' || status === 'aguardando_assinatura')
    return 'atencao'
  if (status === 'recusado' || status === 'cancelado') return 'neutro'
  if (status === 'em_andamento') return 'info'
  return 'destaque'
}

export const formatarDataCurta = dataCurta
export const formatarDataHora = dataHora
