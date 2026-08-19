import Pusher from 'pusher-js'

/**
 * Conexão do navegador com o Pusher.
 *
 * Uma só por aba, guardada em módulo: cada `new Pusher` abre um WebSocket, e
 * abrir um por componente montado transformaria a navegação entre telas numa
 * escada de conexões. Os componentes assinam e desassinam canais sobre esta
 * conexão única.
 *
 * Só a chave pública chega aqui. Ela permite **pedir** a assinatura de um canal
 * privado; quem assina é `/api/realtime/auth`, no servidor, depois de conferir
 * sessão e vínculo. Sem as variáveis públicas configuradas devolve `null`, e a
 * tela segue funcionando sem tempo real.
 */
let conexao: Pusher | null = null

export function realtimeConfiguradoNoNavegador() {
  return Boolean(
    process.env.NEXT_PUBLIC_PUSHER_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  )
}

export function obterConexaoRealtime(): Pusher | null {
  if (typeof window === 'undefined') return null
  if (conexao) return conexao

  const chave = process.env.NEXT_PUBLIC_PUSHER_KEY
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  if (!chave || !cluster) return null

  conexao = new Pusher(chave, {
    cluster,
    // A autorização passa pela nossa rota: é lá que sessão e vínculo são
    // conferidos. O cookie viaja porque a requisição é de mesma origem.
    channelAuthorization: {
      endpoint: '/api/realtime/auth',
      transport: 'ajax',
    },
    // Reconexão é responsabilidade do próprio pusher-js; o que a aplicação faz
    // por cima disso é refazer as consultas ao voltar, porque eventos perdidos
    // durante a queda não são reenviados.
    activityTimeout: 30_000,
    pongTimeout: 10_000,
  })

  return conexao
}
