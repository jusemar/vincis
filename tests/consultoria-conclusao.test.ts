import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoEventos,
  atendimentos,
  avaliacoesAtendimento,
  consultoriaAgendamentos,
  notificacoes,
  sessoesUsuario,
} from '@/db/schema'
import { TIPOS_EVENTO_ATENDIMENTO } from '@/features/atendimentos/constants/atendimento'
import { avaliarAtendimento } from '@/features/avaliacoes/actions/avaliar'
import { obterReputacaoDosPrestadores } from '@/features/avaliacoes/queries/reputacao'
import {
  cancelarConsultoria,
  concluirConsultoria,
  remarcarConsultoria,
} from '@/features/consultorias/actions/ciclo'
import {
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import { pagarConsultoriaSimulado } from '@/features/consultorias/actions/pagamento'
import { reservarHorarioDaConsultoria } from '@/features/consultorias/actions/reserva'
import { listarHorariosDoDia } from '@/features/consultorias/queries/agenda-publica'
import { listarConsultoriasDoCliente } from '@/features/consultorias/queries/agendamentos'
import {
  dataLocalDoInstante,
  somarDiasEmDataLocal,
} from '@/features/consultorias/lib/tempo'
import { processarLembretesDeConsultoria } from '@/features/agendador/lib/processar-lembretes-consultoria'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { entrarNaVideochamada } from '@/features/videochamada/actions/videochamada'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { comSessao, sairDaSessao } from './setup/sessao'

/**
 * O fecho do ciclo: lembretes, conclusão e avaliação.
 *
 * ## O que precisa ser provado
 *
 * Que o lembrete sai uma vez por horário (e volta a sair quando o horário
 * muda), que ninguém além do Profissional conclui e nunca antes da hora, e que
 * a avaliação usa a estrutura oficial da plataforma — a mesma que alimenta a
 * reputação pública — em vez de uma segunda média paralela.
 *
 * A Daily é dublê: o que se testa aqui é a decisão da Vincis.
 */

const salas: string[] = []
vi.mock('@/features/videochamada/lib/daily/cliente-daily', () => ({
  criarSala: vi.fn(async (p: { nome: string }) => {
    if (!salas.includes(p.nome)) salas.push(p.nome)
    return { name: p.nome, url: `https://vincis.daily.co/${p.nome}`, privacy: 'private' }
  }),
  obterSala: vi.fn(async (n: string) =>
    salas.includes(n) ? { name: n, url: `https://vincis.daily.co/${n}`, privacy: 'private' } : null,
  ),
  criarTokenDeReuniao: vi.fn(async () => 'tok'),
  apagarSala: vi.fn(async () => true),
}))

const SUFIXO = '@consultoria-conclusao.teste'
const FUSO = 'America/Sao_Paulo'
const MINUTO = 60_000

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

async function slotLivre(prestador: ContaDeTeste, opcoes: { pular?: number } = {}) {
  const pular = opcoes.pular ?? 0
  for (let avanco = 0; avanco < 10; avanco += 1) {
    const data = somarDiasEmDataLocal(dataAlvo, avanco)
    const { horarios } = await listarHorariosDoDia({ prestadorId: prestador.id, data })
    if (horarios.length > pular) return { data, inicio: horarios[pular].inicio }
  }
  throw new Error('sem horário livre')
}

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
    ...alvo,
  }
}

const relogio = (d: Date) => vi.setSystemTime(d)
const depoisDoFim = (c: Contratada) => relogio(new Date(c.fimEm.getTime() + MINUTO))

async function estado(id: string) {
  const [l] = await db
    .select()
    .from(consultoriaAgendamentos)
    .where(eq(consultoriaAgendamentos.id, id))
    .limit(1)
  return l
}

async function lembretes(atendimentoId: string) {
  return db
    .select({ resumo: notificacoes.resumo, destinatarioId: notificacoes.destinatarioId })
    .from(notificacoes)
    .where(
      and(
        eq(notificacoes.tipo, TIPOS_NOTIFICACAO.consultoriaLembrete),
        eq(notificacoes.atendimentoId, atendimentoId),
      ),
    )
}

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119472')
  dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 12)
  await configurar(contas.anaPro)
  await configurar(contas.brunoPro)
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

afterAll(async () => {
  vi.useRealTimers()
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('lembretes', () => {
  it('emite um por faixa, para os dois lados, e não repete', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)

    // 24h antes
    relogio(new Date(c.inicioEm.getTime() - 24 * 60 * MINUTO))
    expect(await processarLembretesDeConsultoria(new Date())).toBe(2)
    // O cron repete no minuto seguinte: nada de novo sai.
    relogio(new Date(c.inicioEm.getTime() - 23 * 60 * MINUTO))
    expect(await processarLembretesDeConsultoria(new Date())).toBe(0)

    // 1h antes
    relogio(new Date(c.inicioEm.getTime() - 60 * MINUTO))
    expect(await processarLembretesDeConsultoria(new Date())).toBe(2)
    relogio(new Date(c.inicioEm.getTime() - 50 * MINUTO))
    expect(await processarLembretesDeConsultoria(new Date())).toBe(0)

    // 10min antes
    relogio(new Date(c.inicioEm.getTime() - 10 * MINUTO))
    expect(await processarLembretesDeConsultoria(new Date())).toBe(2)
    relogio(new Date(c.inicioEm.getTime() - 5 * MINUTO))
    expect(await processarLembretesDeConsultoria(new Date())).toBe(0)

    const todos = await lembretes(c.atendimentoId)
    expect(todos).toHaveLength(6)
    // Cada lado recebeu os três.
    expect(todos.filter((n) => n.destinatarioId === contas.clienteA.id)).toHaveLength(3)
    expect(todos.filter((n) => n.destinatarioId === contas.anaPro.id)).toHaveLength(3)
    // E os textos são diferentes para cada papel.
    expect(todos.some((n) => n.resumo.startsWith('Sua consultoria'))).toBe(true)
    expect(todos.some((n) => n.resumo.startsWith('Você tem uma consultoria'))).toBe(true)
  })

  it('depois de começar, nenhum lembrete sai', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    relogio(new Date(c.inicioEm.getTime() + MINUTO))
    expect(await processarLembretesDeConsultoria(new Date())).toBe(0)
    expect(await lembretes(c.atendimentoId)).toHaveLength(0)
  })

  it('cancelada não recebe lembrete', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    relogio(new Date(c.inicioEm.getTime() - 5 * 60 * MINUTO))
    await comSessao(contas.clienteA.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId }),
    )
    relogio(new Date(c.inicioEm.getTime() - 60 * MINUTO))
    expect(await processarLembretesDeConsultoria(new Date())).toBe(0)
    expect(await lembretes(c.atendimentoId)).toHaveLength(0)
  })

  it('concluída não recebe lembrete futuro', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    depoisDoFim(c)
    await comSessao(contas.anaPro.token, () =>
      concluirConsultoria({ agendamentoId: c.agendamentoId }),
    )
    // Mesmo voltando o relógio para dentro da janela de lembrete.
    relogio(new Date(c.inicioEm.getTime() - 60 * MINUTO))
    expect(await processarLembretesDeConsultoria(new Date())).toBe(0)
  })

  /**
   * O caso que o dedupe ingênuo quebraria: remarcar depois de já ter recebido o
   * lembrete do horário antigo. A chave carrega o instante de início, então a
   * série nova nasce livre — e os avisos antigos ficam no histórico.
   */
  it('remarcada gera lembretes do horário novo, sem apagar os do antigo', async () => {
    const c = await contratar(contas.clienteA, contas.brunoPro)

    relogio(new Date(c.inicioEm.getTime() - 60 * MINUTO))
    expect(await processarLembretesDeConsultoria(new Date())).toBe(2)
    const antes = await lembretes(c.atendimentoId)
    expect(antes).toHaveLength(2)

    // Remarca (o Profissional pode até o início).
    const destino = await slotLivre(contas.brunoPro)
    const r = await comSessao(contas.brunoPro.token, () =>
      remarcarConsultoria({
        agendamentoId: c.agendamentoId,
        data: destino.data,
        inicio: destino.inicio,
      }),
    )
    expect(r.situacao).toBe('remarcada')

    const novo = await estado(c.agendamentoId)
    relogio(new Date(novo.inicioEm.getTime() - 60 * MINUTO))
    // A faixa de 1h do horário NOVO não está bloqueada pela do antigo.
    expect(await processarLembretesDeConsultoria(new Date())).toBe(2)

    const depois = await lembretes(c.atendimentoId)
    expect(depois).toHaveLength(4)
  })
})

describe('conclusão', () => {
  it('antes do fim, ninguém conclui; no instante exato do fim, o Profissional conclui', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)

    relogio(new Date(c.fimEm.getTime() - 1000))
    expect(
      (
        await comSessao(contas.anaPro.token, () =>
          concluirConsultoria({ agendamentoId: c.agendamentoId }),
        )
      ).situacao,
    ).toBe('fora_do_prazo')

    relogio(c.fimEm)
    const r = await comSessao(contas.anaPro.token, () =>
      concluirConsultoria({ agendamentoId: c.agendamentoId }),
    )
    expect(r.situacao).toBe('concluida')

    const linha = await estado(c.agendamentoId)
    expect(linha.status).toBe('concluida')
    expect(linha.concluidoPor).toBe(contas.anaPro.id)
    expect(linha.concluidoEm).toBeTruthy()
  })

  it('o Cliente não conclui', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    depoisDoFim(c)
    const r = await comSessao(contas.clienteA.token, () =>
      concluirConsultoria({ agendamentoId: c.agendamentoId }),
    )
    expect(r.situacao).toBe('sem_acesso')
    expect((await estado(c.agendamentoId)).status).toBe('agendada')
  })

  it('Profissional alheio e visitante não concluem', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    depoisDoFim(c)
    expect(
      (
        await comSessao(contas.brunoPro.token, () =>
          concluirConsultoria({ agendamentoId: c.agendamentoId }),
        )
      ).situacao,
    ).toBe('sem_acesso')
    sairDaSessao()
    expect((await concluirConsultoria({ agendamentoId: c.agendamentoId })).situacao).toBe(
      'precisa_entrar',
    )
    expect((await estado(c.agendamentoId)).status).toBe('agendada')
  })

  it('cancelada não conclui', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    relogio(new Date(c.inicioEm.getTime() - 5 * 60 * MINUTO))
    await comSessao(contas.clienteA.token, () =>
      cancelarConsultoria({ agendamentoId: c.agendamentoId }),
    )
    depoisDoFim(c)
    const r = await comSessao(contas.anaPro.token, () =>
      concluirConsultoria({ agendamentoId: c.agendamentoId }),
    )
    expect(r.situacao).toBe('ja_cancelada')
    expect((await estado(c.agendamentoId)).status).toBe('cancelada')
  })

  it('duplo clique e retry concluem uma vez só', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    depoisDoFim(c)
    const [um, dois] = await Promise.all([
      comSessao(contas.anaPro.token, () =>
        concluirConsultoria({ agendamentoId: c.agendamentoId }),
      ),
      comSessao(contas.anaPro.token, () =>
        concluirConsultoria({ agendamentoId: c.agendamentoId }),
      ),
    ])
    const tres = await comSessao(contas.anaPro.token, () =>
      concluirConsultoria({ agendamentoId: c.agendamentoId }),
    )
    const desfechos = [um.situacao, dois.situacao, tres.situacao]
    expect(desfechos.filter((s) => s === 'concluida')).toHaveLength(1)
    expect(desfechos.filter((s) => s === 'ja_concluida')).toHaveLength(2)

    const eventos = await db
      .select({ id: atendimentoEventos.id })
      .from(atendimentoEventos)
      .where(
        and(
          eq(atendimentoEventos.atendimentoId, c.atendimentoId),
          eq(atendimentoEventos.tipo, TIPOS_EVENTO_ATENDIMENTO.consultoriaConcluida),
        ),
      )
    expect(eventos).toHaveLength(1)
  })

  it('registra o histórico, fecha o Atendimento e avisa só o Cliente', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    depoisDoFim(c)
    await comSessao(contas.anaPro.token, () =>
      concluirConsultoria({ agendamentoId: c.agendamentoId }),
    )

    const [evento] = await db
      .select({ descricao: atendimentoEventos.descricao })
      .from(atendimentoEventos)
      .where(
        and(
          eq(atendimentoEventos.atendimentoId, c.atendimentoId),
          eq(atendimentoEventos.tipo, TIPOS_EVENTO_ATENDIMENTO.consultoriaConcluida),
        ),
      )
    expect(evento.descricao).toMatch(/Consultoria concluída pelo Profissional em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}\./)

    // O Atendimento fecha — é o que libera a avaliação.
    const [at] = await db
      .select({ status: atendimentos.status, protocolo: atendimentos.protocolo })
      .from(atendimentos)
      .where(eq(atendimentos.id, c.atendimentoId))
      .limit(1)
    expect(at.status).toBe('concluido')
    // O protocolo é o mesmo de sempre.
    expect(at.protocolo).toBe(c.protocolo)

    const avisos = await db
      .select({ destinatarioId: notificacoes.destinatarioId })
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.tipo, TIPOS_NOTIFICACAO.consultoriaConcluida),
          eq(notificacoes.atendimentoId, c.atendimentoId),
        ),
      )
    expect(avisos).toHaveLength(1)
    expect(avisos[0].destinatarioId).toBe(contas.clienteA.id)
  })

  /**
   * Concluir não é uma segunda regra de acesso: a janela da videochamada
   * continua sendo a única, e ela não se reabre nem se fecha por causa disto.
   */
  it('não altera a janela da videochamada', async () => {
    const c = await contratar(contas.clienteA, contas.anaPro)
    depoisDoFim(c)
    await comSessao(contas.anaPro.token, () =>
      concluirConsultoria({ agendamentoId: c.agendamentoId }),
    )

    // Dentro da janela (que ainda tem 15 min de tolerância), continua entrando.
    relogio(new Date(c.fimEm.getTime() + 5 * MINUTO))
    expect(
      (
        await comSessao(contas.clienteA.token, () =>
          entrarNaVideochamada({ atendimentoId: c.atendimentoId }),
        )
      ).situacao,
    ).toBe('autorizado')

    // Depois dela, não — e concluir não muda isso.
    relogio(new Date(c.fimEm.getTime() + 16 * MINUTO))
    expect(
      (
        await comSessao(contas.clienteA.token, () =>
          entrarNaVideochamada({ atendimentoId: c.atendimentoId }),
        )
      ).situacao,
    ).toBe('fora_da_janela')
  })
})

describe('avaliação', () => {
  /** Contrata, conclui e devolve a consultoria pronta para ser avaliada. */
  async function concluida(cliente: ContaDeTeste, pro: ContaDeTeste) {
    const c = await contratar(cliente, pro)
    depoisDoFim(c)
    const r = await comSessao(pro.token, () =>
      concluirConsultoria({ agendamentoId: c.agendamentoId }),
    )
    if (r.situacao !== 'concluida') throw new Error(`conclusão: ${r.situacao}`)
    return c
  }

  it('o Cliente dono avalia, e a nota vira reputação pública', async () => {
    const c = await concluida(contas.clienteA, contas.brunoPro)
    const r = await comSessao(contas.clienteA.token, () =>
      avaliarAtendimento({ atendimentoId: c.atendimentoId, nota: 5, comentario: 'Excelente.' }),
    )
    expect(r.sucesso).toBe(true)

    const [linha] = await db
      .select()
      .from(avaliacoesAtendimento)
      .where(eq(avaliacoesAtendimento.atendimentoId, c.atendimentoId))
    expect(linha.nota).toBe(5)
    expect(linha.comentario).toBe('Excelente.')
    expect(linha.clienteUsuarioId).toBe(contas.clienteA.id)
    expect(linha.prestadorId).toBe(contas.brunoPro.id)

    // A média pública é calculada a partir daqui — não há segunda média.
    const reputacao = await obterReputacaoDosPrestadores([contas.brunoPro.id])
    expect(reputacao.get(contas.brunoPro.id)?.total).toBeGreaterThanOrEqual(1)
    expect(reputacao.get(contas.brunoPro.id)?.media).toBeGreaterThan(0)

    /**
     * E aparece na Área do Cliente. Uma consultoria concluída já está no
     * passado — é por isso que a página carrega também as passadas recentes:
     * sem elas a consultoria sumiria da tela exatamente quando o Cliente
     * precisa dela para avaliar.
     */
    const { passadas } = await listarConsultoriasDoCliente(contas.clienteA.id, new Date())
    const desta = passadas.find((p) => p.id === c.agendamentoId)
    expect(desta?.status).toBe('concluida')
    expect(desta?.avaliacao).toEqual({ nota: 5, comentario: 'Excelente.' })
    expect(desta?.concluidoEm).toBeTruthy()
    // Concluída não oferece mais alterar nem concluir de novo.
    expect(desta?.podeAlterar).toBe(false)
    expect(desta?.podeConcluir).toBe(false)
  })

  it('editar reutiliza o mesmo registro — nunca cria um segundo', async () => {
    const c = await concluida(contas.clienteA, contas.brunoPro)
    await comSessao(contas.clienteA.token, () =>
      avaliarAtendimento({ atendimentoId: c.atendimentoId, nota: 3, comentario: 'Ok.' }),
    )
    const [antes] = await db
      .select()
      .from(avaliacoesAtendimento)
      .where(eq(avaliacoesAtendimento.atendimentoId, c.atendimentoId))

    const r = await comSessao(contas.clienteA.token, () =>
      avaliarAtendimento({ atendimentoId: c.atendimentoId, nota: 5, comentario: 'Melhorou.' }),
    )
    expect(r.sucesso).toBe(true)

    const todas = await db
      .select()
      .from(avaliacoesAtendimento)
      .where(eq(avaliacoesAtendimento.atendimentoId, c.atendimentoId))
    expect(todas).toHaveLength(1)
    expect(todas[0].id).toBe(antes.id)
    expect(todas[0].nota).toBe(5)
    expect(todas[0].comentario).toBe('Melhorou.')
  })

  it('outro Cliente e o Profissional não avaliam', async () => {
    const c = await concluida(contas.clienteA, contas.brunoPro)
    const doOutro = await comSessao(contas.clienteB.token, () =>
      avaliarAtendimento({ atendimentoId: c.atendimentoId, nota: 1 }),
    )
    const doPro = await comSessao(contas.brunoPro.token, () =>
      avaliarAtendimento({ atendimentoId: c.atendimentoId, nota: 5 }),
    )
    expect(doOutro.sucesso).toBe(false)
    expect(doPro.sucesso).toBe(false)
    expect(
      await db
        .select()
        .from(avaliacoesAtendimento)
        .where(eq(avaliacoesAtendimento.atendimentoId, c.atendimentoId)),
    ).toHaveLength(0)
  })

  it('consultoria agendada ou cancelada não é avaliável', async () => {
    const agendada = await contratar(contas.clienteA, contas.brunoPro)
    relogio(new Date(agendada.inicioEm.getTime() - 5 * 60 * MINUTO))
    expect(
      (
        await comSessao(contas.clienteA.token, () =>
          avaliarAtendimento({ atendimentoId: agendada.atendimentoId, nota: 5 }),
        )
      ).sucesso,
    ).toBe(false)

    const cancelada = await contratar(contas.clienteA, contas.brunoPro)
    relogio(new Date(cancelada.inicioEm.getTime() - 5 * 60 * MINUTO))
    await comSessao(contas.clienteA.token, () =>
      cancelarConsultoria({ agendamentoId: cancelada.agendamentoId }),
    )
    expect(
      (
        await comSessao(contas.clienteA.token, () =>
          avaliarAtendimento({ atendimentoId: cancelada.atendimentoId, nota: 5 }),
        )
      ).sucesso,
    ).toBe(false)
  })

  it('a nota é inteira e fica entre 1 e 5', async () => {
    const c = await concluida(contas.clienteA, contas.anaPro)
    for (const nota of [0, 6, -1, 2.5]) {
      const r = await comSessao(contas.clienteA.token, () =>
        avaliarAtendimento({ atendimentoId: c.atendimentoId, nota }),
      )
      expect(r.sucesso).toBe(false)
    }
    expect(
      await db
        .select()
        .from(avaliacoesAtendimento)
        .where(eq(avaliacoesAtendimento.atendimentoId, c.atendimentoId)),
    ).toHaveLength(0)

    expect(
      (
        await comSessao(contas.clienteA.token, () =>
          avaliarAtendimento({ atendimentoId: c.atendimentoId, nota: 1 }),
        )
      ).sucesso,
    ).toBe(true)
  })

  it('comentário: espaços viram ausência, e acima do limite é recusado', async () => {
    const c = await concluida(contas.clienteA, contas.anaPro)
    const soEspacos = await comSessao(contas.clienteA.token, () =>
      avaliarAtendimento({ atendimentoId: c.atendimentoId, nota: 4, comentario: '     ' }),
    )
    expect(soEspacos.sucesso).toBe(true)
    const [linha] = await db
      .select()
      .from(avaliacoesAtendimento)
      .where(eq(avaliacoesAtendimento.atendimentoId, c.atendimentoId))
    expect(linha.comentario).toBeNull()

    const gigante = await comSessao(contas.clienteA.token, () =>
      avaliarAtendimento({
        atendimentoId: c.atendimentoId,
        nota: 4,
        comentario: 'a'.repeat(1001),
      }),
    )
    expect(gigante.sucesso).toBe(false)
    // A avaliação anterior segue intacta.
    const [depois] = await db
      .select()
      .from(avaliacoesAtendimento)
      .where(eq(avaliacoesAtendimento.atendimentoId, c.atendimentoId))
    expect(depois.nota).toBe(4)
  })
})
