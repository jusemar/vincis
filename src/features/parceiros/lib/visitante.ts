import { createHash, randomBytes } from 'node:crypto'

/**
 * O identificador do visitante anônimo.
 *
 * Trinta e dois bytes de sorteio, em hexadecimal. Não deriva de usuário, de
 * parceiro, de IP nem de característica do aparelho: é opaco por construção, e
 * não há o que extrair dele. Quem o recebe é o navegador; quem o guarda é o
 * banco, **em hash** — mesma escolha de `sessoes_usuario`, pelo mesmo motivo:
 * um dump do banco não pode entregar a chave que o navegador apresenta.
 *
 * Não é sessão e não autentica ninguém. Ele responde a uma única pergunta —
 * "este navegador já tinha chegado por algum link?" — e é justamente por não
 * autenticar que pode viver noventa dias.
 */
export function gerarTokenDeVisitante(): string {
  return randomBytes(32).toString('hex')
}

export function hashDoVisitante(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** O token tem a forma que geramos? Barra lixo antes de consultar o banco. */
export function tokenDeVisitanteValido(token: string | undefined): token is string {
  return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token)
}

/**
 * Dados técnicos do acesso — o mínimo que serve para auditar, e nada além.
 *
 * `user_agent` responde "isto foi gente ou o robô de pré-visualização de um
 * mensageiro?"; o host de origem responde "de qual canal veio". A URL inteira
 * do referenciador **não** entra: ela costuma carregar caminho e parâmetros de
 * outra plataforma, e nada disso é preciso aqui. IP não entra de forma alguma.
 */
export function dadosTecnicosDoAcesso(cabecalhos: {
  userAgent: string | null
  referer: string | null
}) {
  let referenciaHost: string | null = null
  if (cabecalhos.referer) {
    try {
      referenciaHost = new URL(cabecalhos.referer).hostname.slice(0, 120)
    } catch {
      // Referenciador ilegível é ausência de referenciador, não erro.
    }
  }

  return {
    userAgent: cabecalhos.userAgent?.slice(0, 255) ?? null,
    referenciaHost,
  }
}
