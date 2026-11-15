/**
 * O andamento de um Atendimento como o Cliente precisa entendê-lo.
 *
 * ## Status de negócio × leitura de UX
 *
 * `atendimentos.status` responde à operação ("em que coluna do quadro está?").
 * O Cliente precisa de outra resposta: **em que ponto do serviço estou e quem
 * precisa agir agora?** Esta lib deriva essa resposta de fatos que já estão
 * gravados — mensagens, manifestações, arquivos e o pedido explícito "Solicitar
 * ao cliente" — sem coluna nova. Gravar a situação num campo criaria um segundo
 * lugar capaz de discordar da conversa; derivá-la mantém uma verdade só (o
 * mesmo raciocínio de `pagamentos/lib/etapa-comercial.ts`).
 *
 * ## Três camadas, na ordem em que a tela as mostra
 *
 * 1. **Jornada** — `Pagamento confirmado → Em atendimento → Concluído`;
 * 2. **Situação** — durante "Em atendimento", quem precisa agir:
 *    `Aguardando profissional` ou `Aguardando você`;
 * 3. **Alerta** — prazo vencido, atendimento inativo (7 dias) ou em revisão
 *    pela Vincis (14 dias). Nenhum deles cancela, conclui ou estorna nada.
 *
 * ## O que conta como interação
 *
 * Só o que uma pessoa fez **para a outra parte**: mensagem na conversa com o
 * Cliente, manifestação no Protocolo, arquivo enviado pelo Cliente ou pela
 * equipe e o pedido explícito ao Cliente. Eventos do sistema (troca de status,
 * prioridade, checklist, avisos) e a conversa interna da equipe **não** contam:
 * não mudam quem precisa agir nem zeram o relógio de inatividade.
 *
 * Módulo puro — sem banco, sem React — para que tela, rotina diária e testes
 * apliquem exatamente a mesma regra.
 */

export type LadoInteracao = 'cliente' | 'profissional'

/** A última interação de cada lado. `null` = aquele lado nunca interagiu. */
export type ResumoDeInteracoes = {
  ultimaDoCliente: Date | null
  ultimaDoProfissional: Date | null
}

export type SituacaoAtual = 'aguardando_profissional' | 'aguardando_voce'
export type AlertaDoAtendimento = 'prazo_vencido' | 'inativo' | 'em_revisao'
export type FaseDoAtendimento = 'em_atendimento' | 'concluido' | 'encerrado'

/** Dias sem interação que disparam cada degrau. Regra aprovada. */
export const DIAS_LEMBRETE = 3
export const DIAS_INATIVO = 7
export const DIAS_REVISAO = 14

const MS_POR_DIA = 24 * 60 * 60 * 1000

export type EntradaAndamento = {
  status: string
  criadoEm: Date
  prazoEm: Date | null
  interacoes: ResumoDeInteracoes
  /** Houve pagamento (Pix, consultoria paga, acordo pago)? Muda só o rótulo. */
  pago: boolean
  agora?: Date
}

export type Andamento = {
  fase: FaseDoAtendimento
  status: string
  /** Rótulos da jornada e a etapa atual (`length` = todas concluídas). */
  jornada: { passos: [string, string, string]; atual: number }
  situacao: SituacaoAtual | null
  alerta: AlertaDoAtendimento | null
  prazoVencido: boolean
  prazoEm: Date | null
  /** Referência da inatividade: última interação, ou a abertura. */
  ultimaInteracaoEm: Date
  diasSemInteracao: number
  /** 0, 3, 7 ou 14 — o degrau de inatividade alcançado. */
  degrauInatividade: 0 | typeof DIAS_LEMBRETE | typeof DIAS_INATIVO | typeof DIAS_REVISAO
  /** O profissional já se manifestou alguma vez para o Cliente? */
  profissionalJaRespondeu: boolean
  /** A última interação foi do Cliente? (para "Sua resposta foi enviada") */
  ultimaFoiDoCliente: boolean
}

const ENCERRADOS_SEM_SERVICO = ['recusado', 'cancelado', 'encerrado_sem_conclusao']

function maisRecente(a: Date | null, b: Date | null): Date | null {
  if (!a) return b
  if (!b) return a
  return a.getTime() >= b.getTime() ? a : b
}

/**
 * Quem precisa agir.
 *
 * A última interação decide: se foi do Cliente, a vez é do profissional; se foi
 * do profissional (inclusive o pedido explícito ao Cliente), a vez é do
 * Cliente. Sem nenhuma interação, o pedido explícito de status
 * (`aguardando_cliente`) prevalece; fora isso, quem acabou de ser contratado é
 * quem age primeiro — o profissional.
 */
export function situacaoAtual(status: string, interacoes: ResumoDeInteracoes): SituacaoAtual {
  const { ultimaDoCliente: cliente, ultimaDoProfissional: profissional } = interacoes
  if (!cliente && !profissional) {
    return status === 'aguardando_cliente' ? 'aguardando_voce' : 'aguardando_profissional'
  }
  if (!profissional) return 'aguardando_profissional'
  if (!cliente) return 'aguardando_voce'
  return cliente.getTime() > profissional.getTime() ? 'aguardando_profissional' : 'aguardando_voce'
}

export function calcularAndamento({
  status,
  criadoEm,
  prazoEm,
  interacoes,
  pago,
  agora = new Date(),
}: EntradaAndamento): Andamento {
  const passos: [string, string, string] = [
    pago ? 'Pagamento confirmado' : 'Contratação confirmada',
    'Em atendimento',
    'Concluído',
  ]
  const ultima = maisRecente(interacoes.ultimaDoCliente, interacoes.ultimaDoProfissional)
  const ultimaInteracaoEm = maisRecente(ultima, criadoEm) ?? criadoEm
  const diasSemInteracao = Math.max(
    0,
    Math.floor((agora.getTime() - ultimaInteracaoEm.getTime()) / MS_POR_DIA),
  )
  const base = {
    status,
    prazoEm,
    ultimaInteracaoEm,
    diasSemInteracao,
    profissionalJaRespondeu: Boolean(interacoes.ultimaDoProfissional),
    ultimaFoiDoCliente:
      Boolean(interacoes.ultimaDoCliente) &&
      (!interacoes.ultimaDoProfissional ||
        interacoes.ultimaDoCliente!.getTime() > interacoes.ultimaDoProfissional.getTime()),
  }

  if (status === 'concluido') {
    return {
      ...base,
      fase: 'concluido',
      jornada: { passos, atual: passos.length },
      situacao: null,
      alerta: null,
      prazoVencido: false,
      degrauInatividade: 0,
    }
  }
  if (ENCERRADOS_SEM_SERVICO.includes(status)) {
    return {
      ...base,
      fase: 'encerrado',
      jornada: { passos, atual: 1 },
      situacao: null,
      alerta: null,
      prazoVencido: false,
      degrauInatividade: 0,
    }
  }

  const prazoVencido = Boolean(prazoEm && prazoEm.getTime() < agora.getTime())
  const degrauInatividade =
    diasSemInteracao >= DIAS_REVISAO
      ? DIAS_REVISAO
      : diasSemInteracao >= DIAS_INATIVO
        ? DIAS_INATIVO
        : diasSemInteracao >= DIAS_LEMBRETE
          ? DIAS_LEMBRETE
          : 0
  // Um alerta só, o mais grave: o card não vira mural de etiquetas.
  const alerta: AlertaDoAtendimento | null =
    degrauInatividade === DIAS_REVISAO
      ? 'em_revisao'
      : degrauInatividade === DIAS_INATIVO
        ? 'inativo'
        : prazoVencido
          ? 'prazo_vencido'
          : null

  return {
    ...base,
    fase: 'em_atendimento',
    jornada: { passos, atual: 1 },
    situacao: situacaoAtual(status, interacoes),
    alerta,
    prazoVencido,
    degrauInatividade,
  }
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

export const ROTULO_SITUACAO: Record<SituacaoAtual, string> = {
  aguardando_profissional: 'Aguardando profissional',
  aguardando_voce: 'Aguardando você',
}

export const ROTULO_ALERTA: Record<AlertaDoAtendimento, string> = {
  prazo_vencido: 'Prazo vencido',
  inativo: 'Atendimento inativo',
  em_revisao: 'Em revisão pela Vincis',
}

/** Microtexto do card: o que a pessoa precisa saber sem abrir. */
export const MICRO_SITUACAO: Record<SituacaoAtual, string> = {
  aguardando_profissional: 'Você não precisa fazer nada agora',
  aguardando_voce: 'Há uma resposta aguardando sua ação',
}

export type Tom = 'neutro' | 'destaque' | 'info' | 'sucesso' | 'atencao'

export type ApresentacaoDoAndamento = {
  /** Linha principal do card: "Prazo vencido · Aguardando profissional". */
  rotulo: string
  micro: string | null
  tom: Tom
  /** Parágrafos do bloco "O que acontece agora?". */
  oQueAcontece: string[]
}

function dataBR(data: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(data)
}

/**
 * O andamento em palavras.
 *
 * Regra que vale para todo texto daqui: **nada sobre dinheiro**. Nenhum estado
 * — inatividade, revisão, encerramento — promete reembolso, crédito ou
 * devolução: encerrar por falta de retorno não decide quem tem direito a quê.
 */
export function apresentarAndamento(
  andamento: Andamento,
  { profissional }: { profissional: string },
): ApresentacaoDoAndamento {
  if (andamento.fase === 'concluido') {
    return {
      rotulo: 'Concluído',
      micro: null,
      tom: 'sucesso',
      oQueAcontece: ['O serviço foi concluído. A entrega, a conversa e o histórico continuam disponíveis aqui.'],
    }
  }

  if (andamento.fase === 'encerrado') {
    if (andamento.status === 'encerrado_sem_conclusao') {
      return {
        rotulo: 'Atendimento encerrado sem conclusão',
        micro: null,
        tom: 'neutro',
        oQueAcontece: [
          'Este atendimento foi encerrado por falta de retorno. Se precisar de ajuda ou quiser esclarecer a situação, entre em contato com a Vincis.',
        ],
      }
    }
    const rotulo = andamento.status === 'recusado' ? 'Atendimento recusado' : 'Atendimento cancelado'
    return {
      rotulo,
      micro: null,
      tom: 'neutro',
      oQueAcontece: ['Este atendimento foi encerrado. Se tiver dúvidas sobre ele, entre em contato com a Vincis.'],
    }
  }

  const situacao = andamento.situacao ?? 'aguardando_profissional'
  const comProfissional = situacao === 'aguardando_profissional'
  const paragrafos: string[] = []

  if (comProfissional) {
    paragrafos.push(
      andamento.profissionalJaRespondeu && andamento.ultimaFoiDoCliente
        ? `Sua resposta foi enviada. Você não precisa fazer nada agora. Avisaremos quando ${profissional} responder.`
        : `${profissional} recebeu sua contratação. Você não precisa fazer nada agora — avisaremos você quando houver uma resposta.`,
    )
  } else {
    paragrafos.push(
      `${profissional} respondeu e precisa de uma informação sua para continuar. Responda pela conversa deste atendimento.`,
    )
  }

  if (andamento.prazoVencido && andamento.prazoEm) {
    paragrafos.push(
      `O prazo previsto terminou em ${dataBR(andamento.prazoEm)}. ${
        comProfissional
          ? 'Estamos aguardando uma ação do profissional.'
          : 'Estamos aguardando uma resposta sua para continuar.'
      }`,
    )
  }
  if (andamento.alerta === 'inativo') {
    paragrafos.push(
      comProfissional
        ? 'Não houve movimentação nos últimos 7 dias. O profissional foi notificado novamente.'
        : 'Não houve movimentação nos últimos 7 dias. Enviamos um novo aviso para você responder.',
    )
  }
  if (andamento.alerta === 'em_revisao') {
    paragrafos.push(
      'Este atendimento está sem movimentação há 14 dias. A Vincis poderá acompanhar a situação para ajudar na resolução.',
    )
  }

  const rotuloSituacao = ROTULO_SITUACAO[situacao]
  return {
    rotulo: andamento.alerta ? `${ROTULO_ALERTA[andamento.alerta]} · ${rotuloSituacao}` : rotuloSituacao,
    micro: MICRO_SITUACAO[situacao],
    tom: andamento.alerta || !comProfissional ? 'atencao' : 'info',
    oQueAcontece: paragrafos,
  }
}
