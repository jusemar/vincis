/**
 * Regras de rolagem da Conversa.
 *
 * Ficam aqui, fora do componente e sem tocar no DOM, porque são decisões de
 * comportamento — e decisão de comportamento se testa. O hook cuida do
 * "como rolar"; este arquivo responde "rolar ou não".
 */

/**
 * Distância do fim, em pixels, que ainda conta como "está no fim".
 *
 * Comparar `scrollTop` com `scrollHeight - clientHeight` na igualdade é frágil:
 * o navegador arredonda em telas com zoom ou densidade fracionária, uma bolha
 * que cresce meio pixel já quebra a conta, e o resultado seria um chat que às
 * vezes acompanha e às vezes não. A tolerância é generosa de propósito — cerca
 * de uma bolha e meia de altura: quem está lendo as últimas mensagens continua
 * sendo levado junto, quem subiu para procurar algo antigo não é puxado.
 */
export const TOLERANCIA_FIM_PX = 120

export type MetricasDeRolagem = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/** A pessoa está no fim da conversa (ou perto o bastante disso)? */
export function estaNoFim(
  { scrollTop, scrollHeight, clientHeight }: MetricasDeRolagem,
  tolerancia = TOLERANCIA_FIM_PX,
): boolean {
  // Conteúdo menor que a área visível não rola: está sempre no fim.
  if (scrollHeight <= clientHeight) return true
  return scrollHeight - scrollTop - clientHeight <= tolerancia
}

export type DecisaoRolagem =
  | 'ir-para-o-fim'
  | 'avisar-nova-mensagem'
  | 'manter-posicao'

/**
 * O que fazer quando a lista de mensagens muda.
 *
 * Três situações, nesta ordem de precedência:
 *
 * 1. **Foco numa não lida manda.** Quem clicou no badge vermelho pediu para ir
 *    a uma mensagem específica; descer para o fim logo em seguida destruiria
 *    exatamente o que ele pediu.
 * 2. **A mensagem é minha.** Acabei de enviar: quero vê-la, sempre.
 * 3. **Estava no fim?** Sim, acompanha; não, avisa e preserva a leitura.
 */
export function decidirRolagem({
  chegouMensagem,
  ancorado,
  ultimaEhMinha,
  focoEmNaoLida = false,
}: {
  /** A lista mudou de verdade (mensagem nova), e não só re-renderizou. */
  chegouMensagem: boolean
  /** A pessoa estava no fim antes desta mudança. */
  ancorado: boolean
  ultimaEhMinha: boolean
  focoEmNaoLida?: boolean
}): DecisaoRolagem {
  if (!chegouMensagem) return 'manter-posicao'
  if (focoEmNaoLida) return 'manter-posicao'
  if (ultimaEhMinha) return 'ir-para-o-fim'
  return ancorado ? 'ir-para-o-fim' : 'avisar-nova-mensagem'
}
