import type { EventoRealtime } from '@/integracoes/realtime/eventos'

/**
 * O que a pessoa está olhando neste instante.
 *
 * `null` significa "não está com nenhum Atendimento aberto" — no Dashboard, em
 * Clientes, ou com a aba do navegador em segundo plano.
 */
export type ContextoAtivo = {
  atendimentoId: string
  aba: 'protocolo' | 'conversa' | 'arquivos' | 'historico' | 'info'
  canalConversa: 'cliente' | 'interno'
  /** Negociação aberta na tela, quando a caixa de convites está em foco. */
  conviteId?: string | null
} | null

/**
 * O toast aparece quando o aviso é relevante **e** a pessoa não está olhando
 * para o lugar onde a novidade já vai aparecer sozinha.
 *
 * As três recusas, na ordem em que importam:
 *
 * 1. **A própria ação.** Quem enviou a mensagem sabe que enviou.
 * 2. **Aba escondida.** Toast em aba de fundo não é visto por ninguém e ainda
 *    empilha; ao voltar, a pessoa encontra a tela já atualizada.
 * 3. **Já está no contexto.** Se a Conversa está aberta naquele canal, a
 *    mensagem simplesmente aparece — avisar por cima seria ruído sobre algo
 *    que a pessoa está literalmente lendo.
 *
 * A comparação de canal existe porque a Conversa tem dois lados: estar no
 * canal Interno não é estar vendo o que o Cliente escreveu.
 */
export function deveExibirToast({
  evento,
  contexto,
  usuarioId,
  abaVisivel = true,
}: {
  evento: EventoRealtime
  contexto: ContextoAtivo
  usuarioId: string
  abaVisivel?: boolean
}): boolean {
  if (!evento.titulo) return false
  if (evento.autorId && evento.autorId === usuarioId) return false
  if (!abaVisivel) return false
  if (!contexto) return true

  if (evento.tipo === 'convite' || evento.tipo === 'negociacao') {
    return !evento.conviteId || contexto.conviteId !== evento.conviteId
  }

  if (!evento.atendimentoId) return true
  if (contexto.atendimentoId !== evento.atendimentoId) return true

  if (evento.tipo === 'mensagem') {
    return (
      contexto.aba !== 'conversa' ||
      (Boolean(evento.canalConversa) &&
        contexto.canalConversa !== evento.canalConversa)
    )
  }

  const abaDoEvento: Record<string, string> = {
    manifestacao: 'protocolo',
    // A solicitação de ajuste e a resposta dela são manifestações formais: quem
    // já está lendo o Protocolo daquele Atendimento vê a novidade entrar sozinha.
    ajuste: 'protocolo',
    arquivo: 'arquivos',
    checklist: 'protocolo',
  }

  // `status` não está no mapa de propósito: o badge de status fica no cabeçalho
  // do painel e é visto de qualquer aba. Quem está com o Atendimento aberto vê
  // "Concluído" trocar sozinho — um toast por cima avisaria de algo que a
  // pessoa está literalmente olhando.
  const abaEsperada = abaDoEvento[evento.tipo]
  // Sem aba correspondente (notificação genérica), estar no Atendimento certo
  // já basta para dispensar o aviso.
  return abaEsperada ? contexto.aba !== abaEsperada : false
}
