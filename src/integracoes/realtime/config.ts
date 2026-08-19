/**
 * Credenciais do Pusher Channels.
 *
 * Lidas aqui e em nenhum outro lugar. As três primeiras são segredo de
 * servidor; só `NEXT_PUBLIC_PUSHER_KEY` e `NEXT_PUBLIC_PUSHER_CLUSTER` chegam
 * ao navegador — a chave pública sozinha não assina canal privado, porque a
 * assinatura é feita pelo `secret` na rota de autorização.
 *
 * Nada aqui tem valor embutido. Sem as variáveis configuradas, o tempo real
 * simplesmente não liga e a aplicação continua inteira: Server Actions gravam,
 * o refresh busca o estado real. Tempo real é melhoria de experiência, não
 * fonte de verdade.
 */

export type ConfiguracaoServidorRealtime = {
  appId: string
  key: string
  secret: string
  cluster: string
}

export function configuracaoServidorRealtime(): ConfiguracaoServidorRealtime | null {
  const appId = process.env.PUSHER_APP_ID
  const key = process.env.PUSHER_KEY
  const secret = process.env.PUSHER_SECRET
  const cluster = process.env.PUSHER_CLUSTER

  if (!appId || !key || !secret || !cluster) return null
  return { appId, key, secret, cluster }
}

export function realtimeConfiguradoNoServidor() {
  return configuracaoServidorRealtime() !== null
}
