import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, sql as bruto } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentos,
  consultoriaConfiguracoes,
  consultoriaReservas,
  contratacoesServico,
  usuarios,
} from '@/db/schema'
import {
  criarExcecao,
  removerExcecao,
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import { reservarHorarioDaConsultoria } from '@/features/consultorias/actions/reserva'
import { MENSAGEM_HORARIO_INDISPONIVEL } from '@/features/consultorias/constants/contratacao'
import { HOLD_CONSULTORIA_MINUTOS } from '@/features/consultorias/constants/reserva'
import {
  bordasDeConflito,
  expiracaoDe,
  formatarRestante,
  periodosConflitam,
  reservaValida,
  restanteEmSegundos,
} from '@/features/consultorias/lib/reserva'
import { listarHorariosDoDia } from '@/features/consultorias/queries/agenda-publica'
import {
  dataLocalDoInstante,
  diaDaSemanaDeDataLocal,
  somarDiasEmDataLocal,
} from '@/features/consultorias/lib/tempo'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { comSessao, entrarComo, sairDaSessao } from './setup/sessao'

/**
 * A reserva temporária, e principalmente a disputa por ela.
 *
 * ## O que este arquivo precisa provar
 *
 * Que a exclusividade do horário é do **banco**, e não de um botão desabilitado.
 * Por isso o teste central não é sequencial: dois Clientes disparam a aquisição
 * do mesmo horário ao mesmo tempo, com `Promise.all`, e o arquivo cobra que
 * exatamente um vença — e que o banco fique com exatamente uma reserva viva.
 * Rodar isso várias vezes seguidas é de propósito: corrida que só falha de vez
 * em quando é pior do que corrida que nunca funciona.
 *
 * ## Por que a expiração é testada mexendo no banco
 *
 * Ninguém pode esperar dez minutos numa suíte. O teste empurra `expira_em` para
 * o passado com um `update` — que é exatamente o estado em que o mundo real
 * fica depois de dez minutos — e cobra que o horário volte a ser oferecido
 * **sem** nenhuma varredura ter rodado. É assim que se prova que a liberação
 * não depende de Cron.
 */

const SUFIXO = '@consultoria-reserva.teste'
const FUSO = 'America/Sao_Paulo'

type Chave = 'profissional' | 'clienteA' | 'clienteB' | 'clienteC' | 'prestadorIntruso'

const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  profissional: { perfil: 'profissional', prestador: 'profissional' },
  clienteA: { perfil: 'cliente' },
  clienteB: { perfil: 'cliente' },
  clienteC: { perfil: 'cliente' },
  prestadorIntruso: { perfil: 'profissional', prestador: 'profissional' },
}

/** Duração 60, folga 15: o próximo início legítimo depois das 14:00 é 15:15. */
const CONFIGURACAO = {
  titulo: 'Consultoria tributária',
  descricaoCurta: 'Conversa ao vivo para decisões fiscais.',
  valorCentavos: 20_000,
  duracaoMinutos: 60,
  intervaloMinutos: 15,
  antecedenciaMinimaMinutos: 120,
  horizonteDias: 60,
  timezone: FUSO,
}

let contas: Record<Chave, ContaDeTeste>
let configuracaoId: string
let dataAlvo: string
let horarios: string[]

async function reservasDoBanco(status?: string) {
  const registros = await db
    .select()
    .from(consultoriaReservas)
    .where(
      status
        ? and(
            eq(consultoriaReservas.configuracaoId, configuracaoId),
            eq(consultoriaReservas.status, status),
          )
        : eq(consultoriaReservas.configuracaoId, configuracaoId),
    )
  return registros
}

async function limparReservas() {
  await db
    .delete(consultoriaReservas)
    .where(eq(consultoriaReservas.configuracaoId, configuracaoId))
}

/**
 * Uma tentativa de reserva, com a sessão presa ao contexto desta chamada.
 *
 * `comSessao` em vez de `entrarComo` porque metade destes testes dispara duas
 * tentativas em paralelo: com o token numa variável de módulo, A e B acabariam
 * chegando ao servidor como a mesma pessoa, e a disputa que o teste quer provar
 * não teria acontecido.
 */
function reservar(conta: ContaDeTeste, inicio: string, descricao = 'Assunto.') {
  return comSessao(conta.token, () =>
    reservarHorarioDaConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio,
      descricao,
    }),
  )
}

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119465')
  dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 7)

  entrarComo(contas.profissional.token)
  const salva = await salvarConsultoria(CONFIGURACAO)
  if (!salva.sucesso) throw new Error(salva.mensagem)
  const faixas = await salvarDisponibilidades([
    {
      diaSemana: diaDaSemanaDeDataLocal(dataAlvo),
      horaInicio: '08:00',
      horaFim: '18:00',
    },
  ])
  if (!faixas.sucesso) throw new Error(faixas.mensagem)
  sairDaSessao()

  const [configuracao] = await db
    .select({ id: consultoriaConfiguracoes.id })
    .from(consultoriaConfiguracoes)
    .where(eq(consultoriaConfiguracoes.prestadorId, contas.profissional.id))
  configuracaoId = configuracao.id

  const agenda = await listarHorariosDoDia({
    prestadorId: contas.profissional.id,
    data: dataAlvo,
  })
  horarios = agenda.horarios.map((slot) => slot.inicio)
  if (horarios.length < 4) throw new Error('Cenário sem horários suficientes.')
}, 120_000)

afterEach(async () => {
  sairDaSessao()
  await limparReservas()
})

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('contas da reserva, sem banco', () => {
  it('o prazo é de dez minutos, contados do instante da aquisição', () => {
    const agora = new Date('2026-09-14T12:00:00Z')
    expect(HOLD_CONSULTORIA_MINUTOS).toBe(10)
    expect(expiracaoDe(agora).toISOString()).toBe('2026-09-14T12:10:00.000Z')
  })

  it('só é válida quando está ativa E ainda não venceu', () => {
    const agora = new Date('2026-09-14T12:00:00Z')
    const futuro = new Date('2026-09-14T12:05:00Z')
    const passado = new Date('2026-09-14T11:59:00Z')
    expect(reservaValida({ status: 'ativa', expiraEm: futuro }, agora)).toBe(true)
    // Vencida continua "ativa" no banco até alguém varrer — e não vale nada.
    expect(reservaValida({ status: 'ativa', expiraEm: passado }, agora)).toBe(false)
    // Liberada não segura horário nem com prazo no futuro.
    expect(reservaValida({ status: 'liberada', expiraEm: futuro }, agora)).toBe(false)
    expect(reservaValida({ status: 'expirada', expiraEm: futuro }, agora)).toBe(false)
  })

  it('o contador nunca fica negativo e formata como relógio', () => {
    const agora = new Date('2026-09-14T12:00:00Z')
    expect(restanteEmSegundos(new Date('2026-09-14T12:09:42Z'), agora)).toBe(582)
    expect(restanteEmSegundos(new Date('2026-09-14T11:50:00Z'), agora)).toBe(0)
    expect(formatarRestante(582)).toBe('09:42')
    expect(formatarRestante(0)).toBe('00:00')
    expect(formatarRestante(-30)).toBe('00:00')
  })

  it('conflito é de intervalo, e não de início igual', () => {
    const base = {
      inicioEm: new Date('2026-09-14T17:00:00Z'),
      fimEm: new Date('2026-09-14T18:00:00Z'),
    }
    const sobrepoeNoMeio = {
      inicioEm: new Date('2026-09-14T17:30:00Z'),
      fimEm: new Date('2026-09-14T18:30:00Z'),
    }
    const colado = {
      inicioEm: new Date('2026-09-14T18:00:00Z'),
      fimEm: new Date('2026-09-14T19:00:00Z'),
    }
    const depoisDoBuffer = {
      inicioEm: new Date('2026-09-14T18:15:00Z'),
      fimEm: new Date('2026-09-14T19:15:00Z'),
    }

    expect(periodosConflitam(base, sobrepoeNoMeio, 0)).toBe(true)
    // Encostado sem folga não conflita quando não há buffer…
    expect(periodosConflitam(base, colado, 0)).toBe(false)
    // …mas conflita quando o buffer exige quinze minutos entre consultas.
    expect(periodosConflitam(base, colado, 15)).toBe(true)
    expect(periodosConflitam(base, depoisDoBuffer, 15)).toBe(false)
    // A relação é simétrica: quem chega antes não tem privilégio.
    expect(periodosConflitam(sobrepoeNoMeio, base, 0)).toBe(true)
  })

  it('as bordas SQL dizem a mesma coisa que a comparação de intervalos', () => {
    const periodo = {
      inicioEm: new Date('2026-09-14T17:00:00Z'),
      fimEm: new Date('2026-09-14T18:00:00Z'),
    }
    const { limiteInferior, limiteSuperior } = bordasDeConflito(periodo, 15)
    expect(limiteInferior.toISOString()).toBe('2026-09-14T16:45:00.000Z')
    expect(limiteSuperior.toISOString()).toBe('2026-09-14T18:15:00.000Z')
  })
})

describe('quem pode reservar', () => {
  it('Cliente apto reserva, e a reserva nasce com dez minutos', async () => {
    const antes = Date.now()
    const resultado = await reservar(contas.clienteA, horarios[0])

    expect(resultado.situacao).toBe('reservado')
    if (resultado.situacao !== 'reservado') return
    expect(resultado.jaExistia).toBe(false)
    const duracao = resultado.reserva.expiraEm.getTime() - antes
    expect(duracao).toBeGreaterThan(9 * 60_000)
    expect(duracao).toBeLessThanOrEqual(10 * 60_000 + 5_000)
    // A fotografia financeira é a da configuração, não a do navegador.
    expect(resultado.reserva.valorCentavos).toBe(CONFIGURACAO.valorCentavos)
    expect(resultado.reserva.duracaoMinutos).toBe(CONFIGURACAO.duracaoMinutos)
  })

  it('visitante sem sessão não reserva nada', async () => {
    sairDaSessao()
    const resultado = await reservarHorarioDaConsultoria({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      inicio: horarios[0],
      descricao: 'Sem sessão.',
    })
    expect(resultado.situacao).toBe('precisa_entrar')
    expect(await reservasDoBanco()).toHaveLength(0)
  })

  it('conta não confirmada não reserva', async () => {
    await db
      .update(usuarios)
      .set({ emailVerificado: false, emailVerificadoEm: null, whatsappVerificado: false })
      .where(eq(usuarios.id, contas.clienteC.id))

    const resultado = await reservar(contas.clienteC, horarios[0])
    expect(resultado.situacao).toBe('conta_nao_confirmada')
    expect(await reservasDoBanco()).toHaveLength(0)

    await db
      .update(usuarios)
      .set({ emailVerificado: true, emailVerificadoEm: new Date() })
      .where(eq(usuarios.id, contas.clienteC.id))
  })

  it('Prestador autenticado não reserva como se fosse Cliente', async () => {
    const resultado = await reservar(contas.prestadorIntruso, horarios[0])
    expect(resultado.situacao).toBe('perfil_nao_pode_contratar')
    expect(await reservasDoBanco()).toHaveLength(0)
  })

  it('descrição vazia é recusada antes de qualquer gravação', async () => {
    const resultado = await reservar(contas.clienteA, horarios[0], '    ')
    expect(resultado.situacao).toBe('dados_invalidos')
    expect(await reservasDoBanco()).toHaveLength(0)
  })
})

describe('idempotência do mesmo Cliente', () => {
  it('clique duplo devolve a mesma reserva, com o mesmo relógio', async () => {
    const primeira = await reservar(contas.clienteA, horarios[0])
    const segunda = await reservar(contas.clienteA, horarios[0])

    expect(primeira.situacao).toBe('reservado')
    expect(segunda.situacao).toBe('reservado')
    if (primeira.situacao !== 'reservado' || segunda.situacao !== 'reservado') return

    expect(segunda.jaExistia).toBe(true)
    expect(segunda.reserva.id).toBe(primeira.reserva.id)
    // Insistir não compra tempo: o prazo é o da primeira aquisição.
    expect(segunda.reserva.expiraEm.toISOString()).toBe(
      primeira.reserva.expiraEm.toISOString(),
    )
    expect(await reservasDoBanco('ativa')).toHaveLength(1)
  })

  it('cinco tentativas seguidas continuam gerando uma reserva só', async () => {
    const ids = new Set<string>()
    for (let vez = 0; vez < 5; vez += 1) {
      const resultado = await reservar(contas.clienteA, horarios[0])
      if (resultado.situacao === 'reservado') ids.add(resultado.reserva.id)
    }
    expect(ids.size).toBe(1)
    expect(await reservasDoBanco('ativa')).toHaveLength(1)
  })

  it('duplo clique simultâneo do mesmo Cliente também não duplica', async () => {
    const [a, b] = await Promise.all([
      reservar(contas.clienteA, horarios[0]),
      reservar(contas.clienteA, horarios[0]),
    ])
    const vencedores = [a, b].filter((r) => r.situacao === 'reservado')
    expect(vencedores.length).toBeGreaterThanOrEqual(1)
    expect(await reservasDoBanco('ativa')).toHaveLength(1)
  })
})

describe('concorrência real entre dois Clientes', () => {
  it('A e B disputam o mesmo horário ao mesmo tempo: exatamente um vence', async () => {
    for (let rodada = 0; rodada < 5; rodada += 1) {
      await limparReservas()

      const [a, b] = await Promise.all([
        reservar(contas.clienteA, horarios[0], 'Cliente A.'),
        reservar(contas.clienteB, horarios[0], 'Cliente B.'),
      ])

      const reservados = [a, b].filter((r) => r.situacao === 'reservado')
      const recusados = [a, b].filter((r) => r.situacao === 'horario_indisponivel')

      expect(reservados).toHaveLength(1)
      expect(recusados).toHaveLength(1)

      // E o banco concorda com a resposta dada às duas pessoas.
      const vivas = await reservasDoBanco('ativa')
      expect(vivas).toHaveLength(1)
      if (reservados[0].situacao === 'reservado') {
        expect(vivas[0].id).toBe(reservados[0].reserva.id)
      }
    }
  }, 60_000)

  it('a recusa não conta nada sobre o outro Cliente', async () => {
    await reservar(contas.clienteA, horarios[0], 'Assunto sigiloso do Cliente A.')
    const recusa = await reservar(contas.clienteB, horarios[0])

    expect(recusa.situacao).toBe('horario_indisponivel')
    if (recusa.situacao === 'reservado') return
    expect(recusa.mensagem).toBe(MENSAGEM_HORARIO_INDISPONIVEL)

    const serializada = JSON.stringify(recusa)
    expect(serializada).not.toContain('Assunto sigiloso')
    expect(serializada).not.toContain(contas.clienteA.id)
    expect(serializada.toLowerCase()).not.toContain('reserva')
    expect(serializada.toLowerCase()).not.toContain('minuto')
  })

  it('slots vizinhos não conflitam — o buffer já está embutido na grade', async () => {
    // A grade nasce espaçada de `duração + intervalo`, então dois horários
    // oferecidos lado a lado nunca se cruzam. Reservar um não pode derrubar o
    // seguinte: seria o buffer sendo cobrado duas vezes.
    expect(await reservar(contas.clienteA, horarios[0])).toMatchObject({
      situacao: 'reservado',
    })
    expect(await reservar(contas.clienteB, horarios[1])).toMatchObject({
      situacao: 'reservado',
    })
    expect(await reservasDoBanco('ativa')).toHaveLength(2)
  })

  it('sobreposição parcial é conflito, mesmo com início diferente', async () => {
    /*
     * Um período desalinhado da grade atual não é hipótese de laboratório: o
     * Profissional pode encurtar a duração ou o intervalo depois de alguém já
     * ter reservado, e a reserva antiga continua valendo (ela é um compromisso
     * assumido). Aqui ele é gravado direto na tabela para descrever exatamente
     * essa situação — meia hora adiantado em relação ao slot oferecido.
     */
    const inicioDoSlot = (
      await listarHorariosDoDia({ prestadorId: contas.profissional.id, data: dataAlvo })
    ).horarios[0]

    const meiaHoraAntes = new Date(inicioDoSlot.inicioEm.getTime() - 30 * 60_000)
    await db.insert(consultoriaReservas).values({
      configuracaoId,
      clienteUsuarioId: contas.clienteB.id,
      inicioEm: meiaHoraAntes,
      fimEm: new Date(meiaHoraAntes.getTime() + 60 * 60_000),
      expiraEm: new Date(Date.now() + 10 * 60_000),
      valorCentavos: CONFIGURACAO.valorCentavos,
      duracaoMinutos: CONFIGURACAO.duracaoMinutos,
      timezone: FUSO,
      descricao: 'Reserva desalinhada da grade.',
    })

    // Início diferente, intervalos cruzados: conflito.
    const tentativa = await reservar(contas.clienteA, inicioDoSlot.inicio)
    expect(tentativa.situacao).toBe('horario_indisponivel')

    // E o calendário público também deixa de oferecer aquele horário.
    const agenda = await listarHorariosDoDia({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
    })
    expect(agenda.horarios.map((h) => h.inicio)).not.toContain(inicioDoSlot.inicio)
  })
})

describe('expiração — sem Cron', () => {
  it('reserva válida some da agenda pública; vencida reaparece', async () => {
    const antes = await listarHorariosDoDia({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
    })
    expect(antes.horarios.map((h) => h.inicio)).toContain(horarios[0])

    const reserva = await reservar(contas.clienteA, horarios[0])
    expect(reserva.situacao).toBe('reservado')

    const durante = await listarHorariosDoDia({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
    })
    expect(durante.horarios.map((h) => h.inicio)).not.toContain(horarios[0])
    // E só ele: o vizinho da grade respeita o buffer por construção e continua
    // à venda.
    expect(durante.horarios.map((h) => h.inicio)).toContain(horarios[1])

    // Dez minutos depois, sem nenhuma varredura ter rodado: a linha continua
    // fisicamente lá, marcada como `ativa`, e não segura mais nada.
    await db
      .update(consultoriaReservas)
      .set({ expiraEm: new Date(Date.now() - 1_000) })
      .where(eq(consultoriaReservas.configuracaoId, configuracaoId))

    const aindaAtivas = await reservasDoBanco('ativa')
    expect(aindaAtivas).toHaveLength(1)

    const depois = await listarHorariosDoDia({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
    })
    expect(depois.horarios.map((h) => h.inicio)).toContain(horarios[0])
  })

  it('outro Cliente adquire o horário depois que a reserva vence', async () => {
    await reservar(contas.clienteA, horarios[0])
    await db
      .update(consultoriaReservas)
      .set({ expiraEm: new Date(Date.now() - 1_000) })
      .where(eq(consultoriaReservas.configuracaoId, configuracaoId))

    const resultado = await reservar(contas.clienteB, horarios[0])
    expect(resultado.situacao).toBe('reservado')

    // A antiga foi marcada como expirada pela própria aquisição — higiene, para
    // que o índice único continue podendo existir.
    const expiradas = await reservasDoBanco('expirada')
    expect(expiradas).toHaveLength(1)
    expect(expiradas[0].clienteUsuarioId).toBe(contas.clienteA.id)
    expect(await reservasDoBanco('ativa')).toHaveLength(1)
  })
})

describe('o Cliente troca de horário', () => {
  it('a reserva anterior é liberada e o horário antigo volta à agenda', async () => {
    const primeira = await reservar(contas.clienteA, horarios[0])
    const segunda = await reservar(contas.clienteA, horarios[3])

    expect(primeira.situacao).toBe('reservado')
    expect(segunda.situacao).toBe('reservado')
    if (primeira.situacao !== 'reservado' || segunda.situacao !== 'reservado') return
    expect(segunda.reserva.id).not.toBe(primeira.reserva.id)

    expect(await reservasDoBanco('ativa')).toHaveLength(1)
    const liberadas = await reservasDoBanco('liberada')
    expect(liberadas).toHaveLength(1)
    expect(liberadas[0].id).toBe(primeira.reserva.id)

    const agenda = await listarHorariosDoDia({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
    })
    expect(agenda.horarios.map((h) => h.inicio)).toContain(horarios[0])
    expect(agenda.horarios.map((h) => h.inicio)).not.toContain(horarios[3])
  })

  it('não perde a reserva antiga quando a nova é recusada', async () => {
    // B fica com o horário disputado; A tenta trocar para ele e é recusado.
    const deA = await reservar(contas.clienteA, horarios[0])
    await reservar(contas.clienteB, horarios[3])
    const tentativa = await reservar(contas.clienteA, horarios[3])

    expect(tentativa.situacao).toBe('horario_indisponivel')
    if (deA.situacao !== 'reservado') return

    // A continua com o que já era dele: a troca é tudo ou nada.
    const vivas = await reservasDoBanco('ativa')
    expect(vivas.map((r) => r.id)).toContain(deA.reserva.id)
  })
})

describe('a reserva do próprio Cliente não o atrapalha', () => {
  it('quem reservou continua enxergando e reconferindo o próprio horário', async () => {
    const reserva = await reservar(contas.clienteA, horarios[0])
    expect(reserva.situacao).toBe('reservado')

    // Para o dono, o horário continua alcançável — é dele.
    const paraOdono = await listarHorariosDoDia({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      ignorarClienteId: contas.clienteA.id,
    })
    expect(paraOdono.horarios.map((h) => h.inicio)).toContain(horarios[0])

    // Para qualquer outra pessoa, está ocupado.
    const paraOsOutros = await listarHorariosDoDia({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
      ignorarClienteId: contas.clienteB.id,
    })
    expect(paraOsOutros.horarios.map((h) => h.inicio)).not.toContain(horarios[0])
  })
})

describe('a agenda continua obedecendo às exceções', () => {
  it('dia bloqueado pelo Profissional impede a reserva', async () => {
    entrarComo(contas.profissional.token)
    const excecao = await criarExcecao({
      data: dataAlvo,
      tipo: 'indisponivel_dia',
      motivo: 'Audiência',
    })
    if (!excecao.sucesso) throw new Error(excecao.mensagem)
    sairDaSessao()

    const resultado = await reservar(contas.clienteA, horarios[0])
    expect(resultado.situacao).toBe('horario_indisponivel')
    expect(await reservasDoBanco()).toHaveLength(0)

    entrarComo(contas.profissional.token)
    await removerExcecao(excecao.dados.id)
    sairDaSessao()
  })
})

describe('nada além da reserva é criado', () => {
  it('reservar não cria contratação, Atendimento nem protocolo', async () => {
    const [{ contratacoes }] = await db
      .select({ contratacoes: bruto<number>`count(*)::int` })
      .from(contratacoesServico)
    const [{ atendidos }] = await db
      .select({ atendidos: bruto<number>`count(*)::int` })
      .from(atendimentos)

    const resultado = await reservar(contas.clienteA, horarios[0])
    expect(resultado.situacao).toBe('reservado')

    const [{ contratacoesDepois }] = await db
      .select({ contratacoesDepois: bruto<number>`count(*)::int` })
      .from(contratacoesServico)
    const [{ atendidosDepois }] = await db
      .select({ atendidosDepois: bruto<number>`count(*)::int` })
      .from(atendimentos)

    expect(contratacoesDepois).toBe(contratacoes)
    expect(atendidosDepois).toBe(atendidos)
  })

  it('a descrição fica guardada na reserva, e não vaza pela agenda pública', async () => {
    await reservar(contas.clienteA, horarios[0], 'Processo trabalhista confidencial.')

    const [registro] = await reservasDoBanco('ativa')
    expect(registro.descricao).toBe('Processo trabalhista confidencial.')

    // A consulta que qualquer visitante alcança não carrega o assunto de
    // ninguém — mesmo princípio do `motivo` das exceções.
    const agenda = await listarHorariosDoDia({
      prestadorId: contas.profissional.id,
      data: dataAlvo,
    })
    expect(JSON.stringify(agenda)).not.toContain('Processo trabalhista')
  })
})
