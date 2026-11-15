/**
 * Honorários jurídicos são combinados diretamente entre Cliente e advogado.
 *
 * Regra aprovada para advocacia: a Vincis participa da conexão, da conversa,
 * do orçamento/proposta e do acompanhamento — e **não** do pagamento. Não gera
 * Pix, não mostra QR Code, não cria cobrança Efí, não recebe nem repassa, não
 * confirma e não registra se houve pagamento. Cliente e advogado combinam a
 * forma de pagar entre eles (pela conversa da Vincis ou fora dela).
 *
 * Módulo puro (sem banco) para servir também a componentes de navegador; a
 * leitura do cadastro mora em `lib/honorarios.ts`.
 */
export const TIPO_PROFISSIONAL_HONORARIOS_DIRETOS = 'advocacia'

/** Texto único para quando um pagamento jurídico é pedido à Vincis. */
export const MENSAGEM_HONORARIOS_DIRETOS =
  'Os honorários jurídicos são combinados diretamente com o profissional. A Vincis não processa esse pagamento.'

/** O tipo de profissional combina os honorários diretamente com o Cliente? */
export function honorariosDiretos(tipoProfissional: string | null | undefined): boolean {
  return tipoProfissional === TIPO_PROFISSIONAL_HONORARIOS_DIRETOS
}
