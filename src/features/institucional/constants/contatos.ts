/**
 * Canais oficiais de contato da Vincis.
 *
 * ## Por que os valores não aparecem por extenso
 *
 * Robôs de spam varrem HTML e JavaScript à procura de padrões de e-mail
 * (`algo@dominio`) e de links `mailto:`/`wa.me`. Aqui o e-mail fica guardado
 * em partes invertidas e o telefone em blocos de dígitos: nenhum arquivo
 * enviado ao navegador contém o endereço montado. Ele só é montado no
 * navegador, depois que a página carrega, e os links só nascem no clique
 * (`ContatoProtegido`).
 *
 * É proteção contra coleta **simples**. Quem executa JavaScript ou lê a tela
 * ainda consegue copiar o contato — e precisa conseguir, porque é para ser
 * usado por pessoas.
 */

/** E-mail, em partes invertidas: usuário e domínio. */
const EMAIL_INVERTIDO = ['otatnoc', 'rb.moc.sicniv'] as const

/** WhatsApp: país, DDD e número, em blocos. */
const WHATSAPP_BLOCOS = ['55', '31', '99252', '5777'] as const

const desinverter = (texto: string) => texto.split('').reverse().join('')

export function montarEmailVincis(): string {
  return EMAIL_INVERTIDO.map(desinverter).join('@')
}

/** Só dígitos, com DDI: o formato que o WhatsApp espera no link. */
export function montarWhatsappVincisDigitos(): string {
  return WHATSAPP_BLOCOS.join('')
}

/** Como o número aparece para a pessoa: "(DDD) prefixo-sufixo". */
export function montarWhatsappVincisExibicao(): string {
  const [, ddd, prefixo, sufixo] = WHATSAPP_BLOCOS
  return `(${ddd}) ${prefixo}-${sufixo}`
}

/** Endereços de ação — chamados somente no clique. */
export function linkEmailVincis(): string {
  return `mailto:${montarEmailVincis()}`
}

export function linkWhatsappVincis(): string {
  return `https://wa.me/${montarWhatsappVincisDigitos()}`
}
