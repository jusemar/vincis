import { DOMParser, type Element as ElementoXml } from '@xmldom/xmldom'

/**
 * Árvore XML própria da Vincis — o **único** ponto do projeto que conhece a
 * biblioteca de XML.
 *
 * A leitura fiscal trabalha sobre `NoXml`, não sobre o DOM da biblioteca. Trocar
 * `@xmldom/xmldom` por outra solução madura é reescrever só este arquivo.
 *
 * ## Namespace, não prefixo
 *
 * Cada nó guarda o **nome local** e a **URI de namespace** resolvida pela
 * biblioteca. Por isso `nfeProc`, `nfe:nfeProc` e qualquer outro prefixo são o
 * mesmo nó para quem lê — e um elemento homônimo de outro namespace (assinatura
 * XMLDSig, por exemplo) nunca é confundido com um do leiaute fiscal.
 *
 * ## Só leitura
 *
 * A árvore é congelada e nasce de uma cópia em texto: interpretar não altera o
 * XML recebido, e o arquivo original guardado na Fase 1.2 permanece intocado.
 *
 * ## Segurança
 *
 * Esta camada só recebe XML aprovado pela barreira da Fase 1.2
 * (`validar-xml-fiscal`), que recusa DTD, DOCTYPE, ENTITY e instruções de
 * processamento. Ainda assim, aqui nada é resolvido além do XML em memória: sem
 * rede, sem arquivo, sem expansão de entidade própria — só as cinco
 * predefinidas e as numéricas, que a própria biblioteca decodifica.
 */
export type NoXml = {
  /** Nome local, sem prefixo. */
  readonly nome: string
  /** URI do namespace, ou `null` quando o elemento não está em namespace. */
  readonly namespace: string | null
  /** Atributos pelo nome local (o prefixo não identifica o atributo). */
  readonly atributos: ReadonlyMap<string, string>
  readonly filhos: readonly NoXml[]
  /** Texto imediato do elemento (inclui CDATA), já sem espaços nas pontas. */
  readonly texto: string
}

const TEXTO = 3
const CDATA = 4
const ELEMENTO = 1

/** Converte o XML em árvore própria. `null` quando o XML não é legível. */
export function lerArvoreXml(xml: string): NoXml | null {
  let erroFatal = false
  const parser = new DOMParser({
    onError: (nivel) => {
      if (nivel === 'error' || nivel === 'fatalError') erroFatal = true
    },
  })
  let documento: ReturnType<DOMParser['parseFromString']>
  try {
    documento = parser.parseFromString(xml, 'text/xml')
  } catch {
    return null
  }
  const raiz = documento.documentElement
  if (erroFatal || !raiz) return null
  return converter(raiz)
}

function converter(elemento: ElementoXml): NoXml {
  const atributos = new Map<string, string>()
  for (let i = 0; i < elemento.attributes.length; i++) {
    const atributo = elemento.attributes[i]
    atributos.set(atributo.localName ?? atributo.name, atributo.value)
  }

  const filhos: NoXml[] = []
  let texto = ''
  for (let no = elemento.firstChild; no; no = no.nextSibling) {
    if (no.nodeType === ELEMENTO) filhos.push(converter(no as ElementoXml))
    else if (no.nodeType === TEXTO || no.nodeType === CDATA) texto += no.nodeValue ?? ''
  }

  return Object.freeze({
    nome: elemento.localName ?? elemento.nodeName,
    namespace: elemento.namespaceURI ?? null,
    atributos,
    filhos: Object.freeze(filhos),
    texto: texto.trim(),
  })
}

/** Primeiro filho com este nome local, no mesmo namespace do pai. */
export function filho(no: NoXml | null, nome: string): NoXml | null {
  if (!no) return null
  return no.filhos.find((f) => f.nome === nome && f.namespace === no.namespace) ?? null
}

/** Todos os filhos com este nome local, no mesmo namespace do pai, em ordem. */
export function filhos(no: NoXml | null, nome: string): readonly NoXml[] {
  if (!no) return []
  return no.filhos.filter((f) => f.nome === nome && f.namespace === no.namespace)
}

/** Desce por nomes locais: `caminho(infNFe, 'emit', 'enderEmit')`. */
export function caminho(no: NoXml | null, ...nomes: string[]): NoXml | null {
  return nomes.reduce<NoXml | null>((atual, nome) => filho(atual, nome), no)
}

/** Texto de um filho. Vazio vira `null`: campo em branco não é dado. */
export function textoDe(no: NoXml | null, ...nomes: string[]): string | null {
  const alvo = nomes.length ? caminho(no, ...nomes) : no
  const valor = alvo?.texto.trim()
  return valor ? valor : null
}

/** Valor de atributo pelo nome local. */
export function atributoDe(no: NoXml | null, nome: string): string | null {
  const valor = no?.atributos.get(nome)?.trim()
  return valor ? valor : null
}
