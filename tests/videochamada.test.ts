import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import { consultoriaAgendamentos, sessoesUsuario, usuarios } from '@/db/schema'
import {
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import { pagarConsultoriaSimulado } from '@/features/consultorias/actions/pagamento'
import { reservarHorarioDaConsultoria } from '@/features/consultorias/actions/reserva'
import { listarHorariosDoDia } from '@/features/consultorias/queries/agenda-publica'
import {
  dataLocalDoInstante,
  diaDaSemanaDeDataLocal,
  somarDiasEmDataLocal,
} from '@/features/consultorias/lib/tempo'
import { entrarNaVideochamada } from '@/features/videochamada/actions/videochamada'
import {
  MINUTOS_ANTES_DA_CONSULTORIA,
  MINUTOS_DE_TOLERANCIA,
} from '@/features/videochamada/constants/videochamada'
import { ErroDaily } from '@/features/videochamada/lib/daily/erros'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { comSessao, sairDaSessao } from './setup/sessao'

/**
 * A videochamada da Consultoria: quem entra, quando, e em qual sala.
 *
 * ## Por que a Daily é dublê aqui
 *
 * Porque o que precisa ser provado é **nosso**: a decisão de autorizar, a
 * fronteira da janela e a garantia de que duas pessoas convergem para uma sala
 * só. Nada disso mora na Daily — ela recebe o resultado da decisão. Chamar a
 * API de verdade em cada um destes casos gastaria minutos do plano para testar
 * código que não é da Daily, e ainda tornaria a suíte refém da rede.
 *
 * O dublê registra **o que foi pedido**, e é sobre esse registro que as
 * asserções de segurança são feitas: qual `room_name` foi gravado no token,
 * quantas salas nasceram, que nome de participante atravessou. A conversa real
 * com a Daily é validada à parte, uma vez, com duas identidades de verdade.
 *
 * ## O relógio
 *
 * Só `Date` é falsificado (`toFake: ['Date']`). Os temporizadores do driver do
 * Postgres continuam reais — congelá-los penduraria cada consulta.
 */

const salasCriadas: { nome: string; nbf: number; exp: number }[] = []
const tokensEmitidos: {
  nomeDaSala: string
  nomeExibido: string
  usuarioId: string
  nbf: number
  exp: number
}[] = []
/** O que o dublê deve fazer na próxima chamada. Um teste por vez mexe nisto. */
const falhas = { criarSala: 0, criarToken: 0, salaSumida: false }

vi.mock('@/features/videochamada/lib/daily/cliente-daily', () => ({
  criarSala: vi.fn(async (props: { nome: string; nbf: number; exp: number }) => {
    if (falhas.criarSala > 0) {
      falhas.criarSala -= 1
      throw new ErroDaily('criar_sala', 'Daily indisponível (dublê).')
    }
    // A Daily recusa nome repetido; o dublê imita isso devolvendo a existente,
    // que é o que o cliente real faz ao ver `already-exists`.
    const jaExiste = salasCriadas.find((s) => s.nome === props.nome)
    if (!jaExiste) salasCriadas.push(props)
    return {
      name: props.nome,
      url: `https://vincis.daily.co/${props.nome}`,
      privacy: 'private',
    }
  }),
  obterSala: vi.fn(async (nome: string) => {
    if (falhas.salaSumida) return null
    const sala = salasCriadas.find((s) => s.nome === nome)
    return sala
      ? { name: nome, url: `https://vincis.daily.co/${nome}`, privacy: 'private' }
      : null
  }),
  criarTokenDeReuniao: vi.fn(async (props: (typeof tokensEmitidos)[number]) => {
    if (falhas.criarToken > 0) {
      falhas.criarToken -= 1
      throw new ErroDaily('criar_token', 'Daily indisponível (dublê).')
    }
    tokensEmitidos.push(props)
    return `tok_${props.nomeDaSala}_${props.usuarioId}`
  }),
  apagarSala: vi.fn(async () => true),
}))

const SUFIXO = '@videochamada.teste'
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
  duracaoMinutos: 60,
  intervaloMinutos: 15,
  antecedenciaMinimaMinutos: 120,
  horizonteDias: 60,
  timezone: FUSO,
}

let contas: Record<Chave, ContaDeTeste>
/** A consultoria de A com Ana — o cenário principal. */
let doA: { atendimentoId: string; agendamentoId: string; inicioEm: Date; fimEm: Date }
/** A consultoria de B com Bruno — a "de outra pessoa", para as tentativas. */
let doB: { atendimentoId: string; agendamentoId: string }

async function configurar(conta: ContaDeTeste, dataAlvo: string) {
  await comSessao(conta.token, async () => {
    const salva = await salvarConsultoria(CONFIG)
    if (!salva.sucesso) throw new Error(salva.mensagem)
    const faixas = await salvarDisponibilidades([
      {
        diaSemana: diaDaSemanaDeDataLocal(dataAlvo),
        horaInicio: '08:00',
        horaFim: '18:00',
      },
    ])
    if (!faixas.sucesso) throw new Error(faixas.mensagem)
  })
}

async function contratar(
  cliente: ContaDeTeste,
  prestador: ContaDeTeste,
  dataAlvo: string,
  inicio: string,
) {
  const reserva = await comSessao(cliente.token, () =>
    reservarHorarioDaConsultoria({
      prestadorId: prestador.id,
      data: dataAlvo,
      inicio,
      descricao: 'Assunto da consultoria de teste.',
    }),
  )
  if (reserva.situacao !== 'reservado') throw new Error(`Reserva: ${reserva.situacao}`)
  const pago = await comSessao(cliente.token, () =>
    pagarConsultoriaSimulado({ reservaId: reserva.reserva.id }),
  )
  if (pago.situacao !== 'confirmado') throw new Error(`Pagamento: ${pago.situacao}`)

  const [agendamento] = await db
    .select({
      id: consultoriaAgendamentos.id,
      inicioEm: consultoriaAgendamentos.inicioEm,
      fimEm: consultoriaAgendamentos.fimEm,
    })
    .from(consultoriaAgendamentos)
    .where(eq(consultoriaAgendamentos.reservaId, reserva.reserva.id))
    .limit(1)

  return {
    atendimentoId: pago.atendimentoId,
    agendamentoId: agendamento.id,
    inicioEm: agendamento.inicioEm,
    fimEm: agendamento.fimEm,
  }
}

/** Coloca o relógio num ponto relativo ao início da consultoria de A. */
function relogioEm(instante: Date) {
  vi.setSystemTime(instante)
}

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119470')
  const dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 7)
  await configurar(contas.anaPro, dataAlvo)
  await configurar(contas.brunoPro, dataAlvo)

  const daAna = (
    await listarHorariosDoDia({ prestadorId: contas.anaPro.id, data: dataAlvo })
  ).horarios.map((h) => h.inicio)
  const doBruno = (
    await listarHorariosDoDia({ prestadorId: contas.brunoPro.id, data: dataAlvo })
  ).horarios.map((h) => h.inicio)

  doA = await contratar(contas.clienteA, contas.anaPro, dataAlvo, daAna[1])
  doB = await contratar(contas.clienteB, contas.brunoPro, dataAlvo, doBruno[2])

  /**
   * As sessões precisam sobreviver à viagem no tempo.
   *
   * O harness cria sessões de uma hora, e a consultoria de teste acontece daqui
   * a uma semana — ao adiantar o relógio para a janela, toda sessão apareceria
   * expirada e **todo** caso viraria `sem_sessao`, escondendo o que realmente
   * está sendo testado. Isto é conserto de cenário, não afrouxamento de regra:
   * a expiração de sessão continua valendo, e quem a cobre é a suíte de
   * autenticação.
   */
  await db
    .update(sessoesUsuario)
    .set({ expiraEm: new Date(doA.fimEm.getTime() + 365 * 24 * 3600_000) })
    .where(
      inArray(
        sessoesUsuario.usuarioId,
        Object.values(contas).map((conta) => conta.id),
      ),
    )

  vi.useFakeTimers({ toFake: ['Date'] })
}, 180_000)

afterEach(() => {
  falhas.criarSala = 0
  falhas.criarToken = 0
  falhas.salaSumida = false
})

afterAll(async () => {
  vi.useRealTimers()
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('autorização', () => {
  it('visitante sem sessão não entra', async () => {
    relogioEm(doA.inicioEm)
    sairDaSessao()
    const r = await entrarNaVideochamada({ atendimentoId: doA.atendimentoId })
    expect(r.situacao).toBe('sem_sessao')
  })

  it('o Cliente dono entra', async () => {
    relogioEm(doA.inicioEm)
    const r = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(r.situacao).toBe('autorizado')
  })

  it('o Profissional contratado entra', async () => {
    relogioEm(doA.inicioEm)
    const r = await comSessao(contas.anaPro.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(r.situacao).toBe('autorizado')
  })

  /**
   * A tentativa de manipulação, na forma em que ela realmente aparece: um id
   * alheio no corpo da requisição. Não há tela que impeça isso — só o `where`.
   */
  it('Cliente alheio não entra no Atendimento de outro Cliente', async () => {
    relogioEm(doA.inicioEm)
    const r = await comSessao(contas.clienteB.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(r.situacao).toBe('sem_acesso')
  })

  it('Profissional alheio não entra na consultoria de outro Profissional', async () => {
    relogioEm(doA.inicioEm)
    const r = await comSessao(contas.brunoPro.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(r.situacao).toBe('sem_acesso')
  })

  it('consultoria inexistente devolve a mesma recusa, sem contar o que faltou', async () => {
    relogioEm(doA.inicioEm)
    const inexistente = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: '11111111-1111-4111-8111-111111111111' }),
    )
    const alheia = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doB.atendimentoId }),
    )
    expect(inexistente.situacao).toBe('sem_acesso')
    expect(alheia.situacao).toBe('sem_acesso')
    // Mesma frase para os dois: a recusa não ensina qual chute chegou perto.
    expect(inexistente).toEqual(alheia)
  })

  it('id malformado não chega ao banco', async () => {
    relogioEm(doA.inicioEm)
    const r = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: 'nao-e-uuid' }),
    )
    expect(r.situacao).toBe('sem_acesso')
  })

  /**
   * Saber o `room_name` não é poder entrar.
   *
   * O nome fica no banco e podia, em tese, vazar. O que ele não faz é virar
   * token: quem emite consulta a linha do **próprio** solicitante, e o
   * `room_name` do token vem de lá. Este teste confere que o token que o
   * intruso não conseguiu tirar nunca existiu — e que o do dono aponta para a
   * sala dele.
   */
  it('descobrir o nome da sala alheia não gera token para ela', async () => {
    relogioEm(doA.inicioEm)
    await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    const [reg] = await db
      .select({ nome: consultoriaAgendamentos.dailyRoomName })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.id, doA.agendamentoId))
      .limit(1)

    const antes = tokensEmitidos.length
    const r = await comSessao(contas.clienteB.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(r.situacao).toBe('sem_acesso')
    expect(tokensEmitidos.length).toBe(antes)
    expect(
      tokensEmitidos.some(
        (t) => t.nomeDaSala === reg.nome && t.usuarioId === contas.clienteB.id,
      ),
    ).toBe(false)
  })
})

describe('janela de acesso, ponta a ponta', () => {
  it('um segundo antes de abrir, o servidor recusa', async () => {
    relogioEm(
      new Date(doA.inicioEm.getTime() - MINUTOS_ANTES_DA_CONSULTORIA * UM_MINUTO - 1000),
    )
    const r = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(r.situacao).toBe('fora_da_janela')
    if (r.situacao === 'fora_da_janela') expect(r.janela).toBe('antes')
  })

  it('no instante em que abre, o servidor autoriza', async () => {
    relogioEm(
      new Date(doA.inicioEm.getTime() - MINUTOS_ANTES_DA_CONSULTORIA * UM_MINUTO),
    )
    const r = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(r.situacao).toBe('autorizado')
  })

  it('no último segundo da tolerância ainda autoriza', async () => {
    relogioEm(
      new Date(doA.fimEm.getTime() + MINUTOS_DE_TOLERANCIA * UM_MINUTO - 1000),
    )
    const r = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(r.situacao).toBe('autorizado')
  })

  it('no instante em que a tolerância acaba, recusa e não emite token', async () => {
    relogioEm(new Date(doA.fimEm.getTime() + MINUTOS_DE_TOLERANCIA * UM_MINUTO))
    const antes = tokensEmitidos.length
    const r = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(r.situacao).toBe('fora_da_janela')
    if (r.situacao === 'fora_da_janela') expect(r.janela).toBe('encerrada')
    expect(tokensEmitidos.length).toBe(antes)
  })

  it('a entrada antecipada não cria sala nenhuma', async () => {
    // Uma consultoria ainda sem sala, para o caso ser observável.
    const semSala = await db
      .select({ nome: consultoriaAgendamentos.dailyRoomName })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.id, doB.agendamentoId))
      .limit(1)
    expect(semSala[0].nome).toBeNull()

    relogioEm(new Date(doA.inicioEm.getTime() - 60 * UM_MINUTO))
    await comSessao(contas.clienteB.token, () =>
      entrarNaVideochamada({ atendimentoId: doB.atendimentoId }),
    )

    const [depois] = await db
      .select({ nome: consultoriaAgendamentos.dailyRoomName })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.id, doB.agendamentoId))
      .limit(1)
    expect(depois.nome).toBeNull()
  })
})

describe('a sala é uma só', () => {
  it('Cliente e Profissional recebem a mesma sala, com tokens distintos', async () => {
    relogioEm(doA.inicioEm)
    const doCliente = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    const doPrestador = await comSessao(contas.anaPro.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    if (doCliente.situacao !== 'autorizado' || doPrestador.situacao !== 'autorizado') {
      throw new Error('esperado autorizado nos dois')
    }
    expect(doCliente.url).toBe(doPrestador.url)
    expect(doCliente.token).not.toBe(doPrestador.token)
    expect(doCliente.nomeExibido).not.toBe(doPrestador.nomeExibido)
  })

  it('F5 e reentrada reutilizam a mesma sala', async () => {
    relogioEm(doA.inicioEm)
    const antes = salasCriadas.length
    const um = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    const dois = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    const tres = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    if (um.situacao !== 'autorizado' || dois.situacao !== 'autorizado' || tres.situacao !== 'autorizado') {
      throw new Error('esperado autorizado')
    }
    expect(new Set([um.url, dois.url, tres.url]).size).toBe(1)
    expect(salasCriadas.length).toBe(antes)
  })

  /**
   * A corrida de verdade: os dois clicam juntos, numa consultoria que ainda não
   * tem sala. É o caso que um `if (!sala) criar()` perderia.
   */
  it('cliques simultâneos criam UMA sala e autorizam OS DOIS', async () => {
    const dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 7)
    const horarios = (
      await listarHorariosDoDia({ prestadorId: contas.anaPro.id, data: dataAlvo })
    ).horarios.map((h) => h.inicio)
    const nova = await contratar(contas.clienteA, contas.anaPro, dataAlvo, horarios[0])

    relogioEm(nova.inicioEm)
    const antes = salasCriadas.length

    const [doCliente, doPrestador] = await Promise.all([
      comSessao(contas.clienteA.token, () =>
        entrarNaVideochamada({ atendimentoId: nova.atendimentoId }),
      ),
      comSessao(contas.anaPro.token, () =>
        entrarNaVideochamada({ atendimentoId: nova.atendimentoId }),
      ),
    ])

    expect(doCliente.situacao).toBe('autorizado')
    expect(doPrestador.situacao).toBe('autorizado')
    if (doCliente.situacao !== 'autorizado' || doPrestador.situacao !== 'autorizado') return
    expect(doCliente.url).toBe(doPrestador.url)

    // Uma linha, um nome — e no máximo uma sala nova nasceu.
    const [reg] = await db
      .select({ nome: consultoriaAgendamentos.dailyRoomName })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.id, nova.agendamentoId))
      .limit(1)
    expect(reg.nome).toBeTruthy()
    expect(doCliente.url).toContain(reg.nome!)
    expect(salasCriadas.length - antes).toBe(1)
  })
})

describe('o token', () => {
  it('vai limitado à sala certa, com a identidade da sessão e prazo da janela', async () => {
    relogioEm(doA.inicioEm)
    await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    const emitido = tokensEmitidos.at(-1)!
    const [reg] = await db
      .select({ nome: consultoriaAgendamentos.dailyRoomName })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.id, doA.agendamentoId))
      .limit(1)

    // `room_name` sempre presente: um token sem ele valeria para qualquer sala
    // do domínio, o que a própria documentação da Daily avisa em destaque.
    expect(emitido.nomeDaSala).toBe(reg.nome)
    expect(emitido.usuarioId).toBe(contas.clienteA.id)
    // O nome exibido é o da conta autenticada, lido do banco — não um campo
    // que o navegador mandou junto do clique.
    const [conta] = await db
      .select({ nome: usuarios.nome })
      .from(usuarios)
      .where(eq(usuarios.id, contas.clienteA.id))
      .limit(1)
    expect(emitido.nomeExibido).toBe(conta.nome)
    // O prazo é o da janela, não "algumas horas".
    expect(emitido.exp * 1000).toBe(
      doA.fimEm.getTime() + MINUTOS_DE_TOLERANCIA * UM_MINUTO,
    )
    expect(emitido.nbf * 1000).toBe(
      doA.inicioEm.getTime() - MINUTOS_ANTES_DA_CONSULTORIA * UM_MINUTO,
    )
  })

  it('não é persistido em lugar nenhum', async () => {
    relogioEm(doA.inicioEm)
    const r = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    if (r.situacao !== 'autorizado') throw new Error('esperado autorizado')

    const [linha] = await db
      .select()
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.id, doA.agendamentoId))
      .limit(1)

    const serializado = JSON.stringify(linha)
    expect(serializado).not.toContain(r.token)
    // A coluna guarda o nome da sala, e só ele.
    expect(linha.dailyRoomName).toBeTruthy()
    expect(serializado).not.toContain('tok_')
  })
})

describe('falhas da Daily', () => {
  it('falha ao criar a sala vira mensagem amigável, sem vazar nada', async () => {
    const dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 7)
    const horarios = (
      await listarHorariosDoDia({ prestadorId: contas.brunoPro.id, data: dataAlvo })
    ).horarios.map((h) => h.inicio)
    const nova = await contratar(contas.clienteA, contas.brunoPro, dataAlvo, horarios[0])

    relogioEm(nova.inicioEm)
    falhas.criarSala = 1
    const r = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: nova.atendimentoId }),
    )

    expect(r.situacao).toBe('falha')
    if (r.situacao !== 'falha') return
    expect(r.mensagem).toBe(
      'Não foi possível iniciar a videochamada agora. Tente novamente em alguns instantes.',
    )
    expect(r.mensagem).not.toMatch(/daily|status|token|http|\d{3}/i)

    /**
     * O retry funciona **e não duplica**: o nome já reservado é reaproveitado,
     * então a segunda tentativa termina na mesma sala que a primeira teria
     * criado. Uma falha da Daily não deixa o agendamento em estado inválido.
     */
    const segunda = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: nova.atendimentoId }),
    )
    expect(segunda.situacao).toBe('autorizado')

    const [reg] = await db
      .select({ nome: consultoriaAgendamentos.dailyRoomName })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.id, nova.agendamentoId))
      .limit(1)
    expect(salasCriadas.filter((s) => s.nome === reg.nome)).toHaveLength(1)
  })

  it('falha ao emitir o token não corrompe a sala nem o agendamento', async () => {
    relogioEm(doA.inicioEm)
    falhas.criarToken = 1
    const r = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(r.situacao).toBe('falha')

    const depois = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(depois.situacao).toBe('autorizado')
  })

  /**
   * A sala expirou e a Daily já a apagou. O vínculo continua válido: recriamos
   * **com o mesmo nome**, e nenhuma segunda sala nasce para a consultoria.
   */
  it('sala apagada é recriada com o mesmo nome', async () => {
    relogioEm(doA.inicioEm)
    const [antes] = await db
      .select({ nome: consultoriaAgendamentos.dailyRoomName })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.id, doA.agendamentoId))
      .limit(1)

    falhas.salaSumida = true
    const r = await comSessao(contas.clienteA.token, () =>
      entrarNaVideochamada({ atendimentoId: doA.atendimentoId }),
    )
    expect(r.situacao).toBe('autorizado')
    if (r.situacao !== 'autorizado') return
    expect(r.url).toContain(antes.nome!)

    const [depois] = await db
      .select({ nome: consultoriaAgendamentos.dailyRoomName })
      .from(consultoriaAgendamentos)
      .where(eq(consultoriaAgendamentos.id, doA.agendamentoId))
      .limit(1)
    expect(depois.nome).toBe(antes.nome)
  })
})
