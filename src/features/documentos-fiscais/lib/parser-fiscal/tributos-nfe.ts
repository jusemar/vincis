import type { TributoInterpretado } from '../../schemas/documento-interpretado'
import type { NoXml } from './arvore-xml'

/**
 * Leitura tributária da NF-e — **não** é motor de cálculo.
 *
 * Nada aqui soma, confere ou apura imposto: cada grupo do XML vira uma linha
 * `{ tributo, situação, base, alíquota, valor }`, o mesmo formato de
 * `documentos_fiscais_tributos`, onde cada incidência é uma linha e o tributo é
 * um código aberto.
 *
 * ## Tabela, não cascata de `if`
 *
 * `GRUPOS` descreve o que ler de cada família (ICMS, IPI, PIS…). Tributo novo —
 * IBS, CBS, Imposto Seletivo, uma retenção que a norma criar — é uma entrada
 * nova nesta tabela, e nada mais do parser muda. Enquanto não tiver entrada, o
 * grupo desconhecido ainda é lido por heurística e preservado inteiro em
 * `dadosEspecificos`: dado do documento não desaparece por falta de mapa.
 */

type Entrada = {
  tributo: string
  situacao?: readonly string[]
  classificacao?: readonly string[]
  base?: readonly string[]
  aliquota?: readonly string[]
  valor?: readonly string[]
  retido?: boolean
}

/** Famílias conhecidas. A chave casa com o nome local do grupo no XML. */
const GRUPOS: { familia: RegExp; subgrupo: boolean; entradas: readonly Entrada[] }[] = [
  {
    // ICMS00, ICMS60, ICMSSN101, ICMSPart, ICMSST… todos sob <ICMS>.
    familia: /^ICMS(?!UFDest)/,
    subgrupo: true,
    entradas: [
      { tributo: 'icms', situacao: ['CST', 'CSOSN'], classificacao: ['cClassTrib'], base: ['vBC'], aliquota: ['pICMS'], valor: ['vICMS'] },
      { tributo: 'icms_st', base: ['vBCST', 'vBCSTRet'], aliquota: ['pICMSST'], valor: ['vICMSST', 'vICMSSTRet'] },
      { tributo: 'fcp', base: ['vBCFCP'], aliquota: ['pFCP'], valor: ['vFCP'] },
      { tributo: 'fcp_st', base: ['vBCFCPST'], aliquota: ['pFCPST'], valor: ['vFCPST', 'vFCPSTRet'] },
    ],
  },
  {
    familia: /^IPI$/,
    subgrupo: true,
    entradas: [{ tributo: 'ipi', situacao: ['CST'], base: ['vBC'], aliquota: ['pIPI'], valor: ['vIPI'] }],
  },
  { familia: /^II$/, subgrupo: false, entradas: [{ tributo: 'ii', base: ['vBC'], valor: ['vII'] }] },
  {
    familia: /^PIS$/,
    subgrupo: true,
    entradas: [{ tributo: 'pis', situacao: ['CST'], base: ['vBC'], aliquota: ['pPIS'], valor: ['vPIS'] }],
  },
  {
    familia: /^PISST$/,
    subgrupo: false,
    entradas: [{ tributo: 'pis_st', situacao: ['CST'], base: ['vBC'], aliquota: ['pPIS'], valor: ['vPIS'] }],
  },
  {
    familia: /^COFINS$/,
    subgrupo: true,
    entradas: [{ tributo: 'cofins', situacao: ['CST'], base: ['vBC'], aliquota: ['pCOFINS'], valor: ['vCOFINS'] }],
  },
  {
    familia: /^COFINSST$/,
    subgrupo: false,
    entradas: [{ tributo: 'cofins_st', situacao: ['CST'], base: ['vBC'], aliquota: ['pCOFINS'], valor: ['vCOFINS'] }],
  },
  {
    familia: /^ISSQN$/,
    subgrupo: false,
    entradas: [{ tributo: 'iss', situacao: ['cSitTrib'], base: ['vBC'], aliquota: ['vAliq'], valor: ['vISSQN'] }],
  },
  {
    familia: /^ICMSUFDest$/,
    subgrupo: false,
    entradas: [
      { tributo: 'icms_uf_destino', base: ['vBCUFDest'], aliquota: ['pICMSUFDest'], valor: ['vICMSUFDest'] },
      { tributo: 'fcp', base: ['vBCFCPUFDest'], aliquota: ['pFCPUFDest'], valor: ['vFCPUFDest'] },
    ],
  },
]

/** Totais do documento: cada grupo de `<total>` vira as suas incidências. */
const GRUPOS_DE_TOTAIS: Record<string, readonly Entrada[]> = {
  ICMSTot: [
    { tributo: 'icms', base: ['vBC'], valor: ['vICMS'] },
    { tributo: 'icms_st', base: ['vBCST'], valor: ['vST'] },
    { tributo: 'fcp', valor: ['vFCP'] },
    { tributo: 'fcp_st', valor: ['vFCPST'] },
    { tributo: 'ipi', valor: ['vIPI'] },
    { tributo: 'ii', valor: ['vII'] },
    { tributo: 'pis', valor: ['vPIS'] },
    { tributo: 'cofins', valor: ['vCOFINS'] },
  ],
  ISSQNtot: [{ tributo: 'iss', base: ['vBC'], valor: ['vISS'] }],
  retTrib: [
    { tributo: 'pis', valor: ['vRetPIS'], retido: true },
    { tributo: 'cofins', valor: ['vRetCOFINS'], retido: true },
    { tributo: 'csll', valor: ['vRetCSLL'], retido: true },
    { tributo: 'irrf', base: ['vBCIRRF'], valor: ['vIRRF'], retido: true },
    { tributo: 'inss', base: ['vBCRetPrev'], valor: ['vRetPrev'], retido: true },
  ],
}

/** `IBSCBS` → `ibscbs`: código de tributo para grupo ainda sem entrada própria. */
function codigoDoGrupo(nome: string) {
  const codigo = nome
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
  return /^[a-z]/.test(codigo) ? codigo : `tributo_${codigo}`
}

/**
 * Campos escalares do grupo, por nome local. Subgrupo vira chave composta
 * (`deducao.vDed`), de modo que nenhum valor do documento se perde.
 */
export function camposDoGrupo(no: NoXml | null, prefixo = ''): Record<string, string> {
  const campos: Record<string, string> = {}
  for (const filho of no?.filhos ?? []) {
    const chave = prefixo ? `${prefixo}.${filho.nome}` : filho.nome
    if (filho.filhos.length > 0) Object.assign(campos, camposDoGrupo(filho, chave))
    else if (filho.texto) campos[chave] = filho.texto
  }
  return campos
}

const primeiro = (campos: Record<string, string>, nomes?: readonly string[]) =>
  nomes?.map((nome) => campos[nome]).find((valor) => valor !== undefined) ?? null

/** Chaves que a entrada consumiu — o resto sobra para `dadosEspecificos`. */
const consumidas = (entrada: Entrada) =>
  [...(entrada.situacao ?? []), ...(entrada.classificacao ?? []), ...(entrada.base ?? []), ...(entrada.aliquota ?? []), ...(entrada.valor ?? [])]

function montarLinhas(
  grupo: string,
  campos: Record<string, string>,
  entradas: readonly Entrada[],
  /** Nos totais é `false`: `totais.grupos` já guarda o grupo inteiro. */
  preservarSobra = true,
): TributoInterpretado[] {
  const usadas = new Set<string>()
  const linhas: TributoInterpretado[] = []

  for (const entrada of entradas) {
    const linha = {
      tributo: entrada.tributo,
      retido: entrada.retido ?? false,
      codigoSituacao: primeiro(campos, entrada.situacao),
      classificacaoTributaria: primeiro(campos, entrada.classificacao),
      baseCalculo: primeiro(campos, entrada.base),
      aliquotaPercentual: primeiro(campos, entrada.aliquota),
      valor: primeiro(campos, entrada.valor),
      grupo,
      dadosEspecificos: null,
    } satisfies TributoInterpretado
    const temAlgo =
      linha.codigoSituacao || linha.classificacaoTributaria || linha.baseCalculo || linha.aliquotaPercentual || linha.valor
    if (!temAlgo) continue
    for (const chave of consumidas(entrada)) if (campos[chave] !== undefined) usadas.add(chave)
    linhas.push(linha)
  }

  // O que o grupo trouxe e nenhuma entrada leu fica com a primeira linha: é o
  // que a fase seguinte guarda em `dados_especificos`.
  const sobra = Object.fromEntries(Object.entries(campos).filter(([chave]) => !usadas.has(chave)))
  if (preservarSobra && linhas.length > 0 && Object.keys(sobra).length > 0) linhas[0].dadosEspecificos = sobra
  return linhas
}

/** Heurística para grupo sem entrada na tabela: lê o óbvio, preserva o resto. */
function linhasDeGrupoDesconhecido(
  nome: string,
  campos: Record<string, string>,
  preservarSobra = true,
): TributoInterpretado[] {
  const chaves = Object.keys(campos)
  const entrada: Entrada = {
    tributo: codigoDoGrupo(nome),
    situacao: ['CST', 'CSOSN', 'cSitTrib'],
    classificacao: ['cClassTrib'],
    base: ['vBC'],
    aliquota: chaves.filter((chave) => /^p[A-Z]/.test(chave)).slice(0, 1),
    valor: chaves.filter((chave) => /^v[A-Z]/.test(chave) && chave !== 'vBC').slice(0, 1),
  }
  const linhas = montarLinhas(nome, campos, [entrada], preservarSobra)
  if (preservarSobra && linhas.length === 0 && chaves.length > 0) {
    return [
      {
        tributo: entrada.tributo,
        retido: false,
        codigoSituacao: null,
        classificacaoTributaria: null,
        baseCalculo: null,
        aliquotaPercentual: null,
        valor: null,
        grupo: nome,
        dadosEspecificos: campos,
      },
    ]
  }
  return linhas
}

/** Tributos de um item, a partir do grupo `<imposto>`. */
export function interpretarTributosDoItem(imposto: NoXml | null): TributoInterpretado[] {
  const linhas: TributoInterpretado[] = []
  for (const grupo of imposto?.filhos ?? []) {
    // `vTotTrib` é campo do grupo `imposto`, não incidência.
    if (grupo.filhos.length === 0) continue
    const familia = GRUPOS.find((candidata) => candidata.familia.test(grupo.nome))
    // Famílias com subgrupo (ICMS → ICMS60, PIS → PISAliq) guardam o CST no
    // filho; o subgrupo é o primeiro filho que também é grupo.
    const no = familia?.subgrupo ? (grupo.filhos.find((f) => f.filhos.length > 0) ?? grupo) : grupo
    const campos = camposDoGrupo(no)
    // Campos soltos ao lado do subgrupo (o `cEnq` do IPI) pertencem ao tributo.
    if (no !== grupo) {
      for (const irmao of grupo.filhos) {
        if (irmao.filhos.length === 0 && irmao.texto && campos[irmao.nome] === undefined) {
          campos[irmao.nome] = irmao.texto
        }
      }
    }
    linhas.push(
      ...(familia
        ? montarLinhas(no.nome, campos, familia.entradas)
        : linhasDeGrupoDesconhecido(no.nome, campos)),
    )
  }
  return linhas
}

/** Tributos do documento inteiro, a partir do grupo `<total>`. */
export function interpretarTributosDoDocumento(total: NoXml | null): TributoInterpretado[] {
  const linhas: TributoInterpretado[] = []
  for (const grupo of total?.filhos ?? []) {
    const campos = camposDoGrupo(grupo)
    const entradas = GRUPOS_DE_TOTAIS[grupo.nome]
    linhas.push(
      ...(entradas
        ? montarLinhas(grupo.nome, campos, entradas, false)
        : linhasDeGrupoDesconhecido(grupo.nome, campos, false)),
    )
  }
  return linhas
}
