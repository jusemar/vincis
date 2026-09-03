import { and, eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { oportunidades } from '@/db/schema'
import { ehDeSimulacao } from '../constants/oportunidade'
import { obterVinculoComOportunidade } from './autorizacao'
import { oportunidadeExpirada } from './vigencia'

/**
 * O fluxo **direto**: conversa entre cliente e profissional, sem etapa comercial.
 *
 * ## Duas negociações no mesmo módulo
 *
 * A Oportunidade tradicional é uma disputa comercial: prestadores propõem um
 * valor, o Cliente aceita um deles, paga, e o pagamento abre o Atendimento.
 * A Oportunidade nascida da **simulação de preços** não é isso — o cliente já
 * viu o preço daquela pessoa e levantou a mão para conversar. O combinado final
 * acontece entre os dois, fora da plataforma.
 *
 * Tudo o que separa os dois fluxos está neste arquivo e é decidido por uma
 * pergunta só: `origem = 'simulacao_preco'`. As Oportunidades tradicionais não
 * passam por nenhuma condição nova — as duas funções abaixo simplesmente não
 * têm o que dizer sobre elas.
 *
 * ## O que o fluxo direto **não** tem, e por quê
 *
 * Ele não cria proposta. E é isso — uma ausência, não uma proibição espalhada —
 * que fecha o caminho comercial inteiro de uma vez: sem linha em
 * `oportunidade_propostas`, não há o que aceitar, não há contraproposta, não há
 * acordo, não há pagamento e não há Atendimento. Cada uma dessas etapas já
 * exigia a proposta antes desta mudança existir; nenhuma precisou aprender uma
 * regra nova.
 *
 * O aceite dele mora em `oportunidades.interesse_em`: uma data, sem valor, sem
 * prazo e sem validade — porque é exatamente isso que ele significa.
 */
export function ehFluxoDireto(origem: string) {
  return ehDeSimulacao(origem)
}

/** O que a conversa precisa saber sobre a Oportunidade para deixar ou não escrever. */
export type ContextoDaConversa = {
  id: string
  origem: string
  status: string
  expiraEm: Date | null
  clienteUsuarioId: string
  destinatarioId: string | null
  titulo: string
  interesseEm: Date | null
}

export type AcessoAConversa = {
  oportunidade: ContextoDaConversa
  /** `cliente` (dono) ou `prestador` (destinatário). Nunca mais ninguém. */
  papel: 'cliente' | 'prestador'
  /** A outra ponta — quem recebe o aviso da mensagem. */
  outraParte: string
  /** Ainda aceita mensagem nova? Histórico continua legível de qualquer forma. */
  podeEscrever: boolean
}

/**
 * Quem pode ler e escrever na conversa de uma Oportunidade.
 *
 * Uma porta só, usada por **todas** as ações da conversa — enviar, carregar,
 * confirmar interesse. Se cada uma tivesse a sua, bastaria uma esquecer o par
 * (oportunidade, pessoa) para que conhecer um id virasse acesso à conversa
 * alheia, que é a forma mais comum de IDOR.
 *
 * Três exigências, nesta ordem:
 *
 * 1. a Oportunidade é do **fluxo direto** — a tradicional conversa por proposta
 *    e contraproposta, e abrir um segundo canal nela mudaria o módulo que a
 *    instrução pediu para não mexer;
 * 2. a pessoa tem vínculo com ela, pela mesma função que decide todo o resto do
 *    módulo. Numa privada isso já significa: ou é o Cliente dono, ou é o
 *    Profissional **destinatário**. Outro contador igualmente habilitado não
 *    entra, nem com o id na mão;
 * 3. para escrever, a solicitação precisa estar viva. Recusada, encerrada ou
 *    vencida, o histórico continua legível e ninguém escreve mais — o "não
 *    tenho interesse" seria uma decisão que o teclado desfaz.
 *
 * Devolve `null` — e não um erro diferente — para quem não alcança: quem não é
 * parte não deve nem descobrir que a conversa existe.
 */
export async function acessoAConversa(
  oportunidadeId: string,
  usuarioId: string,
): Promise<AcessoAConversa | null> {
  const [oportunidade] = await db
    .select({
      id: oportunidades.id,
      origem: oportunidades.origem,
      status: oportunidades.status,
      expiraEm: oportunidades.expiraEm,
      clienteUsuarioId: oportunidades.clienteUsuarioId,
      destinatarioId: oportunidades.destinatarioId,
      titulo: oportunidades.titulo,
      interesseEm: oportunidades.interesseEm,
    })
    .from(oportunidades)
    .where(eq(oportunidades.id, oportunidadeId))
    .limit(1)

  if (!oportunidade || !ehFluxoDireto(oportunidade.origem)) return null

  const vinculo = await obterVinculoComOportunidade(oportunidadeId, usuarioId)
  if (!vinculo) return null

  // O vínculo de prestador é dado pela categoria em solicitações públicas; aqui
  // ele **precisa** ser o destinatário, e a conferência é explícita para não
  // depender de o fluxo direto continuar sendo sempre privado.
  if (vinculo === 'prestador' && oportunidade.destinatarioId !== usuarioId) {
    return null
  }

  const viva =
    oportunidade.status === 'aberta' && !oportunidadeExpirada(oportunidade)

  return {
    oportunidade,
    papel: vinculo,
    outraParte:
      vinculo === 'cliente'
        ? (oportunidade.destinatarioId as string)
        : oportunidade.clienteUsuarioId,
    podeEscrever: viva,
  }
}

/**
 * A Oportunidade aceita o caminho comercial?
 *
 * Consulta enxuta e direta ao banco, para quem precisa da resposta antes de
 * criar uma proposta. `false` só para o fluxo direto — toda Oportunidade
 * tradicional continua respondendo `true`, inclusive as que existiam antes de
 * a coluna `origem` existir.
 */
export async function aceitaFluxoComercial(oportunidadeId: string) {
  const [linha] = await db
    .select({ origem: oportunidades.origem })
    .from(oportunidades)
    .where(
      and(
        eq(oportunidades.id, oportunidadeId),
        eq(oportunidades.origem, 'simulacao_preco'),
      ),
    )
    .limit(1)

  return linha === undefined
}
