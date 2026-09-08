/**
 * Para onde o link de um parceiro pode levar.
 *
 * ## Um código, vários destinos
 *
 * O parceiro tem **um** código e **um** mecanismo de atribuição. O que muda é
 * a página em que a pessoa cai depois que o acesso foi registrado. Um link de
 * afiliado por funcionalidade multiplicaria códigos, cookies e regras de
 * captação — e a primeira divergência entre eles seria uma indicação perdida.
 *
 * ## Lista fechada, e não validação de texto
 *
 * O destino chega pela URL, onde qualquer pessoa escreve o que quiser. Aceitar
 * "qualquer caminho que comece com barra" abriria a porta para `//evil.com`
 * (que o navegador lê como outro domínio) e para páginas internas que nunca
 * deveriam ser alvo de campanha. Por isso o caminho é comparado com esta lista,
 * e os parâmetros que sobrevivem são só os declarados aqui: um `?next=` ou um
 * `?token=` pendurado no destino é descartado sem cerimônia.
 *
 * Destino novo é uma linha nova. É assim que serviço, preços e as próximas
 * páginas públicas entram, sem tocar na rota nem na atribuição.
 */
export const DESTINOS_DE_INDICACAO = [
  { caminho: '/', rotulo: 'Página inicial', parametros: [] },
  {
    caminho: '/perfil-profissional',
    rotulo: 'Perfil de profissional',
    parametros: ['prestador'],
  },
] as const

/** O parâmetro que carrega o destino no link do parceiro. */
export const PARAMETRO_DESTINO = 'd'

/** O destino padrão, quando não há um ou quando o pedido não é aceitável. */
export const DESTINO_PADRAO = '/'

/**
 * O caminho interno seguro correspondente ao que foi pedido.
 *
 * Devolve sempre um caminho relativo que começa com uma única barra — nunca uma
 * URL absoluta, nunca `//host`, nunca `/\host`. Pedido desconhecido ou malformado
 * não vira erro: vira a home, que é o destino de sempre do link de indicação.
 */
export function resolverDestinoInterno(bruto: string | null | undefined): string {
  if (!bruto || !bruto.startsWith('/')) return DESTINO_PADRAO
  // `//host` e `/\host` são absolutos para o navegador, mesmo começando com barra.
  if (bruto.startsWith('//') || bruto.startsWith('/\\')) return DESTINO_PADRAO

  let alvo: URL
  try {
    // A base é descartável: só serve para separar caminho de query com segurança.
    alvo = new URL(bruto, 'https://interno.invalido')
  } catch {
    return DESTINO_PADRAO
  }

  const permitido = DESTINOS_DE_INDICACAO.find(
    (destino) => destino.caminho === alvo.pathname,
  )
  if (!permitido) return DESTINO_PADRAO

  const parametros = new URLSearchParams()
  for (const chave of permitido.parametros) {
    const valor = alvo.searchParams.get(chave)
    if (valor) parametros.set(chave, valor)
  }

  const query = parametros.toString()
  return query ? `${permitido.caminho}?${query}` : permitido.caminho
}

/**
 * O link que o parceiro compartilha.
 *
 * O destino entra codificado num parâmetro só, para que a query da página de
 * chegada não se misture com a do link de indicação. Sem destino, o link é o
 * de sempre — e continua funcionando exatamente como funcionava.
 */
export function montarLinkDeIndicacao(
  base: string,
  codigo: string,
  destino?: string | null,
): string {
  const raiz = `${base.replace(/\/+$/, '')}/p/${codigo}`
  const seguro = resolverDestinoInterno(destino)
  return seguro === DESTINO_PADRAO
    ? raiz
    : `${raiz}?${PARAMETRO_DESTINO}=${encodeURIComponent(seguro)}`
}
