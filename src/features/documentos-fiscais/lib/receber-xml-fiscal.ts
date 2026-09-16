import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/connection'
import { documentosFiscais } from '@/db/schema'
import { ehAcessoInterno, resolverAcessoCliente } from '@/features/clientes/lib/acesso-cliente'
import { PERMISSOES_DOCUMENTOS_FISCAIS } from '../constants/permissoes'
import {
  CODIGOS_DUPLICIDADE,
  CONCORRENCIA_LOTE_XML_FISCAL,
  excedeLimitesDoLote,
  MENSAGENS_UPLOAD_FISCAL,
  MIME_XML_FISCAL,
  TAMANHO_MAXIMO_XML_FISCAL,
  type CodigoRecusaArquivo,
  type CodigoRecusaLote,
} from '../constants/upload'
import type { CodigoErroInterpretacao } from '../constants/nfe'
import { interpretarNfe } from './parser-fiscal/interpretar-nfe'
import { persistirDocumentoFiscal } from './persistir-documento-fiscal'
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
import { limparNomeOriginal, textoDoXmlFiscal, validarXmlFiscal } from './validar-xml-fiscal'

/** O mínimo de `File` que o recebimento usa — permite testar sem navegador. */
export type ArquivoDoLote = {
  name: string
  type: string
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

export type ResultadoArquivoFiscal =
  | { indice: number; nome: string; codigo: 'ACEITO'; mensagem: string; documentoId: string; arquivoId: string }
  | {
      indice: number
      nome: string
      codigo: 'DOCUMENTO_NAO_INTERPRETADO'
      mensagem: string
      documentoId: string
      arquivoId: string
      /** Código do erro do parser — estrutura, nunca conteúdo do XML. */
      motivo: CodigoErroInterpretacao
    }
  | {
      indice: number
      nome: string
      /** `ARQUIVO_DUPLICADO`: mesmo arquivo. `DOCUMENTO_DUPLICADO`: mesma NF-e. */
      codigo: (typeof CODIGOS_DUPLICIDADE)[number]
      mensagem: string
      documentoId: string | null
    }
  | { indice: number; nome: string; codigo: CodigoRecusaArquivo; mensagem: string }

export type ResultadoLoteFiscal =
  | {
      sucesso: true
      resumo: {
        total: number
        aceitos: number
        duplicados: number
        /** Guardados, mas sem leitura fiscal: aguardam reprocessamento. */
        naoInterpretados: number
        recusados: number
      }
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
 * ## Identidade da NF-e
 *
 * O documento fiscal é identificado por **escritório + contribuinte + chave de
 * acesso**, e o arquivo por **escritório + contribuinte + SHA-256**. O
 * contribuinte (`clienteId`, ou o próprio escritório quando nulo) faz parte da
 * identidade porque a escrituração é dele: a mesma NF-e é legitimamente a saída
 * do cliente A e a entrada do cliente B dentro do mesmo escritório, e cada um
 * tem a sua revisão, o seu sentido e a sua classificação. Tirar o contribuinte
 * da regra faria o segundo contribuinte perder a nota por ela já existir para o
 * primeiro. Reenviar o mesmo documento para o mesmo contribuinte, por outro
 * lado, nunca cria documento, item, tributo ou parte novos — é duplicidade, e a
 * garantia final são os índices únicos do banco.
 *
 * Isso vale só para o documento principal: eventos da mesma chave
 * (cancelamento, carta de correção, manifestação) moram em
 * `documentos_fiscais_eventos`, ligados a este documento, e nenhum índice daqui
 * os alcança.
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
      duplicados: resultados.filter((r) => (CODIGOS_DUPLICIDADE as readonly string[]).includes(r.codigo)).length,
      naoInterpretados: resultados.filter((r) => r.codigo === 'DOCUMENTO_NAO_INTERPRETADO').length,
      recusados: resultados.filter(
        (r) => !['ACEITO', ...CODIGOS_DUPLICIDADE, 'DOCUMENTO_NAO_INTERPRETADO'].includes(r.codigo),
      ).length,
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

  const duplicado = async (filtro: FiltroDocumento): Promise<ResultadoArquivoFiscal> => {
    const codigo = filtro.sha256 ? 'ARQUIVO_DUPLICADO' : 'DOCUMENTO_DUPLICADO'
    return {
      indice,
      nome,
      codigo,
      mensagem: MENSAGENS_UPLOAD_FISCAL[codigo],
      documentoId: await referenciaSegura(acesso, entrada.clienteId, filtro, entrada.usuarioId),
    }
  }

  // Caminho rápido: nem grava no storage, nem interpreta, o que já existe. Não é
  // a garantia — a garantia são os índices únicos, conferidos de novo na transação.
  const porArquivo: FiltroDocumento = { sha256: validacao.sha256 }
  if (await buscarDocumento(acesso.empresaId, entrada.clienteId, porArquivo)) return duplicado(porArquivo)

  // Interpretação fiscal: pura, em memória, antes de gravar qualquer byte.
  const interpretacao = interpretarNfe(textoDoXmlFiscal(bytes))

  // A mesma NF-e pode voltar em outro arquivo (novo download, outro
  // espaçamento): a chave identifica o documento; o hash, o arquivo. Reenviar o
  // mesmo documento fiscal principal não cria documento, item nem tributo novo.
  const porChave: FiltroDocumento | null = interpretacao.sucesso
    ? { chaveAcesso: interpretacao.documento.identificacao.chaveAcesso }
    : null
  if (porChave && (await buscarDocumento(acesso.empresaId, entrada.clienteId, porChave))) {
    return duplicado(porChave)
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

  // Documento, arquivo, extração, partes, itens, tributos, evento e auditoria
  // numa transação só: ou entra tudo, ou não entra nada.
  try {
    await persistirDocumentoFiscal({
      identificadores: { documentoId, arquivoId },
      interpretacao,
      contexto: {
        // Sempre a empresa autorizada pelo servidor, nunca a pedida pelo navegador.
        empresaId: acesso.empresaId,
        clienteId: entrada.clienteId,
        usuarioId: entrada.usuarioId,
        origem: 'envio_usuario',
        ip: entrada.ip ?? null,
        arquivo: {
          nomeOriginal: validacao.nomeOriginal,
          tipoMime: MIME_XML_FISCAL,
          tamanhoBytes: bytes.byteLength,
          chaveArmazenamento: chave,
          sha256: validacao.sha256,
        },
      },
    })
  } catch (erro) {
    // O registro não existe: o objeto gravado não pode ficar para trás.
    await descartarObjetoNaoRegistrado(chave).catch((falha) => {
      // Órfão sem linha no banco não é acessível por rota nenhuma, mas precisa
      // ser encontrável para limpeza. A chave vai só para o log do servidor.
      console.error('[DOCUMENTOS_FISCAIS_ORFAO]', { chave, nome: falha instanceof Error ? falha.name : 'desconhecido' })
    })
    const jaRegistrado = motivoDeJaRegistrado(erro)
    if (jaRegistrado) return duplicado(jaRegistrado === 'chave' && porChave ? porChave : porArquivo)
    console.error('[DOCUMENTOS_FISCAIS_REGISTRO]', { nome: erro instanceof Error ? erro.name : 'desconhecido' })
    return recusar('FALHA_REGISTRO')
  }

  // XML seguro que o parser ainda não lê: o original fica guardado e o documento
  // nasce `falhou`, para ser reprocessado quando o parser evoluir.
  if (!interpretacao.sucesso) {
    return {
      indice,
      nome,
      codigo: 'DOCUMENTO_NAO_INTERPRETADO',
      mensagem: MENSAGENS_UPLOAD_FISCAL.DOCUMENTO_NAO_INTERPRETADO,
      documentoId,
      arquivoId,
      motivo: interpretacao.codigo,
    }
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

type FiltroDocumento = { sha256?: string; chaveAcesso?: string }

/** Documento da mesma perspectiva (empresa + cliente) pelo arquivo ou pela chave. */
async function buscarDocumento(empresaId: string, clienteId: string | null, filtro: FiltroDocumento) {
  const [documento] = await db
    .select({ id: documentosFiscais.id })
    .from(documentosFiscais)
    .where(
      and(
        eq(documentosFiscais.empresaId, empresaId),
        clienteId ? eq(documentosFiscais.clienteId, clienteId) : isNull(documentosFiscais.clienteId),
        filtro.sha256
          ? eq(documentosFiscais.sha256Original, filtro.sha256)
          : eq(documentosFiscais.chaveAcesso, filtro.chaveAcesso ?? ''),
      ),
    )
    .limit(1)
  return documento ?? null
}

/** O documento existente só é apontado para quem pode vê-lo. */
async function referenciaSegura(
  acesso: AcessoDocumentosFiscais,
  clienteId: string | null,
  filtro: FiltroDocumento,
  usuarioId: string,
) {
  const existente = await buscarDocumento(acesso.empresaId, clienteId, filtro)
  if (!existente) return null
  const pode = await resolverAcessoDocumentoFiscal(
    usuarioId,
    PERMISSOES_DOCUMENTOS_FISCAIS.visualizar,
    existente.id,
  )
  return pode ? existente.id : null
}

/** Qual índice recusou: o do arquivo (SHA-256) ou o da NF-e (chave de acesso). */
function motivoDeJaRegistrado(erro: unknown): 'arquivo' | 'chave' | null {
  const causa =
    (erro as { cause?: { code?: string; constraint_name?: string } })?.cause ??
    (erro as { code?: string; constraint_name?: string })
  if (causa?.code !== '23505') return null
  if (causa.constraint_name === 'documentos_fiscais_chave_unica') return 'chave'
  if (causa.constraint_name === 'documentos_fiscais_origem_unica') return 'arquivo'
  return null
}
