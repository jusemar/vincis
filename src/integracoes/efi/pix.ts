import { createHash } from 'node:crypto'
import QRCode from 'qrcode'
import { chamarApiPixEfi } from './cliente'
import { obterConfiguracaoEfi } from './configuracao'

/**
 * Cobrança Pix imediata (`/v2/cob`) — o único meio Efí comprovado no Nooo.
 *
 * Cartão, boleto e Pix Automático não existem aqui de propósito: o Nooo não os
 * usa com a Efí, e esta primeira versão só implementa o que já foi provado com
 * dinheiro real.
 */

/** Status da cobrança na Efí (padrão do Bacen). */
export type StatusCobrancaEfi =
  | 'ATIVA'
  | 'CONCLUIDA'
  | 'REMOVIDA_PELO_USUARIO_RECEBEDOR'
  | 'REMOVIDA_PELO_PSP'

export type CobrancaPixCriada = {
  txid: string
  copiaECola: string
  /** Data URL do QR Code. Nulo se a Efí não devolveu a imagem. */
  qrCodeImagem: string | null
  expiraEm: Date
}

export type PixRecebido = {
  endToEndId: string
  txid: string
  valorCentavos: number
  horario: Date
  /** Houve devolução (total ou parcial)? Pix devolvido não confirma nada. */
  devolvido: boolean
}

export type CobrancaPixConsultada = {
  txid: string
  status: StatusCobrancaEfi | string
  valorOriginalCentavos: number | null
  expiraEm: Date | null
  pix: PixRecebido[]
}

type RespostaCob = {
  txid: string
  status?: string
  calendario?: { criacao?: string; expiracao?: number }
  valor?: { original?: string }
  loc?: { id?: number }
  pixCopiaECola?: string
  pix?: Array<{
    endToEndId?: string
    txid?: string
    valor?: string
    horario?: string
    devolucoes?: unknown[]
  }>
}

/**
 * txid de uma cobrança da Vincis.
 *
 * A Efí aceita de 26 a 35 alfanuméricos escolhidos pelo recebedor. Derivar do
 * id da linha torna o `PUT` idempotente: se a rede cair depois de a Efí criar a
 * cobrança e antes de gravarmos a resposta, repetir reencontra a mesma — nunca
 * cria uma segunda. O prefixo separa as cobranças da Vincis das do Nooo, caso
 * um dia dividam conta.
 */
export function gerarTxid(cobrancaId: string): string {
  return createHash('sha256').update(`vincis:cobranca:${cobrancaId}`).digest('hex').slice(0, 32)
}

/** `"123.40"` → `12340`. Recusa qualquer formato que não seja o do Bacen. */
export function valorPixEmCentavos(valor: string | undefined): number | null {
  if (!valor || !/^\d+(?:\.\d{1,2})?$/.test(valor)) return null
  const [reais, centavos = ''] = valor.split('.')
  const total = Number(reais) * 100 + Number(centavos.padEnd(2, '0'))
  return Number.isSafeInteger(total) ? total : null
}

function centavosEmValorPix(centavos: number): string {
  return (centavos / 100).toFixed(2)
}

function expiracaoDe(resposta: RespostaCob, segundosPedidos: number): Date {
  const criacao = resposta.calendario?.criacao
    ? new Date(resposta.calendario.criacao).getTime()
    : Number.NaN
  const segundos = resposta.calendario?.expiracao ?? segundosPedidos
  const base = Number.isFinite(criacao) ? criacao : Date.now()
  return new Date(base + segundos * 1000)
}

/**
 * O QR Code do Pix, como data URL.
 *
 * O QR é só a imagem do BR Code (o Pix Copia e Cola): os dois carregam o mesmo
 * conteúdo. Primeiro pede a imagem oficial à Efí (`/v2/loc/{id}/qrcode`); se
 * ela não vier — a aplicação Efí sem o escopo `payloadlocation.read` responde
 * 403, como no sandbox atual —, gera a imagem localmente a partir do próprio
 * BR Code, o mesmo fallback que o Nooo usa. O QR gerado aqui é escuro sobre
 * branco com margem de silêncio, legível em qualquer tema.
 */
export async function imagemDoQrCode(locId: number | undefined, copiaECola: string): Promise<string | null> {
  if (locId) {
    try {
      const qr = await chamarApiPixEfi<{ imagemQrcode?: string }>('GET', `/v2/loc/${locId}/qrcode`)
      if (qr.imagemQrcode?.startsWith('data:image/')) return qr.imagemQrcode
    } catch (erro) {
      console.warn('[EFI] QR Code oficial indisponível; gerando a partir do BR Code.', {
        status: (erro as { status?: number }).status ?? null,
      })
    }
  }
  return gerarQrCodeLocal(copiaECola)
}

/** Data URL (PNG) do QR do BR Code. Nulo só se a geração falhar. */
export async function gerarQrCodeLocal(copiaECola: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(copiaECola, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#000000', light: '#ffffff' },
    })
  } catch {
    return null
  }
}

export async function criarCobrancaPixImediata({
  txid,
  valorCentavos,
  expiracaoSegundos,
  solicitacaoPagador,
}: {
  txid: string
  valorCentavos: number
  expiracaoSegundos: number
  solicitacaoPagador: string
}): Promise<CobrancaPixCriada> {
  const { pixKey } = obterConfiguracaoEfi()
  const cobranca = await chamarApiPixEfi<RespostaCob>('PUT', `/v2/cob/${txid}`, {
    calendario: { expiracao: expiracaoSegundos },
    valor: { original: centavosEmValorPix(valorCentavos) },
    chave: pixKey,
    // A Efí limita a 140 caracteres; aparece no app do banco do pagador.
    solicitacaoPagador: solicitacaoPagador.slice(0, 140),
  })

  if (!cobranca.pixCopiaECola) {
    throw new Error('A Efí não devolveu o Pix Copia e Cola.')
  }

  const qrCodeImagem = await imagemDoQrCode(cobranca.loc?.id, cobranca.pixCopiaECola)
  return {
    txid: cobranca.txid,
    copiaECola: cobranca.pixCopiaECola,
    qrCodeImagem,
    expiraEm: expiracaoDe(cobranca, expiracaoSegundos),
  }
}

/**
 * A verdade da Efí sobre uma cobrança.
 *
 * É isto — e não o corpo do webhook — que confirma pagamento na Vincis: o
 * webhook só avisa que vale a pena perguntar.
 */
export async function consultarCobrancaPix(txid: string): Promise<CobrancaPixConsultada> {
  const cobranca = await chamarApiPixEfi<RespostaCob>('GET', `/v2/cob/${encodeURIComponent(txid)}`)
  const pix: PixRecebido[] = []
  for (const item of cobranca.pix ?? []) {
    const valorCentavos = valorPixEmCentavos(item.valor)
    const horario = item.horario ? new Date(item.horario) : null
    if (!item.endToEndId || valorCentavos === null || !horario || Number.isNaN(horario.getTime())) {
      continue
    }
    pix.push({
      endToEndId: item.endToEndId,
      txid: item.txid ?? cobranca.txid,
      valorCentavos,
      horario,
      devolvido: Boolean(item.devolucoes?.length),
    })
  }
  return {
    txid: cobranca.txid,
    status: cobranca.status ?? 'ATIVA',
    valorOriginalCentavos: valorPixEmCentavos(cobranca.valor?.original),
    expiraEm: cobranca.calendario ? expiracaoDe(cobranca, 0) : null,
    pix,
  }
}
