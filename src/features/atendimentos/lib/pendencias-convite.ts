import type { ConviteAtendimentoDTO } from '../queries/convites-do-atendimento'

/**
 * Quantas coisas o botão "Convites" precisa sinalizar.
 *
 * Três situações diferentes somadas num número só, porque o badge é um só:
 * convite recebido esperando resposta, mensagem não lida em qualquer
 * negociação, e contraproposta esperando a decisão de quem convidou. Sem isso a
 * pessoa teria de abrir convite por convite para descobrir se alguém respondeu.
 *
 * Mora aqui, e não junto da consulta, porque é função pura sobre um DTO e o
 * quadro é um componente de cliente: importá-la do módulo de consulta arrastava
 * o driver do Postgres para o bundle do navegador. O tipo vem de lá, mas com
 * `import type` — some na compilação.
 */
export function contarPendenciasDeConvite(convites: ConviteAtendimentoDTO[]) {
  return convites.filter(
    (convite) =>
      (convite.status === 'pendente' && convite.papel === 'destinatario') ||
      convite.naoLidas > 0 ||
      convite.aguardandoDecisao,
  ).length
}
