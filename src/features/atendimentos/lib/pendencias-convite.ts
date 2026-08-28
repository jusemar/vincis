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

/**
 * Quantos convites recebidos ainda não foram abertos por quem os recebeu.
 *
 * É o número do destaque verde do Dashboard — e só dele. Não se confunde com
 * `contarPendenciasDeConvite`, que alimenta o badge da caixa de convites e
 * soma três situações diferentes (convite por responder, resposta não lida,
 * contraproposta esperando decisão). Aqui a pergunta é outra e mais estreita:
 * *chegou algo dirigido a mim que eu ainda nem olhei?*
 *
 * Também mora aqui, e pelo mesmo motivo: função pura sobre o DTO, usada tanto
 * pelo servidor quanto por componentes de cliente.
 */
export function contarConvitesNovos(convites: ConviteAtendimentoDTO[]) {
  return convites.filter((convite) => convite.novoParaDestaque).length
}

/**
 * O convite novo mais recente, quando existe.
 *
 * Só serve ao destaque do Dashboard: com um único convite novo, o botão leva
 * direto àquela negociação — o mesmo endereço que o clique no sino usa — em vez
 * de abrir a caixa e deixar a pessoa procurando o que já se sabe qual é.
 *
 * A ordem é a que a consulta já entrega (mais recentes primeiro).
 */
export function primeiroConviteNovo(convites: ConviteAtendimentoDTO[]) {
  return convites.find((convite) => convite.novoParaDestaque)?.id ?? null
}
