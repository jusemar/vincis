/**
 * O link geral do parceiro.
 *
 * ## Um só, permanente, sem serviço
 *
 * É o endereço da pessoa, não de um serviço nem de uma campanha: quem chega por
 * ele pode acabar interessado em qualquer coisa da Vincis. Por isso o código é
 * a única variável, e por isso ele nunca muda — um link já compartilhado não
 * pode passar a apontar para outro lugar.
 *
 * ## Por que `/p/` e não a raiz
 *
 * A tela de demonstração exibia `vincis.app/junior`, um apelido na raiz do
 * site. Servir códigos na raiz exige uma rota curinga em `/[codigo]`, e essa
 * rota passa a interceptar **todo** endereço desconhecido da plataforma: um
 * `/precoss` digitado errado deixaria de ser 404 e viraria uma consulta de
 * código, e qualquer página pública futura passaria a disputar espaço com o
 * espaço de nomes dos parceiros. Um prefixo próprio custa dois caracteres e
 * elimina a disputa inteira.
 *
 * ## Base ausente
 *
 * Sem `APP_URL` o link sai relativo em vez de a página quebrar. Ambiente
 * configurado sempre tem a variável — ela já é obrigatória para o e-mail de
 * confirmação —, mas derrubar o painel de Parceiros por causa de uma variável
 * de e-mail seria transformar um defeito de configuração em tela de erro.
 */
export const PREFIXO_LINK_PARCEIRO = '/p'

export type LinkDoParceiro = {
  /** Endereço completo, o que o botão copia. */
  url: string
  /** A parte fixa, exibida apagada: `vincis.com.br/p/`. */
  base: string
  /** O código, exibido em destaque. */
  codigo: string
}

/**
 * Monta o link a partir da base do site. Função pura: quem lê `APP_URL` é o
 * servidor, e o teste passa a base que quiser.
 */
export function montarLinkDoParceiro(codigo: string, baseDoSite: string): LinkDoParceiro {
  const raiz = baseDoSite.trim().replace(/\/+$/, '')
  const caminho = `${PREFIXO_LINK_PARCEIRO}/${codigo}`

  return {
    url: `${raiz}${caminho}`,
    // Sem protocolo na exibição: `https://` ocupa metade da linha do card e não
    // diz nada a quem só quer conferir o próprio código.
    base: `${raiz.replace(/^https?:\/\//, '')}${PREFIXO_LINK_PARCEIRO}/`,
    codigo,
  }
}

/** A base pública do site, como o servidor a conhece. */
export function baseDoSite(): string {
  return process.env.APP_URL ?? ''
}
