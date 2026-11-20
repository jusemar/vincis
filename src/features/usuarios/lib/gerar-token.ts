import { randomBytes, randomInt, createHash } from 'node:crypto'

export function gerarToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(token).digest('hex')
  return { token, hash }
}

/** Código OTP de 6 dígitos, uniforme e gerado criptograficamente (inclui zeros à esquerda). */
export function gerarCodigoOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

/**
 * Hash do código ligado à SOLICITAÇÃO: o mesmo código em outra solicitação não
 * confere. O código nunca é gravado em texto puro.
 */
export function hashCodigoOtp(solicitacaoId: string, codigo: string): string {
  return createHash('sha256').update(`otp-recuperacao:${solicitacaoId}:${codigo}`).digest('hex')
}

/** Hash do código do CADASTRO por celular (prefixo próprio: não confere em outro fluxo). */
export function hashCodigoCadastro(solicitacaoId: string, codigo: string): string {
  return createHash('sha256').update(`otp-cadastro:${solicitacaoId}:${codigo}`).digest('hex')
}

/** Hash de um segredo aleatório (autorizações de uso único). */
export function hashSegredo(segredo: string): string {
  return createHash('sha256').update(segredo).digest('hex')
}

/**
 * Hash do código de VERIFICAÇÃO do celular da conta: inclui o número. Se a
 * conta trocar de número depois do pedido, o código deixa de conferir.
 */
export function hashCodigoVerificacao(solicitacaoId: string, celularNacional: string, codigo: string): string {
  return createHash('sha256').update(`otp-verificacao:${solicitacaoId}:${celularNacional}:${codigo}`).digest('hex')
}
