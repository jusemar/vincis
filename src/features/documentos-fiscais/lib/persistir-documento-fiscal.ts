import { randomUUID } from 'node:crypto'
import { db } from '@/db/connection'
import {
  documentosFiscais,
  documentosFiscaisArquivos,
  documentosFiscaisEventos,
  documentosFiscaisExtracoes,
  documentosFiscaisItens,
  documentosFiscaisPartes,
  documentosFiscaisTributos,
} from '@/db/schema'
import { ACOES_AUDITORIA, registrarEventoAuditoria } from '@/features/auditoria/lib/registrar-evento'
import { PARSER_FISCAL } from '../constants/nfe'
import type {
  OrigemDocumentoFiscal,
  SentidoDocumentoFiscal,
  TipoEventoFiscal,
} from '../constants/dominio'
import type {
  DocumentoFiscalInterpretado,
  ItemInterpretado,
  ParteInterpretada,
  TributoInterpretado,
} from '../schemas/documento-interpretado'
import type { ResultadoInterpretacao } from './parser-fiscal/interpretar-nfe'
import { ENTIDADES_AUDITORIA_FISCAL, metadadosAuditoriaFiscal } from './auditoria'
import { resolverContribuinteFiscal } from './contribuinte-fiscal'
import {
  classificarIdentificacaoFiscal,
  determinarSentidoFiscal,
  normalizarIdentificacaoFiscal,
} from './identidade-fiscal'

/**
 * Persistência do documento fiscal interpretado (Fase 1.4).
 *
 * Fecha o caminho `upload → barreira de segurança → parser → banco`. O parser
 * continua puro: ele não conhece Drizzle, conexão nem tabela — é esta camada que
 * traduz `DocumentoFiscalInterpretado` para o modelo já existente desde a
 * fundação, sem recriar estrutura nenhuma.
 *
 * ## Tudo ou nada
 *
 * Documento, arquivo, extração, partes, itens, tributos, evento do protocolo e
 * auditoria entram **na mesma transação**. Qualquer falha desfaz o conjunto: não
 * existe documento sem item, item sem documento, tributo pela metade nem
 * auditoria de um processamento que não aconteceu.
 *
 * O armazenamento privado é a única peça fora da transação — object storage não
 * participa do PostgreSQL. Por isso a ordem é: gravar o objeto, depois a
 * transação; se a transação falhar, quem chamou descarta o objeto recém-gravado
 * (`receber-xml-fiscal`). O original em si nunca é alterado: interpretar e
 * persistir só leem.
 *
 * ## Interpretação que falha não some
 *
 * XML que passou pela barreira mas o parser recusou (leiaute não suportado,
 * estrutura essencial ausente) continua sendo gravado: documento com
 * `status_processamento = 'falhou'`, o arquivo original e uma extração `falhou`
 * com o código do erro. É o que permite reprocessar o mesmo original quando o
 * parser evoluir — sem nenhum dado fiscal inventado no cabeçalho.
 *
 * ## O que o banco registra é o que o XML declarou
 *
 * Tributos, totais e protocolo são o que veio no arquivo. Nada aqui calcula
 * imposto nem conclui situação na SEFAZ: `situacao` continua `nao_verificada`
 * mesmo com protocolo de autorização dentro do XML, porque conferir isso exige
 * consulta externa, que não existe nesta fase.
 */

export type ContextoPersistenciaFiscal = {
  /** Empresa **já autorizada** pelo servidor — nunca a informada pelo navegador. */
  empresaId: string
  clienteId: string | null
  usuarioId: string
  origem: OrigemDocumentoFiscal
  ip?: string | null
  /** O arquivo original, já gravado no armazenamento privado. */
  arquivo: {
    nomeOriginal: string
    tipoMime: string
    tamanhoBytes: number
    chaveArmazenamento: string
    sha256: string
  }
}

export type DocumentoFiscalPersistido = {
  documentoId: string
  arquivoId: string
  extracaoId: string
  /** `false` quando o parser recusou e o documento ficou como `falhou`. */
  interpretado: boolean
}

/** `cStat` do protocolo → tipo de evento da Vincis. */
const EVENTOS_POR_STATUS: Record<string, TipoEventoFiscal> = {
  '100': 'autorizacao',
  '150': 'autorizacao',
  '110': 'denegacao',
  '301': 'denegacao',
  '302': 'denegacao',
  '303': 'denegacao',
}

const soDados = (dados: Record<string, string> | null | undefined) =>
  dados && Object.keys(dados).length > 0 ? dados : null

/**
 * Identificação gravada da parte: normalizada (sem máscara, em caixa alta) e com
 * o tipo que o formato sustenta.
 *
 * O leiaute não prevê máscara, mas emissor mal-comportado manda. Normalizar aqui
 * — com a mesma função que compara identidades — evita que um CNPJ pontuado
 * derrube a importação inteira no `check` da tabela, e mantém a busca por
 * contribuinte previsível. Quando a normalização muda o texto, o valor como
 * veio fica em `dados_especificos`: nada do documento se perde.
 */
function identificacaoDaParte(parte: ParteInterpretada) {
  const identificacao = normalizarIdentificacaoFiscal(parte.identificacao)
  if (!identificacao) return { tipoIdentificacao: null, identificacao: null, original: null }
  return {
    tipoIdentificacao: classificarIdentificacaoFiscal(identificacao),
    identificacao,
    original: identificacao === parte.identificacao ? null : parte.identificacao,
  }
}

function linhaDeParte(parte: ParteInterpretada, extracaoId: string) {
  const identidade = identificacaoDaParte(parte)
  return {
    extracaoId,
    papel: parte.papel,
    sequencia: 1,
    tipoIdentificacao: identidade.tipoIdentificacao,
    identificacao: identidade.identificacao,
    nome: parte.nome,
    nomeFantasia: parte.nomeFantasia,
    inscricaoEstadual: parte.inscricaoEstadual,
    inscricaoMunicipal: parte.inscricaoMunicipal,
    regimeTributario: parte.regimeTributario,
    logradouro: parte.logradouro,
    numero: parte.numero,
    complemento: parte.complemento,
    bairro: parte.bairro,
    codigoMunicipio: parte.codigoMunicipio,
    municipio: parte.municipio,
    uf: parte.uf,
    cep: parte.cep,
    codigoPais: parte.codigoPais,
    pais: parte.pais,
    telefone: parte.telefone,
    email: parte.email,
    dadosEspecificos: soDados({
      ...(parte.dadosEspecificos ?? {}),
      ...(identidade.original ? { identificacaoComoRecebida: identidade.original } : {}),
    }),
  }
}

/**
 * O que o leiaute traz e ainda não tem coluna própria fica em
 * `dados_especificos` — inclusive a unidade tributável e o `indTot`.
 */
function dadosEspecificosDoItem(item: ItemInterpretado) {
  const dados: Record<string, string> = { ...(item.dadosEspecificos ?? {}) }
  const complementos: Record<string, string | null> = {
    cEANTrib: item.gtinTributavel,
    uTrib: item.unidadeTributavel,
    qTrib: item.quantidadeTributavel,
    vUnTrib: item.valorUnitarioTributavel,
    indTot: item.indicadorComposicaoTotal === null ? null : item.indicadorComposicaoTotal ? '1' : '0',
  }
  for (const [chave, valor] of Object.entries(complementos)) if (valor !== null) dados[chave] = valor
  return soDados(dados)
}

function linhaDeItem(item: ItemInterpretado, extracaoId: string) {
  return {
    id: randomUUID(),
    extracaoId,
    numeroItem: item.numeroItem,
    codigoProduto: item.codigoProduto,
    descricao: item.descricao,
    gtin: item.gtin,
    ncm: item.ncm,
    cest: item.cest,
    cfop: item.cfop,
    unidade: item.unidade,
    // Decimais seguem como texto do começo ao fim: `numeric` no banco, string no
    // Drizzle, string no contrato. Nenhum valor passa por `number`.
    quantidade: item.quantidade,
    valorUnitario: item.valorUnitario,
    valorBruto: item.valorBruto,
    valorDesconto: item.valorDesconto,
    valorFrete: item.valorFrete,
    valorSeguro: item.valorSeguro,
    valorOutrasDespesas: item.valorOutrasDespesas,
    dadosEspecificos: dadosEspecificosDoItem(item),
  }
}

function linhaDeTributo(tributo: TributoInterpretado, extracaoId: string, itemId: string | null) {
  const dados = { ...(tributo.dadosEspecificos ?? {}) }
  if (tributo.grupo) dados.grupo = tributo.grupo
  return {
    extracaoId,
    itemId,
    tributo: tributo.tributo,
    retido: tributo.retido,
    codigoSituacao: tributo.codigoSituacao,
    classificacaoTributaria: tributo.classificacaoTributaria,
    baseCalculo: tributo.baseCalculo,
    aliquotaPercentual: tributo.aliquotaPercentual,
    valor: tributo.valor,
    dadosEspecificos: soDados(dados),
  }
}

/** A transação do Drizzle, como o `db.transaction` a entrega. */
export type TransacaoFiscal = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Cabeçalho vigente do documento, a partir da leitura. */
export function cabecalhoDoDocumento(
  documento: DocumentoFiscalInterpretado,
  sentido: SentidoDocumentoFiscal,
) {
  const { identificacao, totais, emitente, destinatario } = documento
  return {
    tipo: documento.origem.tipo,
    // Emitida ou recebida pelo contribuinte — decidido pela identidade fiscal,
    // nunca por CFOP ou por semelhança de nome.
    sentido,
    chaveAcesso: identificacao.chaveAcesso,
    modelo: identificacao.modelo,
    serie: identificacao.serie,
    numero: identificacao.numero,
    versaoLeiaute: documento.origem.versaoLeiaute,
    emitidoEm: identificacao.emitidoEm ? new Date(identificacao.emitidoEm) : null,
    // O dia continua o do emitente: converter fuso poderia mudar a competência.
    dataEmissao: identificacao.dataEmissao,
    emitenteIdentificacao: identificacaoDaParte(emitente).identificacao,
    emitenteNome: emitente.nome,
    destinatarioIdentificacao: destinatario ? identificacaoDaParte(destinatario).identificacao : null,
    destinatarioNome: destinatario?.nome ?? null,
    valorTotal: totais.valorTotal,
    valorProdutos: totais.valorProdutos,
    valorServicos: totais.valorServicos,
    valorDesconto: totais.valorDesconto,
    valorFrete: totais.valorFrete,
    valorSeguro: totais.valorSeguro,
    valorOutrasDespesas: totais.valorOutrasDespesas,
  }
}


/**
 * Grava uma leitura do documento: a extração e, quando ela deu certo, partes,
 * itens, tributos e o evento do protocolo.
 *
 * Usada tanto na importação quanto no reprocessamento — por isso recebe a
 * transação de quem chama: a atomicidade é sempre do fluxo inteiro, nunca
 * daqui. Partes, itens e tributos pertencem à extração, então uma leitura nova
 * traz linhas novas e **não** soma às da leitura anterior.
 */
export async function gravarExtracaoInterpretada(
  tx: TransacaoFiscal,
  entrada: {
    documentoId: string
    arquivoId: string
    interpretacao: ResultadoInterpretacao
    origem: OrigemDocumentoFiscal
    usuarioId: string | null
    extracaoId?: string
  },
): Promise<string> {
  const { interpretacao } = entrada
  const extracaoId = entrada.extracaoId ?? randomUUID()
  const agora = new Date()

  await tx.insert(documentosFiscaisExtracoes).values({
    id: extracaoId,
    documentoFiscalId: entrada.documentoId,
    arquivoId: entrada.arquivoId,
    metodo: 'parser_xml',
    provedor: PARSER_FISCAL.provedor,
    versao: PARSER_FISCAL.versao,
    status: interpretacao.sucesso ? 'concluida' : 'falhou',
    // Só leitura concluída alimenta o cabeçalho do documento.
    vigente: interpretacao.sucesso,
    // Proveniência, não cópia: contagens e versão, nunca o XML.
    dados: interpretacao.sucesso ? resumoDaExtracao(interpretacao.documento) : null,
    erros: interpretacao.sucesso
      ? null
      : {
          codigo: interpretacao.codigo,
          caminho: interpretacao.caminho,
          versaoEncontrada: interpretacao.versaoEncontrada,
        },
    criadaPorId: entrada.usuarioId,
    finalizadaEm: agora,
  })

  if (!interpretacao.sucesso) return extracaoId

  const documento = interpretacao.documento
  const partes = [documento.emitente, ...(documento.destinatario ? [documento.destinatario] : [])]
  await tx.insert(documentosFiscaisPartes).values(partes.map((parte) => linhaDeParte(parte, extracaoId)))

  const linhasDeItens = documento.itens.map((item) => linhaDeItem(item, extracaoId))
  if (linhasDeItens.length > 0) await tx.insert(documentosFiscaisItens).values(linhasDeItens)

  const tributos = [
    ...documento.tributos.map((tributo) => linhaDeTributo(tributo, extracaoId, null)),
    ...documento.itens.flatMap((item, indice) =>
      item.tributos.map((tributo) => linhaDeTributo(tributo, extracaoId, linhasDeItens[indice].id)),
    ),
  ]
  if (tributos.length > 0) await tx.insert(documentosFiscaisTributos).values(tributos)

  // O protocolo é o que o arquivo declara — não uma consulta à SEFAZ. O evento
  // é do documento, não da extração: reler o mesmo XML não o duplica, e o
  // índice único da tabela é quem garante isso.
  const protocolo = documento.protocolo
  if (protocolo?.numero) {
    await tx
      .insert(documentosFiscaisEventos)
      .values({
        documentoFiscalId: entrada.documentoId,
        tipo: EVENTOS_POR_STATUS[protocolo.codigoStatus ?? ''] ?? 'outro',
        sequencia: 1,
        protocolo: protocolo.numero,
        ocorridoEm: protocolo.recebidoEm ? new Date(protocolo.recebidoEm) : null,
        origem: entrada.origem,
        registradoPorId: entrada.usuarioId,
        dadosEspecificos: {
          codigoStatus: protocolo.codigoStatus,
          motivo: protocolo.motivo,
          digestValue: protocolo.digestValue,
          ambiente: protocolo.ambiente,
          versaoAplicacao: protocolo.versaoAplicacao,
        },
      })
      .onConflictDoNothing()
  }

  return extracaoId
}

/**
 * Grava o documento inteiro numa transação.
 *
 * Lança quando o banco recusa — inclusive na violação de chave/hash já
 * existente, que quem chama traduz em "documento já importado".
 */
export async function persistirDocumentoFiscal(entrada: {
  contexto: ContextoPersistenciaFiscal
  interpretacao: ResultadoInterpretacao
  /** Ids já escolhidos por quem gravou o objeto — a chave do storage os contém. */
  identificadores?: { documentoId: string; arquivoId: string }
}): Promise<DocumentoFiscalPersistido> {
  const { contexto, interpretacao } = entrada
  const documentoId = entrada.identificadores?.documentoId ?? randomUUID()
  const arquivoId = entrada.identificadores?.arquivoId ?? randomUUID()
  const extracaoId = randomUUID()
  const agora = new Date()
  const interpretado = interpretacao.sucesso

  // Cadastro do contribuinte (cliente atendido ou o próprio escritório): é ele
  // que diz se a nota foi emitida ou recebida.
  const contribuinte = interpretacao.sucesso
    ? await resolverContribuinteFiscal(contexto.empresaId, contexto.clienteId)
    : null
  const sentido = interpretacao.sucesso
    ? determinarSentidoFiscal(interpretacao.documento, contribuinte)
    : null

  await db.transaction(async (tx) => {
    await tx.insert(documentosFiscais).values({
      id: documentoId,
      empresaId: contexto.empresaId,
      clienteId: contexto.clienteId,
      enviadoPorId: contexto.usuarioId,
      origem: contexto.origem,
      sha256Original: contexto.arquivo.sha256,
      statusProcessamento: interpretado ? 'processado' : 'falhou',
      processadoEm: interpretado ? agora : null,
      // Revisão humana continua pendente: interpretar não é conferir.
      statusRevisao: 'pendente',
      // Sem consulta à autoridade fiscal, nada é afirmado sobre a situação.
      situacao: 'nao_verificada',
      ...(interpretacao.sucesso ? cabecalhoDoDocumento(interpretacao.documento, sentido ?? 'nao_determinado') : {}),
    })

    await tx.insert(documentosFiscaisArquivos).values({
      id: arquivoId,
      empresaId: contexto.empresaId,
      documentoFiscalId: documentoId,
      tipoArquivo: 'xml',
      nomeOriginal: contexto.arquivo.nomeOriginal,
      tipoMime: contexto.arquivo.tipoMime,
      tamanhoBytes: contexto.arquivo.tamanhoBytes,
      chaveArmazenamento: contexto.arquivo.chaveArmazenamento,
      sha256: contexto.arquivo.sha256,
      enviadoPorId: contexto.usuarioId,
    })

    await gravarExtracaoInterpretada(tx, {
      documentoId,
      arquivoId,
      extracaoId,
      interpretacao,
      origem: contexto.origem,
      usuarioId: contexto.usuarioId,
    })

    const metadadosComuns = {
      origem: contexto.origem,
      clienteId: contexto.clienteId,
      arquivoId,
      tipoArquivo: 'xml' as const,
      tamanhoBytes: contexto.arquivo.tamanhoBytes,
    }

    await registrarEventoAuditoria(
      {
        acao: ACOES_AUDITORIA.documentoFiscalEnviado,
        entidade: ENTIDADES_AUDITORIA_FISCAL.documento,
        registroAfetado: documentoId,
        autorId: contexto.usuarioId,
        empresaId: contexto.empresaId,
        origem: 'admin',
        ip: contexto.ip ?? null,
        metadados: metadadosAuditoriaFiscal({
          ...metadadosComuns,
          statusNovo: interpretado ? 'processado' : 'falhou',
        }),
      },
      tx,
    )

    // Processamento só é auditado dentro da transação que o concluiu: se algo
    // acima falhar, não sobra registro dizendo que foi processado.
    if (interpretacao.sucesso) {
      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.documentoFiscalProcessado,
          entidade: ENTIDADES_AUDITORIA_FISCAL.extracao,
          registroAfetado: documentoId,
          autorId: contexto.usuarioId,
          empresaId: contexto.empresaId,
          origem: 'admin',
          ip: contexto.ip ?? null,
          metadados: metadadosAuditoriaFiscal({
            tipoDocumento: interpretacao.documento.origem.tipo,
            metodoExtracao: 'parser_xml',
            provedor: PARSER_FISCAL.provedor,
            versao: PARSER_FISCAL.versao,
            extracaoId,
            clienteId: contexto.clienteId,
            statusAnterior: 'pendente',
            statusNovo: 'processado',
          }),
        },
        tx,
      )
    }
  })

  return { documentoId, arquivoId, extracaoId, interpretado }
}

/** Proveniência da leitura: o suficiente para explicar o que foi lido. */
function resumoDaExtracao(documento: DocumentoFiscalInterpretado) {
  return {
    raiz: documento.origem.raiz,
    versaoLeiaute: documento.origem.versaoLeiaute,
    tipo: documento.origem.tipo,
    itens: documento.itens.length,
    tributos: documento.tributos.length + documento.itens.reduce((soma, item) => soma + item.tributos.length, 0),
    partes: documento.destinatario ? 2 : 1,
    protocolo: Boolean(documento.protocolo?.numero),
  }
}
