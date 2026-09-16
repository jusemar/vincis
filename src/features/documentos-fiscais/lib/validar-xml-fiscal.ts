import { createHash } from 'node:crypto'
import {
  ATRIBUTOS_MAXIMOS_POR_ELEMENTO,
  MIMES_ACEITOS_XML,
  NAMESPACE_NFE,
  PROFUNDIDADE_MAXIMA_XML,
  RAIZES_XML_ACEITAS,
  TAMANHO_MAXIMO_XML_FISCAL,
  type CodigoRecusaArquivo,
} from '../constants/upload'

/**
 * Barreira de segurança de entrada do XML fiscal (Fase 1.2) — **não é o parser
 * fiscal**, e não deve virar um.
 *
 * ## Papel
 *
 * Responde só "este arquivo pode entrar?": é XML UTF-8 minimamente bem formado,
 * sem DTD/entidades/instruções, dentro dos tetos de tamanho, profundidade e
 * atributos, e a raiz é uma das aceitas hoje (`RAIZES_XML_ACEITAS` no namespace
 * da NF-e) — o suficiente para encaminhar. Não lê nenhum campo fiscal, não
 * confere versão nem layout, não valida contra XSD e não devolve nada além de
 * nome, hash e nome da raiz.
 *
 * ## Fronteira com o parser fiscal
 *
 * A interpretação vive em `lib/parser-fiscal/` (Fase 1.3): namespaces, versões
 * de layout, `NFe` e `nfeProc`, evolução dos schemas e, adiante, XSD oficiais e
 * Reforma Tributária. Ela usa uma biblioteca XML madura, só lê o que esta
 * barreira já aceitou e armazenou, e nunca é chamada em lugar dela. Regra fiscal
 * nova vai para lá; aqui só entra endurecimento de segurança.
 *
 * ## Por que um verificador próprio, e não uma biblioteca
 *
 * Esta porta recebe bytes de qualquer um. Um parser completo resolve entidades,
 * lê DTD e monta árvore em memória — exatamente a superfície de XXE e de
 * "billion laughs". Este verificador faz uma varredura linear dos bytes e
 * **nunca expande nada**:
 *
 * - qualquer `<!DOCTYPE`/`<!ENTITY` (ou outro `<!…` que não seja comentário ou
 *   CDATA) é recusado antes de qualquer interpretação — sem DTD não há entidade
 *   externa, arquivo local, acesso de rede nem expansão exponencial;
 * - referência de entidade só é aceita se for uma das cinco predefinidas ou
 *   numérica; o texto não é substituído, só conferido;
 * - instrução de processamento além da declaração inicial é recusada
 *   (`xml-stylesheet` e afins apontam para recursos externos);
 * - profundidade e atributos por elemento têm teto, e o tamanho já veio
 *   limitado — custo O(n) sobre no máximo 3 MB.
 *
 * Nenhuma dependência nova. Mesmo com o parser fiscal instalado, esta porta
 * continua na frente dele: é defesa em profundidade, não substituta.
 */

export type ArquivoRecebido = {
  nome: string
  tipoMime: string
  bytes: Uint8Array
}

export type XmlFiscalAceito = {
  valido: true
  nomeOriginal: string
  sha256: string
  raiz: string
}

export type XmlFiscalRecusado = {
  valido: false
  codigo: CodigoRecusaArquivo
  /** Motivo técnico curto, para log e teste. Nunca contém o conteúdo do arquivo. */
  motivo: string
}

/** SHA-256 dos bytes exatamente como chegaram — sem normalização alguma. */
export function calcularSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Nome como veio, sem caminho nem caracteres de controle. Serve para exibir e
 * para o `Content-Disposition` do download; nunca compõe a chave de storage.
 */
export function limparNomeOriginal(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255)
}

/**
 * Bytes aprovados → texto para o parser. O BOM é marca de codificação, não
 * conteúdo: sai daqui e continua no arquivo original, que nunca é reescrito.
 */
export function textoDoXmlFiscal(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes).replace(/^\ufeff/, '')
}

const recusa = (codigo: CodigoRecusaArquivo, motivo: string): XmlFiscalRecusado => ({
  valido: false,
  codigo,
  motivo,
})

/** Assinaturas de formatos binários comuns renomeados para `.xml`. */
const ASSINATURAS_BINARIAS: { nome: string; bytes: number[] }[] = [
  { nome: 'executavel_windows', bytes: [0x4d, 0x5a] },
  { nome: 'executavel_elf', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { nome: 'zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { nome: 'gzip', bytes: [0x1f, 0x8b] },
  { nome: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { nome: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { nome: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
]

function ehBinario(bytes: Uint8Array): string | null {
  for (const { nome, bytes: assinatura } of ASSINATURAS_BINARIAS) {
    if (assinatura.every((byte, i) => bytes[i] === byte)) return nome
  }
  // NUL não existe em XML UTF-8. UTF-16 também cai aqui, e está certo: NF-e é UTF-8.
  if (bytes.includes(0)) return 'byte_nulo'
  return null
}

/**
 * Valida um arquivo recebido do navegador, na ordem do mais barato ao mais caro.
 * Recebe os bytes já lidos; quem chama confere `size` antes de ler.
 */
export function validarXmlFiscal(arquivo: ArquivoRecebido): XmlFiscalAceito | XmlFiscalRecusado {
  const nomeOriginal = limparNomeOriginal(arquivo.nome)
  if (!nomeOriginal.toLowerCase().endsWith('.xml') || nomeOriginal.length <= 4) {
    return recusa('ARQUIVO_NAO_PERMITIDO', 'extensao')
  }
  if (!(MIMES_ACEITOS_XML as readonly string[]).includes(arquivo.tipoMime.trim().toLowerCase())) {
    return recusa('ARQUIVO_NAO_PERMITIDO', 'mime')
  }
  if (arquivo.bytes.byteLength === 0) return recusa('ARQUIVO_VAZIO', 'vazio')
  if (arquivo.bytes.byteLength > TAMANHO_MAXIMO_XML_FISCAL) {
    return recusa('ARQUIVO_MUITO_GRANDE', 'tamanho')
  }

  const binario = ehBinario(arquivo.bytes)
  if (binario) return recusa('ARQUIVO_NAO_PERMITIDO', `binario:${binario}`)

  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(arquivo.bytes)
  } catch {
    return recusa('ARQUIVO_NAO_PERMITIDO', 'utf8')
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0001-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(texto)) {
    return recusa('ARQUIVO_NAO_PERMITIDO', 'caractere_de_controle')
  }
  if (!/^\ufeff?\s*</.test(texto)) return recusa('XML_INVALIDO', 'nao_comeca_com_tag')

  const estrutura = verificarEstruturaXml(texto)
  if (!estrutura.valido) return estrutura

  const [prefixo, local] = estrutura.raiz.nome.includes(':')
    ? estrutura.raiz.nome.split(':')
    : [null, estrutura.raiz.nome]
  const namespace = estrutura.raiz.atributos.get(prefixo ? `xmlns:${prefixo}` : 'xmlns')
  if (!(RAIZES_XML_ACEITAS as readonly string[]).includes(local) || namespace !== NAMESPACE_NFE) {
    return recusa('XML_NAO_SUPORTADO', 'raiz')
  }

  return { valido: true, nomeOriginal, sha256: calcularSha256(arquivo.bytes), raiz: local }
}

type EstruturaValida = {
  valido: true
  raiz: { nome: string; atributos: Map<string, string> }
}

const NOME_XML = /^[A-Za-z_][A-Za-z0-9._-]*(?::[A-Za-z_][A-Za-z0-9._-]*)?$/
const REFERENCIA = /&(?:lt|gt|amp|quot|apos|#([0-9]{1,7})|#x([0-9A-Fa-f]{1,6}));/y

function codigoPermitido(codigo: number) {
  return (
    codigo === 0x9 ||
    codigo === 0xa ||
    codigo === 0xd ||
    (codigo >= 0x20 && codigo <= 0xd7ff) ||
    (codigo >= 0xe000 && codigo <= 0xfffd) ||
    (codigo >= 0x10000 && codigo <= 0x10ffff)
  )
}

/** Confere cada `&` de um texto ou valor de atributo, sem substituir nada. */
function verificarReferencias(trecho: string): XmlFiscalRecusado | null {
  let posicao = trecho.indexOf('&')
  while (posicao !== -1) {
    REFERENCIA.lastIndex = posicao
    const achado = REFERENCIA.exec(trecho)
    if (!achado) {
      // `&nome;` fora das cinco predefinidas só teria sentido com DTD.
      return /^&[A-Za-z_][\w.-]*;/.test(trecho.slice(posicao, posicao + 64))
        ? recusa('XML_INSEGURO', 'entidade_nao_predefinida')
        : recusa('XML_INVALIDO', 'e_comercial_solto')
    }
    const numerico = achado[1] ?? achado[2]
    if (numerico !== undefined) {
      const codigo = parseInt(numerico, achado[1] !== undefined ? 10 : 16)
      if (!codigoPermitido(codigo)) return recusa('XML_INVALIDO', 'referencia_numerica')
    }
    posicao = trecho.indexOf('&', REFERENCIA.lastIndex)
  }
  return null
}

/**
 * Bem-formação mínima: uma raiz, tags balanceadas, atributos únicos e bem
 * delimitados, referências válidas, nada fora da raiz além de espaço e
 * comentário. Exportada para teste.
 */
export function verificarEstruturaXml(texto: string): EstruturaValida | XmlFiscalRecusado {
  const n = texto.length
  let i = texto.charCodeAt(0) === 0xfeff ? 1 : 0

  // Declaração XML: só no começo absoluto, e só UTF-8.
  while (i < n && /\s/.test(texto[i])) i++
  if (texto.startsWith('<?xml', i) && /[\s?]/.test(texto[i + 5] ?? '')) {
    const fim = texto.indexOf('?>', i)
    if (fim === -1) return recusa('XML_INVALIDO', 'declaracao_aberta')
    const encoding = /encoding\s*=\s*["']([^"']*)["']/i.exec(texto.slice(i, fim))
    if (encoding && !['utf-8', 'utf8'].includes(encoding[1].toLowerCase())) {
      return recusa('XML_INVALIDO', 'encoding')
    }
    i = fim + 2
  }

  const pilha: string[] = []
  let raiz: EstruturaValida['raiz'] | null = null
  let raizFechada = false

  while (i < n) {
    const abre = texto.indexOf('<', i)
    const fimTexto = abre === -1 ? n : abre
    if (fimTexto > i) {
      const trecho = texto.slice(i, fimTexto)
      if (pilha.length === 0) {
        if (/\S/.test(trecho)) return recusa('XML_INVALIDO', 'texto_fora_da_raiz')
      } else {
        if (trecho.includes(']]>')) return recusa('XML_INVALIDO', 'fim_cdata_solto')
        const erro = verificarReferencias(trecho)
        if (erro) return erro
      }
    }
    if (abre === -1) break
    i = abre

    if (texto.startsWith('<!--', i)) {
      const fim = texto.indexOf('-->', i + 4)
      if (fim === -1 || texto.slice(i + 4, fim).includes('--')) {
        return recusa('XML_INVALIDO', 'comentario')
      }
      i = fim + 3
      continue
    }
    if (texto.startsWith('<![CDATA[', i)) {
      if (pilha.length === 0) return recusa('XML_INVALIDO', 'cdata_fora_da_raiz')
      const fim = texto.indexOf(']]>', i + 9)
      if (fim === -1) return recusa('XML_INVALIDO', 'cdata_aberto')
      i = fim + 3
      continue
    }
    // DOCTYPE, ENTITY, ELEMENT, ATTLIST... Nada disso é interpretado — é recusado.
    if (texto.startsWith('<!', i)) return recusa('XML_INSEGURO', 'declaracao_dtd')
    if (texto.startsWith('<?', i)) return recusa('XML_INSEGURO', 'instrucao_de_processamento')

    if (texto.startsWith('</', i)) {
      const fim = texto.indexOf('>', i)
      if (fim === -1) return recusa('XML_INVALIDO', 'fechamento_aberto')
      const nome = texto.slice(i + 2, fim).trimEnd()
      if (pilha.pop() !== nome) return recusa('XML_INVALIDO', 'fechamento_divergente')
      if (pilha.length === 0) raizFechada = true
      i = fim + 1
      continue
    }

    // Tag de abertura.
    if (raizFechada) return recusa('XML_INVALIDO', 'mais_de_uma_raiz')
    let j = i + 1
    const nomeTag = /[^\s/>]+/y
    nomeTag.lastIndex = j
    const nome = nomeTag.exec(texto)?.[0] ?? ''
    if (!NOME_XML.test(nome)) return recusa('XML_INVALIDO', 'nome_de_elemento')
    j += nome.length

    const atributos = new Map<string, string>()
    let autoFechada = false
    for (;;) {
      const inicioEspaco = j
      while (j < n && /\s/.test(texto[j])) j++
      if (j >= n) return recusa('XML_INVALIDO', 'tag_aberta')
      if (texto[j] === '>') {
        j++
        break
      }
      if (texto.startsWith('/>', j)) {
        j += 2
        autoFechada = true
        break
      }
      if (j === inicioEspaco) return recusa('XML_INVALIDO', 'atributo_sem_espaco')

      const nomeAtributo = /[^\s=/>]+/y
      nomeAtributo.lastIndex = j
      const atributo = nomeAtributo.exec(texto)?.[0] ?? ''
      if (!NOME_XML.test(atributo)) return recusa('XML_INVALIDO', 'nome_de_atributo')
      j += atributo.length
      while (j < n && /\s/.test(texto[j])) j++
      if (texto[j] !== '=') return recusa('XML_INVALIDO', 'atributo_sem_valor')
      j++
      while (j < n && /\s/.test(texto[j])) j++
      const aspas = texto[j]
      if (aspas !== '"' && aspas !== "'") return recusa('XML_INVALIDO', 'atributo_sem_aspas')
      const fimValor = texto.indexOf(aspas, j + 1)
      if (fimValor === -1) return recusa('XML_INVALIDO', 'atributo_aberto')
      const valor = texto.slice(j + 1, fimValor)
      if (valor.includes('<')) return recusa('XML_INVALIDO', 'menor_que_em_atributo')
      const erro = verificarReferencias(valor)
      if (erro) return erro
      if (atributos.has(atributo)) return recusa('XML_INVALIDO', 'atributo_repetido')
      atributos.set(atributo, valor)
      if (atributos.size > ATRIBUTOS_MAXIMOS_POR_ELEMENTO) {
        return recusa('XML_INVALIDO', 'atributos_demais')
      }
      j = fimValor + 1
    }

    if (!raiz) raiz = { nome, atributos }
    if (autoFechada) {
      if (pilha.length === 0) raizFechada = true
    } else {
      pilha.push(nome)
      if (pilha.length > PROFUNDIDADE_MAXIMA_XML) return recusa('XML_INVALIDO', 'profundidade')
    }
    i = j
  }

  if (!raiz) return recusa('XML_INVALIDO', 'sem_raiz')
  if (pilha.length > 0) return recusa('XML_INVALIDO', 'elemento_nao_fechado')
  return { valido: true, raiz }
}
