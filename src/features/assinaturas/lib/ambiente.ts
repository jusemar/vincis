/**
 * O ambiente aceita confirmação manual de pagamento?
 *
 * Fechado por padrão. Só responde sim quando alguém declarou, explicitamente,
 * `VINCIS_AMBIENTE=homologacao` — e mesmo assim nunca num deploy de produção da
 * Vercel. Produção não define a variável, então produção não confirma nada à mão,
 * mesmo que um dia alguém ligue esta confirmação a uma tela.
 */
export function ambientePermiteConfirmacaoManual(
  ambiente: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    ambiente.VINCIS_AMBIENTE === 'homologacao' &&
    ambiente.VERCEL_ENV !== 'production'
  )
}
