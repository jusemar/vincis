'use server'

import { and, eq, gt, lt, lte, ne } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  consultoriaAgendamentos,
  consultoriaConfiguracoes,
  consultoriaReservas,
} from '@/db/schema'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { MENSAGEM_HORARIO_INDISPONIVEL } from '../constants/contratacao'
import { HOLD_CONSULTORIA_MINUTOS } from '../constants/reserva'
import { bordasDeConflito, expiracaoDe } from '../lib/reserva'
import type { ResumoContratacaoDTO } from '../types/contratacao'
import type { ReservaDTO, ResultadoReserva } from '../types/contratacao'
import { prepararContratacaoConsultoria } from './contratacao'

const CODIGO_UNICIDADE_POSTGRES = '23505'

function ehViolacaoDeUnicidade(erro: unknown) {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code?: string }).code === CODIGO_UNICIDADE_POSTGRES
  )
}

const CONFLITO = {
  situacao: 'horario_indisponivel',
  mensagem: MENSAGEM_HORARIO_INDISPONIVEL,
} as const

/** A reserva do banco, vestida com os horários que a tela mostra. */
function paraDTO(
  registro: {
    id: string
    inicioEm: Date
    fimEm: Date
    expiraEm: Date
    duracaoMinutos: number
    valorCentavos: number
    timezone: string
  },
  resumo: ResumoContratacaoDTO,
): ReservaDTO {
  return {
    id: registro.id,
    data: resumo.data,
    inicio: resumo.inicio,
    fim: resumo.fim,
    timezone: registro.timezone,
    inicioEm: registro.inicioEm,
    fimEm: registro.fimEm,
    expiraEm: registro.expiraEm,
    duracaoMinutos: registro.duracaoMinutos,
    valorCentavos: registro.valorCentavos,
  }
}

/**
 * Reserva o horário para este Cliente por dez minutos.
 *
 * ## Onde mora a exclusividade
 *
 * No banco, e em lugar nenhum além dele. Botão desabilitado, estado do React,
 * debounce e loading melhoram a experiência e não garantem nada: dois
 * navegadores em máquinas diferentes não conversam entre si. A garantia real
 * tem duas camadas, e as duas são do PostgreSQL:
 *
 * 1. **`SELECT ... FOR UPDATE` na linha da configuração.** A primeira coisa que
 *    a transação faz é travar a consultoria disputada. Quem chegar depois fica
 *    na fila do banco até o primeiro terminar — e então enxerga o resultado
 *    dele. É o mesmo recurso que `salvarDisponibilidades` já usa para serializar
 *    duas edições da mesma agenda, pelo mesmo motivo: a regra de conflito é uma
 *    propriedade do **conjunto** de reservas, e não de cada linha isolada, e
 *    nenhuma constraint por linha consegue enxergar o conjunto.
 * 2. **Índice único parcial `(configuracao_id, inicio_em) WHERE status='ativa'`.**
 *    A rede embaixo do trapézio, para o caso grosseiro de dois inícios idênticos.
 *    Se algum caminho futuro esquecer a trava, o banco ainda recusa — e o `23505`
 *    é tratado relendo o vencedor, do mesmo jeito que
 *    `garantirAtendimentoDaOportunidade` faz.
 *
 * ## Por que não `EXCLUDE USING gist`
 *
 * Seria a expressão mais direta de "estes períodos não podem se cruzar", mas
 * exige a extensão `btree_gist` instalada em todo ambiente — inclusive no
 * Postgres descartável da suíte — e a folga entre consultas é configurável por
 * Profissional, então o período a excluir teria de ser gravado já esticado e
 * envelheceria junto com a configuração. A trava por consultoria dá a mesma
 * garantia sem obrigar nenhum ambiente a ganhar uma extensão.
 *
 * ## Conflito é de intervalo, não de horário igual
 *
 * 14:00–15:00 e 14:30–15:30 são inícios diferentes e conflito igual. A consulta
 * de colisão compara intervalos com a folga somada dos dois lados — a mesma
 * expressão que o gerador de slots aplica —, e é por isso que ela vive em
 * `lib/reserva.ts` e não escrita à mão aqui.
 *
 * ## O que esta ação **não** faz
 *
 * Não cobra, não confirma contratação, não cria Atendimento e não gera
 * protocolo. Reservar é só ganhar o direito de continuar.
 */
export async function reservarHorarioDaConsultoria(
  entrada: unknown,
): Promise<ResultadoReserva> {
  // Toda a validação da etapa anterior, sem uma segunda cópia: sessão, RBAC,
  // Profissional público, horário legítimo e resumo relido do banco.
  const preparacao = await prepararContratacaoConsultoria(entrada)
  if (preparacao.situacao !== 'pronto') return preparacao

  const { resumo } = preparacao

  // A sessão de novo, e de propósito: o dono da reserva é sempre quem o cookie
  // provou ser, nunca um id que veio na requisição.
  const sessao = await obterSessaoServidor()
  if (!sessao) {
    return { situacao: 'precisa_entrar', mensagem: 'Entre na sua conta para continuar.' }
  }

  const agora = new Date()
  const periodo = { inicioEm: resumo.inicioEm, fimEm: resumo.fimEm }

  try {
    const resultado = await db.transaction(async (tx) => {
      // (1) A fila do banco começa aqui. Enquanto esta transação viver, nenhuma
      // outra aquisição para esta consultoria passa desta linha.
      const [configuracao] = await tx
        .select({
          id: consultoriaConfiguracoes.id,
          intervaloMinutos: consultoriaConfiguracoes.intervaloMinutos,
        })
        .from(consultoriaConfiguracoes)
        .where(eq(consultoriaConfiguracoes.id, resumo.consultoriaId))
        .for('update')
        .limit(1)

      if (!configuracao) return CONFLITO

      // (2) A passagem do tempo vira estado. Sem isto o índice único trataria
      // uma reserva vencida como se ainda valesse — ele não sabe que horas são.
      // Não é daqui que vem a liberação do horário (a consulta de agenda já
      // ignora vencidas por conta própria); é o que permite o índice existir.
      await tx
        .update(consultoriaReservas)
        .set({ status: 'expirada', updatedAt: agora })
        .where(
          and(
            eq(consultoriaReservas.configuracaoId, configuracao.id),
            eq(consultoriaReservas.status, 'ativa'),
            lte(consultoriaReservas.expiraEm, agora),
          ),
        )

      // (3) Idempotência. Clique duplo, retry, resposta atrasada e F5 caem
      // todos aqui e recebem a MESMA reserva, com o relógio original — refresh
      // não é renovação, e dez minutos não viram vinte por insistência.
      const [minha] = await tx
        .select()
        .from(consultoriaReservas)
        .where(
          and(
            eq(consultoriaReservas.configuracaoId, configuracao.id),
            eq(consultoriaReservas.clienteUsuarioId, sessao.id),
            eq(consultoriaReservas.status, 'ativa'),
            gt(consultoriaReservas.expiraEm, agora),
            eq(consultoriaReservas.inicioEm, resumo.inicioEm),
          ),
        )
        .limit(1)

      if (minha) {
        return {
          situacao: 'reservado' as const,
          resumo,
          reserva: paraDTO(minha, resumo),
          jaExistia: true,
        }
      }

      // (4) Alguém mais está segurando este pedaço da agenda? A comparação é de
      // intervalo, com a folga dos dois lados.
      const { limiteInferior, limiteSuperior } = bordasDeConflito(
        periodo,
        configuracao.intervaloMinutos,
      )
      const conflitantes = await tx
        .select({ id: consultoriaReservas.id })
        .from(consultoriaReservas)
        .where(
          and(
            eq(consultoriaReservas.configuracaoId, configuracao.id),
            eq(consultoriaReservas.status, 'ativa'),
            gt(consultoriaReservas.expiraEm, agora),
            // `inicio < limiteSuperior AND fim > limiteInferior` é a mesma
            // desigualdade de `periodosConflitam`, em forma que usa índice.
            lt(consultoriaReservas.inicioEm, limiteSuperior),
            gt(consultoriaReservas.fimEm, limiteInferior),
            ne(consultoriaReservas.clienteUsuarioId, sessao.id),
          ),
        )
        .limit(1)

      if (conflitantes.length) return CONFLITO

      /**
       * E as consultorias já contratadas.
       *
       * Uma consultoria confirmada não vence: ela bloqueia o horário para
       * sempre. A checagem é separada da anterior porque a origem é outra —
       * reserva caduca, contrato não — e juntá-las numa consulta só esconderia
       * essa diferença atrás de um `union`.
       */
      const contratadas = await tx
        .select({ id: consultoriaAgendamentos.id })
        .from(consultoriaAgendamentos)
        .where(
          and(
            eq(consultoriaAgendamentos.configuracaoId, configuracao.id),
            eq(consultoriaAgendamentos.status, 'agendada'),
            lt(consultoriaAgendamentos.inicioEm, limiteSuperior),
            gt(consultoriaAgendamentos.fimEm, limiteInferior),
          ),
        )
        .limit(1)

      if (contratadas.length) return CONFLITO

      // (5) O Cliente trocou de horário: as reservas dele que sobraram saem de
      // cena. Depois da checagem de conflito, e antes da inserção — assim ele
      // nunca perde a antiga sem ter direito à nova, e a antiga não bloqueia a
      // nova por causa do buffer.
      await tx
        .update(consultoriaReservas)
        .set({ status: 'liberada', updatedAt: agora })
        .where(
          and(
            eq(consultoriaReservas.configuracaoId, configuracao.id),
            eq(consultoriaReservas.clienteUsuarioId, sessao.id),
            eq(consultoriaReservas.status, 'ativa'),
          ),
        )

      // (6) A fotografia. Preço e duração ficam congelados: o Profissional pode
      // reajustar durante os dez minutos, e quem reservou paga o que viu.
      const [nova] = await tx
        .insert(consultoriaReservas)
        .values({
          configuracaoId: configuracao.id,
          clienteUsuarioId: sessao.id,
          inicioEm: resumo.inicioEm,
          fimEm: resumo.fimEm,
          expiraEm: expiracaoDe(agora, HOLD_CONSULTORIA_MINUTOS),
          valorCentavos: resumo.valorCentavos,
          duracaoMinutos: resumo.duracaoMinutos,
          timezone: resumo.timezone,
          descricao: resumo.descricao,
        })
        .returning()

      return {
        situacao: 'reservado' as const,
        resumo,
        reserva: paraDTO(nova, resumo),
        jaExistia: false,
      }
    })

    return resultado
  } catch (erro) {
    // A trava torna isto improvável, e é exatamente por isso que ele fica: se
    // um caminho futuro inserir sem travar, quem perdeu a corrida recebe a
    // recusa pública, e não um erro de banco na cara do Cliente.
    if (!ehViolacaoDeUnicidade(erro)) throw erro
    return CONFLITO
  }
}
