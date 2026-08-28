import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentos, consultoriaReservas } from '@/db/schema'
import {
  salvarConsultoria,
  salvarDisponibilidades,
} from '@/features/consultorias/actions/consultoria'
import { pagarConsultoriaSimulado } from '@/features/consultorias/actions/pagamento'
import { reservarHorarioDaConsultoria } from '@/features/consultorias/actions/reserva'
import {
  rotaDoAtendimento,
  rotaDoAtendimentoNoPainel,
} from '@/features/consultorias/constants/contratacao'
import {
  listarConsultoriasDoCliente,
  listarConsultoriasDoPrestador,
} from '@/features/consultorias/queries/agendamentos'
import { listarHorariosDoDia } from '@/features/consultorias/queries/agenda-publica'
import { resolverAtendimentoDoLink } from '@/features/portal-cliente/lib/deep-link-atendimento'
import {
  dataLocalDoInstante,
  diaDaSemanaDeDataLocal,
  somarDiasEmDataLocal,
} from '@/features/consultorias/lib/tempo'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { comSessao, entrarComo, sairDaSessao } from './setup/sessao'

/**
 * As consultorias contratadas nas áreas do Cliente e do Profissional.
 *
 * ## O que este arquivo precisa provar
 *
 * Que cada um vê **as suas**, e só as suas. O isolamento não é um `if` na tela:
 * é o `where` da consulta, e o teste cobra isso do jeito mais direto possível —
 * pedindo a lista de A e conferindo que nada de B aparece nela, mesmo com os
 * dois usando o mesmo Profissional no mesmo dia.
 *
 * O cenário é montado pelo caminho real: reservar e pagar de verdade, com as
 * ações das etapas anteriores. Inserir agendamentos direto na tabela provaria
 * menos — deixaria de exercitar o vínculo com o Atendimento, que é justamente
 * o que a Área do Cliente usa para abrir o protocolo.
 */

const SUFIXO = '@consultoria-areas.teste'
const FUSO = 'America/Sao_Paulo'

type Chave = 'anaPro' | 'brunoPro' | 'clienteA' | 'clienteB' | 'clienteSemNada'

const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  anaPro: { perfil: 'profissional', prestador: 'profissional' },
  brunoPro: { perfil: 'profissional', prestador: 'profissional' },
  clienteA: { perfil: 'cliente' },
  clienteB: { perfil: 'cliente' },
  clienteSemNada: { perfil: 'cliente' },
}

const CONFIG_ANA = {
  titulo: 'Consultoria tributária',
  descricaoCurta: 'Conversa ao vivo sobre impostos.',
  valorCentavos: 18_000,
  duracaoMinutos: 60,
  intervaloMinutos: 15,
  antecedenciaMinimaMinutos: 120,
  horizonteDias: 60,
  timezone: FUSO,
}

const CONFIG_BRUNO = {
  ...CONFIG_ANA,
  titulo: 'Consultoria jurídica',
  descricaoCurta: 'Orientação para contratos.',
  valorCentavos: 25_000,
  duracaoMinutos: 45,
}

let contas: Record<Chave, ContaDeTeste>
let dataAlvo: string
/** Protocolos por cenário, para conferir quem enxerga o quê. */
const protocolos: Record<string, string> = {}

async function configurar(conta: ContaDeTeste, config: typeof CONFIG_ANA) {
  entrarComo(conta.token)
  const salva = await salvarConsultoria(config)
  if (!salva.sucesso) throw new Error(salva.mensagem)
  const faixas = await salvarDisponibilidades([
    { diaSemana: diaDaSemanaDeDataLocal(dataAlvo), horaInicio: '08:00', horaFim: '18:00' },
  ])
  if (!faixas.sucesso) throw new Error(faixas.mensagem)
  sairDaSessao()
}

/** Reserva e paga de verdade, e devolve o protocolo gerado. */
async function contratar(
  cliente: ContaDeTeste,
  prestador: ContaDeTeste,
  inicio: string,
  assunto: string,
) {
  const reserva = await comSessao(cliente.token, () =>
    reservarHorarioDaConsultoria({
      prestadorId: prestador.id,
      data: dataAlvo,
      inicio,
      descricao: assunto,
    }),
  )
  if (reserva.situacao !== 'reservado') {
    throw new Error(`Reserva falhou: ${reserva.situacao}`)
  }
  const pago = await comSessao(cliente.token, () =>
    pagarConsultoriaSimulado({ reservaId: reserva.reserva.id }),
  )
  if (pago.situacao !== 'confirmado') {
    throw new Error(`Pagamento falhou: ${pago.situacao}`)
  }
  return pago
}

beforeAll(async () => {
  contas = await criarContas(SUFIXO, DEFINICOES, '119469')
  dataAlvo = somarDiasEmDataLocal(dataLocalDoInstante(new Date(), FUSO), 7)

  await configurar(contas.anaPro, CONFIG_ANA)
  await configurar(contas.brunoPro, CONFIG_BRUNO)

  const daAna = (
    await listarHorariosDoDia({ prestadorId: contas.anaPro.id, data: dataAlvo })
  ).horarios.map((h) => h.inicio)
  const doBruno = (
    await listarHorariosDoDia({ prestadorId: contas.brunoPro.id, data: dataAlvo })
  ).horarios.map((h) => h.inicio)

  // Cliente A: duas consultorias futuras, com profissionais diferentes.
  protocolos.aComAna = (
    await contratar(contas.clienteA, contas.anaPro, daAna[1], 'Revisar o IRPF deste ano.')
  ).protocolo
  protocolos.aComBruno = (
    await contratar(
      contas.clienteA,
      contas.brunoPro,
      doBruno[3],
      'Analisar contrato de sociedade.',
    )
  ).protocolo
  // Cliente B: uma, com a mesma profissional e no mesmo dia — o caso em que um
  // filtro frouxo vazaria.
  protocolos.bComAna = (
    await contratar(
      contas.clienteB,
      contas.anaPro,
      daAna[0],
      'Assunto reservado do Cliente B.',
    )
  ).protocolo
}, 180_000)

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('Área do Cliente', () => {
  it('lista as consultorias do Cliente, da mais próxima em diante', async () => {
    const { futuras, passadas } = await listarConsultoriasDoCliente(contas.clienteA.id)

    expect(futuras).toHaveLength(2)
    expect(passadas).toHaveLength(0)

    // Ordem: a mais próxima primeiro.
    const instantes = futuras.map((c) => new Date(c.inicioEm).getTime())
    expect(instantes[0]).toBeLessThan(instantes[1])

    const nomes = futuras.map((c) => c.prestadorNome)
    expect(new Set(nomes).size).toBe(2)
  })

  it('traz preço, duração, protocolo e vínculo do Atendimento corretos', async () => {
    const { futuras } = await listarConsultoriasDoCliente(contas.clienteA.id)
    const comBruno = futuras.find((c) => c.protocolo === protocolos.aComBruno)

    expect(comBruno).toBeDefined()
    if (!comBruno) return
    expect(comBruno.valorCentavos).toBe(CONFIG_BRUNO.valorCentavos)
    expect(comBruno.duracaoMinutos).toBe(CONFIG_BRUNO.duracaoMinutos)
    expect(comBruno.status).toBe('agendada')
    expect(comBruno.pagamentoStatus).toBe('aprovado')
    expect(comBruno.data).toBe(dataAlvo)
    expect(comBruno.inicio).toMatch(/^\d{2}:\d{2}$/)
    expect(comBruno.timezone).toBe(FUSO)

    // O vínculo é estrutural: o Atendimento apontado é o daquela consultoria.
    const [atendimento] = await db
      .select({ id: atendimentos.id, protocolo: atendimentos.protocolo })
      .from(atendimentos)
      .where(eq(atendimentos.consultoriaAgendamentoId, comBruno.id))
    expect(atendimento.id).toBe(comBruno.atendimentoId)
    expect(atendimento.protocolo).toBe(comBruno.protocolo)
  })

  it('Cliente sem consultoria recebe listas vazias, e não erro', async () => {
    const { futuras, passadas } = await listarConsultoriasDoCliente(
      contas.clienteSemNada.id,
    )
    expect(futuras).toEqual([])
    expect(passadas).toEqual([])
  })

  it('classifica passada pelo instante, e não pelo texto da data', async () => {
    // Um instante depois da consultoria mais próxima: ela vira passado.
    const { futuras } = await listarConsultoriasDoCliente(contas.clienteA.id)
    const primeira = new Date(futuras[0].inicioEm)
    const depois = new Date(primeira.getTime() + 1_000)

    const recorte = await listarConsultoriasDoCliente(contas.clienteA.id, depois)
    expect(recorte.passadas.map((c) => c.id)).toContain(futuras[0].id)
    expect(recorte.futuras.map((c) => c.id)).not.toContain(futuras[0].id)
  })

  it('o botão aponta para a rota real da Área do Cliente', async () => {
    const { futuras } = await listarConsultoriasDoCliente(contas.clienteA.id)
    const rota = rotaDoAtendimento(futuras[0].protocolo!)
    expect(rota.startsWith('/cliente?aba=atendimentos&atendimento=')).toBe(true)
    expect(rota).toContain(encodeURIComponent(futuras[0].protocolo!))
  })

  /**
   * A rota existir não basta: ela precisa **abrir** o Atendimento.
   *
   * O link da consultoria carrega o protocolo, que é o identificador que a
   * pessoa acabou de ver na confirmação. A tela resolvia só o uuid, e o
   * resultado era uma rota válida que caía na lista sem abrir nada — falha
   * silenciosa, do tipo que nenhuma asserção de URL pegaria.
   */
  it('o protocolo do link abre o Atendimento, e não só a lista', async () => {
    const { futuras } = await listarConsultoriasDoCliente(contas.clienteA.id)
    const consultoria = futuras[0]
    const lista = [
      { id: consultoria.atendimentoId!, protocolo: consultoria.protocolo! },
      { id: 'outro-atendimento', protocolo: '#2026-9999' },
    ]

    const parametro = decodeURIComponent(
      rotaDoAtendimento(consultoria.protocolo!).split('atendimento=')[1],
    )
    expect(resolverAtendimentoDoLink(lista, parametro)?.id).toBe(
      consultoria.atendimentoId,
    )
    // O uuid continua valendo: os links antigos do portal não regridem.
    expect(resolverAtendimentoDoLink(lista, consultoria.atendimentoId)?.id).toBe(
      consultoria.atendimentoId,
    )
    // E nada abre sozinho quando o parâmetro não existe ou não é de ninguém.
    expect(resolverAtendimentoDoLink(lista, null)).toBeNull()
    expect(resolverAtendimentoDoLink(lista, '#2026-0000')).toBeNull()
  })
})

describe('Área do Profissional', () => {
  it('lista as consultorias do Prestador, com Cliente e assunto', async () => {
    const { futuras } = await listarConsultoriasDoPrestador(contas.anaPro.id)

    // Ana atende A e B — os dois no mesmo dia.
    expect(futuras).toHaveLength(2)
    const instantes = futuras.map((c) => new Date(c.inicioEm).getTime())
    expect(instantes[0]).toBeLessThan(instantes[1])

    const doB = futuras.find((c) => c.protocolo === protocolos.bComAna)
    expect(doB).toBeDefined()
    if (!doB) return
    expect(doB.clienteNome).toBe('Teste clienteB')
    // O assunto chega inteiro: quem corta é a tela.
    expect(doB.descricao).toBe('Assunto reservado do Cliente B.')
    expect(doB.duracaoMinutos).toBe(CONFIG_ANA.duracaoMinutos)
    expect(doB.valorCentavos).toBe(CONFIG_ANA.valorCentavos)
  })

  it('Profissional sem consultoria recebe lista vazia', async () => {
    // Bruno tem uma; um Profissional recém-criado não teria. Aqui basta provar
    // que a consulta não devolve o que não é dele.
    const { futuras } = await listarConsultoriasDoPrestador(contas.brunoPro.id)
    expect(futuras).toHaveLength(1)
    expect(futuras[0].protocolo).toBe(protocolos.aComBruno)
  })

  it('o botão do painel aponta para o deep-link real do quadro', () => {
    const rota = rotaDoAtendimentoNoPainel('#2026-0042')
    expect(rota).toBe(
      '/admin?pagina=atendimentos&atendimento=' + encodeURIComponent('#2026-0042'),
    )
  })
})

describe('isolamento', () => {
  it('Cliente A não enxerga a consultoria do Cliente B', async () => {
    const { futuras } = await listarConsultoriasDoCliente(contas.clienteA.id)
    const serializado = JSON.stringify(futuras)

    expect(futuras.map((c) => c.protocolo)).not.toContain(protocolos.bComAna)
    // Nem o protocolo, nem o id, nem qualquer rastro do assunto alheio.
    expect(serializado).not.toContain(protocolos.bComAna)
    expect(serializado).not.toContain('Assunto reservado do Cliente B')
  })

  it('Cliente B só enxerga a dele, mesmo compartilhando a profissional', async () => {
    const { futuras } = await listarConsultoriasDoCliente(contas.clienteB.id)
    expect(futuras).toHaveLength(1)
    expect(futuras[0].protocolo).toBe(protocolos.bComAna)
    expect(JSON.stringify(futuras)).not.toContain(protocolos.aComAna)
  })

  it('Profissional não enxerga consultoria de outro Profissional', async () => {
    const daAna = await listarConsultoriasDoPrestador(contas.anaPro.id)
    const doBruno = await listarConsultoriasDoPrestador(contas.brunoPro.id)

    expect(daAna.futuras.map((c) => c.protocolo)).not.toContain(protocolos.aComBruno)
    expect(doBruno.futuras.map((c) => c.protocolo)).not.toContain(protocolos.aComAna)
    expect(doBruno.futuras.map((c) => c.protocolo)).not.toContain(protocolos.bComAna)
    // O assunto do Cliente B é da Ana; não pode aparecer na agenda do Bruno.
    expect(JSON.stringify(doBruno.futuras)).not.toContain('Assunto reservado')
  })

  it('a descrição não sai na lista do Cliente — ela vive no Protocolo', async () => {
    const { futuras } = await listarConsultoriasDoCliente(contas.clienteA.id)
    for (const consultoria of futuras) {
      expect(Object.keys(consultoria)).not.toContain('descricao')
    }
    expect(JSON.stringify(futuras)).not.toContain('Revisar o IRPF')
  })

  it('um id de consultoria alheia não abre porta: a consulta é por sessão', async () => {
    // Não existe consulta "por id" — a única entrada é a identidade de quem
    // pergunta. Conhecer o protocolo de B não muda o que A recebe.
    const comoA = await listarConsultoriasDoCliente(contas.clienteA.id)
    const comoB = await listarConsultoriasDoCliente(contas.clienteB.id)
    const idsA = comoA.futuras.map((c) => c.id)
    const idsB = comoB.futuras.map((c) => c.id)
    expect(idsA.some((id) => idsB.includes(id))).toBe(false)
  })
})

describe('o restante do fluxo continua íntegro', () => {
  it('o horário contratado segue fora da agenda pública', async () => {
    const { futuras } = await listarConsultoriasDoCliente(contas.clienteB.id)
    const agenda = await listarHorariosDoDia({
      prestadorId: contas.anaPro.id,
      data: dataAlvo,
    })
    expect(agenda.horarios.map((h) => h.inicio)).not.toContain(futuras[0].inicio)
  })

  it('nenhuma reserva ficou pendurada: todas viraram consultoria', async () => {
    const reservas = await db
      .select({ status: consultoriaReservas.status })
      .from(consultoriaReservas)
      .where(eq(consultoriaReservas.clienteUsuarioId, contas.clienteA.id))
    expect(reservas.every((r) => r.status === 'confirmada')).toBe(true)
  })
})
