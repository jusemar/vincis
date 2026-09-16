import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { documentosFiscais, documentosFiscaisArquivos } from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { ehAcessoInterno, resolverAcessoCliente } from '@/features/clientes/lib/acesso-cliente'
import { PERMISSOES_DOCUMENTOS_FISCAIS } from '../constants/permissoes'
import {
  CONCORRENCIA_LOTE_XML_FISCAL,
  excedeLimitesDoLote,
  MENSAGENS_UPLOAD_FISCAL,
  MIME_XML_FISCAL,
  TAMANHO_MAXIMO_XML_FISCAL,
  type CodigoRecusaArquivo,
  type CodigoRecusaLote,
} from '../constants/upload'
import {
  clienteNoEscopoDoEscritorio,
  resolverAcessoDocumentoFiscal,
  resolverAcessoDocumentosFiscais,
  type AcessoDocumentosFiscais,
} from './acesso-documentos-fiscais'
import {
  descartarObjetoNaoRegistrado,
  gravarOriginalPrivado,
  montarChaveOriginal,
} from './armazenamento-fiscal'
import { ENTIDADES_AUDITORIA_FISCAL, metadadosAuditoriaFiscal } from './auditoria'
import { limparNomeOriginal, validarXmlFiscal } from './validar-xml-fiscal'

/** O mínimo de `File` que o recebimento usa — permite testar sem navegador. */
export type ArquivoDoLote = {
  name: string
  type: string
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

export type ResultadoArquivoFiscal =
  | { indice: number; nome: string; codigo: 'ACEITO'; mensagem: string; documentoId: string; arquivoId: string }
  | { indice: number; nome: string; codigo: 'DOCUMENTO_DUPLICADO'; mensagem: string; documentoId: string | null }
  | { indice: number; nome: string; codigo: CodigoRecusaArquivo; mensagem: string }

export type ResultadoLoteFiscal =
  | {
      sucesso: true
      resumo: { total: number; aceitos: number; duplicados: number; recusados: number }
      arquivos: ResultadoArquivoFiscal[]
    }
  | { sucesso: false; codigo: CodigoRecusaLote; mensagem: string }

const recusarLote = (codigo: CodigoRecusaLote): ResultadoLoteFiscal => ({
  sucesso: false,
  codigo,
  mensagem: MENSAGENS_UPLOAD_FISCAL[codigo],
})

/**
 * Recebe um lote de XMLs fiscais para um escritório e, opcionalmente, um cliente.
 *
 * ## Autorização antes de qualquer byte
 *
 * `empresaId` é só a empresa *pedida* (o contexto ativo da sessão): passa por
 * `resolverAcessoDocumentosFiscais` com `documentos_fiscais.enviar`. O cliente
 * passa por `clienteNoEscopoDoEscritorio` e, para quem não administra o
 * escritório, pelo acesso interno ao cliente — a mesma regra que decide quem
 * **vê** o documento depois. Por isso quem não administra precisa informar um
 * cliente: documento sem cliente é do escritório, e ele não o enxergaria.
 * Cliente inexistente e cliente de outro escritório recebem a mesma resposta.
 *
 * ## Um arquivo não derruba o lote
 *
 * Cada arquivo tem resultado próprio. Os limites do lote (quantidade e tamanho
 * total) são conferidos antes de ler conteúdo; o de cada arquivo, antes de ler
 * aquele arquivo.
 */
export async function receberXmlsFiscais(entrada: {
  usuarioId: string
  empresaId: string
  clienteId: string | null
  arquivos: ArquivoDoLote[]
  ip?: string | null
}): Promise<ResultadoLoteFiscal> {
  const acesso = await resolverAcessoDocumentosFiscais(
    entrada.usuarioId,
    PERMISSOES_DOCUMENTOS_FISCAIS.enviar,
    entrada.empresaId,
  )
  if (!acesso) return recusarLote('SEM_PERMISSAO')

  if (entrada.clienteId) {
    if (!(await clienteNoEscopoDoEscritorio(entrada.clienteId, acesso.empresaId))) {
      return recusarLote('CLIENTE_FORA_DO_ESCOPO')
    }
    if (!acesso.administra) {
      const acessoCliente = await resolverAcessoCliente(entrada.usuarioId, entrada.clienteId)
      if (!acessoCliente || !ehAcessoInterno(acessoCliente.nivel)) {
        return recusarLote('CLIENTE_FORA_DO_ESCOPO')
      }
    }
  } else if (!acesso.administra) {
    return recusarLote('CLIENTE_OBRIGATORIO')
  }

  if (entrada.arquivos.length === 0) return recusarLote('LOTE_VAZIO')
  // Soma real dos tamanhos, independente do `Content-Length` que a rota viu:
  // lote acima do limite é recusado inteiro, antes de ler ou gravar qualquer arquivo.
  if (excedeLimitesDoLote(entrada.arquivos)) return recusarLote('LOTE_MUITO_GRANDE')

  const resultados: ResultadoArquivoFiscal[] = new Array(entrada.arquivos.length)
  let proximo = 0
  // Poucos por vez: o lote inteiro já cabe em memória (≤ 3,5 MB), mas gravar no
  // storage em série deixaria o lote lento e em paralelo total seria abuso.
  const trabalhador = async () => {
    while (proximo < entrada.arquivos.length) {
      const indice = proximo++
      resultados[indice] = await receberArquivo(acesso, entrada, indice)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA_LOTE_XML_FISCAL, entrada.arquivos.length) }, trabalhador),
  )

  return {
    sucesso: true,
    resumo: {
      total: resultados.length,
      aceitos: resultados.filter((r) => r.codigo === 'ACEITO').length,
      duplicados: resultados.filter((r) => r.codigo === 'DOCUMENTO_DUPLICADO').length,
      recusados: resultados.filter((r) => r.codigo !== 'ACEITO' && r.codigo !== 'DOCUMENTO_DUPLICADO').length,
    },
    arquivos: resultados,
  }
}

async function receberArquivo(
  acesso: AcessoDocumentosFiscais,
  entrada: { usuarioId: string; clienteId: string | null; arquivos: ArquivoDoLote[]; ip?: string | null },
  indice: number,
): Promise<ResultadoArquivoFiscal> {
  const arquivo = entrada.arquivos[indice]
  const nome = limparNomeOriginal(arquivo.name)
  const recusar = (codigo: CodigoRecusaArquivo): ResultadoArquivoFiscal => ({
    indice,
    nome,
    codigo,
    mensagem: MENSAGENS_UPLOAD_FISCAL[codigo],
  })

  // Tamanho antes de ler: arquivo grande demais nem entra em memória.
  if (arquivo.size > TAMANHO_MAXIMO_XML_FISCAL) return recusar('ARQUIVO_MUITO_GRANDE')

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await arquivo.arrayBuffer())
  } catch {
    return recusar('ARQUIVO_NAO_PERMITIDO')
  }

  const validacao = validarXmlFiscal({ nome: arquivo.name, tipoMime: arquivo.type, bytes })
  if (!validacao.valido) return recusar(validacao.codigo)

  const duplicado = async (): Promise<ResultadoArquivoFiscal> => ({
    indice,
    nome,
    codigo: 'DOCUMENTO_DUPLICADO',
    mensagem: MENSAGENS_UPLOAD_FISCAL.DOCUMENTO_DUPLICADO,
    documentoId: await referenciaSegura(acesso, entrada.clienteId, validacao.sha256, entrada.usuarioId),
  })

  // Caminho rápido: nem grava no storage o que já existe. Não é a garantia —
  // a garantia é o índice único, conferido de novo na transação.
  if (await buscarDocumentoDeOrigem(acesso.empresaId, entrada.clienteId, validacao.sha256)) {
    return duplicado()
  }

  const documentoId = randomUUID()
  const arquivoId = randomUUID()
  const chave = montarChaveOriginal(acesso.empresaId, documentoId, arquivoId)

  // Storage primeiro: se falhar, não existe linha — nenhum documento fantasma.
  try {
    await gravarOriginalPrivado(chave, bytes, MIME_XML_FISCAL)
  } catch (erro) {
    console.error('[DOCUMENTOS_FISCAIS_ARMAZENAMENTO]', { nome: erro instanceof Error ? erro.name : 'desconhecido' })
    return recusar('FALHA_ARMAZENAMENTO')
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(documentosFiscais).values({
        id: documentoId,
        empresaId: acesso.empresaId,
        clienteId: entrada.clienteId,
        enviadoPorId: entrada.usuarioId,
        origem: 'envio_usuario',
        // `status_processamento` nasce `pendente`: recebido e armazenado,
        // aguardando o parser. Nenhum campo fiscal é preenchido aqui.
        sha256Original: validacao.sha256,
      })
      await tx.insert(documentosFiscaisArquivos).values({
        id: arquivoId,
        empresaId: acesso.empresaId,
        documentoFiscalId: documentoId,
        tipoArquivo: 'xml',
        nomeOriginal: validacao.nomeOriginal,
        tipoMime: MIME_XML_FISCAL,
        tamanhoBytes: bytes.byteLength,
        chaveArmazenamento: chave,
        sha256: validacao.sha256,
        enviadoPorId: entrada.usuarioId,
      })
      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.documentoFiscalEnviado,
          entidade: ENTIDADES_AUDITORIA_FISCAL.documento,
          registroAfetado: documentoId,
          autorId: entrada.usuarioId,
          empresaId: acesso.empresaId,
          origem: 'admin',
          ip: entrada.ip ?? null,
          metadados: metadadosAuditoriaFiscal({
            origem: 'envio_usuario',
            clienteId: entrada.clienteId,
            arquivoId,
            tipoArquivo: 'xml',
            tamanhoBytes: bytes.byteLength,
            statusNovo: 'pendente',
          }),
        },
        tx,
      )
    })
  } catch (erro) {
    // O registro não existe: o objeto gravado não pode ficar para trás.
    await descartarObjetoNaoRegistrado(chave).catch((falha) => {
      // Órfão sem linha no banco não é acessível por rota nenhuma, mas precisa
      // ser encontrável para limpeza. A chave vai só para o log do servidor.
      console.error('[DOCUMENTOS_FISCAIS_ORFAO]', { chave, nome: falha instanceof Error ? falha.name : 'desconhecido' })
    })
    if (ehViolacaoDeOrigem(erro)) return duplicado()
    console.error('[DOCUMENTOS_FISCAIS_REGISTRO]', { nome: erro instanceof Error ? erro.name : 'desconhecido' })
    return recusar('FALHA_REGISTRO')
  }

  return {
    indice,
    nome,
    codigo: 'ACEITO',
    mensagem: MENSAGENS_UPLOAD_FISCAL.ACEITO,
    documentoId,
    arquivoId,
  }
}

async function buscarDocumentoDeOrigem(empresaId: string, clienteId: string | null, sha256: string) {
  const [documento] = await db
    .select({ id: documentosFiscais.id })
    .from(documentosFiscais)
    .where(
      and(
        eq(documentosFiscais.empresaId, empresaId),
        eq(documentosFiscais.sha256Original, sha256),
        clienteId ? eq(documentosFiscais.clienteId, clienteId) : isNull(documentosFiscais.clienteId),
      ),
    )
    .limit(1)
  return documento ?? null
}

/** O documento existente só é apontado para quem pode vê-lo. */
async function referenciaSegura(
  acesso: AcessoDocumentosFiscais,
  clienteId: string | null,
  sha256: string,
  usuarioId: string,
) {
  const existente = await buscarDocumentoDeOrigem(acesso.empresaId, clienteId, sha256)
  if (!existente) return null
  const pode = await resolverAcessoDocumentoFiscal(
    usuarioId,
    PERMISSOES_DOCUMENTOS_FISCAIS.visualizar,
    existente.id,
  )
  return pode ? existente.id : null
}

function ehViolacaoDeOrigem(erro: unknown) {
  const causa = (erro as { cause?: { code?: string; constraint_name?: string } })?.cause ?? (erro as { code?: string; constraint_name?: string })
  return causa?.code === '23505' && causa?.constraint_name === 'documentos_fiscais_origem_unica'
}
