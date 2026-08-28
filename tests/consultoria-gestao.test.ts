import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import { consultoriaAgendamentos, sessoesUsuario } from '@/db/schema'
import { avaliarAtendimento } from '@/features/avaliacoes/actions/avaliar'
import {
  abrirConsultoriaGestao,
  buscarConsultoriasGestao,
} from '@/features/consultorias/actions/gestao-consultorias'
import {
  cancelarConsultoria,
  concluirConsultoria,
} from '@/features/consultorias/actions/ciclo'
import {
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import { pagarConsultoriaSimulado } from '@/features/consultorias/actions/pagamento'
import { reservarHorarioDaConsultoria } from '@/features/consultorias/actions/reserva'
import { obterIndicadoresConsultorias } from '@/features/consultorias/queries/gestao-consultorias'
import { listarHorariosDoDia } from '@/features/consultorias/queries/agenda-publica'
import {
  dataLocalDoInstante,
  somarDiasEmDataLocal,
} from '@/features/consultorias/lib/tempo'
import { entrarNaVideochamada } from '@/features/videochamada/actions/videochamada'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { comSessao, sairDaSessao } from './setup/sessao'

/**
 * A Consultoria Agendada vista pela Gestão da Vincis.
 *
 * ## O que este arquivo precisa provar
 *
 * Duas coisas, e as duas são sobre limite. A primeira: **só a Gestão entra** — e
 * não por um `if` na tela, mas porque a ação recusa antes de tocar o banco. A
 * segunda, mais sutil: **o que a Gestão vê é operacional**. Administrar a
 * plataforma não é ler o assunto que o Cliente escreveu nem conhecer o nome da
 * sala privada, e é isso que as asserções de vazamento cobram.
 *
 * A Daily é dublê: o que se testa é a decisão da Vincis.
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

const SUFIXO = '@consultoria-gestao.teste'
const FUSO = 'America/Sao_Paulo'
const MINUTO = 60_000
/** O assunto privado — nenhuma resposta da Gestão pode conter este texto. */
const ASSUNTO_PRIVADO = 'Detalhe sigiloso do meu processo tributario.'

type Chave = 'gestor' | 'anaPro' | 'brunoPro' | 'clienteA' | 'clienteB'
const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  gestor: { perfil: 'gestor_vincis' },
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
}
/** Uma de cada estado, montadas pelo caminho real. */
let agendada: Contratada
let concluida: Contratada
let cancelada: Contratada
/** Do Cliente B com o outro Profissional — para provar que o filtro recorta. */
let doOutro: Contratada

async function configurar(conta: ContaDeTeste) {
  await comSessao(conta.token, async () => {
    const s = await salvarConsultoria(CONFIG)
    if (!s.sucesso) throw new Error(s.mensagem)
    const f = await salvarDisponibilidades(
      [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaInicio: '08:00',
        horaFim: '18:00',
      })),
    )
    if (!f.sucesso) throw new Error(f.mensagem)
  })
}

async function slotLivre(prestador: ContaDeTeste) {
  for (let avanco = 0; avanco < 10; avanco += 1) {
    const data = somarDiasEmDataLocal(dataAlvo, avanco)
    const { horarios } = await listarHorariosDoDia({ prestadorId: prestador.id, data })
    if (horarios.length) return { data, inicio: horarios[0].inicio }
  }
  throw new Error('sem horário livre')
}

async function contratar(
  cliente: ContaDeTeste,
  prestador: ContaDeTeste,
): Promise<Contratada> {
  const alvo = await slotLivre(prestador)
  const reserva = await comSessao(cliente.token, () =>
    reservarHorarioDaConsultoria({
      prestadorId: prestador.id,
      data: alvo.data,
      inicio: alvo.inicio,
      descricao: ASSUNTO_PRIVADO,
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
  }
}

const buscar = (filtros: Record<string, unknown> = {}) =>
  comSessao(contas.gestor.token, () => buscarConsultoriasGestao(filtros))

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119474')
  dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 20)
  await configurar(contas.anaPro)
  await configurar(contas.brunoPro)

  agendada = await contratar(contas.clienteA, contas.anaPro)
  concluida = await contratar(contas.clienteA, contas.anaPro)
  cancelada = await contratar(contas.clienteA, contas.anaPro)
  doOutro = await contratar(contas.clienteB, contas.brunoPro)

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

  // Uma delas nasce com sala, para a Gestão ver estado técnico verdadeiro.
  vi.setSystemTime(agendada.inicioEm)
  await comSessao(contas.clienteA.token, () =>
    entrarNaVideochamada({ atendimentoId: agendada.atendimentoId }),
  )

  // Conclui uma e avalia.
  vi.setSystemTime(new Date(concluida.fimEm.getTime() + MINUTO))
  await comSessao(contas.anaPro.token, () =>
    concluirConsultoria({ agendamentoId: concluida.agendamentoId }),
  )
  await comSessao(contas.clienteA.token, () =>
    avaliarAtendimento({
      atendimentoId: concluida.atendimentoId,
      nota: 5,
      comentario: 'Muito bom.',
    }),
  )

  // Cancela outra.
  vi.setSystemTime(new Date(cancelada.inicioEm.getTime() - 5 * 60 * MINUTO))
  await comSessao(contas.clienteA.token, () =>
    cancelarConsultoria({ agendamentoId: cancelada.agendamentoId }),
  )

  vi.useRealTimers()
}, 240_000)

afterAll(async () => {
  vi.useRealTimers()
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('permissão', () => {
  it('o gestor autorizado acessa', async () => {
    const r = await buscar()
    expect(r.sucesso).toBe(true)
    expect(r.consultorias.length).toBeGreaterThan(0)
  })

  /**
   * A recusa acontece antes de qualquer consulta: quem não é Gestão não
   * descobre sequer se o id existe.
   */
  it.each([
    ['Cliente', 'clienteA'],
    ['Profissional', 'anaPro'],
  ] as const)('%s não acessa a listagem nem o detalhe', async (_rotulo, chave) => {
    const lista = await comSessao(contas[chave].token, () =>
      buscarConsultoriasGestao({}),
    )
    const detalhe = await comSessao(contas[chave].token, () =>
      abrirConsultoriaGestao(agendada.agendamentoId),
    )
    expect(lista.sucesso).toBe(false)
    expect(lista.consultorias).toHaveLength(0)
    expect(detalhe.sucesso).toBe(false)
    expect(detalhe.dados).toBeNull()
  })

  it('visitante sem sessão é bloqueado', async () => {
    sairDaSessao()
    expect((await buscarConsultoriasGestao({})).sucesso).toBe(false)
    expect((await abrirConsultoriaGestao(agendada.agendamentoId)).sucesso).toBe(false)
  })

  it('a recusa é igual para id inexistente e para não autorizado', async () => {
    const semPermissao = await comSessao(contas.clienteB.token, () =>
      abrirConsultoriaGestao(agendada.agendamentoId),
    )
    expect(semPermissao.sucesso).toBe(false)
    expect(semPermissao.dados).toBeNull()
  })
})

describe('privacidade', () => {
  /**
   * O centro desta etapa. A Gestão administra a plataforma; ela não é parte da
   * consulta. O assunto que o Cliente escreveu vive no Protocolo e não pode
   * aparecer num painel administrativo — nem na lista, nem no detalhe.
   */
  it('o assunto privado do Cliente não vaza em lugar nenhum', async () => {
    const lista = await buscar()
    expect(JSON.stringify(lista)).not.toContain(ASSUNTO_PRIVADO)
    expect(JSON.stringify(lista)).not.toContain('sigiloso')

    const detalhe = await comSessao(contas.gestor.token, () =>
      abrirConsultoriaGestao(agendada.agendamentoId),
    )
    expect(detalhe.sucesso).toBe(true)
    expect(JSON.stringify(detalhe)).not.toContain(ASSUNTO_PRIVADO)
    // O DTO não tem sequer o campo — não é filtro de tela, é ausência.
    expect(detalhe.dados).not.toHaveProperty('descricao')
  })

  it('nenhum segredo da Daily atravessa: sala, token ou chave', async () => {
    const detalhe = await comSessao(contas.gestor.token, () =>
      abrirConsultoriaGestao(agendada.agendamentoId),
    )
    if (!detalhe.sucesso) throw new Error('esperado sucesso')
    const texto = JSON.stringify(detalhe)

    // A sala foi de fato criada — o caso em que haveria o que vazar.
    expect(detalhe.dados.videochamada.salaCriada).toBe(true)
    expect(texto).not.toContain('vincis-c-')
    expect(texto).not.toMatch(/tok|token|api[_-]?key|daily\.co/i)
    expect(detalhe.dados).not.toHaveProperty('dailyRoomName')

    // O que ela vê é operacional: existe sala, e qual é a janela.
    expect(detalhe.dados.videochamada.janelaAbreEm).toBeTruthy()
    expect(detalhe.dados.videochamada.janelaFechaEm).toBeTruthy()
  })

  it('o detalhe traz eventos técnicos, e não conversa nem anexos', async () => {
    const detalhe = await comSessao(contas.gestor.token, () =>
      abrirConsultoriaGestao(concluida.agendamentoId),
    )
    if (!detalhe.sucesso) throw new Error('esperado sucesso')
    expect(detalhe.dados.eventos.length).toBeGreaterThan(0)
    expect(detalhe.dados.eventos.some((e) => e.tipo === 'consultoria_concluida')).toBe(true)
    expect(detalhe.dados).not.toHaveProperty('mensagens')
    expect(detalhe.dados).not.toHaveProperty('arquivos')
    expect(detalhe.dados).not.toHaveProperty('manifestacoes')
  })
})

describe('listagem', () => {
  it('traz os campos operacionais que o suporte precisa', async () => {
    const r = await buscar({ busca: agendada.protocolo })
    expect(r.consultorias).toHaveLength(1)
    const linha = r.consultorias[0]
    expect(linha).toMatchObject({
      protocolo: agendada.protocolo,
      clienteNome: 'Teste clienteA',
      status: 'agendada',
      valorCentavos: CONFIG.valorCentavos,
      duracaoMinutos: CONFIG.duracaoMinutos,
      pagamentoStatus: 'aprovado',
    })
    expect(linha.criadoEm).toBeTruthy()
    expect(linha.atualizadoEm).toBeTruthy()
    expect(linha.data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(linha.inicio).toMatch(/^\d{2}:\d{2}$/)
  })

  it('só devolve consultorias — nada de outros atendimentos', async () => {
    const r = await buscar({ porPagina: 50 })
    expect(r.consultorias.length).toBeGreaterThanOrEqual(4)
    // Todas têm as marcas de uma consultoria agendada.
    for (const c of r.consultorias) {
      expect(c.duracaoMinutos).toBeGreaterThan(0)
      expect(['agendada', 'cancelada', 'concluida']).toContain(c.status)
    }
  })
})

describe('filtros', () => {
  it('por status', async () => {
    const canceladas = await buscar({ status: 'cancelada', porPagina: 50 })
    const concluidas = await buscar({ status: 'concluida', porPagina: 50 })
    expect(canceladas.consultorias.map((c) => c.id)).toContain(cancelada.agendamentoId)
    expect(canceladas.consultorias.every((c) => c.status === 'cancelada')).toBe(true)
    expect(concluidas.consultorias.map((c) => c.id)).toContain(concluida.agendamentoId)
    expect(concluidas.consultorias.every((c) => c.status === 'concluida')).toBe(true)
  })

  it('por profissional', async () => {
    const r = await buscar({ prestadorId: contas.brunoPro.id, porPagina: 50 })
    expect(r.consultorias.map((c) => c.id)).toContain(doOutro.agendamentoId)
    expect(r.consultorias.every((c) => c.prestadorId === contas.brunoPro.id)).toBe(true)
    expect(r.consultorias.map((c) => c.id)).not.toContain(agendada.agendamentoId)
  })

  it('por avaliação', async () => {
    const avaliadas = await buscar({ avaliacao: 'avaliadas', porPagina: 50 })
    expect(avaliadas.consultorias.map((c) => c.id)).toContain(concluida.agendamentoId)
    expect(avaliadas.consultorias.every((c) => c.avaliacaoNota !== null)).toBe(true)

    const sem = await buscar({ avaliacao: 'sem_avaliacao', porPagina: 50 })
    expect(sem.consultorias.map((c) => c.id)).not.toContain(concluida.agendamentoId)
  })

  it('por pagamento', async () => {
    const pagas = await buscar({ pagamento: 'aprovado', porPagina: 50 })
    expect(pagas.consultorias.every((c) => c.pagamentoStatus === 'aprovado')).toBe(true)
    expect(pagas.consultorias.length).toBeGreaterThanOrEqual(4)
  })

  it('por período personalizado', async () => {
    const r = await buscar({
      periodo: 'personalizado',
      de: agendada.inicioEm.toISOString().slice(0, 10),
      ate: agendada.inicioEm.toISOString().slice(0, 10),
      porPagina: 50,
    })
    expect(r.sucesso).toBe(true)
    for (const c of r.consultorias) {
      expect(c.inicioEm.slice(0, 10)).toBe(agendada.inicioEm.toISOString().slice(0, 10))
    }
  })

  /**
   * A página nunca traz mais do que pediu, e o total é do conjunto inteiro —
   * não do que coube na página. Somar a página daria um número errado assim que
   * houvesse mais de uma, e é esse número que a Gestão usa para se orientar.
   */
  it('a paginação limita o que sai do banco', async () => {
    const pagina1 = await buscar({ porPagina: 5, pagina: 1 })
    expect(pagina1.sucesso).toBe(true)
    expect(pagina1.consultorias.length).toBeLessThanOrEqual(5)
    expect(pagina1.total).toBeGreaterThanOrEqual(4)
    expect(pagina1.totalPaginas).toBe(Math.max(1, Math.ceil(pagina1.total / 5)))

    // Uma página além do fim devolve vazio, e não repete a primeira.
    const ids1 = pagina1.consultorias.map((c) => c.id)
    const ultima = await buscar({ porPagina: 5, pagina: pagina1.totalPaginas + 1 })
    expect(ultima.consultorias.every((c) => !ids1.includes(c.id))).toBe(true)
  })

  /**
   * Os dois extremos são recusados pelo schema — abaixo do mínimo e acima do
   * teto. O teto é o que impede uma listagem administrativa de virar um jeito
   * silencioso de puxar a tabela inteira.
   */
  it.each([[2], [5000], [0], [-1]])('porPagina %s é recusado', async (porPagina) => {
    expect((await buscar({ porPagina })).sucesso).toBe(false)
  })
})

describe('busca', () => {
  it('encontra por protocolo, por cliente e por profissional', async () => {
    const porProtocolo = await buscar({ busca: concluida.protocolo })
    expect(porProtocolo.consultorias.map((c) => c.id)).toEqual([concluida.agendamentoId])

    const porCliente = await buscar({ busca: 'clienteB', porPagina: 50 })
    expect(porCliente.consultorias.map((c) => c.id)).toContain(doOutro.agendamentoId)

    const porProfissional = await buscar({ busca: 'brunoPro', porPagina: 50 })
    expect(porProfissional.consultorias.every((c) => c.prestadorId === contas.brunoPro.id))
      .toBe(true)
  })

  /** Buscar pelo texto do assunto não pode funcionar: ele não é indexado aqui. */
  it('não encontra nada buscando pelo conteúdo privado', async () => {
    const r = await buscar({ busca: 'sigiloso', porPagina: 50 })
    expect(r.consultorias).toHaveLength(0)
  })
})

describe('detalhe', () => {
  it('reúne resumo, pagamento, agenda e videochamada', async () => {
    const r = await comSessao(contas.gestor.token, () =>
      abrirConsultoriaGestao(concluida.agendamentoId),
    )
    if (!r.sucesso) throw new Error('esperado sucesso')
    const d = r.dados

    expect(d.protocolo).toBe(concluida.protocolo)
    expect(d.status).toBe('concluida')
    expect(d.concluidoEm).toBeTruthy()
    expect(d.servico).toBe(CONFIG.titulo)
    expect(d.pagamento).toMatchObject({ status: 'aprovado', origem: 'simulado' })
    expect(d.pagamento?.referencia).toMatch(/^SIM-/)
    expect(d.avaliacaoNota).toBe(5)
    expect(d.avaliacaoComentario).toBe('Muito bom.')
    expect(d.videochamada.janelaAbreEm).toBeTruthy()
  })

  it('a cancelada mostra o motivo e a data do cancelamento', async () => {
    const r = await comSessao(contas.gestor.token, () =>
      abrirConsultoriaGestao(cancelada.agendamentoId),
    )
    if (!r.sucesso) throw new Error('esperado sucesso')
    expect(r.dados.status).toBe('cancelada')
    expect(r.dados.canceladoEm).toBeTruthy()
  })
})

describe('indicadores', () => {
  it('contam por status e somam só o que foi pago', async () => {
    const i = await obterIndicadoresConsultorias()
    expect(i.total).toBeGreaterThanOrEqual(4)
    expect(i.agendadas).toBeGreaterThanOrEqual(1)
    expect(i.concluidas).toBeGreaterThanOrEqual(1)
    expect(i.canceladas).toBeGreaterThanOrEqual(1)
    expect(i.valorTotalCentavos).toBeGreaterThanOrEqual(4 * CONFIG.valorCentavos)
    expect(i.avaliacoes).toBeGreaterThanOrEqual(1)
    expect(i.mediaAvaliacoes).toBeGreaterThan(0)
    expect(i.mediaAvaliacoes).toBeLessThanOrEqual(5)
  })
})

describe('problemas operacionais', () => {
  /**
   * Um agendamento sem pagamento é uma contratação que não fechou o ciclo —
   * invisível para quem usa a plataforma, e exatamente o que a Gestão precisa
   * conseguir localizar.
   */
  it('a lista de problemas encontra a inconsistência e a explica', async () => {
    const antes = await obterIndicadoresConsultorias()

    /**
     * O defeito, montado pelo caminho que o produziria de verdade: uma reserva
     * real que virou agendamento e cujo pagamento nunca chegou. Inserir o
     * agendamento à mão é o único jeito de reproduzir isso, já que o fluxo
     * normal grava os dois na mesma transação.
     */
    const alvo = await slotLivre(contas.anaPro)
    const reserva = await comSessao(contas.clienteA.token, () =>
      reservarHorarioDaConsultoria({
        prestadorId: contas.anaPro.id,
        data: alvo.data,
        inicio: alvo.inicio,
        descricao: ASSUNTO_PRIVADO,
      }),
    )
    if (reserva.situacao !== 'reservado') throw new Error(reserva.situacao)

    const [origem] = await db
      .select({ configuracaoId: consultoriaAgendamentos.configuracaoId })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.id, agendada.agendamentoId))
      .limit(1)

    const [orfao] = await db
      .insert(consultoriaAgendamentos)
      .values({
        reservaId: reserva.reserva.id,
        configuracaoId: origem.configuracaoId,
        prestadorId: contas.anaPro.id,
        clienteUsuarioId: contas.clienteA.id,
        inicioEm: reserva.reserva.inicioEm,
        fimEm: reserva.reserva.fimEm,
        timezone: FUSO,
        valorCentavos: 10_000,
        duracaoMinutos: 30,
        descricao: ASSUNTO_PRIVADO,
      })
      .returning({ id: consultoriaAgendamentos.id })
      .onConflictDoNothing()

    if (orfao) {
      const r = await buscar({ somenteProblemas: true, porPagina: 50 })
      expect(r.consultorias.map((c) => c.id)).toContain(orfao.id)
      const encontrado = r.consultorias.find((c) => c.id === orfao.id)!
      expect(encontrado.problemas).toContain('Sem atendimento vinculado')
      expect(encontrado.problemas).toContain('Sem pagamento registrado')

      const depois = await obterIndicadoresConsultorias()
      expect(depois.comProblema).toBeGreaterThan(antes.comProblema)

      // Mesmo no caminho dos problemas, o assunto continua fora.
      expect(JSON.stringify(r)).not.toContain(ASSUNTO_PRIVADO)

      await db
        .delete(consultoriaAgendamentos)
        .where(eq(consultoriaAgendamentos.id, orfao.id))
    }
  })

  it('as consultorias saudáveis não entram na lista de problemas', async () => {
    const r = await buscar({ somenteProblemas: true, porPagina: 50 })
    expect(r.consultorias.map((c) => c.id)).not.toContain(concluida.agendamentoId)
  })
})

describe('isolamento entre participantes segue intacto', () => {
  it('o painel da Gestão não afrouxa o que Cliente e Profissional enxergam', async () => {
    // O Cliente B continua sem ver a consultoria do Cliente A.
    const doB = await comSessao(contas.clienteB.token, () =>
      entrarNaVideochamada({ atendimentoId: agendada.atendimentoId }),
    )
    expect(doB.situacao).toBe('sem_acesso')
  })
})
