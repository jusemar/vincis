import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventoRealtime } from '@/integracoes/realtime/eventos'

/**
 * Solicitação de ajuste sobre um Atendimento concluído.
 *
 * O fluxo inteiro roda de verdade contra o Postgres da suíte: autorização,
 * status, Protocolo, Histórico, notificações, unicidade, concorrência e
 * reabertura. Dois pontos são simulados, e só dois:
 *
 * - a saída para o Pusher, porque o que interessa medir é **o que a aplicação
 *   decide publicar** depois de gravar — em que canais, com que texto e com que
 *   severidade;
 * - o armazenamento privado dos anexos: a validação de tipo e tamanho continua
 *   real, o upload de bytes não.
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

vi.mock('@/features/atendimentos/lib/arquivo-atendimento', async (original) => {
  const real = await original<
    typeof import('@/features/atendimentos/lib/arquivo-atendimento')
  >()
  return {
    ...real,
    enviarArquivoAtendimento: async (atendimentoId: string, arquivo: File) => {
      real.validarArquivoAtendimento(arquivo)
      return {
        chave: `atendimentos/${atendimentoId}/arquivos/${arquivo.name}`,
        nome: arquivo.name,
        tipoMime: arquivo.type,
        tamanhoBytes: arquivo.size,
      }
    },
  }
})

const { and, eq, inArray, like } = await import('drizzle-orm')
const { db } = await import('@/db/connection')
const {
  atendimentoAjustes,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoMensagens,
  atendimentoParticipantes,
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

const { concluirAtendimento } = await import(
  '@/features/atendimentos/lib/concluir-atendimento'
)
const { alterarStatusDoAtendimento } = await import(
  '@/features/atendimentos/lib/alterar-status'
)
const {
  analisarSolicitacaoDeAjuste,
  solicitarAjusteNoAtendimento,
} = await import('@/features/atendimentos/lib/solicitacoes-ajuste')
const { registrarAvaliacao } = await import(
  '@/features/avaliacoes/lib/registrar-avaliacao'
)
const { obterMinhaAvaliacao } = await import(
  '@/features/avaliacoes/lib/registrar-avaliacao'
)
const { listarAtendimentosDoPrestador } = await import(
  '@/features/atendimentos/queries/listar-atendimentos-do-prestador'
)
const { listarAtendimentosDoCliente } = await import(
  '@/features/atendimentos/queries/listar-atendimentos-do-cliente'
)
const { obterArquivoDoAtendimento } = await import(
  '@/features/atendimentos/queries/obter-arquivo-do-atendimento'
)
const { mapearAtendimentoParaCard } = await import(
  '@/features/admin/lib/atendimentos-reais'
)
const { contarIndicadores } = await import(
  '@/features/admin/lib/filtro-atendimentos'
)
const { TIPOS_EVENTO_ATENDIMENTO } = await import(
  '@/features/atendimentos/constants/atendimento'
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

const SUFIXO = '@ajuste-atendimento.teste'

type Chave = 'ana' | 'bruno' | 'convidada' | 'estranho' | 'marina' | 'outroCliente'
type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>

const SERVICO_BASE = {
  nome: 'Regularização de MEI',
  descricaoCurta: 'Regularização completa.',
  descricaoDetalhada: 'Inclui certidões e guias.',
  categoria: 'contabil' as const,
  itensIncluidos: ['Certidões'],
  checklistModelo: [] as string[],
  modeloPreco: 'fixo' as const,
  valor: '100,00',
  prazoEstimadoDias: 5,
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
 * É o estado de onde o pedido de ajuste parte na vida real: contratado, aberto,
 * trabalhado e entregue. Nada é inserido à mão — passa pelo catálogo, pela
 * contratação e pela conclusão de verdade.
 */
async function atendimentoConcluido(nome = SERVICO_BASE.nome) {
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

  const conclusao = await concluirAtendimento({
    atendimentoId,
    usuarioId: contas.ana.id,
    observacaoFinal: 'Entrega concluída conforme combinado.',
  })
  expect(conclusao.sucesso).toBe(true)

  publicados.length = 0
  return atendimentoId
}

/** Atalho: cria o pedido do Cliente e devolve o id da solicitação. */
async function pedirAjuste(atendimentoId: string, motivo = MOTIVO) {
  const resultado = await solicitarAjusteNoAtendimento({
    atendimentoId,
    usuarioId: contas.marina.id,
    motivo,
  })
  expect(resultado.sucesso).toBe(true)
  if (!resultado.sucesso) throw new Error('solicitação recusada')
  publicados.length = 0
  return resultado.solicitacaoId
}

const MOTIVO =
  'O documento entregue está com meu endereço antigo. Poderia corrigir?'

function atendimentoPor(atendimentoId: string) {
  return db
    .select({
      status: atendimentos.status,
      concluidoEm: atendimentos.concluidoEm,
      concluidoPor: atendimentos.concluidoPor,
      observacaoFinal: atendimentos.observacaoFinal,
      protocolo: atendimentos.protocolo,
    })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimentoId))
    .then(([linha]) => linha)
}

function solicitacaoPor(solicitacaoId: string) {
  return db
    .select({
      status: atendimentoAjustes.status,
      motivo: atendimentoAjustes.motivo,
      resposta: atendimentoAjustes.resposta,
      analisadoPor: atendimentoAjustes.analisadoPor,
      analisadoEm: atendimentoAjustes.analisadoEm,
      arquivoId: atendimentoAjustes.arquivoId,
      manifestacaoId: atendimentoAjustes.manifestacaoId,
      respostaManifestacaoId: atendimentoAjustes.respostaManifestacaoId,
      reaberturaEventoId: atendimentoAjustes.reaberturaEventoId,
    })
    .from(atendimentoAjustes)
    .where(eq(atendimentoAjustes.id, solicitacaoId))
    .then(([linha]) => linha)
}

function solicitacoesDo(atendimentoId: string) {
  return db
    .select({ id: atendimentoAjustes.id, status: atendimentoAjustes.status })
    .from(atendimentoAjustes)
    .where(eq(atendimentoAjustes.atendimentoId, atendimentoId))
}

function eventosDo(atendimentoId: string) {
  return db
    .select({
      tipo: atendimentoEventos.tipo,
      descricao: atendimentoEventos.descricao,
      visivelCliente: atendimentoEventos.visivelCliente,
      metadados: atendimentoEventos.metadados,
      criadoEm: atendimentoEventos.createdAt,
    })
    .from(atendimentoEventos)
    .where(eq(atendimentoEventos.atendimentoId, atendimentoId))
    .orderBy(atendimentoEventos.createdAt)
}

function manifestacoesDo(atendimentoId: string) {
  return db
    .select({
      conteudo: atendimentoManifestacoes.conteudo,
      papelAutor: atendimentoManifestacoes.papelAutor,
      visibilidade: atendimentoManifestacoes.visibilidade,
      autorId: atendimentoManifestacoes.autorId,
      arquivoId: atendimentoManifestacoes.arquivoId,
    })
    .from(atendimentoManifestacoes)
    .where(eq(atendimentoManifestacoes.atendimentoId, atendimentoId))
    .orderBy(atendimentoManifestacoes.createdAt)
}

function notificacoesDe(destinatarioId: string, tipo: string) {
  return db
    .select({ titulo: notificacoes.titulo, destino: notificacoes.destino })
    .from(notificacoes)
    .where(
      and(
        eq(notificacoes.destinatarioId, destinatarioId),
        eq(notificacoes.tipo, tipo),
      ),
    )
}

beforeEach(async () => {
  await limpar()
  contas = await criarContas<Chave>(
    SUFIXO,
    {
      ana: { perfil: 'profissional', prestador: 'profissional' },
      bruno: { perfil: 'profissional', prestador: 'profissional' },
      convidada: { perfil: 'profissional', prestador: 'profissional' },
      estranho: { perfil: 'profissional', prestador: 'profissional' },
      marina: { perfil: 'cliente' },
      outroCliente: { perfil: 'cliente' },
    },
    '119481',
  )
  publicados.length = 0
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('o Cliente solicita ajuste', () => {
  it('registra o pedido com o motivo, em estado pendente', async () => {
    const atendimentoId = await atendimentoConcluido()

    const resultado = await solicitarAjusteNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      motivo: `  ${MOTIVO}  `,
    })

    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) return

    const linha = await solicitacaoPor(resultado.solicitacaoId)
    expect(linha.status).toBe('pendente')
    // O texto é gravado como o Cliente escreveu, sem as pontas em branco.
    expect(linha.motivo).toBe(MOTIVO)
    expect(linha.analisadoPor).toBeNull()
    expect(linha.analisadoEm).toBeNull()
  })

  it('NÃO reabre o Atendimento: o status continua Concluído', async () => {
    const atendimentoId = await atendimentoConcluido()
    const antes = await atendimentoPor(atendimentoId)

    await pedirAjuste(atendimentoId)

    const depois = await atendimentoPor(atendimentoId)
    expect(depois.status).toBe('concluido')
    // Nem a data, nem o autor, nem a observação da conclusão são tocados.
    expect(depois.concluidoEm?.toISOString()).toBe(
      antes.concluidoEm?.toISOString(),
    )
    expect(depois.concluidoPor).toBe(antes.concluidoPor)
    expect(depois.observacaoFinal).toBe(antes.observacaoFinal)
  })

  it('entra no Protocolo como manifestação formal do Cliente', async () => {
    const atendimentoId = await atendimentoConcluido()
    await pedirAjuste(atendimentoId)

    const manifestacoes = await manifestacoesDo(atendimentoId)
    const pedido = manifestacoes.at(-1)
    expect(pedido?.papelAutor).toBe('cliente')
    // Todos com acesso ao Atendimento precisam ler para poder analisar.
    expect(pedido?.visibilidade).toBe('participantes_e_cliente')
    expect(pedido?.autorId).toBe(contas.marina.id)
    expect(pedido?.conteudo).toContain(MOTIVO)
  })

  it('não escreve nada na Conversa', async () => {
    const atendimentoId = await atendimentoConcluido()
    await pedirAjuste(atendimentoId)

    const mensagens = await db
      .select({ id: atendimentoMensagens.id })
      .from(atendimentoMensagens)
      .where(eq(atendimentoMensagens.atendimentoId, atendimentoId))
    expect(mensagens).toHaveLength(0)
  })

  it('registra o pedido no Histórico, visível para o Cliente', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)

    const eventos = await eventosDo(atendimentoId)
    const evento = eventos.find(
      (linha) => linha.tipo === TIPOS_EVENTO_ATENDIMENTO.ajusteSolicitado,
    )
    expect(evento).toBeDefined()
    expect(evento?.visivelCliente).toBe(true)
    expect(evento?.descricao).toContain('solicitou um ajuste')
    expect(
      (evento?.metadados as { solicitacaoId?: string })?.solicitacaoId,
    ).toBe(solicitacaoId)
    // O status registrado é o de antes: o pedido não moveu o Atendimento.
    expect(
      (evento?.metadados as { statusAtendimento?: string })?.statusAtendimento,
    ).toBe('concluido')
  })

  it('aceita anexo pelo sistema de Arquivos privados já existente', async () => {
    const atendimentoId = await atendimentoConcluido()

    const resultado = await solicitarAjusteNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      motivo: MOTIVO,
      arquivo: new File(['endereco antigo'], 'comprovante.txt', {
        type: 'text/plain',
      }),
    })
    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) return
    expect(resultado.arquivoId).toBeTruthy()

    const linha = await solicitacaoPor(resultado.solicitacaoId)
    expect(linha.arquivoId).toBe(resultado.arquivoId)

    // O anexo é do Cliente e continua privado: quem tem vínculo baixa, quem
    // não tem recebe a mesma recusa de sempre.
    const arquivoId = resultado.arquivoId as string
    const paraEquipe = await obterArquivoDoAtendimento({
      atendimentoId,
      arquivoId,
      usuarioId: contas.ana.id,
    })
    expect(paraEquipe).not.toBeNull()
    const paraOutroCliente = await obterArquivoDoAtendimento({
      atendimentoId,
      arquivoId,
      usuarioId: contas.outroCliente.id,
    })
    expect(paraOutroCliente).toBeNull()
    const paraEstranho = await obterArquivoDoAtendimento({
      atendimentoId,
      arquivoId,
      usuarioId: contas.estranho.id,
    })
    expect(paraEstranho).toBeNull()
  })

  it('avisa a equipe — e ninguém mais — com aviso e tempo real', async () => {
    const atendimentoId = await atendimentoConcluido()
    await solicitarAjusteNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      motivo: MOTIVO,
    })

    const paraAna = await notificacoesDe(contas.ana.id, 'ajuste_solicitado')
    expect(paraAna).toHaveLength(1)
    expect(paraAna[0].titulo).toContain('solicitou um ajuste')
    expect(paraAna[0].destino).toMatchObject({ aba: 'protocolo' })

    // Quem pediu não é avisado do próprio pedido.
    const paraMarina = await notificacoesDe(
      contas.marina.id,
      'ajuste_solicitado',
    )
    expect(paraMarina).toHaveLength(0)

    const canais = publicados.map(({ canal }) => canal)
    expect(canais).toContain(canalDoUsuario(contas.ana.id))
    expect(canais).toContain(canalDoAtendimento(atendimentoId))
    expect(canais).not.toContain(canalDoUsuario(contas.marina.id))

    const pessoal = publicados.find(
      ({ canal }) => canal === canalDoUsuario(contas.ana.id),
    )
    expect(pessoal?.evento.tipo).toBe('ajuste')
    expect(pessoal?.evento.severidade).toBe('atencao')
    expect(pessoal?.evento.aba).toBe('protocolo')

    // O canal do Atendimento vai sem texto: ele é assinado por qualquer pessoa
    // com vínculo, e o aviso pessoal já passou pelo recorte de audiência.
    const doAtendimento = publicados.find(
      ({ canal }) => canal === canalDoAtendimento(atendimentoId),
    )
    expect(doAtendimento?.evento.titulo ?? null).toBeNull()
  })
})

describe('quem pode solicitar', () => {
  it('outro Cliente não solicita ajuste no atendimento alheio', async () => {
    const atendimentoId = await atendimentoConcluido()

    const resultado = await solicitarAjusteNoAtendimento({
      atendimentoId,
      usuarioId: contas.outroCliente.id,
      motivo: MOTIVO,
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('sem-acesso')
    expect(await solicitacoesDo(atendimentoId)).toHaveLength(0)
  })

  it('o Prestador não solicita ajuste em nome do Cliente', async () => {
    const atendimentoId = await atendimentoConcluido()

    const resultado = await solicitarAjusteNoAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      motivo: MOTIVO,
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('sem-acesso')
  })

  it('atendimento que não está concluído recusa o pedido', async () => {
    entrarComo(contas.ana.token)
    const servico = await criarServico({
      ...SERVICO_BASE,
      nome: 'Serviço em andamento',
    })
    if (!servico.sucesso) throw new Error(servico.mensagem)
    entrarComo(contas.marina.token)
    const contratacao = await contratarServico({
      servicoId: (servico as { dados: { id: string } }).dados.id,
    })
    if (!contratacao.sucesso) throw new Error(contratacao.mensagem)
    const { atendimentoId } = contratacao.dados as { atendimentoId: string }

    const resultado = await solicitarAjusteNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      motivo: MOTIVO,
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('nao-concluido')
  })

  it('pedido sem motivo é recusado', async () => {
    const atendimentoId = await atendimentoConcluido()
    const resultado = await solicitarAjusteNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      motivo: '   ',
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('motivo-vazio')
  })
})

describe('uma solicitação pendente por Atendimento', () => {
  it('recusa o segundo pedido enquanto o primeiro está em análise', async () => {
    const atendimentoId = await atendimentoConcluido()
    await pedirAjuste(atendimentoId)

    const segunda = await solicitarAjusteNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      motivo: 'Outro problema no mesmo documento.',
    })
    expect(segunda.sucesso).toBe(false)
    if (!segunda.sucesso) expect(segunda.motivo).toBe('ja-existe-pendente')
    expect(await solicitacoesDo(atendimentoId)).toHaveLength(1)
  })

  it('dois envios simultâneos produzem uma solicitação só', async () => {
    const atendimentoId = await atendimentoConcluido()

    const [a, b] = await Promise.all([
      solicitarAjusteNoAtendimento({
        atendimentoId,
        usuarioId: contas.marina.id,
        motivo: MOTIVO,
      }),
      solicitarAjusteNoAtendimento({
        atendimentoId,
        usuarioId: contas.marina.id,
        motivo: MOTIVO,
      }),
    ])

    expect([a.sucesso, b.sucesso].filter(Boolean)).toHaveLength(1)
    expect(await solicitacoesDo(atendimentoId)).toHaveLength(1)

    // Uma manifestação, um evento, um aviso: o perdedor não escreveu nada.
    const manifestacoes = await manifestacoesDo(atendimentoId)
    expect(
      manifestacoes.filter((linha) => linha.conteudo.includes(MOTIVO)),
    ).toHaveLength(1)
    const eventos = await eventosDo(atendimentoId)
    expect(
      eventos.filter(
        (linha) => linha.tipo === TIPOS_EVENTO_ATENDIMENTO.ajusteSolicitado,
      ),
    ).toHaveLength(1)
    expect(await notificacoesDe(contas.ana.id, 'ajuste_solicitado')).toHaveLength(1)
  })

  it('depois de recusada, um novo pedido é permitido', async () => {
    const atendimentoId = await atendimentoConcluido()
    const primeira = await pedirAjuste(atendimentoId)
    await analisarSolicitacaoDeAjuste({
      solicitacaoId: primeira,
      usuarioId: contas.ana.id,
      decisao: 'recusar',
      resposta: 'O endereço usado foi o que consta no cadastro enviado.',
    })

    const segunda = await solicitarAjusteNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      motivo: 'Enviei o cadastro novo em anexo.',
    })
    expect(segunda.sucesso).toBe(true)
    expect(await solicitacoesDo(atendimentoId)).toHaveLength(2)
  })
})

describe('quem pode analisar', () => {
  it('o Cliente não aceita nem recusa o próprio pedido', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)

    const resultado = await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.marina.id,
      decisao: 'aceitar',
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('sem-acesso')
    expect((await atendimentoPor(atendimentoId)).status).toBe('concluido')
  })

  it('prestador sem vínculo não alcança a solicitação', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)

    const resultado = await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.estranho.id,
      decisao: 'aceitar',
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('sem-acesso')
  })

  it('participante convidado trabalha no Atendimento, mas não reabre', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)

    await db.insert(atendimentoParticipantes).values({
      atendimentoId,
      usuarioId: contas.convidada.id,
      papel: 'convidado',
    })

    const resultado = await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.convidada.id,
      decisao: 'aceitar',
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('sem-acesso')
    expect((await atendimentoPor(atendimentoId)).status).toBe('concluido')
  })

  it('o responsável analisa mesmo não sendo o dono da carteira', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)
    await db
      .update(atendimentos)
      .set({ responsavelId: contas.bruno.id })
      .where(eq(atendimentos.id, atendimentoId))

    const resultado = await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.bruno.id,
      decisao: 'aceitar',
    })
    expect(resultado.sucesso).toBe(true)
    expect((await atendimentoPor(atendimentoId)).status).toBe('em_andamento')
  })
})

describe('aceitar e reabrir', () => {
  it('devolve o Atendimento para Em andamento e guarda a decisão', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)

    const resultado = await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
      resposta: 'Vamos corrigir o endereço e reenviar.',
    })
    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) return
    expect(resultado.reaberto).toBe(true)

    expect((await atendimentoPor(atendimentoId)).status).toBe('em_andamento')

    const linha = await solicitacaoPor(solicitacaoId)
    expect(linha.status).toBe('aceita')
    expect(linha.analisadoPor).toBe(contas.ana.id)
    expect(linha.analisadoEm).not.toBeNull()
    expect(linha.resposta).toBe('Vamos corrigir o endereço e reenviar.')
    expect(linha.respostaManifestacaoId).toBeTruthy()
    expect(linha.reaberturaEventoId).toBeTruthy()
  })

  it('não apaga a conclusão anterior nem a entrega', async () => {
    const atendimentoId = await atendimentoConcluido()
    const antes = await atendimentoPor(atendimentoId)
    const solicitacaoId = await pedirAjuste(atendimentoId)

    await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
    })

    const depois = await atendimentoPor(atendimentoId)
    expect(depois.concluidoEm?.toISOString()).toBe(
      antes.concluidoEm?.toISOString(),
    )
    expect(depois.concluidoPor).toBe(contas.ana.id)
    expect(depois.observacaoFinal).toBe('Entrega concluída conforme combinado.')
  })

  it('a avaliação existente é preservada, sem recálculo silencioso', async () => {
    const atendimentoId = await atendimentoConcluido()
    const avaliada = await registrarAvaliacao({
      atendimentoId,
      usuarioId: contas.marina.id,
      nota: 4,
      comentario: 'Atendimento bom, faltou um detalhe.',
    })
    expect(avaliada.sucesso).toBe(true)

    const solicitacaoId = await pedirAjuste(atendimentoId)
    await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
    })

    const avaliacao = await obterMinhaAvaliacao(atendimentoId, contas.marina.id)
    expect(avaliacao?.nota).toBe(4)
    expect(avaliacao?.comentario).toBe('Atendimento bom, faltou um detalhe.')

    const linhas = await db
      .select({ id: avaliacoesAtendimento.id })
      .from(avaliacoesAtendimento)
      .where(eq(avaliacoesAtendimento.atendimentoId, atendimentoId))
    expect(linhas).toHaveLength(1)
  })

  it('o Histórico mostra a sequência concluído → pedido → aceite → reaberto', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)
    await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
    })

    const tipos = (await eventosDo(atendimentoId)).map((linha) => linha.tipo)
    const ordem = [
      TIPOS_EVENTO_ATENDIMENTO.atendimentoConcluido,
      TIPOS_EVENTO_ATENDIMENTO.ajusteSolicitado,
      TIPOS_EVENTO_ATENDIMENTO.ajusteAceito,
      TIPOS_EVENTO_ATENDIMENTO.atendimentoReaberto,
    ].map((tipo) => tipos.indexOf(tipo))

    expect(ordem.every((indice) => indice >= 0)).toBe(true)
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b))
  })

  it('a reabertura é registrada com contexto, e não como troca genérica de status', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)
    await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
    })

    const eventos = await eventosDo(atendimentoId)
    const reabertura = eventos.find(
      (linha) => linha.tipo === TIPOS_EVENTO_ATENDIMENTO.atendimentoReaberto,
    )
    expect(reabertura).toBeDefined()
    expect(reabertura?.visivelCliente).toBe(true)
    expect(reabertura?.descricao).toContain('reaberto após solicitação do cliente')

    const metadados = reabertura?.metadados as {
      de?: string
      para?: string
      solicitacaoId?: string
      motivoDoCliente?: string
      reabertoPor?: string
      conclusaoAnterior?: { observacaoFinal?: string | null }
    }
    expect(metadados.de).toBe('concluido')
    expect(metadados.para).toBe('em_andamento')
    expect(metadados.solicitacaoId).toBe(solicitacaoId)
    expect(metadados.motivoDoCliente).toBe(MOTIVO)
    expect(metadados.reabertoPor).toBe(contas.ana.id)
    // O ciclo anterior fica retratado no Histórico: as colunas da conclusão
    // guardam só a mais recente, e uma conclusão futura vai sobrescrevê-las.
    expect(metadados.conclusaoAnterior?.observacaoFinal).toBe(
      'Entrega concluída conforme combinado.',
    )

    // Nenhuma alteração genérica de status foi gravada junto.
    const genericos = eventos.filter(
      (linha) =>
        linha.tipo === TIPOS_EVENTO_ATENDIMENTO.statusAlterado &&
        (linha.metadados as { para?: string })?.para === 'em_andamento' &&
        (linha.metadados as { de?: string })?.de === 'concluido',
    )
    expect(genericos).toHaveLength(0)
  })

  it('publica a decisão no Protocolo e avisa os dois lados', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)
    await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
      resposta: 'Vamos corrigir.',
    })

    const manifestacoes = await manifestacoesDo(atendimentoId)
    const decisao = manifestacoes.at(-1)
    expect(decisao?.papelAutor).toBe('participante')
    expect(decisao?.visibilidade).toBe('participantes_e_cliente')
    expect(decisao?.conteudo).toContain('aceita')
    expect(decisao?.conteudo).toContain('Vamos corrigir.')

    const paraMarina = await notificacoesDe(contas.marina.id, 'ajuste_analisado')
    expect(paraMarina).toHaveLength(1)
    expect(paraMarina[0].titulo).toContain('foi aceita')

    // Aceitar move o card de coluna: para as telas abertas isso é um evento de
    // status, com o tom de sucesso do design system.
    const pessoal = publicados.find(
      ({ canal }) => canal === canalDoUsuario(contas.marina.id),
    )
    expect(pessoal?.evento.tipo).toBe('status')
    expect(pessoal?.evento.severidade).toBe('sucesso')
  })

  it('o card sai de Concluído e entra em Em andamento, sem mexer no total', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)

    const antes = contarIndicadores(
      (await listarAtendimentosDoPrestador(contas.ana.id)).map((dto) =>
        mapearAtendimentoParaCard(dto, contas.ana.id),
      ),
    )
    expect(antes.concluidos).toBe(1)
    expect(antes.andamento).toBe(0)

    await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
    })

    const cards = (await listarAtendimentosDoPrestador(contas.ana.id)).map(
      (dto) => mapearAtendimentoParaCard(dto, contas.ana.id),
    )
    const depois = contarIndicadores(cards)
    expect(depois.concluidos).toBe(0)
    expect(depois.andamento).toBe(1)
    expect(depois.total).toBe(antes.total)

    const card = cards.find((linha) => linha.real?.atendimentoId === atendimentoId)
    expect(card?.status).toBe('andamento')
    // A solicitação chega ao painel junto do card, para a análise acontecer no
    // próprio drawer.
    expect(card?.real?.adjustment?.status).toBe('aceita')
  })
})

describe('recusar', () => {
  it('mantém o Atendimento concluído e registra a justificativa', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)

    const resultado = await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'recusar',
      resposta: 'O endereço usado foi o que constava no cadastro enviado.',
    })
    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) return
    expect(resultado.reaberto).toBe(false)

    expect((await atendimentoPor(atendimentoId)).status).toBe('concluido')

    const linha = await solicitacaoPor(solicitacaoId)
    expect(linha.status).toBe('recusada')
    expect(linha.resposta).toBe(
      'O endereço usado foi o que constava no cadastro enviado.',
    )
    expect(linha.reaberturaEventoId).toBeNull()
  })

  it('recusa sem justificativa não é aceita', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)

    const resultado = await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'recusar',
      resposta: '  ',
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) {
      expect(resultado.motivo).toBe('justificativa-obrigatoria')
    }
    expect((await solicitacaoPor(solicitacaoId)).status).toBe('pendente')
  })

  it('o Cliente recebe a resposta no Protocolo, no Histórico e no sino', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)
    await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'recusar',
      resposta: 'O endereço usado foi o que constava no cadastro enviado.',
    })

    const [dto] = await listarAtendimentosDoCliente(contas.marina.id)
    expect(dto.status).toBe('concluido')
    expect(dto.ajuste?.status).toBe('recusada')
    expect(dto.ajuste?.resposta).toContain('cadastro enviado')
    expect(dto.ajuste?.analisadoPorNome).toBe('Teste ana')
    expect(
      dto.manifestacoes.some((linha) =>
        linha.conteudo.includes('permanece concluído'),
      ),
    ).toBe(true)
    expect(
      dto.eventos.some((linha) =>
        linha.tipo === TIPOS_EVENTO_ATENDIMENTO.ajusteRecusado,
      ),
    ).toBe(true)

    const paraMarina = await notificacoesDe(contas.marina.id, 'ajuste_analisado')
    expect(paraMarina).toHaveLength(1)
    expect(paraMarina[0].titulo).toContain('foi analisada')
  })
})

describe('idempotência e concorrência da análise', () => {
  it('analisar duas vezes não duplica decisão, aviso nem histórico', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)

    const primeira = await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
    })
    const segunda = await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
    })

    expect(primeira.sucesso).toBe(true)
    expect(segunda.sucesso).toBe(false)
    if (!segunda.sucesso) expect(segunda.motivo).toBe('ja-analisada')

    const eventos = await eventosDo(atendimentoId)
    expect(
      eventos.filter(
        (linha) => linha.tipo === TIPOS_EVENTO_ATENDIMENTO.atendimentoReaberto,
      ),
    ).toHaveLength(1)
    expect(
      eventos.filter(
        (linha) => linha.tipo === TIPOS_EVENTO_ATENDIMENTO.ajusteAceito,
      ),
    ).toHaveLength(1)
    expect(await notificacoesDe(contas.marina.id, 'ajuste_analisado')).toHaveLength(1)
  })

  it('aceite e recusa simultâneos: uma decisão única prevalece', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)
    await db
      .update(atendimentos)
      .set({ responsavelId: contas.bruno.id })
      .where(eq(atendimentos.id, atendimentoId))

    const [aceite, recusa] = await Promise.all([
      analisarSolicitacaoDeAjuste({
        solicitacaoId,
        usuarioId: contas.ana.id,
        decisao: 'aceitar',
      }),
      analisarSolicitacaoDeAjuste({
        solicitacaoId,
        usuarioId: contas.bruno.id,
        decisao: 'recusar',
        resposta: 'Já havíamos conferido este ponto com o cliente.',
      }),
    ])

    const vencedoras = [aceite, recusa].filter((linha) => linha.sucesso)
    expect(vencedoras).toHaveLength(1)

    const linha = await solicitacaoPor(solicitacaoId)
    const atendimento = await atendimentoPor(atendimentoId)
    // O estado do Atendimento acompanha a decisão que venceu — nunca as duas.
    if (linha.status === 'aceita') {
      expect(atendimento.status).toBe('em_andamento')
    } else {
      expect(linha.status).toBe('recusada')
      expect(atendimento.status).toBe('concluido')
    }

    const eventos = await eventosDo(atendimentoId)
    expect(
      eventos.filter(
        (evento) =>
          evento.tipo === TIPOS_EVENTO_ATENDIMENTO.ajusteAceito ||
          evento.tipo === TIPOS_EVENTO_ATENDIMENTO.ajusteRecusado,
      ),
    ).toHaveLength(1)
  })
})

describe('novo ciclo de conclusão', () => {
  it('o Atendimento reaberto pode ser concluído de novo', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)
    await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
    })

    const segunda = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Endereço corrigido e documento reenviado.',
    })
    expect(segunda.sucesso).toBe(true)
    if (!segunda.sucesso) return
    expect(segunda.de).toBe('em_andamento')

    const linha = await atendimentoPor(atendimentoId)
    expect(linha.status).toBe('concluido')
    expect(linha.observacaoFinal).toBe(
      'Endereço corrigido e documento reenviado.',
    )

    // A solicitação que provocou a reabertura fica encerrada: o ciclo dela
    // terminou com esta entrega.
    expect((await solicitacaoPor(solicitacaoId)).status).toBe('encerrada')
  })

  it('os dois ciclos sobrevivem no Histórico', async () => {
    const atendimentoId = await atendimentoConcluido()
    const solicitacaoId = await pedirAjuste(atendimentoId)
    await analisarSolicitacaoDeAjuste({
      solicitacaoId,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
    })
    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Endereço corrigido e documento reenviado.',
    })

    const eventos = await eventosDo(atendimentoId)
    const conclusoes = eventos.filter(
      (linha) => linha.tipo === TIPOS_EVENTO_ATENDIMENTO.atendimentoConcluido,
    )
    expect(conclusoes).toHaveLength(2)
    expect(
      (conclusoes[1].metadados as { conclusaoAposReabertura?: boolean })
        ?.conclusaoAposReabertura,
    ).toBe(true)

    // A observação da primeira entrega não se perdeu quando a segunda
    // sobrescreveu a coluna.
    const reabertura = eventos.find(
      (linha) => linha.tipo === TIPOS_EVENTO_ATENDIMENTO.atendimentoReaberto,
    )
    expect(
      (
        reabertura?.metadados as {
          conclusaoAnterior?: { observacaoFinal?: string | null }
        }
      )?.conclusaoAnterior?.observacaoFinal,
    ).toBe('Entrega concluída conforme combinado.')
  })

  it('depois do novo ciclo, o Cliente pode pedir outro ajuste', async () => {
    const atendimentoId = await atendimentoConcluido()
    const primeira = await pedirAjuste(atendimentoId)
    await analisarSolicitacaoDeAjuste({
      solicitacaoId: primeira,
      usuarioId: contas.ana.id,
      decisao: 'aceitar',
    })
    await concluirAtendimento({ atendimentoId, usuarioId: contas.ana.id })

    const segunda = await solicitarAjusteNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      motivo: 'Ainda falta a segunda via.',
    })
    expect(segunda.sucesso).toBe(true)
  })
})

describe('privacidade entre Atendimentos', () => {
  it('a solicitação não aparece no Atendimento vizinho', async () => {
    const comPedido = await atendimentoConcluido('Serviço com pedido')
    const semPedido = await atendimentoConcluido('Serviço sem pedido')
    await pedirAjuste(comPedido)

    const dtos = await listarAtendimentosDoPrestador(contas.ana.id)
    const alvo = dtos.find((dto) => dto.id === comPedido)
    const vizinho = dtos.find((dto) => dto.id === semPedido)
    expect(alvo?.ajuste?.motivo).toBe(MOTIVO)
    expect(vizinho?.ajuste).toBeNull()
  })

  it('outro Cliente não enxerga o pedido em lugar nenhum', async () => {
    const atendimentoId = await atendimentoConcluido()
    await pedirAjuste(atendimentoId)

    const doOutro = await listarAtendimentosDoCliente(contas.outroCliente.id)
    expect(doOutro).toHaveLength(0)

    const [meu] = await listarAtendimentosDoCliente(contas.marina.id)
    expect(meu.ajuste?.motivo).toBe(MOTIVO)
    expect(meu.ajuste?.status).toBe('pendente')
  })

  it('prestador sem vínculo não recebe o Atendimento com o pedido', async () => {
    const atendimentoId = await atendimentoConcluido()
    await pedirAjuste(atendimentoId)

    const doEstranho = await listarAtendimentosDoPrestador(contas.estranho.id)
    expect(
      doEstranho.some((dto) => dto.id === atendimentoId),
    ).toBe(false)
  })
})
