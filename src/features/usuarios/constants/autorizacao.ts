/**
 * Respostas padrão de recusa das Server Actions.
 *
 * Ficam num só lugar para que a mensagem não varie conforme o arquivo — antes
 * existiam três textos diferentes para a mesma situação. Recusa por permissão
 * nunca deve se disfarçar de "não encontrado": o usuário precisa saber que o
 * registro existe mas a ação não é dele.
 */
export const SEM_AUTORIZACAO = {
  sucesso: false as const,
  mensagem: 'Você não tem autorização para esta operação.',
}

export const SEM_AUTORIZACAO_COM_DADOS = {
  ...SEM_AUTORIZACAO,
  dados: null,
}

/** Recusa específica, com o verbo da ação que foi tentada. */
export function semPermissaoPara(acao: string) {
  return {
    sucesso: false as const,
    mensagem: `Você não tem permissão para ${acao}.`,
  }
}
