'use server'

import { z } from 'zod'
import { MENSAGEM_AUTOR_INELEGIVEL, obterAutorDaSessao } from '../lib/autorizacao'
import {
  arquivarPeloAutor,
  cancelarEnvio,
  criarArtigoComRascunho,
  descartarRevisao,
  enviarParaAprovacao,
  salvarTextoDoArtigo,
  slugDoArtigo,
  type EscopoAutoria,
} from '../lib/edicao-artigo'
import { SEM_PERMISSAO, respostaDeErro, type RespostaAcao } from '../lib/respostas'
import { revalidarConhecimento } from '../lib/revalidacao'
import { dadosArtigoSchema, identificadorSchema } from '../schemas/artigo'

/**
 * Ações do **profissional autor**. Todas:
 * 1. leem o autor da sessão (nunca do navegador);
 * 2. validam a entrada com Zod no servidor (o formulário já validou, mas o
 *    servidor não confia);
 * 3. operam com escopo `autor_id = sessão` — um id de artigo alheio responde
 *    "não encontrado", sem revelar que existe.
 *
 * O autor não publica: enviar coloca na fila da Vincis.
 */

const entradaSalvarSchema = z.object({
  artigoId: identificadorSchema.nullable().optional(),
  dados: dadosArtigoSchema,
  intencao: z.enum(['rascunho', 'enviar']),
})

export async function salvarArtigoProfissional(
  entrada: unknown,
): Promise<RespostaAcao<{ artigoId: string }>> {
  const autor = await obterAutorDaSessao()
  if (!autor) return SEM_PERMISSAO
  const validacao = entradaSalvarSchema.safeParse(entrada)
  if (!validacao.success) return respostaDeErro(validacao.error, 'validar artigo')
  const { artigoId, dados, intencao } = validacao.data

  // Criar e enviar exigem perfil na vitrine (é ele que o artigo exibe).
  if ((!artigoId || intencao === 'enviar') && !autor.elegivelParaPublicar)
    return { sucesso: false, mensagem: MENSAGEM_AUTOR_INELEGIVEL }

  const escopo: EscopoAutoria = { tipo: 'profissional', autorId: autor.usuarioId }
  try {
    let id = artigoId ?? null
    if (!id) {
      id = (
        await criarArtigoComRascunho({
          executorId: autor.usuarioId,
          tipoAutoria: 'profissional',
          autorId: autor.usuarioId,
          responsavelEditorialId: null,
          dados,
        })
      ).artigoId
      if (intencao === 'rascunho') {
        revalidarConhecimento()
        return { sucesso: true, mensagem: 'Rascunho criado.', artigoId: id }
      }
    }
    if (intencao === 'enviar') {
      await enviarParaAprovacao({ executorId: autor.usuarioId, artigoId: id, escopo, dados })
      revalidarConhecimento(await slugDoArtigo(id))
      return { sucesso: true, mensagem: 'Artigo enviado para aprovação da Vincis.', artigoId: id }
    }
    const { revisaoAberta } = await salvarTextoDoArtigo({ executorId: autor.usuarioId, artigoId: id, escopo, dados })
    revalidarConhecimento()
    return {
      sucesso: true,
      mensagem: revisaoAberta
        ? 'Revisão criada. O texto publicado continua no ar até a aprovação.'
        : 'Rascunho salvo.',
      artigoId: id,
    }
  } catch (erro) {
    return respostaDeErro(erro, 'salvar artigo do profissional')
  }
}

const OPERACOES = {
  cancelar_envio: { executar: cancelarEnvio, mensagem: 'Envio cancelado. Você pode editar o artigo.' },
  descartar_revisao: { executar: descartarRevisao, mensagem: 'Revisão descartada. O texto publicado foi mantido.' },
  arquivar: { executar: arquivarPeloAutor, mensagem: 'Artigo arquivado.' },
} as const

const entradaOperacaoSchema = z.object({
  artigoId: identificadorSchema,
  operacao: z.enum(['cancelar_envio', 'descartar_revisao', 'arquivar']),
})

export async function operarArtigoProfissional(entrada: unknown): Promise<RespostaAcao> {
  const autor = await obterAutorDaSessao()
  if (!autor) return SEM_PERMISSAO
  const validacao = entradaOperacaoSchema.safeParse(entrada)
  if (!validacao.success) return respostaDeErro(validacao.error, 'validar operação')
  const { artigoId, operacao } = validacao.data
  try {
    await OPERACOES[operacao].executar({
      executorId: autor.usuarioId,
      artigoId,
      escopo: { tipo: 'profissional', autorId: autor.usuarioId },
    })
    revalidarConhecimento(await slugDoArtigo(artigoId))
    return { sucesso: true, mensagem: OPERACOES[operacao].mensagem }
  } catch (erro) {
    return respostaDeErro(erro, `operar artigo: ${operacao}`)
  }
}
