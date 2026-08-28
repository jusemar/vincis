/**
 * Resolve o `?atendimento=` da Área do Cliente.
 *
 * O parâmetro chega em dois formatos, porque os dois circulam de verdade: o
 * uuid, usado pelos links que já tinham o Atendimento carregado (Visão Geral,
 * painel de pagamento), e o **protocolo**, usado por quem só conhece o
 * protocolo — a confirmação da Consultoria Agendada mostra `#2026-0029` na
 * tela e é esse identificador que a pessoa acabou de ler.
 *
 * Aceitar os dois é a mesma regra que o quadro do Profissional já aplica
 * (`p.id === deepLink || p.number === deepLink`). Exigir o uuid do lado do
 * Cliente faria o link da consultoria cair na lista em vez de abrir o
 * Atendimento — silenciosamente, porque a rota continuaria válida.
 */
export function resolverAtendimentoDoLink<
  T extends { id: string; protocolo: string },
>(atendimentos: T[], link: string | null | undefined): T | null {
  if (!link) return null
  return (
    atendimentos.find((item) => item.id === link || item.protocolo === link) ??
    null
  )
}
