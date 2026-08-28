import { expirarConvitesVencidos } from '@/features/atendimentos/lib/convites'
import { processarAvisosDePrazo } from '@/features/notificacoes/lib/avisos-de-prazo'
import { processarOportunidadesVencidas } from '@/features/oportunidades/lib/processar-vencidas'

/**
 * O que uma execução do agendador fez.
 *
 * Só números e nomes de rotina. Nada daqui identifica Cliente, prestador,
 * Atendimento ou solicitação: o resumo existe para responder "rodou? demorou
 * quanto? processou o quê?", e essas três perguntas não precisam de dado
 * pessoal para serem respondidas.
 */
export type ResumoDoAgendador = {
  duracaoMs: number
  oportunidadesExpiradas: number
  avisosDeExpiracao: number
  convitesExpirados: number
  avisosDePrazo: number
  /** Rotinas que falharam, pelo nome. A causa vai para o log do servidor. */
  falhas: string[]
}

/** Uma rotina temporal, com o nome que aparece no resumo e no log. */
type Rotina<T> = {
  nome: string
  executar: () => Promise<T>
}

/**
 * Executa uma rotina sem deixar que a falha dela derrube as outras.
 *
 * Falha parcial é o caso normal de um agendador: uma consulta que estourou o
 * tempo não pode impedir que os avisos de prazo saiam. O erro **não** é
 * engolido — ele vai para o log do servidor com o nome da rotina, e o nome
 * volta no resumo para que a resposta do endpoint já diga o que não rodou.
 */
async function isolar<T>(rotina: Rotina<T>, padrao: T, falhas: string[]) {
  try {
    return await rotina.executar()
  } catch (erro) {
    falhas.push(rotina.nome)
    console.error('[AGENDADOR]', {
      rotina: rotina.nome,
      nome: erro instanceof Error ? erro.name : 'Erro desconhecido',
      mensagem: erro instanceof Error ? erro.message : undefined,
    })
    return padrao
  }
}

/**
 * A varredura temporal da plataforma.
 *
 * ## Uma rotina, e não uma por regra
 *
 * As três coisas que dependem do relógio na Vincis — solicitações vencidas,
 * convites vencidos e prazos de Atendimento — têm a mesma cadência natural
 * (horas e dias) e o mesmo custo (uma consulta indexada cada). Três agendamentos
 * separados seriam três lugares para configurar, três para monitorar e três
 * para esquecer. Quando alguma delas precisar de outra frequência, é aqui que a
 * separação nasce.
 *
 * ## O que ela **não** faz
 *
 * Não valida tempo no lugar de ninguém. As Server Actions continuam recusando
 * proposta vencida, contraproposta de solicitação expirada e pagamento fora do
 * prazo por conta própria, comparando o relógio na hora da escrita. Esta rotina
 * **materializa** estado e emite os avisos que dependem do relógio; entre duas
 * execuções, a corretude continua sendo das transações.
 *
 * ## Idempotência
 *
 * Nenhuma das três produz efeito diferente quando executada duas vezes: as duas
 * expirações filtram pelo estado que vão mudar, e os dois tipos de aviso levam
 * chave de deduplicação conferida pelo índice único de `notificacoes`. Duas
 * execuções concorrentes disputam as mesmas linhas no banco, e o `returning` do
 * `UPDATE` decide qual delas avisa.
 *
 * `agora` é injetável para os testes conseguirem simular vencimento sem esperar
 * o relógio — em produção é sempre a hora do servidor, em UTC, comparada com
 * `timestamp` do Postgres.
 */
export async function processarPrazos(agora = new Date()): Promise<ResumoDoAgendador> {
  const inicio = Date.now()
  const falhas: string[] = []

  const oportunidades = await isolar(
    {
      nome: 'oportunidades-vencidas',
      executar: () => processarOportunidadesVencidas(agora),
    },
    { expiradas: 0, avisos: 0 },
    falhas,
  )

  const convitesExpirados = await isolar(
    { nome: 'convites-vencidos', executar: () => expirarConvitesVencidos() },
    0,
    falhas,
  )

  const avisosDePrazo = await isolar(
    { nome: 'avisos-de-prazo', executar: () => processarAvisosDePrazo(agora) },
    0,
    falhas,
  )

  return {
    duracaoMs: Date.now() - inicio,
    oportunidadesExpiradas: oportunidades.expiradas,
    avisosDeExpiracao: oportunidades.avisos,
    convitesExpirados,
    avisosDePrazo,
    falhas,
  }
}
