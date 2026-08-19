import { NextResponse } from 'next/server'
import { podeAssinarCanal } from '@/features/atendimentos/lib/autorizacao-realtime'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { interpretarCanal } from '@/integracoes/realtime/canais'
import { assinarCanalPrivado } from '@/integracoes/realtime/servidor'

/**
 * Autorização de canal privado do Pusher.
 *
 * O navegador manda `socket_id` e `channel_name` em formulário — é o formato
 * que o `pusher-js` usa — e recebe de volta uma assinatura, ou 403. A rota é o
 * único lugar em que a assinatura é produzida, e ela só é produzida depois de
 * duas conferências no servidor: existe sessão válida, e essa sessão tem
 * vínculo com o recurso do canal.
 *
 * Nenhum id vindo do corpo da requisição é aceito como prova. `channel_name` é
 * apenas a pergunta; a resposta sai do banco.
 */
export async function POST(requisicao: Request) {
  const sessao = await obterSessaoServidor()
  if (!sessao) return new NextResponse('Acesso não autorizado.', { status: 401 })

  const formulario = await requisicao.formData()
  const socketId = String(formulario.get('socket_id') ?? '')
  const nomeDoCanal = String(formulario.get('channel_name') ?? '')

  const canal = interpretarCanal(nomeDoCanal)
  if (!socketId || !canal) {
    return new NextResponse('Canal inválido.', { status: 400 })
  }

  if (!(await podeAssinarCanal(canal, sessao.id))) {
    return new NextResponse('Acesso não autorizado.', { status: 403 })
  }

  const assinatura = assinarCanalPrivado(nomeDoCanal, socketId)
  if (!assinatura) {
    // Sem credenciais configuradas não há o que assinar. 503 diz a verdade: o
    // recurso existe, está indisponível, e o cliente segue sem tempo real.
    return new NextResponse('Tempo real indisponível.', { status: 503 })
  }

  return NextResponse.json(assinatura)
}
