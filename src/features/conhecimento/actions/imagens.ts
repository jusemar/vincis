'use server'

import { randomUUID } from 'node:crypto'
import { and, count, eq, gte } from 'drizzle-orm'
import { db } from '@/db/connection'
import { eventosAuditoria } from '@/db/schema'
import { ACOES_AUDITORIA } from '@/features/auditoria/lib/registrar-evento'
import { enviarImagemPublica } from '@/integracoes/armazenamento/imagens-publicas'
import { validarImagemEnviada } from '@/lib/validar-imagem-enviada'
import { IMAGEM_ARTIGO } from '../constants/limites'
import { PASTA_IMAGENS_CONHECIMENTO } from '../lib/conteudo/imagens-permitidas'
import { registrarEventoConhecimento } from '../lib/auditoria'
import { MENSAGEM_AUTOR_INELEGIVEL, obterAutorDaSessao, obterModeradorDaSessao } from '../lib/autorizacao'
import type { RespostaAcao } from '../lib/respostas'

/** Teto de uploads por pessoa por hora — evita abuso do storage público. */
const LIMITE_UPLOADS_POR_HORA = 60

/**
 * Upload de imagem para artigo (capa ou corpo).
 *
 * Quem pode: profissional autor com perfil na vitrine, ou a Gestão. Validação
 * de tipo, extensão, assinatura de bytes e tamanho (5 MB) no servidor; a chave
 * é montada aqui (`conhecimento/<usuario>/<uuid>.<ext>`) — o nome enviado pelo
 * navegador nunca vira caminho. O resultado é uma URL que o schema do conteúdo
 * reconhece como imagem da Vincis.
 *
 * Limitação conhecida: imagem enviada e depois retirada do rascunho fica órfã
 * no storage (não há coleta automática nesta versão).
 */
export async function enviarImagemArtigo(formulario: FormData): Promise<RespostaAcao<{ url: string }>> {
  const [autor, gestor] = await Promise.all([obterAutorDaSessao(), obterModeradorDaSessao()])
  const usuarioId = gestor?.id ?? autor?.usuarioId
  if (!usuarioId)
    return {
      sucesso: false,
      mensagem: 'Sua sessão expirou ou esta conta não pode enviar imagens. Entre novamente e tente outra vez.',
    }
  if (!gestor && autor && !autor.elegivelParaPublicar) return { sucesso: false, mensagem: MENSAGEM_AUTOR_INELEGIVEL }

  const arquivo = formulario.get('imagem')
  if (!(arquivo instanceof File) || arquivo.size === 0) return { sucesso: false, mensagem: 'Selecione uma imagem.' }

  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000)
  const [{ total }] = await db
    .select({ total: count() })
    .from(eventosAuditoria)
    .where(
      and(
        eq(eventosAuditoria.acao, ACOES_AUDITORIA.conhecimentoImagemEnviada),
        eq(eventosAuditoria.autorId, usuarioId),
        gte(eventosAuditoria.createdAt, umaHoraAtras),
      ),
    )
  if (total >= LIMITE_UPLOADS_POR_HORA)
    return { sucesso: false, mensagem: 'Muitos envios de imagem em pouco tempo. Tente novamente mais tarde.' }

  // 1) Formato e tamanho: mensagens da validação já são para o usuário.
  let extensao: string
  try {
    extensao = await validarImagemEnviada(arquivo, IMAGEM_ARTIGO.tamanhoMaximo)
  } catch (erro) {
    return { sucesso: false, mensagem: erro instanceof Error ? erro.message : 'Arquivo de imagem inválido.' }
  }

  // 2) Armazenamento: o arquivo é gravado como chegou (sem conversão nem
  // compressão). Falha aqui é da plataforma, não do arquivo — o detalhe
  // técnico vai para o log, e a pessoa recebe uma mensagem que diz isso.
  const chave = `${PASTA_IMAGENS_CONHECIMENTO}/${usuarioId}/${randomUUID()}.${extensao}`
  let url: string
  try {
    url = (await enviarImagemPublica(chave, arquivo)).url
  } catch (erro) {
    console.error('[CONHECIMENTO_IMAGEM_ARMAZENAMENTO_FALHOU]', {
      usuarioId,
      chave,
      erro: erro instanceof Error ? erro.message : String(erro),
    })
    return {
      sucesso: false,
      mensagem: 'O arquivo é válido, mas não foi possível gravá-lo no armazenamento de imagens agora. Tente novamente em instantes.',
    }
  }

  try {
    await registrarEventoConhecimento({
      acao: ACOES_AUDITORIA.conhecimentoImagemEnviada,
      entidade: 'conhecimento_imagem',
      registroAfetado: null,
      autorId: usuarioId,
      origem: gestor ? 'gestao_vincis' : 'admin',
      metadados: { chave, tamanho: arquivo.size, tipo: arquivo.type },
    })
  } catch (erro) {
    // A auditoria já registra a própria falha; a imagem gravada continua válida.
    console.error('[CONHECIMENTO_IMAGEM_AUDITORIA_FALHOU]', { usuarioId, chave, erro })
  }
  return { sucesso: true, mensagem: 'Imagem enviada.', url }
}
