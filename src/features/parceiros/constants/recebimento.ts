/**
 * Como o parceiro recebe o que a Vincis lhe deve.
 *
 * Só Pix nesta fatia, e manual: o Gestor lê a chave, paga pelo banco dele e
 * volta para registrar. Nada aqui conversa com instituição financeira.
 *
 * `metodo` já existe como conceito para que conta bancária/TED entre depois
 * como outro valor, sem a tabela mudar de forma.
 */
export const METODO_RECEBIMENTO = 'pix' as const

export const TIPOS_CHAVE_PIX = [
  'cpf',
  'cnpj',
  'email',
  'telefone',
  'aleatoria',
] as const
export type TipoChavePix = (typeof TIPOS_CHAVE_PIX)[number]

export const ROTULO_CHAVE_PIX: Record<TipoChavePix, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
}

export function tipoChaveValido(valor: string): valor is TipoChavePix {
  return (TIPOS_CHAVE_PIX as readonly string[]).includes(valor)
}

/**
 * A chave como ela aparece na tela, sem entregar o valor inteiro.
 *
 * O parceiro precisa reconhecer a própria chave; ninguém precisa lê-la por
 * cima do ombro dele. Documento e telefone mostram os quatro últimos dígitos,
 * que é o que a pessoa usa para se reconhecer; e-mail preserva as duas
 * primeiras letras e o domínio, porque é assim que se confere um e-mail.
 *
 * Mascarar é apresentação, não segurança: quem precisa do valor inteiro — o
 * Gestor, para pagar — obtém pelo caminho próprio, e o mascaramento existe
 * para que a tela não exponha o dado a quem só está de passagem.
 */
export function mascararChavePix(tipo: TipoChavePix, chave: string): string {
  if (!chave) return ''

  if (tipo === 'email') {
    const [usuario, dominio] = chave.split('@')
    if (!dominio) return '•••'
    const visivel = usuario.slice(0, 2)
    return `${visivel}${'•'.repeat(Math.max(usuario.length - 2, 1))}@${dominio}`
  }

  if (tipo === 'aleatoria') {
    return `${'•'.repeat(8)}${chave.slice(-6)}`
  }

  // CPF, CNPJ e telefone são só dígitos: os quatro últimos bastam.
  const fim = chave.slice(-4)
  return `${'•'.repeat(Math.max(chave.length - 4, 3))}${fim}`
}
