import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { consultoriaConfiguracoes, perfisProfissionais } from '@/db/schema'
import {
  criarExcecao,
  obterMinhaConsultoria,
  removerExcecao,
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import {
  listarDiasDisponiveis,
  listarHorariosDoDia,
  obterConsultoriaPublica,
} from '@/features/consultorias/queries/agenda-publica'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * A agenda ligada ao banco, do jeito que a próxima etapa vai usá-la.
 *
 * O que este arquivo prova, e que o teste puro não alcança: a consultoria é
 * encontrada pelo **mesmo identificador** que o perfil público recebe em
 * `?prestador=`, a autorização de configuração é do dono e de mais ninguém, e
 * a ausência de configuração devolve ausência — nunca um preço de exemplo.
 *
 * Todos os cenários passam um `agora` explícito. A suíte precisa dar o mesmo
 * resultado hoje e daqui a um ano.
 */

const SUFIXO = '@consultoria-agenda.teste'

type Chave = 'ana' | 'bruno' | 'semCadastro' | 'marina'

const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  // Profissional habilitado, dono da agenda destes testes.
  ana: { perfil: 'profissional', prestador: 'profissional' },
  // Outro Profissional habilitado: prova o isolamento entre agendas.
  bruno: { perfil: 'profissional', prestador: 'profissional' },
  // Profissional cujo cadastro será rebaixado para `pendente`.
  semCadastro: { perfil: 'profissional', prestador: 'profissional' },
  // Cliente: não configura agenda nenhuma.
  marina: { perfil: 'cliente' },
}

/** Segunda-feira, 09:00 em São Paulo. Todo cenário parte daqui. */
const AGORA = new Date('2026-08-24T12:00:00Z')
const SEGUNDA = '2026-08-24'
const QUINTA = '2026-08-27'
const DOMINGO = '2026-08-30'
const SEGUNDA_SEGUINTE = '2026-08-31'
const QUINTA_SEGUINTE = '2026-09-03'

const CONFIGURACAO = {
  titulo: 'Consultoria tributária',
  descricaoCurta: 'Conversa ao vivo para decisões fiscais.',
  valorCentavos: 18_000,
  duracaoMinutos: 60,
  intervaloMinutos: 15,
  antecedenciaMinimaMinutos: 120,
  horizonteDias: 60,
  timezone: 'America/Sao_Paulo',
}

const FAIXAS = [
  { diaSemana: 1, horaInicio: '09:00', horaFim: '12:00' },
  { diaSemana: 1, horaInicio: '14:00', horaFim: '18:00' },
  { diaSemana: 4, horaInicio: '09:00', horaFim: '12:00' },
]

let contas: Record<Chave, ContaDeTeste>

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119460')

  entrarComo(contas.ana.token)
  const salva = await salvarConsultoria(CONFIGURACAO)
  if (!salva.sucesso) throw new Error(salva.mensagem)
  const faixas = await salvarDisponibilidades(FAIXAS)
  if (!faixas.sucesso) throw new Error(faixas.mensagem)

  // Um feriado, um compromisso no meio da manhã e um domingo excepcional.
  for (const excecao of [
    { data: SEGUNDA_SEGUINTE, tipo: 'indisponivel_dia', motivo: 'Feriado' },
    {
      data: QUINTA_SEGUINTE,
      tipo: 'bloqueio_parcial',
      horaInicio: '09:00',
      horaFim: '11:00',
      motivo: 'Audiência',
    },
    {
      data: DOMINGO,
      tipo: 'disponivel_extra',
      horaInicio: '09:00',
      horaFim: '12:00',
    },
  ]) {
    const criada = await criarExcecao(excecao)
    if (!criada.sucesso) throw new Error(criada.mensagem)
  }
  sairDaSessao()
}, 120_000)

afterAll(async () => {
  sairDaSessao()
  // Nada deste arquivo sobrevive à suíte: as contas saem, e a configuração,
  // as faixas e as exceções vão junto por cascata.
  await limparContas(SUFIXO)
})

describe('configuração da consultoria', () => {
  it('pertence ao prestador da sessão e é encontrada pelo id do perfil público', async () => {
    const publica = await obterConsultoriaPublica(contas.ana.id)
    expect(publica).not.toBeNull()
    expect(publica?.prestadorId).toBe(contas.ana.id)
    expect(publica?.valorCentavos).toBe(18_000)
    expect(publica?.duracaoMinutos).toBe(60)
    expect(publica?.modalidade).toBe('online')
    expect(publica?.timezone).toBe('America/Sao_Paulo')
  })

  it('não expõe o motivo interno das exceções na consulta pública', async () => {
    const publica = await obterConsultoriaPublica(contas.ana.id)
    expect(JSON.stringify(publica)).not.toContain('Audiência')
    const dia = await listarHorariosDoDia({
      prestadorId: contas.ana.id,
      data: QUINTA_SEGUINTE,
      agora: AGORA,
    })
    expect(JSON.stringify(dia)).not.toContain('Audiência')
  })

  it('salvar de novo atualiza a mesma linha — uma consultoria por Profissional', async () => {
    entrarComo(contas.ana.token)
    const resultado = await salvarConsultoria({
      ...CONFIGURACAO,
      titulo: 'Consultoria tributária e societária',
    })
    sairDaSessao()
    expect(resultado.sucesso).toBe(true)

    const linhas = await db
      .select({ id: consultoriaConfiguracoes.id })
      .from(consultoriaConfiguracoes)
      .where(eq(consultoriaConfiguracoes.prestadorId, contas.ana.id))
    expect(linhas).toHaveLength(1)

    const publica = await obterConsultoriaPublica(contas.ana.id)
    expect(publica?.titulo).toBe('Consultoria tributária e societária')
  })

  it('recusa configuração inválida antes de tocar o banco', async () => {
    entrarComo(contas.bruno.token)
    const semDuracao = await salvarConsultoria({ ...CONFIGURACAO, duracaoMinutos: 0 })
    const semPreco = await salvarConsultoria({ ...CONFIGURACAO, valorCentavos: 0 })
    const fusoInvalido = await salvarConsultoria({
      ...CONFIGURACAO,
      timezone: 'Marte/Olympus',
    })
    sairDaSessao()

    expect(semDuracao.sucesso).toBe(false)
    expect(semPreco.sucesso).toBe(false)
    expect(fusoInvalido.sucesso).toBe(false)

    const linhas = await db
      .select({ id: consultoriaConfiguracoes.id })
      .from(consultoriaConfiguracoes)
      .where(eq(consultoriaConfiguracoes.prestadorId, contas.bruno.id))
    expect(linhas).toHaveLength(0)
  })

  it('sem sessão de prestador, nada é configurado', async () => {
    sairDaSessao()
    expect((await salvarConsultoria(CONFIGURACAO)).sucesso).toBe(false)
    expect((await salvarDisponibilidades(FAIXAS)).sucesso).toBe(false)
    expect((await obterMinhaConsultoria()).sucesso).toBe(false)

    // Cliente também não: agenda é ato de quem presta serviço.
    entrarComo(contas.marina.token)
    expect((await salvarConsultoria(CONFIGURACAO)).sucesso).toBe(false)
    sairDaSessao()
  })
})

describe('ausência de configuração', () => {
  it('prestador sem consultoria devolve ausência, e não um exemplo', async () => {
    const publica = await obterConsultoriaPublica(contas.bruno.id)
    expect(publica).toBeNull()

    const dias = await listarDiasDisponiveis({
      prestadorId: contas.bruno.id,
      de: SEGUNDA,
      ate: '2026-09-06',
      agora: AGORA,
    })
    expect(dias.consultoria).toBeNull()
    expect(dias.dias).toEqual([])

    const dia = await listarHorariosDoDia({
      prestadorId: contas.bruno.id,
      data: QUINTA,
      agora: AGORA,
    })
    expect(dia.consultoria).toBeNull()
    expect(dia.horarios).toEqual([])
  })

  it('consultoria desligada some da agenda pública sem perder a configuração', async () => {
    entrarComo(contas.ana.token)
    const desligada = await salvarConsultoria({
      ...CONFIGURACAO,
      titulo: 'Consultoria tributária e societária',
      ativa: false,
    })
    expect(desligada.sucesso).toBe(true)

    expect(await obterConsultoriaPublica(contas.ana.id)).toBeNull()
    // O dono continua enxergando a própria configuração, com as faixas.
    const minha = await obterMinhaConsultoria()
    expect(minha.sucesso).toBe(true)
    expect(minha.dados?.ativa).toBe(false)
    expect(minha.dados?.faixas).toHaveLength(3)

    const religada = await salvarConsultoria({
      ...CONFIGURACAO,
      titulo: 'Consultoria tributária e societária',
      ativa: true,
    })
    sairDaSessao()
    expect(religada.sucesso).toBe(true)
    expect(await obterConsultoriaPublica(contas.ana.id)).not.toBeNull()
  })

  it('cadastro de prestador não habilitado não aparece publicamente', async () => {
    entrarComo(contas.semCadastro.token)
    const salva = await salvarConsultoria(CONFIGURACAO)
    sairDaSessao()
    expect(salva.sucesso).toBe(true)
    expect(await obterConsultoriaPublica(contas.semCadastro.id)).not.toBeNull()

    // Rebaixar a análise tira a agenda do ar pela mesma regra que já tira o
    // prestador da vitrine — a condição é reaproveitada, não reescrita.
    await db
      .update(perfisProfissionais)
      .set({ statusAnalise: 'pendente' })
      .where(eq(perfisProfissionais.usuarioId, contas.semCadastro.id))

    expect(await obterConsultoriaPublica(contas.semCadastro.id)).toBeNull()
  })
})

describe('dias disponíveis no intervalo', () => {
  it('devolve só os dias com horário livre, aplicando exceções e antecedência', async () => {
    const { consultoria, dias } = await listarDiasDisponiveis({
      prestadorId: contas.ana.id,
      de: SEGUNDA,
      ate: '2026-09-06',
      agora: AGORA,
    })

    expect(consultoria?.prestadorId).toBe(contas.ana.id)
    expect(dias).toEqual([
      // Hoje: a manhã já passou pela antecedência de 2h; sobra a tarde.
      { data: SEGUNDA, totalSlots: 3 },
      { data: QUINTA, totalSlots: 2 },
      // Domingo não é dia de atendimento — entrou pela exceção.
      { data: DOMINGO, totalSlots: 2 },
      // Segunda seguinte é feriado e não aparece.
      // Quinta seguinte perde a manhã pelo bloqueio parcial e sobra um horário.
      { data: QUINTA_SEGUINTE, totalSlots: 1 },
    ])
  })

  it('recorta o intervalo pedido ao horizonte e ao passado', async () => {
    const { dias } = await listarDiasDisponiveis({
      prestadorId: contas.ana.id,
      // Um pedido deliberadamente largo: metade no passado, metade além do
      // horizonte de 60 dias.
      de: '2020-01-01',
      ate: '2030-12-31',
      agora: AGORA,
    })
    expect(dias.length).toBeGreaterThan(0)
    expect(dias.every((dia) => dia.data >= SEGUNDA)).toBe(true)
    expect(dias.every((dia) => dia.data <= '2026-10-23')).toBe(true)
  })
})

describe('horários de um dia', () => {
  it('devolve os horários com hora local e instante absoluto coerentes', async () => {
    const { consultoria, horarios } = await listarHorariosDoDia({
      prestadorId: contas.ana.id,
      data: QUINTA,
      agora: AGORA,
    })

    expect(consultoria?.duracaoMinutos).toBe(60)
    expect(horarios.map((horario) => horario.inicio)).toEqual(['09:00', '10:15'])
    // 09:00 em São Paulo é 12:00 UTC. Um parsing ingênuo da data devolveria
    // 09:00 UTC — e a consulta apareceria três horas mais cedo para o Cliente.
    expect(horarios[0].inicioEm.toISOString()).toBe('2026-08-27T12:00:00.000Z')
    expect(horarios[0].fimEm.toISOString()).toBe('2026-08-27T13:00:00.000Z')
  })

  it('o bloqueio parcial recorta a manhã daquele dia específico', async () => {
    const { horarios } = await listarHorariosDoDia({
      prestadorId: contas.ana.id,
      data: QUINTA_SEGUINTE,
      agora: AGORA,
    })
    expect(horarios.map((horario) => horario.inicio)).toEqual(['11:00'])
  })

  it('o feriado esvazia o dia sem afetar as outras quintas e segundas', async () => {
    const feriado = await listarHorariosDoDia({
      prestadorId: contas.ana.id,
      data: SEGUNDA_SEGUINTE,
      agora: AGORA,
    })
    expect(feriado.horarios).toEqual([])
    expect(feriado.consultoria).not.toBeNull()
  })

  it('o mesmo dia muda de instante quando o fuso da agenda muda', async () => {
    entrarComo(contas.ana.token)
    const mudou = await salvarConsultoria({
      ...CONFIGURACAO,
      titulo: 'Consultoria tributária e societária',
      timezone: 'Pacific/Kiritimati',
    })
    expect(mudou.sucesso).toBe(true)

    const { horarios } = await listarHorariosDoDia({
      prestadorId: contas.ana.id,
      data: QUINTA,
      agora: AGORA,
    })
    // A hora de parede é a mesma; o instante, não. É a diferença entre guardar
    // fuso e supor um.
    expect(horarios[0].inicio).toBe('09:00')
    expect(horarios[0].inicioEm.toISOString()).toBe('2026-08-26T19:00:00.000Z')

    const voltou = await salvarConsultoria({
      ...CONFIGURACAO,
      titulo: 'Consultoria tributária e societária',
    })
    sairDaSessao()
    expect(voltou.sucesso).toBe(true)
  })
})

describe('faixas semanais e exceções pertencem a quem as criou', () => {
  it('recusa faixas sobrepostas no mesmo dia', async () => {
    entrarComo(contas.ana.token)
    const resultado = await salvarDisponibilidades([
      { diaSemana: 1, horaInicio: '09:00', horaFim: '12:00' },
      { diaSemana: 1, horaInicio: '11:00', horaFim: '14:00' },
    ])
    sairDaSessao()

    expect(resultado.sucesso).toBe(false)
    // A agenda anterior continua intacta: a recusa não apagou nada.
    const { horarios } = await listarHorariosDoDia({
      prestadorId: contas.ana.id,
      data: QUINTA,
      agora: AGORA,
    })
    expect(horarios).toHaveLength(2)
  })

  it('exige configuração antes de gravar horários', async () => {
    entrarComo(contas.bruno.token)
    const faixas = await salvarDisponibilidades(FAIXAS)
    const excecao = await criarExcecao({
      data: QUINTA,
      tipo: 'indisponivel_dia',
    })
    sairDaSessao()
    expect(faixas.sucesso).toBe(false)
    expect(excecao.sucesso).toBe(false)
  })

  it('conhecer o id de uma exceção alheia não permite removê-la', async () => {
    entrarComo(contas.ana.token)
    const minha = await obterMinhaConsultoria()
    const feriado = minha.dados?.excecoes.find(
      (excecao) => excecao.data === SEGUNDA_SEGUINTE,
    )
    sairDaSessao()
    expect(feriado).toBeDefined()

    entrarComo(contas.bruno.token)
    const tentativa = await removerExcecao(feriado?.id)
    sairDaSessao()
    expect(tentativa.sucesso).toBe(false)

    // Continua valendo: o dia segue fechado.
    const dia = await listarHorariosDoDia({
      prestadorId: contas.ana.id,
      data: SEGUNDA_SEGUINTE,
      agora: AGORA,
    })
    expect(dia.horarios).toEqual([])
  })

  it('o dono remove a própria exceção e o dia volta a abrir', async () => {
    entrarComo(contas.ana.token)
    const minha = await obterMinhaConsultoria()
    const feriado = minha.dados?.excecoes.find(
      (excecao) => excecao.data === SEGUNDA_SEGUINTE,
    )
    const removida = await removerExcecao(feriado?.id)
    sairDaSessao()
    expect(removida.sucesso).toBe(true)

    const dia = await listarHorariosDoDia({
      prestadorId: contas.ana.id,
      data: SEGUNDA_SEGUINTE,
      agora: AGORA,
    })
    expect(dia.horarios.map((horario) => horario.inicio)).toEqual([
      '09:00',
      '10:15',
      '14:00',
      '15:15',
      '16:30',
    ])
  })
})
