import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoEventos,
  consultoriaAgendamentos,
  consultoriaPagamentos,
  notificacoes,
  sessoesUsuario,
} from '@/db/schema'
import { TIPOS_EVENTO_ATENDIMENTO } from '@/features/atendimentos/constants/atendimento'
import {
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import {
  cancelarConsultoria,
  remarcarConsultoria,
} from '@/features/consultorias/actions/ciclo'
import { pagarConsultoriaSimulado } from '@/features/consultorias/actions/pagamento'
import { reservarHorarioDaConsultoria } from '@/features/consultorias/actions/reserva'
import { ANTECEDENCIA_CLIENTE_MINUTOS } from '@/features/consultorias/constants/ciclo'
import { listarHorariosDoDia } from '@/features/consultorias/queries/agenda-publica'
import {
  listarConsultoriasDoCliente,
  listarConsultoriasDoPrestador,
} from '@/features/consultorias/queries/agendamentos'
import {
  dataLocalDoInstante,
  somarDiasEmDataLocal,
} from '@/features/consultorias/lib/tempo'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { entrarNaVideochamada } from '@/features/videochamada/actions/videochamada'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { comSessao, sairDaSessao } from './setup/sessao'

/**
 * O ciclo pós-agendamento: desmarcar, mudar de horário, e o que sobra disso.
 *
 * ## O que este arquivo precisa provar
 *
 * Três coisas que só o servidor pode garantir: que **quem** altera é parte do
 * contrato, que **quando** obedece ao prazo do papel, e que a troca de horário
 * é atômica — o horário novo é conquistado antes de o antigo ser solto, e uma
 * disputa perdida deixa a consultoria exatamente como estava.
 *
 * O cenário é montado pelo caminho real (reservar, pagar), porque é isso que
 * cria o Atendimento e o protocolo cuja preservação é justamente o ponto.
 *
 * A Daily é dublê: o que se testa aqui é a decisão da Vincis — sala anulada na
 * remarcação, entrada barrada no cancelamento — e não o serviço dela.
 */

const salasCriadas: string[] = []
vi.mock('@/features/videochamada/lib/daily/cliente-daily', () => ({
  criarSala: vi.fn(async (p: { nome: string }) => {
    if (!salasCriadas.includes(p.nome)) salasCriadas.push(p.nome)
    return { name: p.nome, url: `https://vincis.daily.co/${p.nome}`, privacy: 'private' }
  }),
  obterSala: vi.fn(async (nome: string) =>
    salasCriadas.includes(nome)
      ? { name: nome, url: `https://vincis.daily.co/${nome}`, privacy: 'private' }
      : null,
  ),
  criarTokenDeReuniao: vi.fn(async (p: { nomeDaSala: string; usuarioId: string }) =>
    `tok_${p.nomeDaSala}_${p.usuarioId}`,
  ),
  apagarSala: vi.fn(async () => true),
}))

const SUFIXO = '@consultoria-ciclo.teste'
const FUSO = 'America/Sao_Paulo'
const UM_MINUTO = 60_000

type Chave = 'anaPro' | 'brunoPro' | 'clienteA' | 'clienteB'
const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  anaPro: { perfil: 'profissional', prestador: 'profissional' },
  brunoPro: { perfil: 'profissional', prestador: 'profissional' },
  clienteA: { perfil: 'cliente' },
  clienteB: { perfil: 'cliente' },
}

const CONFIG = {
  titulo: 'Consultoria tributária',
  descricaoCurta: 'Conversa ao vivo sobre impostos.',
  valorCentavos: 18_000,
  duracaoMinutos: 30,
  intervaloMinutos: 0,
  antecedenciaMinimaMinutos: 120,
  horizonteDias: 60,
  timezone: FUSO,
}

let contas: Record<Chave, ContaDeTeste>
let dataAlvo: string

/**
 * Um horário livre de verdade, pedido no momento do uso.
 *
 * Um array capturado no `beforeAll` envelhece: cada contratação ocupa um slot,
 * e o teste seguinte pegaria um índice que já não existe — que foi exatamente
 * como esta suíte começou a falhar com `dados_invalidos`. Perguntar à agenda
 * agora custa uma consulta e nunca mente.
 */
async function slotLivre(
  prestador: ContaDeTeste,
  opcoes: { pular?: number; data?: string } = {},
): Promise<{ data: string; inicio: string }> {
  const pular = opcoes.pular ?? 0
  for (let avanco = 0; avanco < 8; avanco += 1) {
    const data = opcoes.data ?? somarDiasEmDataLocal(dataAlvo, avanco)
    const { horarios } = await listarHorariosDoDia({ prestadorId: prestador.id, data })
    if (horarios.length > pular) return { data, inicio: horarios[pular].inicio }
    if (opcoes.data) break
  }
  throw new Error('sem horário livre na agenda de teste')
}

type Contratada = {
  agendamentoId: string
  atendimentoId: string
  protocolo: string
  inicioEm: Date
  fimEm: Date
  data: string
  inicio: string
}

async function configurar(conta: ContaDeTeste) {
  await comSessao(conta.token, async () => {
    const salva = await salvarConsultoria(CONFIG)
    if (!salva.sucesso) throw new Error(salva.mensagem)
    // Todos os dias da semana: o alocador de horários abaixo precisa poder
    // avançar de data quando o dia corrente se esgota.
    const faixas = await salvarDisponibilidades(
      [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaInicio: '08:00',
        horaFim: '18:00',
      })),
    )
    if (!faixas.sucesso) throw new Error(faixas.mensagem)
  })
}

/** Reserva e paga de verdade — é o que cria Atendimento e protocolo. */
async function contratar(
  cliente: ContaDeTeste,
  prestador: ContaDeTeste,
  onde?: { data: string; inicio: string },
): Promise<Contratada> {
  const alvo = onde ?? (await slotLivre(prestador))
  const reserva = await comSessao(cliente.token, () =>
    reservarHorarioDaConsultoria({
      prestadorId: prestador.id,
      data: alvo.data,
      inicio: alvo.inicio,
      descricao: 'Assunto da consultoria de teste.',
    }),
  )
  if (reserva.situacao !== 'reservado') throw new Error(`Reserva: ${reserva.situacao}`)
  const pago = await comSessao(cliente.token, () =>
    pagarConsultoriaSimulado({ reservaId: reserva.reserva.id }),
  )
  if (pago.situacao !== 'confirmado') throw new Error(`Pagamento: ${pago.situacao}`)

  const [ag] = await db
    .select({
      id: consultoriaAgendamentos.id,
      inicioEm: consultoriaAgendamentos.inicioEm,
      fimEm: consultoriaAgendamentos.fimEm,
    })
    .from(consultoriaAgendamentos)
    .where(eq(consultoriaAgendamentos.reservaId, reserva.reserva.id))
    .limit(1)

  return {
    agendamentoId: ag.id,
    atendimentoId: pago.atendimentoId,
    protocolo: pago.protocolo,
    inicioEm: ag.inicioEm,
    fimEm: ag.fimEm,
    data: alvo.data,
    inicio: alvo.inicio,
  }
}

const relogio = (instante: Date) => vi.setSystemTime(instante)
/** Bem antes do prazo do Cliente: tudo é permitido. */
const bemAntes = (c: Contratada) =>
  relogio(new Date(c.inicioEm.getTime() - 5 * 60 * UM_MINUTO))

async function estado(agendamentoId: string) {
  const [linha] = await db
    .select()
    .from(consultoriaAgendamentos)
    .where(eq(consultoriaAgendamentos.id, agendamentoId))
    .limit(1)
  return linha
}

async function eventos(atendimentoId: string, tipo: string) {
  return db
    .select({ descricao: atendimentoEventos.descricao })
    .from(atendimentoEventos)
    .where(
      and(
        eq(atendimentoEventos.atendimentoId, atendimentoId),
        eq(atendimentoEventos.tipo, tipo),
      ),
    )
}

async function avisos(tipo: string, atendimentoId: string) {
  return db
    .select({ destinatarioId: notificacoes.destinatarioId, resumo: notificacoes.resumo })
    .from(notificacoes)
    .where(
      and(eq(notificacoes.tipo, tipo), eq(notificacoes.atendimentoId, atendimentoId)),
    )
}

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119471')
  dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 10)
  await configurar(contas.anaPro)
  await configurar(contas.brunoPro)

  // As sessões precisam sobreviver ao adiantamento do relógio (o harness cria
  // sessões de uma hora). Conserto de cenário, não afrouxamento de regra.
  await db
    .update(sessoesUsuario)
    .set({ expiraEm: new Date(Date.now() + 400 * 24 * 3600_000) })
    .where(
      inArray(
        sessoesUsuario.usuarioId,
        Object.values(contas).map((c) => c.id),
      ),
    )
  vi.useFakeTimers({ toFake: ['Date'] })
}, 240_000)

afterEach(() => {
  salasCriadas.length = 0
})

afterAll(async () => {
  vi.useRealTimers()
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('autorização', () => {
  it('o Cliente dono cancela', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    const r = await comSessao(contas.clienteA.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId }),
    )
    expect(r.situacao).toBe('cancelada')
    expect((await estado(c.agendamentoId)).status).toBe('cancelada')
  })

  it('o Profissional contratado cancela, com motivo', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    const r = await comSessao(contas.anaPro.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId, motivo: 'Imprevisto médico.' }),
    )
    expect(r.situacao).toBe('cancelada')
    const linha = await estado(c.agendamentoId)
    expect(linha.motivoCancelamento).toBe('Imprevisto médico.')
    expect(linha.canceladoPor).toBe(contas.anaPro.id)
  })

  it('o Profissional precisa dar motivo — o Cliente, não', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    const semMotivo = await comSessao(contas.anaPro.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId }),
    )
    expect(semMotivo.situacao).toBe('dados_invalidos')
    // Em branco também não vale: não é motivo, é uma linha vazia.
    const soEspacos = await comSessao(contas.anaPro.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId, motivo: '   ' }),
    )
    expect(soEspacos.situacao).toBe('dados_invalidos')
    expect((await estado(c.agendamentoId)).status).toBe('agendada')

    const doCliente = await comSessao(contas.clienteA.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId }),
    )
    expect(doCliente.situacao).toBe('cancelada')
  })

  it('terceiro não cancela nem remarca', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    const destino = await slotLivre(contas.anaPro)
    bemAntes(c)
    const cancelar = await comSessao(contas.clienteB.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId }),
    )
    const remarcar = await comSessao(contas.clienteB.token, () =>
      remarcarConsultoria({
        agendamentoId: c.agendamentoId,
        data: destino.data,
        inicio: destino.inicio,
      }),
    )
    expect(cancelar.situacao).toBe('sem_acesso')
    expect(remarcar.situacao).toBe('sem_acesso')
    expect((await estado(c.agendamentoId)).status).toBe('agendada')
  })

  it('Profissional alheio não mexe na consultoria de outro', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    const r = await comSessao(contas.brunoPro.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId, motivo: 'quero cancelar' }),
    )
    expect(r.situacao).toBe('sem_acesso')
  })

  it('visitante sem sessão não mexe', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    sairDaSessao()
    expect((await cancelarConsultoria({ agendamentoId: c.agendamentoId })).situacao).toBe(
      'precisa_entrar',
    )
  })
})

describe('prazo, no servidor', () => {
  it('o Cliente é recusado a 1h59m59s e aceito a 2h00m00s', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    const limite = c.inicioEm.getTime() - ANTECEDENCIA_CLIENTE_MINUTOS * UM_MINUTO

    relogio(new Date(limite + 1000))
    expect(
      (
        await comSessao(contas.clienteA.token, () =>
          cancelarConsultoria({ agendamentoId: c.agendamentoId }),
        )
      ).situacao,
    ).toBe('fora_do_prazo')

    relogio(new Date(limite))
    expect(
      (
        await comSessao(contas.clienteA.token, () =>
          cancelarConsultoria({ agendamentoId: c.agendamentoId }),
        )
      ).situacao,
    ).toBe('cancelada')
  })

  it('o Profissional é aceito até o início e recusado depois', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)

    relogio(new Date(c.inicioEm.getTime() + 1000))
    expect(
      (
        await comSessao(contas.anaPro.token, () =>
          cancelarConsultoria({ agendamentoId: c.agendamentoId, motivo: 'atrasei' }),
        )
      ).situacao,
    ).toBe('fora_do_prazo')

    relogio(c.inicioEm)
    expect(
      (
        await comSessao(contas.anaPro.token, () =>
          cancelarConsultoria({ agendamentoId: c.agendamentoId, motivo: 'imprevisto' }),
        )
      ).situacao,
    ).toBe('cancelada')
  })
})

describe('efeitos do cancelamento', () => {
  it('libera o horário, preserva protocolo e pagamento, e registra o histórico', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)

    // Ocupado enquanto agendada.
    const ocupada = await listarHorariosDoDia({
      prestadorId: contas.anaPro.id,
      data: c.data,
    })
    expect(ocupada.horarios.map((h) => h.inicio)).not.toContain(c.inicio)

    await comSessao(contas.anaPro.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId, motivo: 'Indisponibilidade imprevista.' }),
    )

    // Livre no instante seguinte — sem passo extra, sem varredura.
    const livre = await listarHorariosDoDia({
      prestadorId: contas.anaPro.id,
      data: c.data,
    })
    expect(livre.horarios.map((h) => h.inicio)).toContain(c.inicio)

    // Nada foi apagado.
    const pagamentos = await db
      .select()
      .from(consultoriaPagamentos)
      .where(eq(consultoriaPagamentos.agendamentoId, c.agendamentoId))
    expect(pagamentos).toHaveLength(1)

    const historico = await eventos(
      c.atendimentoId,
      TIPOS_EVENTO_ATENDIMENTO.consultoriaCancelada,
    )
    expect(historico).toHaveLength(1)
    expect(historico[0].descricao).toContain('cancelada pelo Profissional')
    expect(historico[0].descricao).toContain('Indisponibilidade imprevista.')
  })

  it('duplo clique e retry cancelam uma vez só', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)

    const [um, dois] = await Promise.all([
      comSessao(contas.clienteA.token, () =>
        cancelarConsultoria({ agendamentoId: c.agendamentoId }),
      ),
      comSessao(contas.clienteA.token, () =>
        cancelarConsultoria({ agendamentoId: c.agendamentoId }),
      ),
    ])
    const tres = await comSessao(contas.clienteA.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId }),
    )

    const desfechos = [um.situacao, dois.situacao, tres.situacao]
    expect(desfechos.filter((s) => s === 'cancelada')).toHaveLength(1)
    expect(desfechos.filter((s) => s === 'ja_cancelada')).toHaveLength(2)

    // Um evento e um aviso — nunca três.
    expect(
      await eventos(c.atendimentoId, TIPOS_EVENTO_ATENDIMENTO.consultoriaCancelada),
    ).toHaveLength(1)
    expect(
      await avisos(TIPOS_NOTIFICACAO.consultoriaCancelada, c.atendimentoId),
    ).toHaveLength(1)
  })

  it('consultoria cancelada não abre a videochamada', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    await comSessao(contas.clienteA.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId }),
    )
    // Dentro da janela, que continuaria "aberta" pelo horário original.
    relogio(c.inicioEm)
    const r = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: c.atendimentoId }),
    )
    expect(r.situacao).toBe('sem_acesso')
    expect(salasCriadas).toHaveLength(0)
  })
})

describe('remarcação', () => {
  it('muda o horário mantendo agendamento, Atendimento e protocolo', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    const destino = await slotLivre(contas.anaPro)

    const r = await comSessao(contas.clienteA.token, () =>
      remarcarConsultoria({
        agendamentoId: c.agendamentoId,
        data: destino.data,
        inicio: destino.inicio,
      }),
    )
    expect(r.situacao).toBe('remarcada')

    const linha = await estado(c.agendamentoId)
    expect(linha.id).toBe(c.agendamentoId)
    expect(linha.status).toBe('agendada')
    expect(linha.remarcacoes).toBe(1)
    expect(linha.inicioEm.getTime()).not.toBe(c.inicioEm.getTime())

    // Mesmo Atendimento, mesmo protocolo — nada novo nasceu.
    const { futuras } = await listarConsultoriasDoCliente(contas.clienteA.id, new Date())
    const desta = futuras.find((f) => f.id === c.agendamentoId)
    expect(desta?.protocolo).toBe(c.protocolo)
    expect(desta?.atendimentoId).toBe(c.atendimentoId)
    expect(desta?.inicio).toBe(destino.inicio)

    const historico = await eventos(
      c.atendimentoId,
      TIPOS_EVENTO_ATENDIMENTO.consultoriaRemarcada,
    )
    expect(historico).toHaveLength(1)
    expect(historico[0].descricao).toMatch(/remarcada de .+ para .+ pelo Cliente/)
  })

  it('o horário antigo volta à agenda e o novo sai dela', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    const destino = await slotLivre(contas.anaPro, { data: c.data })

    await comSessao(contas.clienteA.token, () =>
      remarcarConsultoria({
        agendamentoId: c.agendamentoId,
        data: destino.data,
        inicio: destino.inicio,
      }),
    )

    const agenda = (
      await listarHorariosDoDia({ prestadorId: contas.anaPro.id, data: c.data })
    ).horarios.map((h) => h.inicio)
    expect(agenda).toContain(c.inicio)
    expect(agenda).not.toContain(destino.inicio)
  })

  it('a Agenda do Profissional mostra só o horário novo', async () => {
    const c = await contratar(contas.clienteA, contas.brunoPro)
    bemAntes(c)
    const destino = await slotLivre(contas.brunoPro)
    await comSessao(contas.brunoPro.token, () =>
      remarcarConsultoria({
        agendamentoId: c.agendamentoId,
        data: destino.data,
        inicio: destino.inicio,
      }),
    )
    const { futuras } = await listarConsultoriasDoPrestador(contas.brunoPro.id, new Date())
    const desta = futuras.filter((f) => f.id === c.agendamentoId)
    expect(desta).toHaveLength(1)
    expect(desta[0].inicio).toBe(destino.inicio)
  })

  it('horário inexistente ou fora da agenda é recusado, sem mexer no original', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    const r = await comSessao(contas.clienteA.token, () =>
      remarcarConsultoria({ agendamentoId: c.agendamentoId, data: c.data, inicio: '03:00' }),
    )
    expect(r.situacao).toBe('horario_indisponivel')
    expect((await estado(c.agendamentoId)).inicioEm.getTime()).toBe(c.inicioEm.getTime())
  })

  /**
   * Confirmar o mesmo horário não é uma remarcação — e o histórico não pode
   * ganhar uma linha dizendo "de 14:00 para 14:00".
   */
  it('remarcar para o mesmo horário é recusado, sem efeito nenhum', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    const r = await comSessao(contas.clienteA.token, () =>
      remarcarConsultoria({
        agendamentoId: c.agendamentoId,
        data: c.data,
        inicio: c.inicio,
      }),
    )
    expect(r.situacao).toBe('dados_invalidos')
    const linha = await estado(c.agendamentoId)
    expect(linha.remarcacoes).toBe(0)
    expect(linha.inicioEm.getTime()).toBe(c.inicioEm.getTime())
    expect(
      await eventos(c.atendimentoId, TIPOS_EVENTO_ATENDIMENTO.consultoriaRemarcada),
    ).toHaveLength(0)
  })

  it('cancelada não remarca', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    const destino = await slotLivre(contas.anaPro)
    bemAntes(c)
    await comSessao(contas.clienteA.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId }),
    )
    const r = await comSessao(contas.clienteA.token, () =>
      remarcarConsultoria({
        agendamentoId: c.agendamentoId,
        data: destino.data,
        inicio: destino.inicio,
      }),
    )
    expect(r.situacao).toBe('ja_cancelada')
  })
})

describe('concorrência na remarcação', () => {
  /**
   * A corrida que interessa: duas consultorias diferentes disputando o mesmo
   * horário de destino, ao mesmo tempo. Exatamente uma pode vencer, e a
   * perdedora precisa continuar exatamente onde estava.
   */
  it('duas remarcações para o mesmo destino: uma vence, a outra não perde nada', async () => {
    const a = await contratar(contas.clienteA, contas.anaPro)
    const b = await contratar(contas.clienteB, contas.anaPro)
    bemAntes(a)
    const destino = await slotLivre(contas.anaPro)

    const [ra, rb] = await Promise.all([
      comSessao(contas.clienteA.token, () =>
        remarcarConsultoria({
          agendamentoId: a.agendamentoId,
          data: destino.data,
          inicio: destino.inicio,
        }),
      ),
      comSessao(contas.clienteB.token, () =>
        remarcarConsultoria({
          agendamentoId: b.agendamentoId,
          data: destino.data,
          inicio: destino.inicio,
        }),
      ),
    ])

    const desfechos = [ra.situacao, rb.situacao]
    expect(desfechos.filter((s) => s === 'remarcada')).toHaveLength(1)
    expect(desfechos.filter((s) => s === 'horario_indisponivel')).toHaveLength(1)

    // O perdedor continua no horário de origem — nada foi liberado à toa.
    const perdedor = ra.situacao === 'remarcada' ? b : a
    const origem = ra.situacao === 'remarcada' ? b.inicioEm : a.inicioEm
    expect((await estado(perdedor.agendamentoId)).inicioEm.getTime()).toBe(
      origem.getTime(),
    )

    // E o destino é ocupado por exatamente uma consultoria.
    const noDestino = await db
      .select({ id: consultoriaAgendamentos.id })
      .from(consultoriaAgendamentos)
      .where(
        and(
          eq(consultoriaAgendamentos.status, 'agendada'),
          eq(
            consultoriaAgendamentos.inicioEm,
            (await estado((ra.situacao === 'remarcada' ? a : b).agendamentoId)).inicioEm,
          ),
        ),
      )
    expect(noDestino).toHaveLength(1)
  })

  it('remarcar contra um horário que outro Cliente está reservando falha sem dano', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    const destino = await slotLivre(contas.anaPro)

    // Outro Cliente segura o destino com uma reserva viva.
    const hold = await comSessao(contas.clienteB.token, () =>
      reservarHorarioDaConsultoria({
        prestadorId: contas.anaPro.id,
        data: destino.data,
        inicio: destino.inicio,
        descricao: 'Quero este horário.',
      }),
    )
    expect(hold.situacao).toBe('reservado')

    const r = await comSessao(contas.clienteA.token, () =>
      remarcarConsultoria({
        agendamentoId: c.agendamentoId,
        data: destino.data,
        inicio: destino.inicio,
      }),
    )
    expect(r.situacao).toBe('horario_indisponivel')
    expect((await estado(c.agendamentoId)).inicioEm.getTime()).toBe(c.inicioEm.getTime())
  })

  it('duplo clique na mesma remarcação move uma vez só', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    const destino = await slotLivre(contas.anaPro)

    const [um, dois] = await Promise.all([
      comSessao(contas.clienteA.token, () =>
        remarcarConsultoria({
          agendamentoId: c.agendamentoId,
          data: destino.data,
          inicio: destino.inicio,
        }),
      ),
      comSessao(contas.clienteA.token, () =>
        remarcarConsultoria({
          agendamentoId: c.agendamentoId,
          data: destino.data,
          inicio: destino.inicio,
        }),
      ),
    ])
    expect([um.situacao, dois.situacao].filter((s) => s === 'remarcada')).toHaveLength(1)
    expect((await estado(c.agendamentoId)).remarcacoes).toBe(1)
    expect(
      await eventos(c.atendimentoId, TIPOS_EVENTO_ATENDIMENTO.consultoriaRemarcada),
    ).toHaveLength(1)
    // O aviso é do fato, não da tentativa.
    expect(
      await avisos(TIPOS_NOTIFICACAO.consultoriaRemarcada, c.atendimentoId),
    ).toHaveLength(1)
  })
})

describe('a sala Daily acompanha o horário', () => {
  it('remarcar antes de a sala existir não cria sala nenhuma', async () => {
    const c = await contratar(contas.clienteA, contas.brunoPro)
    const destino = await slotLivre(contas.brunoPro)
    bemAntes(c)
    expect((await estado(c.agendamentoId)).dailyRoomName).toBeNull()
    await comSessao(contas.clienteA.token, () =>
      remarcarConsultoria({
        agendamentoId: c.agendamentoId,
        data: destino.data,
        inicio: destino.inicio,
      }),
    )
    expect((await estado(c.agendamentoId)).dailyRoomName).toBeNull()
    expect(salasCriadas).toHaveLength(0)
  })

  /**
   * O caso perigoso: a sala já foi criada, com `nbf`/`exp` do horário antigo.
   * Reaproveitá-la deixaria a consultoria com uma porta que abre na hora errada.
   */
  it('remarcar depois da sala criada desfaz o vínculo e a próxima entrada cria outra', async () => {
    const c = await contratar(contas.clienteA, contas.brunoPro)

    // Entra na janela original: a sala nasce.
    relogio(c.inicioEm)
    const entrou = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: c.atendimentoId }),
    )
    expect(entrou.situacao).toBe('autorizado')
    const salaAntiga = (await estado(c.agendamentoId)).dailyRoomName
    expect(salaAntiga).toBeTruthy()

    // Remarca (o Profissional pode, mesmo já na hora).
    const novo = await slotLivre(contas.brunoPro)
    const r = await comSessao(contas.brunoPro.token, () =>
      remarcarConsultoria({
        agendamentoId: c.agendamentoId,
        data: novo.data,
        inicio: novo.inicio,
      }),
    )
    expect(r.situacao).toBe('remarcada')

    // O vínculo foi desfeito: nenhuma sala com janela velha sobra no banco.
    expect((await estado(c.agendamentoId)).dailyRoomName).toBeNull()

    // No horário ANTIGO ninguém entra mais.
    relogio(c.inicioEm)
    expect(
      (
        await comSessao(contas.clienteA.token, () =>
          entrarNaVideochamada({ atendimentoId: c.atendimentoId }),
        )
      ).situacao,
    ).toBe('fora_da_janela')

    // Na janela NOVA entra, e numa sala diferente.
    const depois = await estado(c.agendamentoId)
    relogio(depois.inicioEm)
    const denovo = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: c.atendimentoId }),
    )
    expect(denovo.situacao).toBe('autorizado')
    const salaNova = (await estado(c.agendamentoId)).dailyRoomName
    expect(salaNova).toBeTruthy()
    expect(salaNova).not.toBe(salaAntiga)
  })
})

describe('notificações', () => {
  it('avisam a outra parte — e nunca o autor', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    await comSessao(contas.clienteA.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId }),
    )
    const lista = await avisos(TIPOS_NOTIFICACAO.consultoriaCancelada, c.atendimentoId)
    expect(lista).toHaveLength(1)
    expect(lista[0].destinatarioId).toBe(contas.anaPro.id)
    expect(lista.map((n) => n.destinatarioId)).not.toContain(contas.clienteA.id)
  })

  it('o aviso do Profissional leva o motivo ao Cliente', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    bemAntes(c)
    await comSessao(contas.anaPro.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId, motivo: 'Cirurgia de emergência.' }),
    )
    const lista = await avisos(TIPOS_NOTIFICACAO.consultoriaCancelada, c.atendimentoId)
    expect(lista).toHaveLength(1)
    expect(lista[0].destinatarioId).toBe(contas.clienteA.id)
    expect(lista[0].resumo).toContain('Cirurgia de emergência.')
  })

  /**
   * Duas remarcações são dois fatos: a dedupe não pode engolir a segunda, ou o
   * Profissional ficaria com a data errada anotada.
   */
  it('duas remarcações geram dois avisos', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    const primeiro = await slotLivre(contas.anaPro)
    const segundo = await slotLivre(contas.anaPro, { pular: 1 })
    bemAntes(c)
    await comSessao(contas.clienteA.token, () =>
      remarcarConsultoria({ agendamentoId: c.agendamentoId, ...primeiro }),
    )
    await comSessao(contas.clienteA.token, () =>
      remarcarConsultoria({ agendamentoId: c.agendamentoId, ...segundo }),
    )
    expect(
      await avisos(TIPOS_NOTIFICACAO.consultoriaRemarcada, c.atendimentoId),
    ).toHaveLength(2)
    expect((await estado(c.agendamentoId)).remarcacoes).toBe(2)
  })
})

describe('o que as áreas passam a mostrar', () => {
  it('o DTO do Cliente carrega o cancelamento e quem o fez', async () => {
    const c = await contratar(contas.clienteA, contas.brunoPro)
    bemAntes(c)
    await comSessao(contas.brunoPro.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId, motivo: 'Agenda comprometida.' }),
    )
    const { futuras } = await listarConsultoriasDoCliente(contas.clienteA.id, new Date())
    const desta = futuras.find((f) => f.id === c.agendamentoId)
    expect(desta?.status).toBe('cancelada')
    expect(desta?.canceladoPorPapel).toBe('prestador')
    expect(desta?.motivoCancelamento).toBe('Agenda comprometida.')
    expect(desta?.canceladoEm).toBeTruthy()
    // Cancelada não se altera mais.
    expect(desta?.podeAlterar).toBe(false)
  })

  it('`podeAlterar` segue o prazo de cada papel', async () => {
    const c = await contratar(contas.clienteA, contas.brunoPro)
    // Faltando 30 minutos: o Cliente já não pode; o Profissional ainda pode.
    const trintaAntes = new Date(c.inicioEm.getTime() - 30 * UM_MINUTO)
    const doCliente = await listarConsultoriasDoCliente(contas.clienteA.id, trintaAntes)
    const doPro = await listarConsultoriasDoPrestador(contas.brunoPro.id, trintaAntes)
    expect(doCliente.futuras.find((f) => f.id === c.agendamentoId)?.podeAlterar).toBe(false)
    expect(doPro.futuras.find((f) => f.id === c.agendamentoId)?.podeAlterar).toBe(true)
  })
})
