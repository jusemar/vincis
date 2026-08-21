/**
 * Vocabulário dos eventos de tempo real.
 *
 * Um evento aqui é um **aviso de que algo mudou**, e não o dado que mudou. O
 * conteúdo da mensagem, o texto da manifestação e o valor negociado nunca
 * trafegam por este canal: o cliente recebe o aviso e vai buscar o dado pelo
 * caminho de sempre, que já aplica autorização no servidor.
 *
 * A escolha não é estética. O Protocolo tem regra assimétrica — o Cliente vê
 * todas as respostas dirigidas a ele, um participante não vê a resposta do
 * outro. Se o texto viajasse no evento, o tempo real seria uma segunda porta
 * para o mesmo dado, com autorização própria, que teria de ser mantida em
 * acordo com a primeira. Duas portas, uma delas esquecida, é como vazamento
 * acontece.
 */

export const TIPOS_EVENTO_REALTIME = [
  'mensagem',
  'manifestacao',
  'arquivo',
  'status',
  'checklist',
  'avaliacao',
  // Solicitação de ajuste do Cliente e a decisão que ela recebe. Tipo próprio
  // porque o destino é o Protocolo, e não a Conversa nem a aba de Arquivos.
  'ajuste',
  'convite',
  'negociacao',
  'notificacao',
  /**
   * Oportunidade pública: solicitação nova para os prestadores compatíveis, e
   * proposta recebida para o Cliente dono. Não carrega descrição, valor nem
   * anexo — como todo evento daqui, é só "algo mudou".
   */
  'oportunidade',
] as const

export type TipoEventoRealtime = (typeof TIPOS_EVENTO_REALTIME)[number]

/**
 * O tom do aviso, decidido por quem publica.
 *
 * Não dá para derivar do `tipo`: `status` cobre tanto uma conclusão (que é boa
 * notícia) quanto um cancelamento. Quem conhece o fato é o domínio, e é lá que
 * a semântica é escolhida — a tela apenas aplica a variante correspondente do
 * design system, sem inventar cor nova.
 *
 * Ausente significa `informacao`: um aviso neutro é o padrão seguro.
 */
export const SEVERIDADES_EVENTO = [
  'sucesso',
  'informacao',
  'atencao',
  'erro',
] as const

export type SeveridadeEvento = (typeof SEVERIDADES_EVENTO)[number]

/** Nome do evento no Pusher. Um só: o que varia é o `tipo` dentro do payload. */
export const EVENTO_ATUALIZACAO = 'atualizacao'

export type EventoRealtime = {
  tipo: TipoEventoRealtime
  /** Quem provocou. O cliente usa para não avisar a pessoa da própria ação. */
  autorId: string | null
  atendimentoId?: string | null
  /** `#AAAA-NNNN` — o que a pessoa lê no toast. */
  protocolo?: string | null
  conviteId?: string | null
  /** Oportunidade envolvida, quando o aviso é da vitrine pública. */
  oportunidadeId?: string | null
  /** Canal da Conversa, quando o evento é de mensagem. */
  canalConversa?: 'cliente' | 'interno' | null
  /**
   * Texto do toast.
   *
   * Só é preenchido no canal privado de **cada destinatário**, nunca no canal
   * do Atendimento: é a mesma frase da notificação daquela pessoa, e por isso
   * já passou pelo recorte de audiência do domínio.
   */
  titulo?: string | null
  /** Aba para onde o clique no toast leva. */
  aba?: 'protocolo' | 'conversa' | 'arquivos' | 'historico' | 'info' | null
  /** Tom do toast. Ausente cai em `informacao`. */
  severidade?: SeveridadeEvento | null
  em: string
}

/** Cria o evento com o carimbo de tempo, para ninguém esquecer o `em`. */
export function montarEvento(
  entrada: Omit<EventoRealtime, 'em'>,
  agora = new Date(),
): EventoRealtime {
  return { ...entrada, em: agora.toISOString() }
}
