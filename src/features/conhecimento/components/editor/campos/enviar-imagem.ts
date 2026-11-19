import { enviarImagemArtigo } from '../../../actions/imagens'
import { IMAGEM_ARTIGO } from '../../../constants/limites'

/**
 * Envio de imagem de artigo a partir do navegador — capa e imagens do texto.
 *
 * Confere formato e tamanho antes de enviar só para responder mais rápido; a
 * decisão é do servidor (tipo, extensão, assinatura dos bytes, 5 MB, sessão).
 * O arquivo segue **como foi escolhido** — sem conversão, redimensionamento ou
 * compressão.
 *
 * Quando a própria requisição falha (a action lança em vez de responder), a
 * mensagem diz o que se sabe: sem conexão, ou o servidor recusou o envio antes
 * de validar o arquivo — nunca um "verifique sua conexão" genérico para tudo.
 */
export type ResultadoEnvioImagem = { ok: true; url: string } | { ok: false; mensagem: string }

const NOMES: Record<string, string> = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP' }

export function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

export async function enviarImagemDoNavegador(arquivo: File): Promise<ResultadoEnvioImagem> {
  if (!(IMAGEM_ARTIGO.tipos as readonly string[]).includes(arquivo.type))
    return {
      ok: false,
      mensagem: `Formato não aceito (${arquivo.type || 'desconhecido'}). Envie ${Object.values(NOMES).join(', ')}.`,
    }
  if (arquivo.size > IMAGEM_ARTIGO.tamanhoMaximo)
    return {
      ok: false,
      mensagem: `A imagem tem ${megabytes(arquivo.size)} MB. O máximo é 5 MB — comprima ou converta para WebP.`,
    }
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return { ok: false, mensagem: 'Você está sem conexão com a internet. Reconecte e tente de novo.' }

  try {
    const formulario = new FormData()
    formulario.set('imagem', arquivo)
    const resposta = await enviarImagemArtigo(formulario)
    return resposta.sucesso ? { ok: true, url: resposta.url } : { ok: false, mensagem: resposta.mensagem }
  } catch (erro) {
    console.error('[ENVIO_IMAGEM_ARTIGO_FALHOU]', { tamanho: arquivo.size, tipo: arquivo.type, erro })
    return {
      ok: false,
      mensagem:
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'A conexão caiu durante o envio. Reconecte e tente de novo.'
          : `O servidor recusou o envio deste arquivo (${NOMES[arquivo.type] ?? arquivo.type}, ${megabytes(arquivo.size)} MB) antes de validá-lo. Tente de novo; se persistir, avise o suporte da Vincis.`,
    }
  }
}
