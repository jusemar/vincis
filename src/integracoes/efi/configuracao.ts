import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Configuração da API Pix da Efí.
 *
 * ## De onde veio
 *
 * Do Nooo, onde a mesma integração roda com dinheiro real: API Pix (`/v2/cob`),
 * mTLS com o certificado `.p12` da conta, OAuth `client_credentials` e uma chave
 * Pix da conta recebedora. Os nomes das variáveis foram mantidos — quem já
 * configurou a Efí uma vez reconhece o painel. **Nenhum valor** foi copiado:
 * cada ambiente da Vincis recebe as credenciais da própria conta Vincis.
 *
 * ## Variáveis
 *
 * - `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET` — credenciais da aplicação na Efí;
 * - `EFI_PIX_KEY` — chave Pix da Vincis (a recebedora de 100% do valor);
 * - `EFI_CERTIFICATE_BASE64` **ou** `EFI_CERTIFICATE_PATH` — o certificado
 *   `.p12`: em Base64 (Vercel, sem arquivo no disco) ou caminho dentro do
 *   projeto (desenvolvimento local);
 * - `EFI_CERTIFICATE_PASSPHRASE` — opcional; a Efí emite sem senha;
 * - `EFI_SANDBOX` — `true` (padrão) usa a homologação da Efí; `false`, produção;
 * - `EFI_WEBHOOK_TOKEN` — segredo que a Efí devolve na URL do webhook.
 *
 * ## A trava de ambiente
 *
 * Homologação da Vincis nunca fala com a Efí de produção, e produção nunca fala
 * com o sandbox. A combinação errada falha ao carregar, com mensagem clara, em
 * vez de cobrar de verdade num ambiente de teste — ou fingir cobrar em produção.
 */

const BASE_URL_PRODUCAO = 'https://pix.api.efipay.com.br'
const BASE_URL_HOMOLOGACAO = 'https://pix-h.api.efipay.com.br'

type Variaveis = Record<string, string | undefined>

export type ConfiguracaoEfi = {
  sandbox: boolean
  baseUrl: string
  clientId: string
  clientSecret: string
  pixKey: string
  certificado: Buffer
  senhaCertificado: string
}

/** Erro de configuração: falta variável ou a combinação é proibida. */
export class ConfiguracaoEfiAusente extends Error {
  readonly variaveisFaltando: string[]
  constructor(mensagem: string, variaveisFaltando: string[] = []) {
    super(mensagem)
    this.name = 'ConfiguracaoEfiAusente'
    this.variaveisFaltando = variaveisFaltando
  }
}

/** As obrigatórias. O certificado é conferido à parte (uma de duas formas). */
const OBRIGATORIAS = ['EFI_CLIENT_ID', 'EFI_CLIENT_SECRET', 'EFI_PIX_KEY'] as const

/** Quais variáveis faltam — só nomes, nunca valores. */
export function variaveisEfiFaltando(variaveis: Variaveis = process.env): string[] {
  const faltando: string[] = OBRIGATORIAS.filter((nome) => !variaveis[nome]?.trim())
  if (
    !variaveis.EFI_CERTIFICATE_BASE64?.trim() &&
    !variaveis.EFI_CERTIFICATE_PATH?.trim()
  ) {
    faltando.push('EFI_CERTIFICATE_BASE64 (ou EFI_CERTIFICATE_PATH)')
  }
  return faltando
}

/**
 * Base64 do certificado, conferido por ida e volta.
 *
 * `Buffer.from(..., 'base64')` aceita lixo em silêncio; sem a comparação
 * canônica, uma variável truncada só falharia no handshake mTLS, com uma
 * mensagem que não aponta para a causa. Mesma regra do Nooo.
 */
export function decodificarCertificadoBase64(valor: string): Buffer {
  const base64 = valor.replace(/\s/g, '')
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new ConfiguracaoEfiAusente('EFI_CERTIFICATE_BASE64 não contém um Base64 válido.')
  }
  const certificado = Buffer.from(base64, 'base64')
  const canonico = certificado.toString('base64').replace(/=+$/, '')
  if (!certificado.length || canonico !== base64.replace(/=+$/, '')) {
    throw new ConfiguracaoEfiAusente('EFI_CERTIFICATE_BASE64 não contém um Base64 válido.')
  }
  return certificado
}

/**
 * Lê o `.p12` do disco.
 *
 * - Caminho **relativo**: resolvido dentro do projeto e proibido de sair dele
 *   (a trava herdada do Nooo — variável nenhuma lê `/etc` por engano).
 * - Caminho **absoluto**: aceito só fora da Vercel, isto é, na máquina de
 *   desenvolvimento, onde o certificado de homologação costuma morar numa pasta
 *   própria fora do repositório (e é melhor que fique fora dele). Mesmo assim,
 *   precisa ser um `.p12` existente. Na Vercel, o caminho é `EFI_CERTIFICATE_BASE64`.
 */
function lerCertificadoDoDisco(caminho: string, variaveis: Variaveis): Buffer {
  const raiz = path.resolve(process.cwd())
  const absolutoDeclarado = path.isAbsolute(caminho)
  const absoluto = path.resolve(raiz, path.normalize(caminho))

  if (absolutoDeclarado) {
    if (variaveis.VERCEL) {
      throw new ConfiguracaoEfiAusente(
        'EFI_CERTIFICATE_PATH absoluto não é aceito na Vercel: use EFI_CERTIFICATE_BASE64.',
      )
    }
    if (path.extname(absoluto).toLowerCase() !== '.p12') {
      throw new ConfiguracaoEfiAusente('EFI_CERTIFICATE_PATH precisa apontar para um arquivo .p12.')
    }
  } else if (!absoluto.startsWith(raiz + path.sep)) {
    throw new ConfiguracaoEfiAusente('EFI_CERTIFICATE_PATH aponta para fora do projeto.')
  }

  if (!existsSync(absoluto)) {
    throw new ConfiguracaoEfiAusente('Certificado Efí não encontrado em EFI_CERTIFICATE_PATH.')
  }
  return readFileSync(absoluto)
}

/**
 * Sandbox ou produção, com as travas de ambiente.
 *
 * `VINCIS_AMBIENTE=homologacao` é como a homologação da Vincis se declara;
 * `VERCEL_ENV=production` é o deploy de produção. Fora dos dois (máquina
 * local), vale `EFI_SANDBOX`, com sandbox como padrão.
 */
export function resolverSandboxEfi(variaveis: Variaveis = process.env): boolean {
  const pedido = variaveis.EFI_SANDBOX?.trim() ?? ''
  // Estrito de propósito: um valor torto (ex.: duas linhas do .env coladas)
  // não pode virar "sandbox" ou "produção" por acaso.
  if (pedido !== '' && pedido !== 'true' && pedido !== 'false') {
    throw new ConfiguracaoEfiAusente(
      'EFI_SANDBOX inválido: use "true" ou "false" (confira se a linha do .env não está colada à seguinte).',
    )
  }
  const sandbox = pedido !== 'false'

  if (variaveis.VERCEL_ENV === 'production' && sandbox) {
    throw new ConfiguracaoEfiAusente(
      'Configuração Efí incompatível: produção não pode usar o sandbox (defina EFI_SANDBOX=false).',
    )
  }
  if (variaveis.VINCIS_AMBIENTE === 'homologacao' && !sandbox) {
    throw new ConfiguracaoEfiAusente(
      'Configuração Efí incompatível: homologação não pode usar a Efí de produção.',
    )
  }
  return sandbox
}

export function obterConfiguracaoEfi(variaveis: Variaveis = process.env): ConfiguracaoEfi {
  const faltando = variaveisEfiFaltando(variaveis)
  if (faltando.length) {
    throw new ConfiguracaoEfiAusente(
      `Pagamento Pix indisponível: configuração Efí incompleta (${faltando.join(', ')}).`,
      faltando,
    )
  }

  const sandbox = resolverSandboxEfi(variaveis)
  const base64 = variaveis.EFI_CERTIFICATE_BASE64?.trim()
  const certificado = base64
    ? decodificarCertificadoBase64(base64)
    : lerCertificadoDoDisco(variaveis.EFI_CERTIFICATE_PATH!.trim(), variaveis)

  return {
    sandbox,
    baseUrl: sandbox ? BASE_URL_HOMOLOGACAO : BASE_URL_PRODUCAO,
    clientId: variaveis.EFI_CLIENT_ID!.trim(),
    clientSecret: variaveis.EFI_CLIENT_SECRET!.trim(),
    pixKey: variaveis.EFI_PIX_KEY!.trim(),
    certificado,
    senhaCertificado: variaveis.EFI_CERTIFICATE_PASSPHRASE ?? '',
  }
}
