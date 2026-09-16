import {
  AMBIENTES_NFE,
  CODIGOS_ERRO_INTERPRETACAO,
  FINALIDADES_NFE,
  MENSAGENS_ERRO_INTERPRETACAO,
  MODELOS_NFE,
  NAMESPACE_NFE,
  PARSER_FISCAL,
  RAIZES_NFE,
  TIPOS_OPERACAO_NFE,
  VERSOES_NFE_SUPORTADAS,
  type CodigoErroInterpretacao,
} from '../../constants/nfe'
import {
  DocumentoFiscalInterpretadoSchema,
  type DocumentoFiscalInterpretado,
  type ItemInterpretado,
  type ParteInterpretada,
  type ProtocoloInterpretado,
  type TotaisInterpretados,
} from '../../schemas/documento-interpretado'
import { atributoDe, caminho, filho, filhos, lerArvoreXml, textoDe, type NoXml } from './arvore-xml'
import { camposDoGrupo, interpretarTributosDoDocumento, interpretarTributosDoItem } from './tributos-nfe'

/**
 * Interpretação fiscal da NF-e (Fase 1.3).
 *
 * `XML seguro → documento fiscal normalizado`. Função pura: não abre conexão,
 * não grava no banco, não toca no storage, não decide autorização e não registra
 * auditoria. Quem chama já validou a entrada pela barreira da Fase 1.2
 * (`validar-xml-fiscal`) — esta camada **não** a substitui nem a repete.
 *
 * ## O que ela não faz
 *
 * Não calcula imposto, não conclui situação fiscal e não consulta a SEFAZ. Um
 * protocolo dentro do XML é lido como o que é — um registro que veio no arquivo
 * —, e nada além disso é afirmado sobre a nota.
 *
 * ## Evolução do leiaute
 *
 * A versão é lida uma vez, conferida contra `VERSOES_NFE_SUPORTADAS` e devolvida
 * no resultado; versão fora da lista para aqui, com erro próprio, em vez de ser
 * lida como se fosse 4.00. Campos novos de um leiaute futuro caem em
 * `dadosEspecificos`/`totais.grupos` e não se perdem enquanto não têm coluna.
 *
 * ## Original intocado
 *
 * O XML entra como texto e só é lido. O arquivo guardado na Fase 1.2 continua
 * imutável, e reinterpretar o mesmo original com uma versão futura do parser
 * continua possível — é o que sustenta reprocessamento e auditoria.
 */

export type ErroInterpretacao = {
  sucesso: false
  codigo: CodigoErroInterpretacao
  mensagem: string
  /** Caminho estrutural do problema (`infNFe/ide/nNF`). Nunca conteúdo do XML. */
  caminho: string | null
  /** Versão encontrada, quando o leiaute não é suportado. */
  versaoEncontrada: string | null
}

export type ResultadoInterpretacao =
  | { sucesso: true; documento: DocumentoFiscalInterpretado }
  | ErroInterpretacao

export { CODIGOS_ERRO_INTERPRETACAO }

const erro = (
  codigo: CodigoErroInterpretacao,
  caminho: string | null = null,
  versaoEncontrada: string | null = null,
): ErroInterpretacao => ({
  sucesso: false,
  codigo,
  mensagem: MENSAGENS_ERRO_INTERPRETACAO[codigo],
  caminho,
  versaoEncontrada,
})

/** Campos do grupo que nenhum campo nomeado consumiu. */
function sobraDoGrupo(no: NoXml | null, consumidos: readonly string[]): Record<string, string> | null {
  const campos = camposDoGrupo(no)
  for (const chave of consumidos) delete campos[chave]
  return Object.keys(campos).length > 0 ? campos : null
}

const CAMPOS_ENDERECO = ['xLgr', 'nro', 'xCpl', 'xBairro', 'cMun', 'xMun', 'UF', 'CEP', 'cPais', 'xPais', 'fone']

function montarParte(
  no: NoXml,
  papel: ParteInterpretada['papel'],
  grupoEndereco: string,
): ParteInterpretada {
  const endereco = filho(no, grupoEndereco)
  const cnpj = textoDe(no, 'CNPJ')
  const cpf = textoDe(no, 'CPF')
  const estrangeiro = textoDe(no, 'idEstrangeiro')
  const identificacao = cnpj ?? cpf ?? estrangeiro
  const tipoIdentificacao = cnpj ? 'cnpj' : cpf ? 'cpf' : estrangeiro ? 'estrangeiro' : null

  const consumidos = [
    'CNPJ',
    'CPF',
    'idEstrangeiro',
    'xNome',
    'xFant',
    'IE',
    'IM',
    'CRT',
    'email',
    ...CAMPOS_ENDERECO.map((campo) => `${grupoEndereco}.${campo}`),
  ]

  return {
    papel,
    tipoIdentificacao,
    identificacao,
    nome: textoDe(no, 'xNome'),
    nomeFantasia: textoDe(no, 'xFant'),
    inscricaoEstadual: textoDe(no, 'IE'),
    inscricaoMunicipal: textoDe(no, 'IM'),
    regimeTributario: textoDe(no, 'CRT'),
    logradouro: textoDe(endereco, 'xLgr'),
    numero: textoDe(endereco, 'nro'),
    complemento: textoDe(endereco, 'xCpl'),
    bairro: textoDe(endereco, 'xBairro'),
    codigoMunicipio: textoDe(endereco, 'cMun'),
    municipio: textoDe(endereco, 'xMun'),
    uf: textoDe(endereco, 'UF'),
    cep: textoDe(endereco, 'CEP'),
    codigoPais: textoDe(endereco, 'cPais'),
    pais: textoDe(endereco, 'xPais'),
    telefone: textoDe(endereco, 'fone'),
    email: textoDe(no, 'email'),
    dadosEspecificos: sobraDoGrupo(no, consumidos),
  }
}

const CAMPOS_PRODUTO = [
  'cProd', 'cEAN', 'xProd', 'NCM', 'CEST', 'CFOP', 'uCom', 'qCom', 'vUnCom', 'vProd',
  'cEANTrib', 'uTrib', 'qTrib', 'vUnTrib', 'vFrete', 'vSeg', 'vDesc', 'vOutro', 'indTot',
]

function montarItem(det: NoXml, numeroItem: number): ItemInterpretado {
  const prod = filho(det, 'prod')
  const indicador = textoDe(prod, 'indTot')
  const extras = { ...(sobraDoGrupo(prod, CAMPOS_PRODUTO) ?? {}) }
  for (const [chave, valor] of Object.entries(camposDoGrupo(det))) {
    if (!chave.startsWith('prod.') && !chave.startsWith('imposto.')) extras[chave] = valor
  }

  return {
    numeroItem,
    codigoProduto: textoDe(prod, 'cProd'),
    descricao: textoDe(prod, 'xProd'),
    gtin: textoDe(prod, 'cEAN'),
    ncm: textoDe(prod, 'NCM'),
    cest: textoDe(prod, 'CEST'),
    cfop: textoDe(prod, 'CFOP'),
    unidade: textoDe(prod, 'uCom'),
    quantidade: textoDe(prod, 'qCom'),
    valorUnitario: textoDe(prod, 'vUnCom'),
    valorBruto: textoDe(prod, 'vProd'),
    valorDesconto: textoDe(prod, 'vDesc'),
    valorFrete: textoDe(prod, 'vFrete'),
    valorSeguro: textoDe(prod, 'vSeg'),
    valorOutrasDespesas: textoDe(prod, 'vOutro'),
    gtinTributavel: textoDe(prod, 'cEANTrib'),
    unidadeTributavel: textoDe(prod, 'uTrib'),
    quantidadeTributavel: textoDe(prod, 'qTrib'),
    valorUnitarioTributavel: textoDe(prod, 'vUnTrib'),
    indicadorComposicaoTotal: indicador === null ? null : indicador === '1',
    tributos: interpretarTributosDoItem(filho(det, 'imposto')),
    dadosEspecificos: Object.keys(extras).length > 0 ? extras : null,
  }
}

function montarTotais(total: NoXml | null): TotaisInterpretados {
  const icmsTot = filho(total, 'ICMSTot')
  const issqnTot = filho(total, 'ISSQNtot')
  return {
    valorTotal: textoDe(icmsTot, 'vNF'),
    valorProdutos: textoDe(icmsTot, 'vProd'),
    valorServicos: textoDe(issqnTot, 'vServ'),
    valorFrete: textoDe(icmsTot, 'vFrete'),
    valorSeguro: textoDe(icmsTot, 'vSeg'),
    valorDesconto: textoDe(icmsTot, 'vDesc'),
    valorOutrasDespesas: textoDe(icmsTot, 'vOutro'),
    // Todo grupo de totais, inteiro: `ICMSTot` é um deles, não o modelo.
    grupos: (total?.filhos ?? []).map((grupo) => ({ nome: grupo.nome, campos: camposDoGrupo(grupo) })),
  }
}

function montarProtocolo(infProt: NoXml): ProtocoloInterpretado {
  return {
    numero: textoDe(infProt, 'nProt'),
    chaveAcesso: textoDe(infProt, 'chNFe'),
    recebidoEm: textoDe(infProt, 'dhRecbto'),
    digestValue: textoDe(infProt, 'digVal'),
    codigoStatus: textoDe(infProt, 'cStat'),
    motivo: textoDe(infProt, 'xMotivo'),
    ambiente: AMBIENTES_NFE[textoDe(infProt, 'tpAmb') ?? ''] ?? null,
    versaoAplicacao: textoDe(infProt, 'verAplic'),
  }
}

const CAMPOS_IDE = ['natOp', 'mod', 'serie', 'nNF', 'dhEmi', 'tpNF', 'finNFe', 'tpAmb']

export function interpretarNfe(xml: string): ResultadoInterpretacao {
  try {
    return interpretar(xml)
  } catch {
    // Nenhum detalhe técnico vaza: sem stack, sem trecho do XML.
    return erro('FALHA_INTERPRETACAO')
  }
}

function interpretar(xml: string): ResultadoInterpretacao {
  const raiz = lerArvoreXml(xml)
  if (!raiz) return erro('XML_ILEGIVEL')

  const ehRaizNfe = (RAIZES_NFE as readonly string[]).includes(raiz.nome)
  if (!ehRaizNfe || raiz.namespace !== NAMESPACE_NFE) return erro('DOCUMENTO_NAO_RECONHECIDO')
  const raizNfe = raiz.nome as (typeof RAIZES_NFE)[number]

  // `nfeProc` embrulha a nota e o protocolo; `NFe` é a nota direta.
  const nfe = raizNfe === 'nfeProc' ? filho(raiz, 'NFe') : raiz
  if (!nfe) return erro('ESTRUTURA_ESSENCIAL_AUSENTE', 'nfeProc/NFe')

  const infNFe = filho(nfe, 'infNFe')
  if (!infNFe) return erro('ESTRUTURA_ESSENCIAL_AUSENTE', 'NFe/infNFe')

  const versao = atributoDe(infNFe, 'versao')
  if (!versao) return erro('ESTRUTURA_ESSENCIAL_AUSENTE', 'infNFe@versao')
  if (!(VERSOES_NFE_SUPORTADAS as readonly string[]).includes(versao)) {
    return erro('LAYOUT_NAO_SUPORTADO', 'infNFe@versao', versao)
  }

  // A chave vem do documento, nunca do nome do arquivo.
  const id = atributoDe(infNFe, 'Id')
  if (!id) return erro('ESTRUTURA_ESSENCIAL_AUSENTE', 'infNFe@Id')
  const chave = /^NFe([0-9A-Z]{44})$/.exec(id)?.[1]
  if (!chave) return erro('ESTRUTURA_INCONSISTENTE', 'infNFe@Id')

  const ide = filho(infNFe, 'ide')
  if (!ide) return erro('ESTRUTURA_ESSENCIAL_AUSENTE', 'infNFe/ide')
  const emit = filho(infNFe, 'emit')
  if (!emit) return erro('ESTRUTURA_ESSENCIAL_AUSENTE', 'infNFe/emit')

  const infProt = caminho(raiz, 'protNFe', 'infProt')
  const protocolo = infProt ? montarProtocolo(infProt) : null
  if (protocolo?.chaveAcesso && protocolo.chaveAcesso !== chave) {
    return erro('ESTRUTURA_INCONSISTENTE', 'protNFe/infProt/chNFe')
  }

  const itens: ItemInterpretado[] = []
  for (const [posicao, det] of filhos(infNFe, 'det').entries()) {
    const numero = Number(atributoDe(det, 'nItem') ?? posicao + 1)
    if (!Number.isInteger(numero) || numero < 1) return erro('ESTRUTURA_INCONSISTENTE', 'det@nItem')
    itens.push(montarItem(det, numero))
  }

  const dhEmi = textoDe(ide, 'dhEmi')
  const modelo = textoDe(ide, 'mod')
  const total = filho(infNFe, 'total')

  const documento: DocumentoFiscalInterpretado = {
    origem: {
      raiz: raizNfe,
      namespace: NAMESPACE_NFE,
      versaoLeiaute: versao,
      tipo: MODELOS_NFE[modelo ?? ''] ?? 'outro',
      parser: { provedor: PARSER_FISCAL.provedor, versao: PARSER_FISCAL.versao },
    },
    identificacao: {
      chaveAcesso: chave,
      modelo,
      serie: textoDe(ide, 'serie'),
      numero: textoDe(ide, 'nNF'),
      naturezaOperacao: textoDe(ide, 'natOp'),
      emitidoEm: dhEmi,
      dataEmissao: /^\d{4}-\d{2}-\d{2}/.test(dhEmi ?? '') ? dhEmi!.slice(0, 10) : null,
      codigoTipoOperacao: textoDe(ide, 'tpNF'),
      tipoOperacao: TIPOS_OPERACAO_NFE[textoDe(ide, 'tpNF') ?? ''] ?? null,
      codigoFinalidade: textoDe(ide, 'finNFe'),
      finalidade: FINALIDADES_NFE[textoDe(ide, 'finNFe') ?? ''] ?? null,
      codigoAmbiente: textoDe(ide, 'tpAmb'),
      ambiente: AMBIENTES_NFE[textoDe(ide, 'tpAmb') ?? ''] ?? null,
      dadosEspecificos: sobraDoGrupo(ide, CAMPOS_IDE),
    },
    emitente: montarParte(emit, 'emitente', 'enderEmit'),
    destinatario: (() => {
      const dest = filho(infNFe, 'dest')
      return dest ? montarParte(dest, 'destinatario', 'enderDest') : null
    })(),
    itens,
    totais: montarTotais(total),
    tributos: interpretarTributosDoDocumento(total),
    protocolo,
  }

  const conferido = DocumentoFiscalInterpretadoSchema.safeParse(documento)
  if (!conferido.success) {
    return erro('CONTRATO_INVALIDO', conferido.error.issues[0]?.path.join('/') || null)
  }
  return { sucesso: true, documento: conferido.data }
}
