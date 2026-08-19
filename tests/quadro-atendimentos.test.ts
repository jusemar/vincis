import { describe, expect, it } from 'vitest'
import {
  contarIndicadores,
  filtrarProtocolos,
  paginar,
  protocoloAtendeBusca,
  TAMANHO_PAGINA_LISTA,
} from '@/features/admin/lib/filtro-atendimentos'
import {
  iniciais,
  mapearAtendimentoParaCard,
} from '@/features/admin/lib/atendimentos-reais'
import { calcularProgresso } from '@/features/atendimentos/lib/progresso-checklist'
import type { AtendimentoOperacionalDTO } from '@/features/atendimentos/types/atendimento'
import { EMPTY_FILTERS } from '@/features/admin/components/atendimentos/FiltersPanel'
import { COLUMNS, STATUS_SEM_COLUNA } from '@/features/admin/constants/atendimentos'
import type { Protocol, Status } from '@/features/admin/types/atendimentos'

/**
 * Busca e contadores do quadro de Atendimentos.
 *
 * São regras de tela — não tocam banco —, mas decidem o que a pessoa enxerga e
 * o número que ela lê no topo. Ficam aqui como teste puro para que a resposta
 * de "buscar Marina mostra só a Marina, e os indicadores concordam com isso"
 * seja verificável sem subir navegador.
 */

const BASE = {
  title: 'Serviço qualquer',
  category: 'Contábil',
  priority: 'media',
  deadline: 'normal',
  deadlineLabel: '5 dias restantes',
  messages: 0,
  files: 0,
  access: 'privado',
  assignees: [],
  createdAt: 'Hoje, 09:00',
  origin: 'real',
} as const

function protocolo(
  id: string,
  number: string,
  client: string,
  status: Status,
  extras: Partial<Protocol> = {},
): Protocol {
  return { ...BASE, id, number, client, status, ...extras }
}

const MARINA = 'CLI-915B956F'
const PAULO = 'CLI-CFC1B9F2'

const QUADRO: Protocol[] = [
  protocolo('a1', '#2026-0001', 'Marina Souza', 'novo', { clientCode: MARINA }),
  protocolo('a2', '#2026-0002', 'Paulo Ribeiro', 'andamento', {
    clientCode: PAULO,
    deadlineLabel: 'Vence hoje',
    deadline: 'proximo',
  }),
  protocolo('a3', '#2026-0003', 'Marina Souza', 'aguardando-cliente', {
    clientCode: MARINA,
    priority: 'alta',
  }),
  protocolo('a4', '#2026-0004', 'Marina Souza', 'concluido', {
    clientCode: MARINA,
  }),
  // Card de demonstração: sem código de carteira, como os mocks da tela.
  protocolo('m1', '#2026-0090', 'Padaria Real', 'novo', {
    title: 'Dúvida da Marina sobre o DAS',
    origin: 'mock',
  }),
]

const criterios = (parcial: Partial<Parameters<typeof filtrarProtocolos>[1]> = {}) => ({
  busca: '',
  somenteMeus: false,
  altaPrioridade: false,
  vencendoHoje: false,
  filtros: EMPTY_FILTERS,
  ...parcial,
})

describe('busca do quadro', () => {
  it('encontra pelo nome do Cliente', () => {
    const visiveis = filtrarProtocolos(QUADRO, criterios({ busca: 'Marina' }))
    expect(visiveis.map((p) => p.number)).toEqual([
      '#2026-0001',
      '#2026-0003',
      '#2026-0004',
    ])
  })

  it('não procura no título: card que cita o nome fica de fora', () => {
    const visiveis = filtrarProtocolos(QUADRO, criterios({ busca: 'Marina' }))
    expect(visiveis.map((p) => p.id)).not.toContain('m1')
  })

  it('encontra pelo número do protocolo, com ou sem #', () => {
    for (const termo of ['#2026-0003', '2026-0003']) {
      const visiveis = filtrarProtocolos(QUADRO, criterios({ busca: termo }))
      expect(visiveis.map((p) => p.id)).toEqual(['a3'])
    }
  })

  it('encontra todos os protocolos pelo código do Cliente', () => {
    const visiveis = filtrarProtocolos(QUADRO, criterios({ busca: MARINA }))
    expect(visiveis.map((p) => p.client)).toEqual([
      'Marina Souza',
      'Marina Souza',
      'Marina Souza',
    ])
  })

  it('o código não casa por nome disfarçado', () => {
    // Nenhum atendimento do Paulo entra numa busca pelo código da Marina.
    const visiveis = filtrarProtocolos(QUADRO, criterios({ busca: MARINA }))
    expect(visiveis.map((p) => p.clientCode)).toEqual([MARINA, MARINA, MARINA])
    // E um código inexistente não devolve nada, mesmo tendo o prefixo comum.
    expect(filtrarProtocolos(QUADRO, criterios({ busca: 'CLI-00000000' }))).toEqual([])
  })

  it('ignora acento e caixa', () => {
    expect(
      protocoloAtendeBusca(
        protocolo('x', '#2026-0100', 'Antônio Júnior', 'novo'),
        'antonio junior',
      ),
    ).toBe(true)
  })

  it('busca vazia devolve o quadro inteiro', () => {
    expect(filtrarProtocolos(QUADRO, criterios({ busca: '   ' }))).toHaveLength(
      QUADRO.length,
    )
  })
})

describe('indicadores do topo', () => {
  it('contam o conjunto visível, não o quadro inteiro', () => {
    const geral = contarIndicadores(filtrarProtocolos(QUADRO, criterios()))
    expect(geral).toEqual({
      total: 5,
      novos: 2,
      andamento: 1,
      aguardandoCliente: 1,
      concluidos: 1,
    })

    const daMarina = contarIndicadores(
      filtrarProtocolos(QUADRO, criterios({ busca: 'Marina' })),
    )
    expect(daMarina).toEqual({
      total: 3,
      novos: 1,
      andamento: 0,
      aguardandoCliente: 1,
      concluidos: 1,
    })
  })

  it('o código do Cliente filtra os contadores igual ao nome', () => {
    const porCodigo = contarIndicadores(
      filtrarProtocolos(QUADRO, criterios({ busca: MARINA })),
    )
    const porNome = contarIndicadores(
      filtrarProtocolos(QUADRO, criterios({ busca: 'Marina' })),
    )
    expect(porCodigo).toEqual(porNome)
  })

  it('protocolo pesquisado deixa exatamente um atendimento', () => {
    const contagem = contarIndicadores(
      filtrarProtocolos(QUADRO, criterios({ busca: '#2026-0002' })),
    )
    expect(contagem.total).toBe(1)
    expect(contagem.andamento).toBe(1)
    expect(contagem.aguardandoCliente).toBe(0)
  })

  it('"Em andamento" e "Aguardando cliente" não se misturam', () => {
    const contagem = contarIndicadores(QUADRO)
    expect(contagem.andamento).toBe(1)
    expect(contagem.aguardandoCliente).toBe(1)
  })

  it('limpar a busca devolve os números gerais', () => {
    const filtrado = contarIndicadores(
      filtrarProtocolos(QUADRO, criterios({ busca: 'Paulo' })),
    )
    expect(filtrado.total).toBe(1)
    const limpo = contarIndicadores(filtrarProtocolos(QUADRO, criterios({ busca: '' })))
    expect(limpo.total).toBe(QUADRO.length)
  })
})

describe('chips e filtros', () => {
  it('"Alta prioridade" mostra só os de prioridade alta', () => {
    const visiveis = filtrarProtocolos(
      QUADRO,
      criterios({ altaPrioridade: true }),
    )
    expect(visiveis.map((p) => p.id)).toEqual(['a3'])
    expect(contarIndicadores(visiveis).total).toBe(1)
  })

  it('"Vencendo hoje" usa o prazo real do card', () => {
    const visiveis = filtrarProtocolos(QUADRO, criterios({ vencendoHoje: true }))
    expect(visiveis.map((p) => p.id)).toEqual(['a2'])
  })

  it('o filtro de Status combina com a busca', () => {
    const visiveis = filtrarProtocolos(
      QUADRO,
      criterios({
        busca: 'Marina',
        filtros: { ...EMPTY_FILTERS, status: ['concluido'] },
      }),
    )
    expect(visiveis.map((p) => p.id)).toEqual(['a4'])
    expect(contarIndicadores(visiveis)).toEqual({
      total: 1,
      novos: 0,
      andamento: 0,
      aguardandoCliente: 0,
      concluidos: 1,
    })
  })
})

describe('paginação', () => {
  const muitos = Array.from({ length: 23 }, (_, i) =>
    protocolo(`x${i}`, `#2026-${String(i).padStart(4, '0')}`, 'Marina Souza', 'novo', {
      clientCode: MARINA,
    }),
  )

  it('divide a lista em páginas sem repetir nem perder ninguém', () => {
    const paginas = [1, 2, 3].map((p) => paginar(muitos, p, TAMANHO_PAGINA_LISTA))
    expect(paginas.map((p) => p.itens.length)).toEqual([10, 10, 3])
    expect(paginas[0].totalPaginas).toBe(3)

    const vistos = paginas.flatMap((p) => p.itens.map((i) => i.id))
    expect(new Set(vistos).size).toBe(muitos.length)
  })

  it('página fora do intervalo cai na última válida', () => {
    expect(paginar(muitos, 99, TAMANHO_PAGINA_LISTA).pagina).toBe(3)
    expect(paginar(muitos, 0, TAMANHO_PAGINA_LISTA).pagina).toBe(1)
  })

  it('conta o conjunto filtrado, não a página', () => {
    const pagina = paginar(muitos, 1, TAMANHO_PAGINA_LISTA)
    expect(pagina.itens).toHaveLength(10)
    expect(pagina.total).toBe(23)
    expect(contarIndicadores(muitos).total).toBe(23)
  })

  it('paginação anda sobre o resultado da busca', () => {
    const doPaulo = protocolo('p99', '#2026-9999', 'Paulo Ribeiro', 'novo', {
      clientCode: PAULO,
    })
    const filtrado = filtrarProtocolos([...muitos, doPaulo], criterios({ busca: 'Paulo' }))
    const pagina = paginar(filtrado, 1, TAMANHO_PAGINA_LISTA)
    expect(pagina.total).toBe(1)
    expect(pagina.totalPaginas).toBe(1)
    expect(pagina.itens[0].id).toBe('p99')
  })

  it('paginação anda sobre o filtro de Status', () => {
    const concluidos = muitos.slice(0, 4).map((p) => ({ ...p, status: 'concluido' as const }))
    const conjunto = [...concluidos, ...muitos.slice(4)]
    const filtrado = filtrarProtocolos(
      conjunto,
      criterios({ filtros: { ...EMPTY_FILTERS, status: ['concluido'] } }),
    )
    const pagina = paginar(filtrado, 1, TAMANHO_PAGINA_LISTA)
    expect(pagina.total).toBe(4)
    expect(contarIndicadores(filtrado).concluidos).toBe(4)
  })
})

describe('iniciais de quem atende', () => {
  it('usa a primeira letra do primeiro nome e a do último sobrenome', () => {
    expect(iniciais('Ana Carolina Silva')).toBe('AS')
    expect(iniciais('Ricardo Mendes')).toBe('RM')
    expect(iniciais('Carlos Eduardo Santos')).toBe('CS')
  })

  it('ignora forma de tratamento e título', () => {
    expect(iniciais('Dra. Ana Carolina Silva')).toBe('AS')
    expect(iniciais('Dr. Ricardo Mendes')).toBe('RM')
    expect(iniciais('Prof. Carlos Eduardo Santos')).toBe('CS')
  })

  it('ignora conectivos do nome', () => {
    expect(iniciais('Maria de Souza')).toBe('MS')
    expect(iniciais('João dos Santos')).toBe('JS')
  })

  it('nome de uma palavra usa as duas primeiras letras', () => {
    expect(iniciais('Marina')).toBe('MA')
  })
})

describe('progresso do checklist', () => {
  it('4 de 7 dá 57%', () => {
    const itens = Array.from({ length: 7 }, (_, i) => ({ concluido: i < 4 }))
    expect(calcularProgresso(itens)).toEqual({ done: 4, total: 7, percentual: 57 })
  })

  it('5 de 5 dá 100%', () => {
    const itens = Array.from({ length: 5 }, () => ({ concluido: true }))
    expect(calcularProgresso(itens)).toEqual({ done: 5, total: 5, percentual: 100 })
  })

  it('sem etapas não há barra', () => {
    expect(calcularProgresso([])).toBeNull()
  })
})

/**
 * Card real montado a partir do DTO.
 *
 * É onde se confere que o dado real cabe no visual do mock: mesma estrutura,
 * mesmos campos, nenhuma versão "real" à parte.
 */
describe('Atendimento real vira card do quadro', () => {
  const HOJE = new Date('2026-08-18T12:00:00.000Z')
  const UM_DIA = 24 * 60 * 60 * 1000

  const dto = (parcial: Partial<AtendimentoOperacionalDTO> = {}): AtendimentoOperacionalDTO => ({
    id: 'a1',
    protocolo: '#2026-0004',
    titulo: 'Abertura de Empresa MEI',
    categoria: 'contabil',
    status: 'em_andamento',
    prioridade: 'alta',
    acesso: 'privado',
    criadoEm: HOJE.toISOString(),
    atualizadoEm: HOJE.toISOString(),
    prazoEm: new Date(HOJE.getTime() + UM_DIA).toISOString(),
    responsavel: { id: 'u-ana', nome: 'Dra. Ana Carolina Silva' },
    cliente: { usuarioId: 'u-marina', nome: 'Marina Souza', codigo: 'CLI-915B956F' },
    contratacao: null,
    participantes: [
      { usuarioId: 'u-ana', nome: 'Dra. Ana Carolina Silva', papel: 'responsavel' },
      { usuarioId: 'u-ricardo', nome: 'Dr. Ricardo Mendes', papel: 'convidado' },
    ],
    eventos: [],
    mensagens: [],
    manifestacoes: [],
    checklist: [],
    arquivos: [],
    acoes: [],
    // Nada por ler é o estado neutro do card: sem pílula vermelha.
    naoLidas: {
      cliente: 0,
      interno: 0,
      total: 0,
      canalPrimeira: null,
      primeiraNaoLidaId: null,
    },
    ...parcial,
  })

  it('traduz status, prioridade e categoria para o vocabulário do quadro', () => {
    const card = mapearAtendimentoParaCard(dto(), 'u-ana', HOJE)
    expect(card.status).toBe('andamento')
    expect(card.priority).toBe('alta')
    expect(card.category).toBe('Contábil')
    expect(card.origin).toBe('real')
  })

  it('calcula o prazo a partir da data real, sem texto congelado', () => {
    const amanha = mapearAtendimentoParaCard(dto(), 'u-ana', HOJE)
    expect(amanha.deadlineLabel).toBe('Vence amanhã')
    expect(amanha.deadline).toBe('proximo')

    // O mesmo Atendimento, lido no dia seguinte, vira "Vence hoje" sozinho.
    const noDiaSeguinte = mapearAtendimentoParaCard(
      dto(),
      'u-ana',
      new Date(HOJE.getTime() + UM_DIA),
    )
    expect(noDiaSeguinte.deadlineLabel).toBe('Vence hoje')

    const vencido = mapearAtendimentoParaCard(
      dto({ prazoEm: new Date(HOJE.getTime() - UM_DIA).toISOString() }),
      'u-ana',
      HOJE,
    )
    expect(vencido.deadlineLabel).toBe('Vencido há 1 dia')
    expect(vencido.deadline).toBe('vencido')

    const folgado = mapearAtendimentoParaCard(
      dto({ prazoEm: new Date(HOJE.getTime() + 5 * UM_DIA).toISOString() }),
      'u-ana',
      HOJE,
    )
    expect(folgado.deadlineLabel).toBe('5 dias restantes')

    const semPrazo = mapearAtendimentoParaCard(dto({ prazoEm: null }), 'u-ana', HOJE)
    expect(semPrazo.deadlineLabel).toBe('Sem prazo definido')
  })

  it('mostra a barra de progresso do checklist real', () => {
    const checklist = Array.from({ length: 7 }, (_, i) => ({
      id: `e${i}`,
      titulo: `Etapa ${i}`,
      concluido: i < 4,
      visibilidade: 'cliente' as const,
      origem: 'catalogo' as const,
      ordem: i,
    }))
    const card = mapearAtendimentoParaCard(dto({ checklist }), 'u-ana', HOJE)
    expect(card.progress).toEqual({ done: 4, total: 7, percentual: 57 })

    // Sem checklist não existe barra — o card não desenha o bloco.
    expect(mapearAtendimentoParaCard(dto(), 'u-ana', HOJE).progress).toBeUndefined()
  })

  it('mostra os responsáveis reais com iniciais e cores próprias', () => {
    const card = mapearAtendimentoParaCard(dto(), 'u-ana', HOJE)
    expect(card.assignees.map((a) => a.initials)).toEqual(['AS', 'RM'])
    expect(card.assignees[0].color).not.toBe(card.assignees[1].color)

    // A cor é determinística: a mesma pessoa recebe sempre a mesma.
    const outroCard = mapearAtendimentoParaCard(
      dto({ id: 'a2', protocolo: '#2026-0005' }),
      'u-ana',
      HOJE,
    )
    expect(outroCard.assignees[0].color).toBe(card.assignees[0].color)
  })

  it('conta Conversa e arquivos de verdade, sem misturar com o Protocolo', () => {
    const card = mapearAtendimentoParaCard(
      dto({
        mensagens: [
          {
            id: 'm1',
            escopo: 'cliente',
            conteudo: 'Oi',
            autorId: 'u-marina',
            autorNome: 'Marina Souza',
            autorEhCliente: true,
            criadoEm: HOJE.toISOString(),
          },
          {
            id: 'm2',
            escopo: 'interno',
            conteudo: 'Conferir documentos',
            autorId: 'u-ana',
            autorNome: 'Ana',
            autorEhCliente: false,
            criadoEm: HOJE.toISOString(),
          },
        ],
        manifestacoes: [
          {
            id: 'p1',
            papelAutor: 'cliente',
            conteudo: 'Preciso abrir o MEI',
            autorId: 'u-marina',
            autorNome: 'Marina Souza',
            autoria: false,
            respondeManifestacaoId: null,
            arquivo: null,
            criadoEm: HOJE.toISOString(),
          },
        ],
        arquivos: [
          {
            id: 'f1',
            nome: 'documento.txt',
            tipoMime: 'text/plain',
            tamanhoBytes: 65,
            origem: 'cliente',
            remetenteNome: 'Marina Souza',
            criadoEm: HOJE.toISOString(),
          },
        ],
      }),
      'u-ana',
      HOJE,
    )

    // Duas mensagens de Conversa; a manifestação do Protocolo não entra na conta.
    expect(card.messages).toBe(2)
    expect(card.files).toBe(1)
    expect(card.real?.manifestations).toHaveLength(1)
    expect(card.real?.messages).toHaveLength(2)
  })
})

describe('status sem coluna no quadro', () => {
  /**
   * Recusado e Cancelado não têm coluna — e é por isso que a tela troca para a
   * Lista quando eles entram no filtro. Se um dia ganharem coluna, esta lista
   * esvazia sozinha (ela é derivada das colunas) e a troca de vista deixa de
   * acontecer sem ninguém precisar lembrar de mexer no componente.
   */
  it('são exatamente os encerramentos excepcionais', () => {
    expect([...STATUS_SEM_COLUNA].sort()).toEqual(['cancelado', 'recusado'])
  })

  it('nenhum deles aparece entre as colunas do Kanban', () => {
    const colunas = COLUMNS.map((coluna) => coluna.id)
    for (const status of STATUS_SEM_COLUNA) {
      expect(colunas).not.toContain(status)
    }
  })
})
