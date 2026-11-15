import { planoContratavel } from './assinatura'

/**
 * Contador parceiro responsável por um plano contábil da Vincis.
 *
 * Na contratação em `/precos` o cliente escolhe um contador parceiro
 * (`cliente`) ou deixa a Vincis escolher (`vincis`). No segundo caso o plano
 * fica "aguardando alocação" até o Gestor definir o responsável — nunca com
 * profissional provisório.
 */
export const ESCOLHAS_CONTADOR = ['cliente', 'vincis'] as const
export type EscolhaContador = (typeof ESCOLHAS_CONTADOR)[number]

export const ROTULO_ESCOLHA_CONTADOR: Record<EscolhaContador, string> = {
  cliente: 'Escolhido pelo cliente',
  vincis: 'Cliente deixou a Vincis escolher',
}

/** Quem fez cada alocação registrada no histórico. */
export const ORIGENS_ALOCACAO = ['cliente', 'gestor'] as const
export type OrigemAlocacao = (typeof ORIGENS_ALOCACAO)[number]

export const ROTULO_ORIGEM_ALOCACAO: Record<OrigemAlocacao, string> = {
  cliente: 'Escolhido pelo cliente',
  gestor: 'Alocado pela Vincis',
}

export const OPCAO_VINCIS_ESCOLHE = 'Deixar a Vincis escolher meu contador'
export const AGUARDANDO_ALOCACAO = 'Aguardando alocação de contador'

/**
 * Os planos da vitrine (`padrao`, `consultiva`) são contabilidade recorrente e
 * têm contador responsável. Perfil Pro e armazenamento adicional são pagamentos
 * do próprio profissional à Vincis — não têm.
 */
export function planoTemContadorResponsavel(planoCodigo: string): boolean {
  return planoContratavel(planoCodigo)
}

export const TAMANHO_MAXIMO_MOTIVO = 500

/**
 * Status de plano que contam como vínculo recorrente **ativo** do contador
 * (os pendentes que reservam vaga estão em `queries/carteira-do-contador.ts`).
 *
 * Auditado em `constants/assinatura.ts`: o contrato nasce
 * `aguardando_pagamento` e só vira `ativa` pela confirmação do primeiro
 * pagamento; `cancelada` e `encerrada` são fins. Logo só `ativa` é vínculo
 * realmente pago e vigente — contratação pendente (inclusive com Pix vencido
 * ou cancelado) não é cliente ativo — mas pode reservar vaga.
 */
export const STATUS_VINCULO_ATIVO = ['ativa'] as const

/** Ocupação do contador: ativos + reservas de planos pendentes. */
export type Ocupacao = { ativos: number; reservados: number; ocupados: number }

/**
 * A capacidade do contador diante da ocupação de agora.
 *
 * `lotado`: não recebe nova alocação (ocupados ≥ capacidade). `acimaDoLimite`:
 * a Gestão baixou a capacidade abaixo do que já estava ocupado — ninguém é
 * removido, só novas entradas ficam bloqueadas.
 */
export function situacaoDaCapacidade(capacidade: number | null, ocupacao: Ocupacao) {
  return {
    capacidade,
    ...ocupacao,
    lotado: capacidade !== null && ocupacao.ocupados >= capacidade,
    acimaDoLimite: capacidade !== null && ocupacao.ocupados > capacidade,
  }
}

function plural(n: number, singular: string, pluralizado: string) {
  return n === 1 ? singular : pluralizado
}

/** "18 ativos + 1 aguardando pagamento" — a composição da ocupação. */
export function rotuloDaOcupacao({ ativos, reservados }: Ocupacao): string {
  const parteAtivos = `${ativos} ${plural(ativos, 'ativo', 'ativos')}`
  return reservados > 0 ? `${parteAtivos} + ${reservados} aguardando pagamento` : parteAtivos
}

/** "18 ativos + 1 aguardando pagamento · 19 de 20 vagas" (ou "· Sem limite"). */
export function rotuloDaCapacidade(capacidade: number | null, ocupacao: Ocupacao): string {
  const vagas =
    capacidade === null
      ? 'Sem limite'
      : `${ocupacao.ocupados} de ${capacidade} ${plural(capacidade, 'vaga', 'vagas')}`
  return `${rotuloDaOcupacao(ocupacao)} · ${vagas}`
}

export const MENSAGEM_CONTADOR_SEM_VAGA =
  'O contador escolhido não tem mais vaga. Escolha outro contador ou deixe a Vincis escolher para gerar o Pix.'

/**
 * Situação operacional do plano para o contador responsável.
 *
 * Antes do pagamento confirmado ele **vê** a contratação, mas não começa a
 * prestação. Quem libera é a própria confirmação da Efí, que muda o status para
 * `ativa` (`lib/pagamentos.ts`) — sem passo manual do Gestor.
 */
export type SituacaoOperacionalDoPlano = 'aguardando_pagamento' | 'liberada' | 'encerrada'

export function situacaoOperacionalDoPlano(status: string): SituacaoOperacionalDoPlano {
  if (status === 'ativa') return 'liberada'
  if (status === 'aguardando_pagamento') return 'aguardando_pagamento'
  return 'encerrada'
}

export const ROTULO_SITUACAO_OPERACIONAL: Record<SituacaoOperacionalDoPlano, string> = {
  aguardando_pagamento: 'Aguardando confirmação do pagamento',
  liberada: 'Atendimento liberado',
  encerrada: 'Plano encerrado',
}

export const MENSAGEM_OPERACAO_BLOQUEADA =
  'Aguardando confirmação do pagamento: a prestação deste plano só começa depois que o pagamento for confirmado.'

/** Área do contador parceiro no painel profissional. */
export const ROTA_MEUS_CLIENTES_VINCIS = '/admin/meus-clientes-vincis'
export const ROTULO_MEUS_CLIENTES_VINCIS = 'Meus clientes Vincis'
