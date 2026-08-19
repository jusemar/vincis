import {
  ROTULO_STATUS_ATENDIMENTO,
  STATUS_TERMINAIS,
  type StatusAtendimento,
} from '../constants/atendimento'

export type AcaoTransicao = {
  /** Texto do item de menu. É o verbo da ação, não o nome do status. */
  rotulo: string
  destino: StatusAtendimento
  /** Ações destrutivas ganham destaque próprio na interface. */
  encerra?: boolean
}

/**
 * Máquina de estados do Atendimento.
 *
 * Declarada como dado — e não espalhada em `if`s — para que a mesma tabela
 * responda às três perguntas do sistema: que botões a tela mostra, que
 * transição o servidor aceita e o que os testes conferem. Divergência entre
 * essas três respostas é exatamente o tipo de bug que uma tabela única elimina.
 *
 * `concluido`, `recusado` e `cancelado` não têm saída: são terminais. Voltar de
 * um deles será uma regra de reabertura própria, com motivo e autorização.
 */
export const TRANSICOES_ATENDIMENTO: Record<StatusAtendimento, AcaoTransicao[]> =
  {
    novo: [
      { rotulo: 'Iniciar', destino: 'em_andamento' },
      { rotulo: 'Recusar', destino: 'recusado', encerra: true },
    ],
    em_andamento: [
      { rotulo: 'Solicitar ao cliente', destino: 'aguardando_cliente' },
      { rotulo: 'Aguardar assinatura', destino: 'aguardando_assinatura' },
      { rotulo: 'Concluir', destino: 'concluido' },
      { rotulo: 'Cancelar', destino: 'cancelado', encerra: true },
    ],
    // O Cliente respondeu ou enviou o que faltava: o trabalho volta para a mesa.
    aguardando_cliente: [
      { rotulo: 'Retomar atendimento', destino: 'em_andamento' },
      { rotulo: 'Cancelar', destino: 'cancelado', encerra: true },
    ],
    // Pendência de assinatura resolvida: volta a andar ou já encerra.
    aguardando_assinatura: [
      { rotulo: 'Retomar atendimento', destino: 'em_andamento' },
      { rotulo: 'Concluir', destino: 'concluido' },
      { rotulo: 'Cancelar', destino: 'cancelado', encerra: true },
    ],
    concluido: [],
    recusado: [],
    cancelado: [],
  }

export function transicoesPermitidas(status: StatusAtendimento) {
  return TRANSICOES_ATENDIMENTO[status] ?? []
}

export function ehStatusTerminal(status: StatusAtendimento) {
  return STATUS_TERMINAIS.includes(status)
}

/** A transição existe na máquina de estados? */
export function podeTransicionar(
  de: StatusAtendimento,
  para: StatusAtendimento,
) {
  return transicoesPermitidas(de).some((acao) => acao.destino === para)
}

/** "Ana Silva alterou de Novo para Em andamento." */
export function descreverTransicao(
  autor: string,
  de: StatusAtendimento,
  para: StatusAtendimento,
) {
  return `${autor} alterou de ${ROTULO_STATUS_ATENDIMENTO[de]} para ${ROTULO_STATUS_ATENDIMENTO[para]}.`
}
