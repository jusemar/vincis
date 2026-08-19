import Pusher from 'pusher'
import {
  canalDoAtendimento,
  canalDoConvite,
  canalDoUsuario,
} from './canais'
import { configuracaoServidorRealtime } from './config'
import { EVENTO_ATUALIZACAO, type EventoRealtime } from './eventos'

/**
 * Arquivo de servidor.
 *
 * Nada aqui pode ser importado por componente de cliente: o `secret` do Pusher
 * mora nesta variável de ambiente e é ele que assina a autorização dos canais
 * privados. O par para o navegador é `navegador.ts`, que só conhece a chave
 * pública.
 */
let instancia: Pusher | null = null

/**
 * Cliente do Pusher no servidor.
 *
 * Preguiçoso e único: criar um por requisição abriria conexões à toa. Devolve
 * `null` quando não há credenciais — e é esse `null` que faz toda a publicação
 * virar uma operação silenciosa em desenvolvimento sem Pusher configurado.
 */
function clientePusher() {
  if (instancia) return instancia
  const config = configuracaoServidorRealtime()
  if (!config) return null

  instancia = new Pusher({
    appId: config.appId,
    key: config.key,
    secret: config.secret,
    cluster: config.cluster,
    useTLS: true,
  })
  return instancia
}

/** Autoriza a assinatura de um canal privado. Só a rota de auth chama isto. */
export function assinarCanalPrivado(canal: string, socketId: string) {
  const cliente = clientePusher()
  if (!cliente) return null
  return cliente.authorizeChannel(socketId, canal)
}

/**
 * Publica um aviso em vários canais de uma vez.
 *
 * **Nunca lança.** Uma indisponibilidade do Pusher não pode desfazer uma
 * mensagem já gravada nem devolver erro para quem enviou: o dado está no
 * PostgreSQL, que continua sendo a fonte de verdade. O pior caso é a outra
 * pessoa ver a novidade no próximo refresh — exatamente o comportamento de
 * antes desta etapa.
 *
 * O disparo é em lote e sem `await` no caminho crítico da action; o `catch`
 * existe para que uma promessa rejeitada não derrube o processo do Next.
 */
export async function publicarEventos(
  envios: { canal: string; evento: EventoRealtime }[],
) {
  if (!envios.length) return false
  const cliente = clientePusher()
  if (!cliente) return false

  try {
    // O Pusher aceita até 10 mensagens por lote.
    for (let inicio = 0; inicio < envios.length; inicio += 10) {
      await cliente.triggerBatch(
        envios.slice(inicio, inicio + 10).map(({ canal, evento }) => ({
          channel: canal,
          name: EVENTO_ATUALIZACAO,
          data: evento,
        })),
      )
    }
    return true
  } catch (erro) {
    console.error('[realtime] falha ao publicar evento', erro)
    return false
  }
}

/** Avisa pessoas específicas, cada uma no canal privado dela. */
export function publicarParaUsuarios(
  usuarioIds: string[],
  evento: EventoRealtime,
) {
  const alvos = Array.from(new Set(usuarioIds)).filter(Boolean)
  return publicarEventos(
    alvos.map((usuarioId) => ({ canal: canalDoUsuario(usuarioId), evento })),
  )
}

/** Avisa quem estiver com aquele Atendimento aberto. */
export function publicarNoAtendimento(
  atendimentoId: string,
  evento: EventoRealtime,
) {
  return publicarEventos([
    { canal: canalDoAtendimento(atendimentoId), evento },
  ])
}

/** Avisa as duas pontas de uma negociação. */
export function publicarNoConvite(conviteId: string, evento: EventoRealtime) {
  return publicarEventos([{ canal: canalDoConvite(conviteId), evento }])
}
