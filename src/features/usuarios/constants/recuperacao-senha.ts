/** Textos e prazos da recuperação de senha — usados pelo servidor e pela tela. */

/**
 * Dois prazos DIFERENTES (não confundir):
 * - INTERVALO de reenvio: quanto tempo esperar para pedir outro link/código
 *   (proteção contra envios repetidos e custo de SMS);
 * - VALIDADE: por quanto tempo o link/código enviado funciona (conferido no
 *   servidor). Um pedido novo invalida o anterior a qualquer momento.
 */

/** Intervalo mínimo entre pedidos (a tela mostra a contagem antes de "Reenviar"). */
export const INTERVALO_REENVIO_RECUPERACAO_SEGUNDOS = 60

/** Validade do código enviado por SMS (recuperação, cadastro e verificação do celular). */
export const VALIDADE_CODIGO_SMS_MINUTOS = 10
export const VALIDADE_CODIGO_SMS_SEGUNDOS = VALIDADE_CODIGO_SMS_MINUTOS * 60

/** Validade do link de redefinição de senha enviado por e-mail. */
export const VALIDADE_LINK_EMAIL_MINUTOS = 10

/** Erros seguidos que invalidam um código. */
export const MAXIMO_TENTATIVAS_CODIGO = 5

/** Depois do código certo: tempo para cadastrar a nova senha (autorização de uso único). */
export const VALIDADE_AUTORIZACAO_REDEFINICAO_MINUTOS = 10

/** Aviso obrigatório ao pedir o código. Não afirma entrega: o provedor só aceita o envio. */
export const MENSAGEM_RECUPERACAO_SMS =
  'O SMS pode levar até 1 minuto para chegar. Aguarde antes de solicitar outro código.'

export const MENSAGEM_RECUPERACAO_EMAIL = `Se este e-mail estiver vinculado a uma conta, enviaremos um link para redefinir a senha. O link vale por ${VALIDADE_LINK_EMAIL_MINUTOS} minutos e pode ser usado uma única vez. Confira também a caixa de spam.`

/** Mesma resposta para código errado, expirado, já usado ou de solicitação inexistente. */
export const MENSAGEM_CODIGO_INVALIDO = 'Código incorreto ou expirado. Confira o SMS ou solicite um novo código.'

export const MENSAGEM_CODIGO_BLOQUEADO = 'Muitas tentativas incorretas. Solicite um novo código.'
