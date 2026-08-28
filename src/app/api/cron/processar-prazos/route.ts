import { NextResponse, type NextRequest } from 'next/server'
import {
  autorizarCron,
  NOME_VARIAVEL_CRON,
} from '@/features/agendador/lib/autorizacao-cron'
import { processarPrazos } from '@/features/agendador/lib/processar-prazos'

/**
 * A varredura temporal da plataforma, disparada pelo Vercel Cron.
 *
 * ## Por que uma rota, e não um script
 *
 * O projeto roda em funções serverless: não há processo de longa duração onde
 * um `setInterval` sobreviveria, e um worker separado seria um segundo
 * ambiente para configurar, versionar e monitorar. O Vercel Cron chama uma rota
 * HTTP do próprio deploy — mesmo código, mesmas variáveis, mesmo banco.
 *
 * ## Método
 *
 * `GET`, porque é o que o Vercel Cron dispara. Não é uma leitura no sentido
 * HTTP — ela escreve —, mas o agendamento não oferece escolha, e a operação é
 * idempotente: repetir a chamada não produz efeito diferente, que é a
 * propriedade que realmente importa aqui.
 *
 * ## Resposta
 *
 * Só contadores e duração. Nenhum id, nome, protocolo ou texto de solicitação
 * atravessa — a resposta vai para o log de execução da Vercel, que é um lugar
 * legítimo para saber *quanto* foi processado e um lugar ruim para saber *o
 * quê*.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const autorizacao = autorizarCron(request.headers.get('authorization'))

  if (!autorizacao.autorizado) {
    if (autorizacao.motivo === 'sem-configuracao') {
      // Diz o que falta configurar, nunca o valor. Sem a variável, o agendador
      // fica desligado — e desligado com aviso é melhor que aberto em silêncio.
      console.error('[AGENDADOR] variável ausente', { variavel: NOME_VARIAVEL_CRON })
      return NextResponse.json(
        { erro: 'Agendador não configurado.' },
        { status: 503 },
      )
    }
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }

  const resumo = await processarPrazos()

  // Uma linha por execução, com números e nada mais. Log por registro cresceria
  // com o volume e afogaria justamente o resumo que interessa.
  console.log('[AGENDADOR] execução concluída', resumo)

  return NextResponse.json(
    { status: resumo.falhas.length ? 'parcial' : 'ok', ...resumo },
    // Falha parcial é 207: parte do trabalho foi feita, e a Vercel precisa
    // conseguir distinguir isso de um sucesso limpo no painel de execuções.
    { status: resumo.falhas.length ? 207 : 200 },
  )
}
