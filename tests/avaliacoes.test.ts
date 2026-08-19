import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventoRealtime } from '@/integracoes/realtime/eventos'

/**
 * Avaliação real do Atendimento.
 *
 * Um único ponto simulado: a saída para o Pusher, porque o que interessa medir
 * é **o que a aplicação decide publicar** depois de gravar — em que canais, com
 * que texto e com que severidade. A rede não é o objeto do teste.
 *
 * Todo o resto roda de verdade contra o Postgres da suíte: propriedade do
 * Atendimento, status, faixa da nota, unicidade no banco, Histórico,
 * notificações, agregação da média e o que chega às telas públicas.
 */
const publicados: { canal: string; evento: EventoRealtime }[] = []

vi.mock('@/integracoes/realtime/servidor', () => ({
  publicarEventos: async (envios: { canal: string; evento: EventoRealtime }[]) => {
    publicados.push(...envios)
    return true
  },
  publicarParaUsuarios: async () => true,
  publicarNoAtendimento: async () => true,
  publicarNoConvite: async () => true,
  assinarCanalPrivado: () => null,
}))

const { and, eq, inArray, like } = await import('drizzle-orm')
const { db } = await import('@/db/connection')
const {
  atendimentoEventos,
  atendimentos,
  avaliacoesAtendimento,
  clientes,
  contratacoesServico,
  notificacoes,
  perfisProfissionais,
  servicos,
  sessoesUsuario,
  usuarios,
  usuariosPerfis,
} = await import('@/db/schema')

const { registrarAvaliacao, obterMinhaAvaliacao, sanitizarComentario } =
  await import('@/features/avaliacoes/lib/registrar-avaliacao')
const { avaliarAtendimento } = await import(
  '@/features/avaliacoes/actions/avaliar'
)
const {
  listarAvaliacoesPublicas,
  obterDistribuicaoDeNotas,
  obterReputacaoDoPrestador,
  obterReputacaoDosPrestadores,
} = await import('@/features/avaliacoes/queries/reputacao')
const { obterPainelDeAvaliacoes } = await import(
  '@/features/avaliacoes/queries/painel-de-avaliacoes'
)
const { concluirAtendimento } = await import(
  '@/features/atendimentos/lib/concluir-atendimento'
)
const { alterarStatusDoAtendimento } = await import(
  '@/features/atendimentos/lib/alterar-status'
)
const { listarAtendimentosDoCliente } = await import(
  '@/features/atendimentos/queries/listar-atendimentos-do-cliente'
)
const { pesquisarProfissionaisReais } = await import(
  '@/features/profissionais/queries/pesquisar-profissionais'
)
const { obterIdentidadePublica } = await import(
  '@/features/servicos/queries/identidade-publica'
)
const { canalDoAtendimento, canalDoUsuario } = await import(
  '@/integracoes/realtime/canais'
)
const { criarServico } = await import('@/features/servicos/actions/catalogo')
const { contratarServico } = await import('@/features/servicos/actions/contratar')
const { criarContas } = await import('./setup/contas-de-teste')
const { limparAtendimentosDosPrestadores } = await import(
  './setup/limpeza-atendimentos'
)
const { entrarComo, sairDaSessao } = await import('./setup/sessao')

const SUFIXO = '@avaliacao-atendimento.teste'

type Chave = 'ana' | 'bruno' | 'convidada' | 'semAvaliacao' | 'marina' | 'outroCliente'
type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>

const SERVICO_BASE = {
  nome: 'Consultoria Tributária',
  descricaoCurta: 'Análise fiscal completa.',
  descricaoDetalhada: 'Diagnóstico e plano de ação.',
  categoria: 'contabil' as const,
  itensIncluidos: ['Diagnóstico'],
  checklistModelo: [] as string[],
  modeloPreco: 'fixo' as const,
  valor: '250,00',
  prazoEstimadoDias: 7,
  ativo: true,
  publico: true,
  ordem: 0,
}

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return

  await db.delete(notificacoes).where(inArray(notificacoes.destinatarioId, ids))
  await limparAtendimentosDosPrestadores(ids)
  await db
    .delete(contratacoesServico)
    .where(inArray(contratacoesServico.prestadorId, ids))
  await db.delete(servicos).where(inArray(servicos.prestadorId, ids))
  await db.delete(clientes).where(inArray(clientes.profissionalId, ids))
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db
    .delete(perfisProfissionais)
    .where(inArray(perfisProfissionais.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}

/**
 * Um Atendimento real de Ana para Marina, já concluído.
 *
 * É o estado de onde a avaliação parte na vida real. Nada é inserido à mão:
 * passa pelo catálogo, pela contratação e pela conclusão de verdade.
 */
async function atendimentoConcluido(nome = SERVICO_BASE.nome) {
  const atendimentoId = await atendimentoEmAndamento(nome)
  const conclusao = await concluirAtendimento({
    atendimentoId,
    usuarioId: contas.ana.id,
    observacaoFinal: 'Serviço entregue.',
  })
  expect(conclusao.sucesso).toBe(true)
  publicados.length = 0
  return atendimentoId
}

async function atendimentoEmAndamento(nome = SERVICO_BASE.nome) {
  entrarComo(contas.ana.token)
  const servico = await criarServico({ ...SERVICO_BASE, nome })
  if (!servico.sucesso) throw new Error(servico.mensagem)

  entrarComo(contas.marina.token)
  const contratacao = await contratarServico({
    servicoId: (servico as { dados: { id: string } }).dados.id,
  })
  if (!contratacao.sucesso) throw new Error(contratacao.mensagem)
  const { atendimentoId } = contratacao.dados as { atendimentoId: string }

  const inicio = await alterarStatusDoAtendimento({
    atendimentoId,
    usuarioId: contas.ana.id,
    destino: 'em_andamento',
  })
  expect(inicio.sucesso).toBe(true)

  publicados.length = 0
  return atendimentoId
}

function avaliacoesDo(atendimentoId: string) {
  return db
    .select({
      id: avaliacoesAtendimento.id,
      nota: avaliacoesAtendimento.nota,
      comentario: avaliacoesAtendimento.comentario,
      prestadorId: avaliacoesAtendimento.prestadorId,
      clienteUsuarioId: avaliacoesAtendimento.clienteUsuarioId,
      criadoEm: avaliacoesAtendimento.createdAt,
      atualizadoEm: avaliacoesAtendimento.updatedAt,
    })
    .from(avaliacoesAtendimento)
    .where(eq(avaliacoesAtendimento.atendimentoId, atendimentoId))
}

function eventosDo(atendimentoId: string) {
  return db
    .select({
      tipo: atendimentoEventos.tipo,
      descricao: atendimentoEventos.descricao,
      visivelCliente: atendimentoEventos.visivelCliente,
      metadados: atendimentoEventos.metadados,
    })
    .from(atendimentoEventos)
    .where(eq(atendimentoEventos.atendimentoId, atendimentoId))
}

function notificacoesDe(destinatarioId: string, tipo: string) {
  return db
    .select({
      titulo: notificacoes.titulo,
      resumo: notificacoes.resumo,
      destino: notificacoes.destino,
      atendimentoId: notificacoes.atendimentoId,
      protocolo: notificacoes.protocolo,
    })
    .from(notificacoes)
    .where(
      and(
        eq(notificacoes.destinatarioId, destinatarioId),
        eq(notificacoes.tipo, tipo),
      ),
    )
}

function estadoDoAtendimento(atendimentoId: string) {
  return db
    .select({
      status: atendimentos.status,
      protocolo: atendimentos.protocolo,
      concluidoEm: atendimentos.concluidoEm,
      observacaoFinal: atendimentos.observacaoFinal,
      atualizadoEm: atendimentos.updatedAt,
    })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimentoId))
    .then(([linha]) => linha)
}

beforeEach(async () => {
  await limpar()
  contas = await criarContas<Chave>(
    SUFIXO,
    {
      ana: { perfil: 'profissional', prestador: 'profissional' },
      bruno: { perfil: 'profissional', prestador: 'profissional' },
      convidada: { perfil: 'profissional', prestador: 'profissional' },
      semAvaliacao: { perfil: 'profissional', prestador: 'profissional' },
      marina: { perfil: 'cliente' },
      outroCliente: { perfil: 'cliente' },
    },
    '119490',
  )
  publicados.length = 0
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('somente Atendimento concluído aceita avaliação', () => {
  it('recusa avaliação de Atendimento em andamento', async () => {
    const atendimentoId = await atendimentoEmAndamento()

    const resultado = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
    })

    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) return
    expect(resultado.motivo).toBe('nao-concluido')
    expect(await avaliacoesDo(atendimentoId)).toHaveLength(0)
  })

  it('aceita depois da conclusão real', async () => {
    const atendimentoId = await atendimentoConcluido()

    const resultado = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
      comentario: 'Atendimento claro e no prazo.',
    })

    expect(resultado.sucesso).toBe(true)
    const [linha] = await avaliacoesDo(atendimentoId)
    expect(linha.nota).toBe(5)
    expect(linha.comentario).toBe('Atendimento claro e no prazo.')
    // Quem é avaliado é o Prestador principal — nunca um participante.
    expect(linha.prestadorId).toBe(contas.ana.id)
    expect(linha.clienteUsuarioId).toBe(contas.marina.id)
  })
})

describe('quem pode avaliar', () => {
  it('o Cliente proprietário avalia', async () => {
    const atendimentoId = await atendimentoConcluido()
    const resultado = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 4,
    })
    expect(resultado.sucesso).toBe(true)
  })

  it('outro Cliente é recusado mesmo conhecendo o id', async () => {
    const atendimentoId = await atendimentoConcluido()

    const resultado = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.outroCliente.id,
      nota: 1,
    })

    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) return
    expect(resultado.motivo).toBe('sem-acesso')
    expect(await avaliacoesDo(atendimentoId)).toHaveLength(0)
  })

  it('o Prestador não avalia o próprio Atendimento', async () => {
    const atendimentoId = await atendimentoConcluido()

    const resultado = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.ana.id,
      nota: 5,
    })

    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) return
    expect(resultado.motivo).toBe('sem-acesso')
    expect(await avaliacoesDo(atendimentoId)).toHaveLength(0)
  })

  it('participante convidado não cria avaliação em nome do Cliente', async () => {
    const atendimentoId = await atendimentoConcluido()

    const resultado = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.convidada.id,
      nota: 5,
    })

    expect(resultado.sucesso).toBe(false)
    expect(await avaliacoesDo(atendimentoId)).toHaveLength(0)
  })

  it('a action nunca aceita o autor pelo parâmetro — ele vem da sessão', async () => {
    const atendimentoId = await atendimentoConcluido()

    // O prestador logado tenta se passar pelo Cliente enviando o id dele.
    entrarComo(contas.ana.token)
    const resultado = await avaliarAtendimento({
      atendimentoId,
      nota: 5,
      clienteUsuarioId: contas.marina.id,
      usuarioId: contas.marina.id,
    })

    expect(resultado.sucesso).toBe(false)
    expect(await avaliacoesDo(atendimentoId)).toHaveLength(0)
  })
})

describe('faixa da nota', () => {
  it('aceita os cinco valores inteiros', async () => {
    for (const nota of [1, 2, 3, 4, 5]) {
      const atendimentoId = await atendimentoConcluido(`Serviço nota ${nota}`)
      const resultado = await registrarAvaliacao({
        atendimentoId,
        usuarioId: contas.marina.id,
        nota,
      })
      expect(resultado.sucesso).toBe(true)
    }
  })

  it.each([0, 6, 4.5, -1, Number.NaN])('recusa %s', async (nota) => {
    const atendimentoId = await atendimentoConcluido(`Serviço ${String(nota)}`)

    const resultado = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: nota as number,
    })

    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) return
    expect(resultado.motivo).toBe('nota-invalida')
    expect(await avaliacoesDo(atendimentoId)).toHaveLength(0)
  })

  it('a action recusa nota ausente e nota fora da faixa', async () => {
    const atendimentoId = await atendimentoConcluido()
    entrarComo(contas.marina.token)

    expect((await avaliarAtendimento({ atendimentoId })).sucesso).toBe(false)
    expect(
      (await avaliarAtendimento({ atendimentoId, nota: null })).sucesso,
    ).toBe(false)
    expect((await avaliarAtendimento({ atendimentoId, nota: 6 })).sucesso).toBe(
      false,
    )
    expect(await avaliacoesDo(atendimentoId)).toHaveLength(0)
  })

  it('o banco recusa nota fora da faixa mesmo por escrita direta', async () => {
    const atendimentoId = await atendimentoConcluido()
    await expect(
      db.insert(avaliacoesAtendimento).values({
        atendimentoId,
        prestadorId: contas.ana.id,
        clienteUsuarioId: contas.marina.id,
        nota: 9,
      }),
    ).rejects.toThrow()
  })
})

describe('comentário', () => {
  it('é opcional: só estrelas é avaliação completa', async () => {
    const atendimentoId = await atendimentoConcluido()
    const resultado = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
    })

    expect(resultado.sucesso).toBe(true)
    const [linha] = await avaliacoesDo(atendimentoId)
    expect(linha.comentario).toBeNull()
  })

  it('texto só de espaços vira ausência de comentário', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 4,
      comentario: '    \n\n   ',
    })

    const [linha] = await avaliacoesDo(atendimentoId)
    expect(linha.comentario).toBeNull()
  })

  it('sanitiza sem reescrever o que a pessoa quis dizer', () => {
    expect(sanitizarComentario('  Ótimo trabalho.  ')).toBe('Ótimo trabalho.')
    expect(sanitizarComentario('Linha 1\n\n\n\n\nLinha 2')).toBe(
      'Linha 1\n\nLinha 2',
    )
    expect(sanitizarComentario('   ')).toBeNull()
    expect(sanitizarComentario(null)).toBeNull()
    expect(sanitizarComentario('a'.repeat(2000))?.length).toBe(1000)
  })
})

describe('uma avaliação por Atendimento', () => {
  it('o duplo clique não cria duas avaliações', async () => {
    const atendimentoId = await atendimentoConcluido()

    const [primeira, segunda] = await Promise.all([
      registrarAvaliacao({
        atendimentoId,
        usuarioId: contas.marina.id,
        nota: 5,
        comentario: 'Primeiro clique.',
      }),
      registrarAvaliacao({
        atendimentoId,
        usuarioId: contas.marina.id,
        nota: 5,
        comentario: 'Segundo clique.',
      }),
    ])

    expect(primeira.sucesso).toBe(true)
    expect(segunda.sucesso).toBe(true)
    expect(await avaliacoesDo(atendimentoId)).toHaveLength(1)
    expect((await obterReputacaoDoPrestador(contas.ana.id)).total).toBe(1)
  })

  it('requisição repetida converge para a mesma linha', async () => {
    const atendimentoId = await atendimentoConcluido()
    entrarComo(contas.marina.token)

    for (let i = 0; i < 4; i += 1) {
      const resultado = await avaliarAtendimento({ atendimentoId, nota: 5 })
      expect(resultado.sucesso).toBe(true)
    }

    expect(await avaliacoesDo(atendimentoId)).toHaveLength(1)
  })

  it('o banco impede duplicidade mesmo por escrita direta', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
    })

    await expect(
      db.insert(avaliacoesAtendimento).values({
        atendimentoId,
        prestadorId: contas.ana.id,
        clienteUsuarioId: contas.marina.id,
        nota: 3,
      }),
    ).rejects.toThrow()
  })
})

describe('edição da avaliação', () => {
  it('atualiza a mesma linha, preserva criado_em e move atualizado_em', async () => {
    const atendimentoId = await atendimentoConcluido()
    const criacao = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
      comentario: 'Excelente.',
    })
    expect(criacao.sucesso).toBe(true)
    if (!criacao.sucesso) return
    expect(criacao.criada).toBe(true)

    await new Promise((resolver) => setTimeout(resolver, 20))

    const edicao = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 4,
      comentario: 'Bom, com um pequeno atraso.',
    })
    expect(edicao.sucesso).toBe(true)
    if (!edicao.sucesso) return
    expect(edicao.criada).toBe(false)
    expect(edicao.avaliacaoId).toBe(criacao.avaliacaoId)

    const linhas = await avaliacoesDo(atendimentoId)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].nota).toBe(4)
    expect(linhas[0].comentario).toBe('Bom, com um pequeno atraso.')
    expect(linhas[0].criadoEm.getTime()).toBe(criacao.criadoEm.getTime())
    expect(linhas[0].atualizadoEm.getTime()).toBeGreaterThan(
      linhas[0].criadoEm.getTime(),
    )
  })

  it('a quantidade continua 1 e a média é recalculada', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
    })
    expect(await obterReputacaoDoPrestador(contas.ana.id)).toMatchObject({
      media: 5,
      mediaEmDecimos: 50,
      total: 1,
    })

    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 4,
    })

    expect(await obterReputacaoDoPrestador(contas.ana.id)).toMatchObject({
      media: 4,
      mediaEmDecimos: 40,
      total: 1,
    })
  })

  it('o Prestador não altera a avaliação recebida', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 2,
      comentario: 'Demorou.',
    })

    const tentativa = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.ana.id,
      nota: 5,
      comentario: 'Na verdade foi ótimo.',
    })

    expect(tentativa.sucesso).toBe(false)
    const [linha] = await avaliacoesDo(atendimentoId)
    expect(linha.nota).toBe(2)
    expect(linha.comentario).toBe('Demorou.')
  })

  it('a edição não gera segunda notificação nem segundo evento', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
    })
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 3,
    })

    const avisos = await notificacoesDe(contas.ana.id, 'avaliacao_recebida')
    expect(avisos).toHaveLength(1)

    const eventos = (await eventosDo(atendimentoId)).filter(
      (evento) => evento.tipo === 'atendimento_avaliado',
    )
    expect(eventos).toHaveLength(1)
  })
})

describe('média e quantidade reais', () => {
  it('média de 5, 5, 4, 5 é 4,75 e a exibição arredonda para 4,8', async () => {
    for (const nota of [5, 5, 4, 5]) {
      const atendimentoId = await atendimentoConcluido(`Serviço média ${nota}-${Math.random()}`)
      await registrarAvaliacao({
        atendimentoId,
        usuarioId: contas.marina.id,
        nota,
      })
    }

    const reputacao = await obterReputacaoDoPrestador(contas.ana.id)
    expect(reputacao.total).toBe(4)
    expect(reputacao.media).toBeCloseTo(4.75, 5)
    // A convenção "valor / 10" das telas aprovadas continua valendo.
    expect(reputacao.mediaEmDecimos).toBe(48)
    expect(((reputacao.mediaEmDecimos ?? 0) / 10).toFixed(1)).toBe('4.8')
  })

  it('a reputação de um prestador não contamina a de outro', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
    })

    const mapa = await obterReputacaoDosPrestadores([
      contas.ana.id,
      contas.semAvaliacao.id,
    ])
    expect(mapa.get(contas.ana.id)).toMatchObject({ total: 1, media: 5 })
    expect(mapa.get(contas.semAvaliacao.id)).toMatchObject({
      total: 0,
      media: null,
      mediaEmDecimos: null,
    })
  })

  it('a distribuição por estrela soma o total', async () => {
    for (const nota of [5, 5, 3]) {
      const atendimentoId = await atendimentoConcluido(
        `Serviço distribuição ${nota}-${Math.random()}`,
      )
      await registrarAvaliacao({
        atendimentoId,
        usuarioId: contas.marina.id,
        nota,
      })
    }

    const distribuicao = await obterDistribuicaoDeNotas(contas.ana.id)
    // Cinco faixas sempre, mesmo zeradas: o gráfico aprovado tem cinco linhas.
    expect(distribuicao).toHaveLength(5)
    expect(distribuicao.find((faixa) => faixa.nota === 5)?.total).toBe(2)
    expect(distribuicao.find((faixa) => faixa.nota === 3)?.total).toBe(1)
    expect(distribuicao.find((faixa) => faixa.nota === 1)?.total).toBe(0)
    expect(distribuicao.reduce((soma, faixa) => soma + faixa.total, 0)).toBe(3)
  })

  it('o card público e o perfil público leem a mesma reputação', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 4,
    })

    const vitrine = await pesquisarProfissionaisReais({ busca: 'Teste ana' })
    const card = vitrine.profissionais.find(({ id }) => id === contas.ana.id)
    const perfil = await obterIdentidadePublica(contas.ana.id)
    const painel = await obterPainelDeAvaliacoes(contas.ana.id)

    expect(card?.avaliacaoMedia).toBe(40)
    expect(card?.totalAvaliacoes).toBe(1)
    expect(perfil?.avaliacaoMedia).toBe(40)
    expect(perfil?.totalAvaliacoes).toBe(1)
    expect(painel.reputacao.mediaEmDecimos).toBe(40)
    expect(painel.reputacao.total).toBe(1)
  })
})

describe('comentários públicos', () => {
  it('trazem estrelas, texto e o nome público do Cliente', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
      comentario: 'Explicou tudo sem complicar.',
    })

    const [publica] = await listarAvaliacoesPublicas(contas.ana.id)
    expect(publica.nota).toBe(5)
    expect(publica.comentario).toBe('Explicou tudo sem complicar.')
    expect(publica.autor).toBe('Teste marina')
  })

  it('não expõem e-mail, telefone nem id do Cliente', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
      comentario: 'Recomendo.',
    })

    const [publica] = await listarAvaliacoesPublicas(contas.ana.id)
    const serializada = JSON.stringify(publica)
    expect(serializada).not.toContain(SUFIXO)
    expect(serializada).not.toContain(contas.marina.id)
    expect(Object.keys(publica).sort()).toEqual([
      'autor',
      'comentario',
      'criadoEm',
      'id',
      'nota',
    ])
  })

  it('avaliação sem comentário não vira card vazio', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
    })

    expect(await listarAvaliacoesPublicas(contas.ana.id)).toHaveLength(0)
    // Mas ela continua contando na média e na quantidade, que é onde pertence.
    expect((await obterReputacaoDoPrestador(contas.ana.id)).total).toBe(1)
  })

  it('mais recentes primeiro, dentro do limite do layout', async () => {
    for (const indice of [1, 2, 3, 4, 5]) {
      const atendimentoId = await atendimentoConcluido(`Serviço ordem ${indice}`)
      await registrarAvaliacao({
        atendimentoId,
        usuarioId: contas.marina.id,
        nota: 5,
        comentario: `Comentário ${indice}`,
      })
      await new Promise((resolver) => setTimeout(resolver, 5))
    }

    const publicas = await listarAvaliacoesPublicas(contas.ana.id)
    expect(publicas).toHaveLength(4)
    expect(publicas[0].comentario).toBe('Comentário 5')
    expect(publicas[3].comentario).toBe('Comentário 2')
  })
})

describe('prestador sem avaliação', () => {
  it('não recebe nota nem comentário inventados', async () => {
    const reputacao = await obterReputacaoDoPrestador(contas.semAvaliacao.id)
    expect(reputacao).toMatchObject({
      media: null,
      mediaEmDecimos: null,
      total: 0,
    })
    expect(await listarAvaliacoesPublicas(contas.semAvaliacao.id)).toEqual([])

    const perfil = await obterIdentidadePublica(contas.semAvaliacao.id)
    expect(perfil?.avaliacaoMedia).toBeNull()
    expect(perfil?.totalAvaliacoes).toBe(0)

    const painel = await obterPainelDeAvaliacoes(contas.semAvaliacao.id)
    expect(painel.recebidas).toEqual([])
    expect(painel.distribuicao.every((faixa) => faixa.total === 0)).toBe(true)
  })

  it('a coluna legada de demonstração não alimenta mais nenhuma tela', async () => {
    // Mesmo com o mock antigo gravado no cadastro, a vitrine mostra o real.
    await db
      .update(perfisProfissionais)
      .set({ avaliacaoMedia: 48, totalAvaliacoes: 89 })
      .where(eq(perfisProfissionais.usuarioId, contas.semAvaliacao.id))

    const vitrine = await pesquisarProfissionaisReais({ busca: 'Teste semAvaliacao' })
    const card = vitrine.profissionais.find(
      ({ id }) => id === contas.semAvaliacao.id,
    )
    expect(card?.avaliacaoMedia).toBeNull()
    expect(card?.totalAvaliacoes).toBe(0)

    const perfil = await obterIdentidadePublica(contas.semAvaliacao.id)
    expect(perfil?.avaliacaoMedia).toBeNull()
    expect(perfil?.totalAvaliacoes).toBe(0)
  })
})

describe('histórico', () => {
  it('registra o fato e a hora, sem o texto da avaliação', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
      comentario: 'Texto que não deve aparecer no histórico.',
    })

    const [evento] = (await eventosDo(atendimentoId)).filter(
      (linha) => linha.tipo === 'atendimento_avaliado',
    )
    expect(evento.descricao).toBe('Cliente avaliou o atendimento.')
    expect(evento.visivelCliente).toBe(true)
    expect(JSON.stringify(evento.metadados)).not.toContain(
      'Texto que não deve aparecer',
    )
    expect(evento.metadados).toMatchObject({ nota: 5, temComentario: true })
  })

  it('o Cliente vê o evento no histórico dele', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
    })

    const [dto] = await listarAtendimentosDoCliente(contas.marina.id)
    expect(
      dto.eventos.some(
        (evento) => evento.descricao === 'Cliente avaliou o atendimento.',
      ),
    ).toBe(true)
  })
})

describe('notificação e tempo real', () => {
  it('o Prestador recebe notificação com o protocolo e destino no histórico', async () => {
    const atendimentoId = await atendimentoConcluido()
    const { protocolo } = await estadoDoAtendimento(atendimentoId)

    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
      comentario: 'Comentário que não vai para o sino.',
    })

    const [aviso] = await notificacoesDe(contas.ana.id, 'avaliacao_recebida')
    expect(aviso.titulo).toBe(`Nova avaliação recebida no ${protocolo}.`)
    expect(aviso.resumo).toBe('5 estrelas.')
    expect(aviso.resumo).not.toContain('Comentário')
    expect(aviso.protocolo).toBe(protocolo)
    expect(aviso.atendimentoId).toBe(atendimentoId)
    expect(aviso.destino).toMatchObject({
      pagina: 'atendimentos',
      atendimento: protocolo,
      aba: 'historico',
    })
  })

  it('o Cliente não é avisado da própria avaliação', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
    })

    expect(await notificacoesDe(contas.marina.id, 'avaliacao_recebida')).toEqual(
      [],
    )
  })

  it('difunde no canal pessoal do Prestador e no canal do Atendimento', async () => {
    const atendimentoId = await atendimentoConcluido()
    const { protocolo } = await estadoDoAtendimento(atendimentoId)

    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
      comentario: 'Texto que não trafega no evento.',
    })

    const pessoal = publicados.find(
      ({ canal }) => canal === canalDoUsuario(contas.ana.id),
    )
    expect(pessoal?.evento.tipo).toBe('avaliacao')
    expect(pessoal?.evento.titulo).toBe(
      `Teste marina avaliou o atendimento ${protocolo}.`,
    )
    expect(pessoal?.evento.severidade).toBe('sucesso')
    expect(pessoal?.evento.aba).toBe('historico')

    const doAtendimento = publicados.find(
      ({ canal }) => canal === canalDoAtendimento(atendimentoId),
    )
    // O canal do Atendimento nunca leva texto: quem o assina é qualquer pessoa
    // com vínculo, e o toast pertence ao canal pessoal.
    expect(doAtendimento?.evento.titulo).toBeFalsy()

    // O comentário não trafega em nenhum canal.
    expect(JSON.stringify(publicados)).not.toContain('não trafega')

    // O Cliente autor não recebe toast do próprio ato.
    expect(
      publicados.some(({ canal }) => canal === canalDoUsuario(contas.marina.id)),
    ).toBe(false)
  })

  it('a edição atualiza a tela aberta sem um segundo toast pessoal', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
    })
    publicados.length = 0

    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 3,
    })

    expect(
      publicados.some(({ canal }) => canal === canalDoUsuario(contas.ana.id)),
    ).toBe(false)
    expect(
      publicados.some(({ canal }) => canal === canalDoAtendimento(atendimentoId)),
    ).toBe(true)
  })
})

describe('o Atendimento continua imutável', () => {
  it('avaliar não muda status, conclusão nem carimbo do Atendimento', async () => {
    const atendimentoId = await atendimentoConcluido()
    const antes = await estadoDoAtendimento(atendimentoId)

    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
      comentario: 'Ótimo.',
    })

    const depois = await estadoDoAtendimento(atendimentoId)
    expect(depois.status).toBe(antes.status)
    expect(depois.status).toBe('concluido')
    expect(depois.concluidoEm?.getTime()).toBe(antes.concluidoEm?.getTime())
    expect(depois.observacaoFinal).toBe(antes.observacaoFinal)
    expect(depois.atualizadoEm.getTime()).toBe(antes.atualizadoEm.getTime())
  })
})

describe('portal do Cliente', () => {
  it('devolve a própria avaliação e diz que já foi avaliado', async () => {
    const atendimentoId = await atendimentoConcluido()

    const [antes] = await listarAtendimentosDoCliente(contas.marina.id)
    expect(antes.avaliacao).toBeNull()

    entrarComo(contas.marina.token)
    const resultado = await avaliarAtendimento({
      atendimentoId,
      nota: 5,
      comentario: 'Perfeito.',
    })
    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) return
    expect(resultado.mensagem).toBe('Avaliação enviada com sucesso.')

    const [depois] = await listarAtendimentosDoCliente(contas.marina.id)
    expect(depois.avaliacao).toMatchObject({ nota: 5, comentario: 'Perfeito.' })
  })

  it('a avaliação de um Cliente não aparece para outro', async () => {
    const atendimentoId = await atendimentoConcluido()
    await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 5,
    })

    const doOutro = await listarAtendimentosDoCliente(contas.outroCliente.id)
    expect(doOutro).toHaveLength(0)
    expect(await obterMinhaAvaliacao(atendimentoId, contas.outroCliente.id)).toBeNull()
    expect(await obterMinhaAvaliacao(atendimentoId, contas.marina.id)).not.toBeNull()
  })

  it('a edição pela action mantém uma avaliação e atualiza o público', async () => {
    const atendimentoId = await atendimentoConcluido()
    entrarComo(contas.marina.token)

    await avaliarAtendimento({
      atendimentoId,
      nota: 5,
      comentario: 'Comentário original.',
    })
    const edicao = await avaliarAtendimento({
      atendimentoId,
      nota: 4,
      comentario: 'Comentário corrigido.',
    })

    expect(edicao.sucesso).toBe(true)
    if (!edicao.sucesso) return
    expect(edicao.mensagem).toBe('Avaliação atualizada com sucesso.')

    const reputacao = await obterReputacaoDoPrestador(contas.ana.id)
    expect(reputacao.total).toBe(1)
    expect(reputacao.media).toBe(4)

    const publicas = await listarAvaliacoesPublicas(contas.ana.id)
    expect(publicas).toHaveLength(1)
    expect(publicas[0].comentario).toBe('Comentário corrigido.')
    expect(publicas[0].nota).toBe(4)
  })
})

describe('o painel do Prestador recebe as avaliações reais', () => {
  it('média, quantidade, distribuição e comentários vêm da mesma fonte', async () => {
    const primeiro = await atendimentoConcluido('Serviço painel 1')
    await registrarAvaliacao({
      atendimentoId: primeiro,
      usuarioId: contas.marina.id,
      nota: 5,
      comentario: 'Muito bom.',
    })
    const segundo = await atendimentoConcluido('Serviço painel 2')
    await registrarAvaliacao({
      atendimentoId: segundo,
      usuarioId: contas.marina.id,
      nota: 4,
    })

    const painel = await obterPainelDeAvaliacoes(contas.ana.id)
    expect(painel.reputacao.total).toBe(2)
    expect(painel.reputacao.media).toBe(4.5)
    // A tela do prestador vê também a avaliação sem comentário: a nota é dele.
    expect(painel.recebidas).toHaveLength(2)
    expect(painel.recebidas[0].protocolo).toMatch(/^#\d{4}-\d{4}$/)
    expect(
      painel.distribuicao.find((faixa) => faixa.nota === 5)?.total,
    ).toBe(1)

    // E a lista pública continua trazendo só o que tem comentário.
    expect(await listarAvaliacoesPublicas(contas.ana.id)).toHaveLength(1)
  })
})
