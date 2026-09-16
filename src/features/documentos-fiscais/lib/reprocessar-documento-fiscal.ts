import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { documentosFiscais, documentosFiscaisArquivos, documentosFiscaisExtracoes } from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { PARSER_FISCAL, type CodigoErroInterpretacao } from '../constants/nfe'
import { PERMISSOES_DOCUMENTOS_FISCAIS } from '../constants/permissoes'
import { resolverAcessoDocumentoFiscal } from './acesso-documentos-fiscais'
import { lerOriginalPrivado } from './armazenamento-fiscal'
import { ENTIDADES_AUDITORIA_FISCAL, metadadosAuditoriaFiscal } from './auditoria'
import { resolverContribuinteFiscal } from './contribuinte-fiscal'
import { determinarSentidoFiscal } from './identidade-fiscal'
import { interpretarNfe } from './parser-fiscal/interpretar-nfe'
import { cabecalhoDoDocumento, gravarExtracaoInterpretada } from './persistir-documento-fiscal'
import { calcularSha256, textoDoXmlFiscal, validarXmlFiscal } from './validar-xml-fiscal'

/**
 * Reprocessamento: reinterpretar um documento a partir do **mesmo original**.
 *
 * É o que dá sentido a guardar XML que o parser ainda não lê. Quando o parser
 * evolui, o arquivo privado é lido de novo, passa outra vez pela barreira de
 * segurança da Fase 1.2 e pelo parser atual, e uma **nova extração** nasce.
 *
 * ## O que muda e o que não muda
 *
 * - O original não é tocado: nada é regravado, nada é apagado. O hash é
 *   conferido na leitura; se não bater, o reprocessamento para.
 * - A extração anterior continua existindo, com o erro que registrou. Ela só
 *   deixa de ser `vigente` quando a leitura nova dá certo — leitura que falha
 *   não derruba uma leitura boa.
 * - Partes, itens e tributos pertencem à extração, então a leitura nova cria as
 *   suas próprias linhas e não soma às antigas. O documento e o arquivo
 *   continuam os mesmos: reprocessar nunca cria documento nem original novo.
 * - Tudo numa transação: extração, estrutura, cabeçalho e auditoria entram
 *   juntos ou não entram.
 *
 * ## Autorização
 *
 * `documentos_fiscais.revisar` — reinterpretar dado fiscal é ato técnico, o
 * mesmo corte da revisão. O documento é resolvido pelo par usuário → empresa →
 * documento (`resolverAcessoDocumentoFiscal`); documento de outro escritório,
 * inexistente ou sem permissão respondem igual, sem distinguir.
 */

export type ResultadoReprocessamento =
  | {
      sucesso: true
      codigo: 'REPROCESSADO'
      documentoId: string
      extracaoId: string
      statusAnterior: string
      sentido: string
    }
  | {
      sucesso: false
      codigo: 'NAO_INTERPRETADO'
      documentoId: string
      extracaoId: string
      motivo: CodigoErroInterpretacao
    }
  | {
      sucesso: false
      codigo: 'SEM_PERMISSAO' | 'ARQUIVO_INDISPONIVEL' | 'ARQUIVO_RECUSADO' | 'DOCUMENTO_DUPLICADO' | 'FALHA_REGISTRO'
      documentoId: string
    }

export async function reprocessarDocumentoFiscal(entrada: {
  usuarioId: string
  documentoId: string
  ip?: string | null
}): Promise<ResultadoReprocessamento> {
  const { documentoId } = entrada
  const acesso = await resolverAcessoDocumentoFiscal(
    entrada.usuarioId,
    PERMISSOES_DOCUMENTOS_FISCAIS.revisar,
    documentoId,
  )
  if (!acesso) return { sucesso: false, codigo: 'SEM_PERMISSAO', documentoId }

  const [documento] = await db
    .select({
      id: documentosFiscais.id,
      empresaId: documentosFiscais.empresaId,
      clienteId: documentosFiscais.clienteId,
      statusProcessamento: documentosFiscais.statusProcessamento,
    })
    .from(documentosFiscais)
    .where(
      and(
        eq(documentosFiscais.id, documentoId),
        eq(documentosFiscais.empresaId, acesso.empresaId),
        isNull(documentosFiscais.excluidoEm),
      ),
    )
    .limit(1)
  if (!documento) return { sucesso: false, codigo: 'SEM_PERMISSAO', documentoId }

  // O XML de origem do documento — não o de um evento dele.
  const [arquivo] = await db
    .select({
      id: documentosFiscaisArquivos.id,
      nomeOriginal: documentosFiscaisArquivos.nomeOriginal,
      tipoMime: documentosFiscaisArquivos.tipoMime,
      chave: documentosFiscaisArquivos.chaveArmazenamento,
      sha256: documentosFiscaisArquivos.sha256,
    })
    .from(documentosFiscaisArquivos)
    .where(
      and(
        eq(documentosFiscaisArquivos.documentoFiscalId, documentoId),
        eq(documentosFiscaisArquivos.empresaId, acesso.empresaId),
        eq(documentosFiscaisArquivos.tipoArquivo, 'xml'),
        isNull(documentosFiscaisArquivos.eventoFiscalId),
      ),
    )
    .orderBy(documentosFiscaisArquivos.createdAt)
    .limit(1)
  if (!arquivo) return { sucesso: false, codigo: 'ARQUIVO_INDISPONIVEL', documentoId }

  let bytes: Uint8Array
  try {
    const original = await lerOriginalPrivado(arquivo.chave)
    if (!original) return { sucesso: false, codigo: 'ARQUIVO_INDISPONIVEL', documentoId }
    bytes = new Uint8Array(await new Response(original.stream).arrayBuffer())
  } catch (erro) {
    console.error('[DOCUMENTOS_FISCAIS_REPROCESSO_LEITURA]', { nome: erro instanceof Error ? erro.name : 'desconhecido' })
    return { sucesso: false, codigo: 'ARQUIVO_INDISPONIVEL', documentoId }
  }
  // O original tem que ser exatamente o que foi aceito lá atrás.
  if (calcularSha256(bytes) !== arquivo.sha256) {
    return { sucesso: false, codigo: 'ARQUIVO_INDISPONIVEL', documentoId }
  }

  // A barreira de segurança roda de novo: o parser nunca recebe XML que não
  // passou por ela, mesmo vindo do nosso próprio armazenamento.
  const validacao = validarXmlFiscal({
    nome: arquivo.nomeOriginal,
    tipoMime: arquivo.tipoMime,
    bytes,
  })
  if (!validacao.valido) return { sucesso: false, codigo: 'ARQUIVO_RECUSADO', documentoId }

  const interpretacao = interpretarNfe(textoDoXmlFiscal(bytes))
  const contribuinte = interpretacao.sucesso
    ? await resolverContribuinteFiscal(documento.empresaId, documento.clienteId)
    : null
  const sentido = interpretacao.sucesso
    ? determinarSentidoFiscal(interpretacao.documento, contribuinte)
    : null

  let extracaoId: string
  try {
    extracaoId = await db.transaction(async (tx) => {
      // Só uma leitura boa substitui a vigente; uma falha não derruba a anterior.
      if (interpretacao.sucesso) {
        await tx
          .update(documentosFiscaisExtracoes)
          .set({ vigente: false })
          .where(
            and(
              eq(documentosFiscaisExtracoes.documentoFiscalId, documentoId),
              eq(documentosFiscaisExtracoes.vigente, true),
            ),
          )
      }

      const novaExtracao = await gravarExtracaoInterpretada(tx, {
        documentoId,
        arquivoId: arquivo.id,
        interpretacao,
        origem: 'envio_usuario',
        usuarioId: entrada.usuarioId,
      })

      if (interpretacao.sucesso) {
        await tx
          .update(documentosFiscais)
          .set({
            statusProcessamento: 'processado',
            processadoEm: new Date(),
            updatedAt: new Date(),
            ...cabecalhoDoDocumento(interpretacao.documento, sentido ?? 'nao_determinado'),
          })
          .where(eq(documentosFiscais.id, documentoId))
      }

      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.documentoFiscalProcessado,
          entidade: ENTIDADES_AUDITORIA_FISCAL.extracao,
          registroAfetado: documentoId,
          autorId: entrada.usuarioId,
          empresaId: documento.empresaId,
          origem: 'admin',
          ip: entrada.ip ?? null,
          metadados: metadadosAuditoriaFiscal({
            metodoExtracao: 'parser_xml',
            provedor: PARSER_FISCAL.provedor,
            versao: PARSER_FISCAL.versao,
            extracaoId: novaExtracao,
            clienteId: documento.clienteId,
            statusAnterior: documento.statusProcessamento,
            statusNovo: interpretacao.sucesso ? 'processado' : 'falhou',
          }),
        },
        tx,
      )

      return novaExtracao
    })
  } catch (erro) {
    if (ehChaveJaRegistrada(erro)) return { sucesso: false, codigo: 'DOCUMENTO_DUPLICADO', documentoId }
    console.error('[DOCUMENTOS_FISCAIS_REPROCESSO]', { nome: erro instanceof Error ? erro.name : 'desconhecido' })
    return { sucesso: false, codigo: 'FALHA_REGISTRO', documentoId }
  }

  if (!interpretacao.sucesso) {
    return {
      sucesso: false,
      codigo: 'NAO_INTERPRETADO',
      documentoId,
      extracaoId,
      motivo: interpretacao.codigo,
    }
  }

  return {
    sucesso: true,
    codigo: 'REPROCESSADO',
    documentoId,
    extracaoId,
    statusAnterior: documento.statusProcessamento,
    sentido: sentido ?? 'nao_determinado',
  }
}

/** A leitura nova apontou para uma NF-e que já existe nesta perspectiva. */
function ehChaveJaRegistrada(erro: unknown) {
  const causa =
    (erro as { cause?: { code?: string; constraint_name?: string } })?.cause ??
    (erro as { code?: string; constraint_name?: string })
  return causa?.code === '23505' && causa?.constraint_name === 'documentos_fiscais_chave_unica'
}
