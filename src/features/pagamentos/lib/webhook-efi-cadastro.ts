import {
  ConfiguracaoEfiAusente,
  obterConfiguracaoEfi,
  variaveisEfiFaltando,
} from '@/integracoes/efi/configuracao'
import { ErroEfi } from '@/integracoes/efi/cliente'
import { cadastrarWebhookPix, consultarWebhookPix } from '@/integracoes/efi/webhook-cadastro'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'

/**
 * Webhook Pix da Efí: conferir e cadastrar, pela Gestão.
 *
 * ## Regras
 *
 * - **Só na produção da Vincis** (`VERCEL_ENV=production` + Efí de produção).
 *   O endereço é fixo em `vincis.com.br`: a homologação ou uma máquina local
 *   nunca apontam o webhook da conta real para si mesmas.
 * - **Nunca sobrescreve** um webhook diferente já cadastrado na chave: pode
 *   ser de outro sistema, e trocá-lo calaria aquele sistema sem aviso. O
 *   Gestor vê o conflito e decide fora daqui.
 * - **Nada sensível sai daqui:** token, chave Pix e a URL cadastrada completa
 *   (que contém o token) não são devolvidos, nem logados, nem auditados. Para
 *   a tela, só o domínio e o caminho.
 */

export const ENDERECO_PUBLICO_PRODUCAO = 'https://vincis.com.br'
export const CAMINHO_WEBHOOK_EFI = '/api/efi/webhook'

type Variaveis = Record<string, string | undefined>

/**
 * A URL a cadastrar. `ignorar=` precisa ser o **último** parâmetro: a Efí
 * acrescenta `/pix` ao fim da URL, e assim o sufixo cai no valor de `ignorar`
 * (documentação oficial), sem mexer no token nem no caminho.
 */
export function montarUrlWebhookEfi(token: string): string {
  return `${ENDERECO_PUBLICO_PRODUCAO}${CAMINHO_WEBHOOK_EFI}?token=${encodeURIComponent(token)}&ignorar=`
}

export type ComparacaoWebhook =
  | { tipo: 'vincis' }
  | { tipo: 'vincis_token_diferente' }
  | { tipo: 'vincis_formato_diferente' }
  | { tipo: 'outro_endereco'; dominio: string }

/** O cadastrado é o da Vincis, com o token atual? Compara por partes, não por texto. */
export function compararWebhook(cadastrada: string, token: string): ComparacaoWebhook {
  let url: URL
  try {
    url = new URL(cadastrada)
  } catch {
    return { tipo: 'outro_endereco', dominio: 'endereço inválido' }
  }
  const esperado = new URL(montarUrlWebhookEfi(token))
  if (url.origin !== esperado.origin || url.pathname.replace(/\/+$/, '') !== CAMINHO_WEBHOOK_EFI) {
    return { tipo: 'outro_endereco', dominio: url.hostname }
  }
  if (url.searchParams.get('token') !== token) return { tipo: 'vincis_token_diferente' }
  const parametros = [...url.searchParams.keys()]
  const formatoCerto =
    parametros.length === 2 && parametros[1] === 'ignorar' && url.searchParams.get('ignorar') === ''
  return formatoCerto ? { tipo: 'vincis' } : { tipo: 'vincis_formato_diferente' }
}

export type SituacaoWebhookEfi =
  | { estado: 'indisponivel'; motivo: string }
  | { estado: 'nao_cadastrado' }
  | { estado: 'cadastrado'; criacao: string | null }
  | { estado: 'conflito'; comparacao: Exclude<ComparacaoWebhook, { tipo: 'vincis' }>; criacao: string | null }
  | { estado: 'erro'; mensagem: string }

type Pronto = { token: string }

/** Ambiente apto a mexer no webhook real? Devolve o token, ou o motivo de não estar. */
function conferirAmbiente(variaveis: Variaveis): Pronto | { motivo: string } {
  if (variaveis.VERCEL_ENV !== 'production') {
    return { motivo: 'Disponível somente na produção da Vincis (vincis.com.br).' }
  }
  const faltando = variaveisEfiFaltando(variaveis)
  if (faltando.length) return { motivo: `Configuração Efí incompleta: ${faltando.join(', ')}.` }
  const token = variaveis.EFI_WEBHOOK_TOKEN?.trim()
  if (!token) return { motivo: 'Configuração Efí incompleta: EFI_WEBHOOK_TOKEN.' }
  try {
    if (obterConfiguracaoEfi(variaveis).sandbox) {
      return { motivo: 'A Efí está em modo sandbox: o webhook de produção não é cadastrado.' }
    }
  } catch (erro) {
    return { motivo: erro instanceof ConfiguracaoEfiAusente ? erro.message : 'Configuração Efí inválida.' }
  }
  return { token }
}

/** Mensagem legível de falha da Efí — sem corpo de resposta nem dado sensível. */
export function mensagemDeFalhaEfi(erro: unknown): string {
  if (erro instanceof ErroEfi) {
    if (erro.status === 401 || erro.status === 403) {
      return `A Efí recusou o acesso (HTTP ${erro.status}). Confira as credenciais e os escopos webhook.read e webhook.write da aplicação.`
    }
    if (erro.status) return `A Efí respondeu HTTP ${erro.status}: ${erro.message}`
    return erro.message
  }
  if (erro instanceof ConfiguracaoEfiAusente) return erro.message
  return 'Falha inesperada ao falar com a Efí.'
}

function situacaoDe(cadastrado: Awaited<ReturnType<typeof consultarWebhookPix>>, token: string): SituacaoWebhookEfi {
  if (!cadastrado) return { estado: 'nao_cadastrado' }
  const comparacao = compararWebhook(cadastrado.webhookUrl, token)
  return comparacao.tipo === 'vincis'
    ? { estado: 'cadastrado', criacao: cadastrado.criacao }
    : { estado: 'conflito', comparacao, criacao: cadastrado.criacao }
}

/** Consulta o webhook na Efí (`GET`). Só leitura. */
export async function consultarSituacaoWebhookEfi(variaveis: Variaveis = process.env): Promise<SituacaoWebhookEfi> {
  const ambiente = conferirAmbiente(variaveis)
  if ('motivo' in ambiente) return { estado: 'indisponivel', motivo: ambiente.motivo }
  try {
    return situacaoDe(await consultarWebhookPix(), ambiente.token)
  } catch (erro) {
    return { estado: 'erro', mensagem: mensagemDeFalhaEfi(erro) }
  }
}

export type ResultadoCadastroWebhook =
  | { ok: true; jaEstavaCadastrado: boolean; criacao: string | null }
  | { ok: false; situacao: SituacaoWebhookEfi }

/**
 * Cadastra o webhook da Vincis se — e só se — a chave não tiver nenhum.
 *
 * Confere antes (`GET`), cadastra (`PUT`, que a Efí valida enviando um aviso
 * de teste à URL) e confere de novo: só diz "cadastrado" o que a Efí devolve.
 */
export async function cadastrarWebhookEfi(
  { gestorId, ip }: { gestorId: string; ip: string | null },
  variaveis: Variaveis = process.env,
): Promise<ResultadoCadastroWebhook> {
  const antes = await consultarSituacaoWebhookEfi(variaveis)
  if (antes.estado === 'cadastrado') return { ok: true, jaEstavaCadastrado: true, criacao: antes.criacao }
  if (antes.estado !== 'nao_cadastrado') return { ok: false, situacao: antes }

  const ambiente = conferirAmbiente(variaveis) as Pronto
  try {
    await cadastrarWebhookPix(montarUrlWebhookEfi(ambiente.token))
  } catch (erro) {
    console.warn('[EFI_WEBHOOK] cadastro recusado', { status: erro instanceof ErroEfi ? (erro.status ?? null) : null })
    return { ok: false, situacao: { estado: 'erro', mensagem: mensagemDeFalhaEfi(erro) } }
  }

  const depois = await consultarSituacaoWebhookEfi(variaveis)
  if (depois.estado !== 'cadastrado') return { ok: false, situacao: depois }

  await registrarEventoAuditoria({
    acao: ACOES_AUDITORIA.webhookEfiCadastrado,
    entidade: 'efi_webhook',
    autorId: gestorId,
    origem: 'gestao_vincis',
    ip,
    // Sem token, sem chave Pix, sem a URL completa.
    metadados: {
      dominio: new URL(ENDERECO_PUBLICO_PRODUCAO).hostname,
      caminho: CAMINHO_WEBHOOK_EFI,
      ignorarSufixo: true,
      dispensaMtlsDeEntrada: true,
      criacaoNaEfi: depois.criacao,
    },
  })
  console.info('[EFI_WEBHOOK] cadastrado', { dominio: new URL(ENDERECO_PUBLICO_PRODUCAO).hostname })
  return { ok: true, jaEstavaCadastrado: false, criacao: depois.criacao }
}
