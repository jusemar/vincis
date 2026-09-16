import { z } from 'zod'
import {
  FORMATO_CODIGO_TRIBUTO,
  PAPEIS_PARTE_FISCAL,
  TIPOS_DOCUMENTO_FISCAL,
  TIPOS_IDENTIFICACAO_PARTE,
} from '../constants/dominio'
import { RAIZES_NFE } from '../constants/nfe'

/**
 * Contrato fiscal interno da Vincis — o que o resto da aplicação enxerga de um
 * documento interpretado.
 *
 * ## Por que existe
 *
 * A árvore crua da biblioteca de XML nunca sai do parser. Quem consome depende
 * deste contrato, então trocar a biblioteca, corrigir a leitura ou passar a ler
 * outro leiaute não reescreve o resto do sistema.
 *
 * ## Dinheiro é texto
 *
 * Todo valor monetário, quantidade e alíquota viaja como **string decimal**,
 * exatamente como está no documento. `number` do JavaScript perderia centavos
 * em silêncio, e as colunas fiscais do banco são `numeric` — que o Drizzle lê e
 * grava como string. Nada aqui é somado, arredondado ou convertido: o parser lê,
 * não calcula.
 *
 * ## O que não cabe em coluna não se perde
 *
 * Cada grupo tem os campos consultáveis nomeados (os mesmos das tabelas
 * `documentos_fiscais_*`) e um `dadosEspecificos` com o que sobrou do grupo, por
 * nome local do leiaute. É assim que rastreabilidade, medicamento, combustível e
 * os grupos que a Reforma Tributária trouxer continuam disponíveis sem virar um
 * JSON genérico no lugar dos campos principais.
 */

/** Decimal como o leiaute escreve: sem sinal, sem separador de milhar. */
const DECIMAL = /^\d+(\.\d{1,10})?$/
const Decimal = z.string().regex(DECIMAL, 'valor decimal inválido')
const TextoOpcional = z.string().min(1).nullable()
const DecimalOpcional = Decimal.nullable()

/** Campos do grupo que ainda não têm coluna própria, por nome local. */
const DadosEspecificos = z.record(z.string(), z.string()).nullable()

export const TributoInterpretadoSchema = z.object({
  /** Código do tributo (`icms`, `pis`, `ibs`…). Aberto por decisão da fundação. */
  tributo: z.string().regex(FORMATO_CODIGO_TRIBUTO),
  retido: z.boolean(),
  /** CST ou CSOSN, como informado. */
  codigoSituacao: TextoOpcional,
  /** `cClassTrib` e sucessores — classificação tributária da Reforma. */
  classificacaoTributaria: TextoOpcional,
  baseCalculo: DecimalOpcional,
  /** Em pontos percentuais: `18.0000` é 18%. */
  aliquotaPercentual: DecimalOpcional,
  valor: DecimalOpcional,
  /** Nome do grupo do leiaute de onde veio (`ICMS00`, `PISAliq`, `retTrib`…). */
  grupo: TextoOpcional,
  dadosEspecificos: DadosEspecificos,
})

export const ParteInterpretadaSchema = z.object({
  papel: z.enum(PAPEIS_PARTE_FISCAL),
  tipoIdentificacao: z.enum(TIPOS_IDENTIFICACAO_PARTE).nullable(),
  /**
   * CNPJ, CPF ou identificador estrangeiro, sem máscara e como apresentado.
   * O CNPJ alfanumérico entra por aqui sem mudança: o parser não impõe
   * "14 dígitos" — validação fiscal é versionável e vive fora da leitura.
   */
  identificacao: TextoOpcional,
  nome: TextoOpcional,
  nomeFantasia: TextoOpcional,
  inscricaoEstadual: TextoOpcional,
  inscricaoMunicipal: TextoOpcional,
  /** CRT do emitente, como informado. */
  regimeTributario: TextoOpcional,
  logradouro: TextoOpcional,
  numero: TextoOpcional,
  complemento: TextoOpcional,
  bairro: TextoOpcional,
  codigoMunicipio: TextoOpcional,
  municipio: TextoOpcional,
  uf: TextoOpcional,
  cep: TextoOpcional,
  codigoPais: TextoOpcional,
  pais: TextoOpcional,
  telefone: TextoOpcional,
  email: TextoOpcional,
  dadosEspecificos: DadosEspecificos,
})

export const ItemInterpretadoSchema = z.object({
  numeroItem: z.number().int().min(1),
  codigoProduto: TextoOpcional,
  descricao: TextoOpcional,
  gtin: TextoOpcional,
  ncm: TextoOpcional,
  cest: TextoOpcional,
  cfop: TextoOpcional,
  unidade: TextoOpcional,
  quantidade: DecimalOpcional,
  valorUnitario: DecimalOpcional,
  /** `vProd`: valor bruto do produto, antes de desconto e acréscimos. */
  valorBruto: DecimalOpcional,
  valorDesconto: DecimalOpcional,
  valorFrete: DecimalOpcional,
  valorSeguro: DecimalOpcional,
  valorOutrasDespesas: DecimalOpcional,
  gtinTributavel: TextoOpcional,
  unidadeTributavel: TextoOpcional,
  quantidadeTributavel: DecimalOpcional,
  valorUnitarioTributavel: DecimalOpcional,
  /** `indTot`: se o valor do item compõe o total da nota. */
  indicadorComposicaoTotal: z.boolean().nullable(),
  tributos: z.array(TributoInterpretadoSchema),
  dadosEspecificos: DadosEspecificos,
})

export const TotaisInterpretadosSchema = z.object({
  /** Os valores que viram cabeçalho do documento. */
  valorTotal: DecimalOpcional,
  valorProdutos: DecimalOpcional,
  valorServicos: DecimalOpcional,
  valorFrete: DecimalOpcional,
  valorSeguro: DecimalOpcional,
  valorDesconto: DecimalOpcional,
  valorOutrasDespesas: DecimalOpcional,
  /**
   * Todo grupo de totais do documento, com os campos como estão no XML.
   * `ICMSTot` é um deles, não o modelo: `ISSQNtot`, `retTrib` e os grupos da
   * Reforma (IBS, CBS, Imposto Seletivo) entram aqui sem mudar o contrato.
   */
  grupos: z.array(z.object({ nome: z.string(), campos: z.record(z.string(), z.string()) })),
})

export const ProtocoloInterpretadoSchema = z.object({
  numero: TextoOpcional,
  chaveAcesso: TextoOpcional,
  recebidoEm: TextoOpcional,
  digestValue: TextoOpcional,
  /** `cStat` e `xMotivo` como registrados no protocolo — sem consulta externa. */
  codigoStatus: TextoOpcional,
  motivo: TextoOpcional,
  ambiente: z.enum(['producao', 'homologacao']).nullable(),
  versaoAplicacao: TextoOpcional,
})

export const IdentificacaoInterpretadaSchema = z.object({
  /** 44 posições, do atributo `Id` de `infNFe` — não do nome do arquivo. */
  chaveAcesso: z.string().regex(/^[0-9A-Z]{44}$/),
  modelo: TextoOpcional,
  serie: TextoOpcional,
  numero: TextoOpcional,
  naturezaOperacao: TextoOpcional,
  /** Instante de emissão como escrito (`dhEmi`), com o deslocamento do emitente. */
  emitidoEm: TextoOpcional,
  /** Dia da emissão no fuso do emitente — o que decide competência. */
  dataEmissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  codigoTipoOperacao: TextoOpcional,
  tipoOperacao: z.enum(['entrada', 'saida']).nullable(),
  codigoFinalidade: TextoOpcional,
  finalidade: z.enum(['normal', 'complementar', 'ajuste', 'devolucao']).nullable(),
  codigoAmbiente: TextoOpcional,
  ambiente: z.enum(['producao', 'homologacao']).nullable(),
  dadosEspecificos: DadosEspecificos,
})

export const DocumentoFiscalInterpretadoSchema = z.object({
  origem: z.object({
    /** Raiz encontrada, por nome local: prefixo do namespace é irrelevante. */
    raiz: z.enum(RAIZES_NFE),
    namespace: z.string(),
    versaoLeiaute: z.string(),
    tipo: z.enum(TIPOS_DOCUMENTO_FISCAL),
    parser: z.object({ provedor: z.string(), versao: z.string() }),
  }),
  identificacao: IdentificacaoInterpretadaSchema,
  emitente: ParteInterpretadaSchema,
  destinatario: ParteInterpretadaSchema.nullable(),
  itens: z.array(ItemInterpretadoSchema),
  totais: TotaisInterpretadosSchema,
  /** Tributos do documento inteiro (totais e retenções), não os dos itens. */
  tributos: z.array(TributoInterpretadoSchema),
  protocolo: ProtocoloInterpretadoSchema.nullable(),
})

export type TributoInterpretado = z.infer<typeof TributoInterpretadoSchema>
export type ParteInterpretada = z.infer<typeof ParteInterpretadaSchema>
export type ItemInterpretado = z.infer<typeof ItemInterpretadoSchema>
export type TotaisInterpretados = z.infer<typeof TotaisInterpretadosSchema>
export type ProtocoloInterpretado = z.infer<typeof ProtocoloInterpretadoSchema>
export type IdentificacaoInterpretada = z.infer<typeof IdentificacaoInterpretadaSchema>
export type DocumentoFiscalInterpretado = z.infer<typeof DocumentoFiscalInterpretadoSchema>
