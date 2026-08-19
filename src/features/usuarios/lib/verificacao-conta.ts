/**
 * Verificação de identidade da conta.
 *
 * A plataforma aceita dois métodos independentes:
 *
 * - `email`: o usuário clicou no link enviado para o endereço cadastrado;
 * - `whatsapp_gestao`: o Gestor Vincis falou com a pessoa pelo WhatsApp
 *   cadastrado e confirmou a identidade manualmente.
 *
 * Os dois podem coexistir e nenhum sobrescreve o outro. Confirmar pelo WhatsApp
 * jamais marca o e-mail como verificado: seria registrar como fato algo que não
 * aconteceu, e o e-mail continua sendo um canal que precisa ser provado.
 *
 * `contaVerificada` é derivada, nunca armazenada. Um terceiro booleano no banco
 * poderia divergir dos dois primeiros; derivar torna a inconsistência
 * impossível por construção — e dispensa backfill, já que as contas antigas com
 * e-mail confirmado passam a contar como verificadas automaticamente.
 *
 * Este arquivo é puro (sem Drizzle) para que a Gestão possa exibir o mesmo
 * rótulo que o servidor usa para autorizar. A versão SQL vive em
 * `condicao-verificacao.ts`.
 */

export const METODOS_VERIFICACAO = ['email', 'whatsapp_gestao'] as const
export type MetodoVerificacao = (typeof METODOS_VERIFICACAO)[number]

export type EstadoVerificacao = {
  emailVerificado: boolean
  whatsappVerificado: boolean
}

/** A identidade da conta foi comprovada por pelo menos um método. */
export function contaVerificada(estado: EstadoVerificacao): boolean {
  return estado.emailVerificado || estado.whatsappVerificado
}

/**
 * Métodos que comprovaram esta conta, do mais forte para o mais fraco.
 * Vazio quando a conta ainda não foi verificada.
 */
export function metodosVerificacao(
  estado: EstadoVerificacao,
): MetodoVerificacao[] {
  const metodos: MetodoVerificacao[] = []
  if (estado.emailVerificado) metodos.push('email')
  if (estado.whatsappVerificado) metodos.push('whatsapp_gestao')
  return metodos
}

/** Rótulo de interface. Nunca afirma que o e-mail foi confirmado sem que tenha sido. */
export function rotuloVerificacao(estado: EstadoVerificacao): string {
  if (estado.emailVerificado && estado.whatsappVerificado) {
    return 'Verificada por e-mail e WhatsApp'
  }
  if (estado.emailVerificado) return 'Verificada por e-mail'
  if (estado.whatsappVerificado) return 'Verificada via WhatsApp'
  return 'Não verificada'
}
