import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventoRealtime } from '@/integracoes/realtime/eventos'

/**
 * Entrega e conclusão do Atendimento.
 *
 * Dois pontos simulados, e só dois:
 *
 * - a saída para o Pusher, porque o que interessa medir é **o que a aplicação
 *   decide publicar** depois de gravar — em que canais, com que texto e com que
 *   severidade. A rede não é o objeto do teste;
 * - o armazenamento privado dos anexos, pelo mesmo motivo de sempre: a validação
 *   de tipo e tamanho continua real, o upload de bytes não.
 *
 * Todo o resto roda de verdade contra o Postgres da suíte: autorização, status,
 * Protocolo, Histórico, notificações, concorrência.
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
  atendimentoArquivos,
  atendimentoChecklistItens,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoMensagens,
  atendimentoParticipantes,
  atendimentos,
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
const { anexarArquivoNoAtendimento } = await import(
  '@/features/atendimentos/lib/anexar-arquivo'
)
const { adicionarItemDoChecklist } = await import(
  '@/features/atendimentos/lib/checklist'
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

const SUFIXO = '@conclusao-atendimento.teste'

type Chave = 'ana' | 'bruno' | 'convidada' | 'estranho' | 'marina' | 'outroCliente'
type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>

const SERVICO_BASE = {
  nome: 'Abertura de Empresa',
  descricaoCurta: 'Abertura completa de MEI.',
  descricaoDetalhada: 'Inclui CNPJ e alvará.',
  categoria: 'contabil' as const,
  itensIncluidos: ['CNPJ'],
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
 * Um Atendimento real de Ana para Marina, já em andamento.
 *
 * É o estado de onde a conclusão parte na vida real: contratado, aberto e com o
 * trabalho começado. Nada é inserido à mão — passa pelo catálogo e pela
 * contratação de verdade.
 */
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

async function anexar(atendimentoId: string, usuarioId: string, nome: string) {
  const anexado = await anexarArquivoNoAtendimento({
    atendimentoId,
    usuarioId,
    arquivo: new File(['conteudo de teste'], nome, { type: 'text/plain' }),
  })
  publicados.length = 0
  return anexado
}

function statusDoAtendimento(atendimentoId: string) {
  return db
    .select({
      status: atendimentos.status,
      concluidoEm: atendimentos.concluidoEm,
      concluidoPor: atendimentos.concluidoPor,
      observacaoFinal: atendimentos.observacaoFinal,
      responsavelId: atendimentos.responsavelId,
      protocolo: atendimentos.protocolo,
    })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimentoId))
    .then(([linha]) => linha)
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
    '119480',
  )
  publicados.length = 0
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('conclusão autorizada', () => {
  it('muda o status para Concluído e grava data e autor', async () => {
    const atendimentoId = await atendimentoEmAndamento()

    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Serviço concluído. Documentos finais em Arquivos.',
    })

    expect(resultado.sucesso).toBe(true)
    if (!resultado.sucesso) return
    expect(resultado.de).toBe('em_andamento')

    const linha = await statusDoAtendimento(atendimentoId)
    expect(linha.status).toBe('concluido')
    expect(linha.concluidoEm).not.toBeNull()
    expect(linha.concluidoPor).toBe(contas.ana.id)
    expect(linha.observacaoFinal).toBe(
      'Serviço concluído. Documentos finais em Arquivos.',
    )
  })

  it('a data e o autor não dependem do histórico para serem lidos', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await concluirAtendimento({ atendimentoId, usuarioId: contas.ana.id })

    // Apagar a linha do tempo não pode apagar quando e por quem o serviço foi
    // concluído: são colunas do Atendimento, não uma leitura de eventos.
    await db
      .delete(atendimentoEventos)
      .where(eq(atendimentoEventos.atendimentoId, atendimentoId))

    const [dto] = await listarAtendimentosDoPrestador(contas.ana.id)
    expect(dto.conclusao?.em).toBeTruthy()
    expect(dto.conclusao?.porNome).toBe('Teste ana')
  })

  it('o responsável conclui mesmo não sendo o dono da carteira', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await db
      .update(atendimentos)
      .set({ responsavelId: contas.bruno.id })
      .where(eq(atendimentos.id, atendimentoId))

    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.bruno.id,
    })
    expect(resultado.sucesso).toBe(true)

    // Quem concluiu fica registrado; o responsável principal não é trocado.
    const linha = await statusDoAtendimento(atendimentoId)
    expect(linha.concluidoPor).toBe(contas.bruno.id)
    expect(linha.responsavelId).toBe(contas.bruno.id)
  })
})

describe('observação final', () => {
  it('é persistida como dado da conclusão, e não só como mensagem', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: '  Tudo entregue conforme combinado.  ',
    })

    const linha = await statusDoAtendimento(atendimentoId)
    expect(linha.observacaoFinal).toBe('Tudo entregue conforme combinado.')
  })

  it('conclusão sem observação deixa a coluna nula, sem texto inventado', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await concluirAtendimento({ atendimentoId, usuarioId: contas.ana.id })

    const linha = await statusDoAtendimento(atendimentoId)
    expect(linha.observacaoFinal).toBeNull()
  })
})

describe('arquivos de entrega', () => {
  it('marca como entrega final os arquivos escolhidos, e só eles', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    const entrega = await anexar(atendimentoId, contas.ana.id, 'contrato.txt')
    const avulso = await anexar(atendimentoId, contas.ana.id, 'rascunho.txt')

    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      arquivoIds: [entrega.id],
    })
    expect(resultado.sucesso).toBe(true)
    if (resultado.sucesso) expect(resultado.arquivosDeEntrega).toBe(1)

    const arquivos = await db
      .select({ id: atendimentoArquivos.id, finalidade: atendimentoArquivos.finalidade })
      .from(atendimentoArquivos)
      .where(eq(atendimentoArquivos.atendimentoId, atendimentoId))

    const porId = new Map(arquivos.map((a) => [a.id, a.finalidade]))
    expect(porId.get(entrega.id)).toBe('entrega_final')
    expect(porId.get(avulso.id)).toBe('anexo')
  })

  it('reaproveita a tabela de arquivos existente — nenhum registro novo é criado', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    const entrega = await anexar(atendimentoId, contas.ana.id, 'contrato.txt')

    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      arquivoIds: [entrega.id],
    })

    const arquivos = await db
      .select({ id: atendimentoArquivos.id })
      .from(atendimentoArquivos)
      .where(eq(atendimentoArquivos.atendimentoId, atendimentoId))
    expect(arquivos).toHaveLength(1)
  })

  it('registra no histórico que houve entrega, visível ao Cliente', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    const entrega = await anexar(atendimentoId, contas.ana.id, 'contrato.txt')
    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      arquivoIds: [entrega.id],
    })

    const eventos = await eventosDo(atendimentoId)
    const entregaRegistrada = eventos.find(
      (e) => e.tipo === 'entrega_final_registrada',
    )
    expect(entregaRegistrada).toBeDefined()
    expect(entregaRegistrada?.visivelCliente).toBe(true)
    expect(entregaRegistrada?.metadados).toMatchObject({
      arquivoIds: [entrega.id],
    })
  })
})

describe('conclusão sem arquivo', () => {
  it('é permitida e não cria entrega fictícia', async () => {
    const atendimentoId = await atendimentoEmAndamento()

    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Consultoria realizada por telefone. Sem documentos.',
    })

    expect(resultado.sucesso).toBe(true)
    if (resultado.sucesso) expect(resultado.arquivosDeEntrega).toBe(0)

    const arquivos = await db
      .select({ id: atendimentoArquivos.id })
      .from(atendimentoArquivos)
      .where(eq(atendimentoArquivos.atendimentoId, atendimentoId))
    expect(arquivos).toHaveLength(0)

    const eventos = await eventosDo(atendimentoId)
    expect(eventos.some((e) => e.tipo === 'entrega_final_registrada')).toBe(false)

    // O Cliente lê a observação mesmo sem nenhum documento envolvido.
    const [doCliente] = await listarAtendimentosDoCliente(contas.marina.id)
    expect(doCliente.conclusao?.observacaoFinal).toBe(
      'Consultoria realizada por telefone. Sem documentos.',
    )
    expect(doCliente.conclusao?.arquivosDeEntrega).toBe(0)
  })
})

describe('checklist antes de concluir', () => {
  it('recusa enquanto houver etapa pendente e não confirmada', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await adicionarItemDoChecklist({
      atendimentoId,
      usuarioId: contas.ana.id,
      titulo: 'Enviar contrato assinado',
    })

    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
    })

    expect(resultado.sucesso).toBe(false)
    if (resultado.sucesso) return
    expect(resultado.motivo).toBe('checklist-pendente')
    expect(resultado.pendentes).toBe(1)

    // A recusa não deixa rastro: o Atendimento continua onde estava.
    const linha = await statusDoAtendimento(atendimentoId)
    expect(linha.status).toBe('em_andamento')
    expect(linha.concluidoEm).toBeNull()
  })

  it('conclui com confirmação explícita e não marca nenhuma etapa', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await adicionarItemDoChecklist({
      atendimentoId,
      usuarioId: contas.ana.id,
      titulo: 'Enviar contrato assinado',
    })
    await adicionarItemDoChecklist({
      atendimentoId,
      usuarioId: contas.ana.id,
      titulo: 'Conferência interna',
      visibilidade: 'interno',
    })

    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      confirmarPendencias: true,
    })
    expect(resultado.sucesso).toBe(true)

    const itens = await db
      .select({ concluido: atendimentoChecklistItens.concluido })
      .from(atendimentoChecklistItens)
      .where(eq(atendimentoChecklistItens.atendimentoId, atendimentoId))
    expect(itens).toHaveLength(2)
    expect(itens.every((item) => item.concluido === false)).toBe(true)

    // O histórico guarda quantas etapas ficaram abertas: a decisão é auditável.
    const eventos = await eventosDo(atendimentoId)
    const conclusao = eventos.find((e) => e.tipo === 'atendimento_concluido')
    expect(conclusao?.metadados).toMatchObject({ etapasPendentes: 2 })
  })
})

describe('status', () => {
  it('registra a transição de origem e destino no histórico', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await concluirAtendimento({ atendimentoId, usuarioId: contas.ana.id })

    const eventos = await eventosDo(atendimentoId)
    const conclusao = eventos.find((e) => e.tipo === 'atendimento_concluido')
    expect(conclusao?.visivelCliente).toBe(true)
    expect(conclusao?.descricao).toBe('Teste ana concluiu o atendimento.')
    expect(conclusao?.metadados).toMatchObject({
      de: 'em_andamento',
      para: 'concluido',
      deRotulo: 'Em andamento',
      paraRotulo: 'Concluído',
      concluidoPor: contas.ana.id,
    })
  })

  it('não volta para Em andamento: Concluído é terminal', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await concluirAtendimento({ atendimentoId, usuarioId: contas.ana.id })

    const volta = await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      destino: 'em_andamento',
    })
    expect(volta.sucesso).toBe(false)

    const linha = await statusDoAtendimento(atendimentoId)
    expect(linha.status).toBe('concluido')
  })

  it('a troca genérica de status não encerra o Atendimento pela lateral', async () => {
    const atendimentoId = await atendimentoEmAndamento()

    const atalho = await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      destino: 'concluido',
    })
    expect(atalho.sucesso).toBe(false)
    if (!atalho.sucesso) expect(atalho.motivo).toBe('transicao-invalida')

    const linha = await statusDoAtendimento(atendimentoId)
    expect(linha.status).toBe('em_andamento')
    expect(linha.concluidoEm).toBeNull()
  })

  it('concluir a partir de um status que não permite é recusado', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await db
      .update(atendimentos)
      .set({ status: 'novo' })
      .where(eq(atendimentos.id, atendimentoId))

    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('transicao-invalida')
  })

  it('aguardando assinatura também conclui', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      destino: 'aguardando_assinatura',
    })

    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
    })
    expect(resultado.sucesso).toBe(true)
    if (resultado.sucesso) expect(resultado.de).toBe('aguardando_assinatura')
  })
})

describe('manifestação no Protocolo', () => {
  it('publica a conclusão como registro formal legível por todos', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    const entrega = await anexar(atendimentoId, contas.ana.id, 'contrato.txt')

    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Comprovante emitido.',
      arquivoIds: [entrega.id],
    })

    const linhas = await manifestacoesDo(atendimentoId)
    expect(linhas).toHaveLength(1)
    const [manifestacao] = linhas
    expect(manifestacao.papelAutor).toBe('participante')
    // O fecho do registro formal é de todos: não é uma réplica dirigida.
    expect(manifestacao.visibilidade).toBe('participantes_e_cliente')
    expect(manifestacao.autorId).toBe(contas.ana.id)
    expect(manifestacao.conteudo).toContain('Atendimento concluído.')
    expect(manifestacao.conteudo).toContain('Comprovante emitido.')
    expect(manifestacao.conteudo).toContain('aba Arquivos')
    // Um único arquivo é citado direto; com vários, nenhum seria destacado.
    expect(manifestacao.arquivoId).toBe(entrega.id)
  })

  it('sem entrega, o texto não promete arquivo nenhum', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await concluirAtendimento({ atendimentoId, usuarioId: contas.ana.id })

    const [manifestacao] = await manifestacoesDo(atendimentoId)
    expect(manifestacao.conteudo).toBe('Atendimento concluído.')
    expect(manifestacao.arquivoId).toBeNull()
  })

  it('não escreve nada na Conversa', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Entregue.',
    })

    const mensagens = await db
      .select({ id: atendimentoMensagens.id })
      .from(atendimentoMensagens)
      .where(eq(atendimentoMensagens.atendimentoId, atendimentoId))
    expect(mensagens).toHaveLength(0)
  })
})

describe('notificação', () => {
  it('avisa o Cliente com a frase dele e a equipe com a dela', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await db.insert(atendimentoParticipantes).values({
      atendimentoId,
      usuarioId: contas.convidada.id,
      papel: 'convidado',
    })

    await concluirAtendimento({ atendimentoId, usuarioId: contas.ana.id })
    const { protocolo } = await statusDoAtendimento(atendimentoId)

    const avisos = await db
      .select({
        destinatarioId: notificacoes.destinatarioId,
        tipo: notificacoes.tipo,
        titulo: notificacoes.titulo,
        protocolo: notificacoes.protocolo,
        destino: notificacoes.destino,
      })
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.atendimentoId, atendimentoId),
          eq(notificacoes.tipo, 'atendimento_concluido'),
        ),
      )

    const doCliente = avisos.find((a) => a.destinatarioId === contas.marina.id)
    expect(doCliente?.titulo).toBe(`Seu atendimento ${protocolo} foi concluído.`)
    expect(doCliente?.protocolo).toBe(protocolo)

    const daConvidada = avisos.find((a) => a.destinatarioId === contas.convidada.id)
    expect(daConvidada?.titulo).toBe(`${protocolo} foi concluído por Teste ana.`)

    // Ninguém é avisado da própria ação.
    expect(avisos.some((a) => a.destinatarioId === contas.ana.id)).toBe(false)
  })

  it('sem entrega o clique do Cliente cai no Protocolo; com entrega, em Arquivos', async () => {
    const semArquivo = await atendimentoEmAndamento('Consultoria avulsa')
    await concluirAtendimento({
      atendimentoId: semArquivo,
      usuarioId: contas.ana.id,
    })

    const comArquivo = await atendimentoEmAndamento('Abertura com entrega')
    const entrega = await anexar(comArquivo, contas.ana.id, 'contrato.txt')
    await concluirAtendimento({
      atendimentoId: comArquivo,
      usuarioId: contas.ana.id,
      arquivoIds: [entrega.id],
    })

    const avisos = await db
      .select({
        atendimentoId: notificacoes.atendimentoId,
        destino: notificacoes.destino,
      })
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.destinatarioId, contas.marina.id),
          eq(notificacoes.tipo, 'atendimento_concluido'),
        ),
      )

    const doSemArquivo = avisos.find((a) => a.atendimentoId === semArquivo)
    const doComArquivo = avisos.find((a) => a.atendimentoId === comArquivo)
    expect(doSemArquivo?.destino).toMatchObject({ aba: 'protocolo' })
    expect(doComArquivo?.destino).toMatchObject({ aba: 'arquivos' })
  })
})

describe('tempo real', () => {
  it('publica no canal de cada pessoa e uma única vez no canal do Atendimento', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await db.insert(atendimentoParticipantes).values({
      atendimentoId,
      usuarioId: contas.convidada.id,
      papel: 'convidado',
    })

    await concluirAtendimento({ atendimentoId, usuarioId: contas.ana.id })
    const { protocolo } = await statusDoAtendimento(atendimentoId)

    const noCanalDoAtendimento = publicados.filter(
      (envio) => envio.canal === canalDoAtendimento(atendimentoId),
    )
    // O canal do Atendimento leva "algo mudou", sem texto, e uma vez só —
    // mesmo com duas redações de audiência diferentes.
    expect(noCanalDoAtendimento).toHaveLength(1)
    expect(noCanalDoAtendimento[0].evento.titulo).toBeFalsy()
    expect(noCanalDoAtendimento[0].evento.tipo).toBe('status')

    const paraMarina = publicados.find(
      (envio) => envio.canal === canalDoUsuario(contas.marina.id),
    )
    expect(paraMarina?.evento.titulo).toBe(
      `Seu atendimento ${protocolo} foi concluído.`,
    )
    // Conclusão é boa notícia: variante de sucesso do design system.
    expect(paraMarina?.evento.severidade).toBe('sucesso')

    const paraConvidada = publicados.find(
      (envio) => envio.canal === canalDoUsuario(contas.convidada.id),
    )
    expect(paraConvidada?.evento.titulo).toBe(
      `${protocolo} foi concluído por Teste ana.`,
    )

    // Quem concluiu não recebe aviso da própria ação.
    expect(
      publicados.some((envio) => envio.canal === canalDoUsuario(contas.ana.id)),
    ).toBe(false)
  })

  it('nenhum evento carrega o texto da observação final', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Detalhe sigiloso do parecer.',
    })

    const serializado = JSON.stringify(publicados)
    expect(serializado).not.toContain('Detalhe sigiloso')
  })
})

describe('idempotência e concorrência', () => {
  it('a segunda conclusão é recusada e não duplica nada', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    const entrega = await anexar(atendimentoId, contas.ana.id, 'contrato.txt')

    const primeira = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Primeira.',
      arquivoIds: [entrega.id],
    })
    expect(primeira.sucesso).toBe(true)

    const segunda = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Segunda.',
      arquivoIds: [entrega.id],
    })
    expect(segunda.sucesso).toBe(false)
    if (!segunda.sucesso) expect(segunda.motivo).toBe('ja-concluido')

    expect(await manifestacoesDo(atendimentoId)).toHaveLength(1)

    const eventos = await eventosDo(atendimentoId)
    expect(eventos.filter((e) => e.tipo === 'atendimento_concluido')).toHaveLength(1)
    expect(
      eventos.filter((e) => e.tipo === 'entrega_final_registrada'),
    ).toHaveLength(1)

    const avisos = await db
      .select({ id: notificacoes.id })
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.atendimentoId, atendimentoId),
          eq(notificacoes.destinatarioId, contas.marina.id),
          eq(notificacoes.tipo, 'atendimento_concluido'),
        ),
      )
    expect(avisos).toHaveLength(1)

    // A segunda tentativa não reescreve a observação da primeira.
    const linha = await statusDoAtendimento(atendimentoId)
    expect(linha.observacaoFinal).toBe('Primeira.')
  })

  it('duas conclusões simultâneas: uma só prevalece', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await db
      .update(atendimentos)
      .set({ responsavelId: contas.bruno.id })
      .where(eq(atendimentos.id, atendimentoId))

    const resultados = await Promise.all([
      concluirAtendimento({
        atendimentoId,
        usuarioId: contas.ana.id,
        observacaoFinal: 'Pela Ana.',
      }),
      concluirAtendimento({
        atendimentoId,
        usuarioId: contas.bruno.id,
        observacaoFinal: 'Pelo Bruno.',
      }),
    ])

    expect(resultados.filter((r) => r.sucesso)).toHaveLength(1)

    const linha = await statusDoAtendimento(atendimentoId)
    expect(linha.status).toBe('concluido')
    expect([contas.ana.id, contas.bruno.id]).toContain(linha.concluidoPor)

    // Estado único: uma conclusão, uma manifestação, um evento.
    expect(await manifestacoesDo(atendimentoId)).toHaveLength(1)
    const eventos = await eventosDo(atendimentoId)
    expect(eventos.filter((e) => e.tipo === 'atendimento_concluido')).toHaveLength(1)
  })
})

describe('autorização', () => {
  it('o Cliente não conclui o próprio atendimento', async () => {
    const atendimentoId = await atendimentoEmAndamento()

    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('sem-acesso')

    const linha = await statusDoAtendimento(atendimentoId)
    expect(linha.status).toBe('em_andamento')
  })

  it('prestador sem vínculo não conclui nem sabendo o id', async () => {
    const atendimentoId = await atendimentoEmAndamento()

    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.estranho.id,
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('sem-acesso')
  })

  it('convite pendente não conclui: participação só existe depois do aceite', async () => {
    const atendimentoId = await atendimentoEmAndamento()

    // Sem linha em `atendimento_participantes`, não há vínculo nenhum.
    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.convidada.id,
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('sem-acesso')
  })

  it('participante convidado trabalha no Atendimento mas não o encerra', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await db.insert(atendimentoParticipantes).values({
      atendimentoId,
      usuarioId: contas.convidada.id,
      papel: 'convidado',
    })

    const resultado = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.convidada.id,
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('sem-acesso')

    // E a tela dele nem chega a oferecer o botão.
    const [dto] = await listarAtendimentosDoPrestador(contas.convidada.id)
    expect(dto.acoes.map((a) => a.destino)).not.toContain('concluido')

    // Para quem responde pelo Atendimento, a ação continua disponível.
    const [daAna] = await listarAtendimentosDoPrestador(contas.ana.id)
    expect(daAna.acoes.map((a) => a.destino)).toContain('concluido')
  })

  it('arquivo de outro Atendimento não entra como entrega', async () => {
    const meu = await atendimentoEmAndamento('Serviço A')
    const outro = await atendimentoEmAndamento('Serviço B')
    const alheio = await anexar(outro, contas.ana.id, 'alheio.txt')

    const resultado = await concluirAtendimento({
      atendimentoId: meu,
      usuarioId: contas.ana.id,
      arquivoIds: [alheio.id],
    })
    expect(resultado.sucesso).toBe(false)
    if (!resultado.sucesso) expect(resultado.motivo).toBe('arquivo-invalido')

    // A recusa é total: o Atendimento não foi concluído pela metade.
    const linha = await statusDoAtendimento(meu)
    expect(linha.status).toBe('em_andamento')

    const [arquivo] = await db
      .select({ finalidade: atendimentoArquivos.finalidade })
      .from(atendimentoArquivos)
      .where(eq(atendimentoArquivos.id, alheio.id))
    expect(arquivo.finalidade).toBe('anexo')
  })
})

describe('portal do Cliente', () => {
  it('lê a entrega: status, data, autor, observação e arquivos', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    const entrega = await anexar(atendimentoId, contas.ana.id, 'contrato.txt')
    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Documentos finais disponíveis.',
      arquivoIds: [entrega.id],
    })

    const [doCliente] = await listarAtendimentosDoCliente(contas.marina.id)
    expect(doCliente.status).toBe('concluido')
    expect(doCliente.conclusao?.em).toBeTruthy()
    expect(doCliente.conclusao?.porNome).toBe('Teste ana')
    expect(doCliente.conclusao?.observacaoFinal).toBe(
      'Documentos finais disponíveis.',
    )
    expect(doCliente.conclusao?.arquivosDeEntrega).toBe(1)
    expect(doCliente.prestador.nome).toBe('Teste ana')

    const arquivoEntregue = doCliente.arquivos.find((a) => a.id === entrega.id)
    expect(arquivoEntregue?.finalidade).toBe('entrega_final')

    // O Protocolo do Cliente traz a manifestação formal da conclusão.
    expect(
      doCliente.manifestacoes.some((m) =>
        m.conteudo.includes('Atendimento concluído.'),
      ),
    ).toBe(true)

    // O Histórico dele mostra a conclusão e a entrega.
    const tipos = doCliente.eventos.map((e) => e.tipo)
    expect(tipos).toContain('atendimento_concluido')
    expect(tipos).toContain('entrega_final_registrada')
  })

  it('o Cliente proprietário baixa a entrega; outro Cliente não alcança', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    const entrega = await anexar(atendimentoId, contas.ana.id, 'contrato.txt')
    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      arquivoIds: [entrega.id],
    })

    expect(
      await obterArquivoDoAtendimento({
        atendimentoId,
        arquivoId: entrega.id,
        usuarioId: contas.marina.id,
      }),
    ).not.toBeNull()

    // A equipe autorizada também alcança.
    expect(
      await obterArquivoDoAtendimento({
        atendimentoId,
        arquivoId: entrega.id,
        usuarioId: contas.ana.id,
      }),
    ).not.toBeNull()

    for (const intruso of [contas.outroCliente.id, contas.estranho.id]) {
      expect(
        await obterArquivoDoAtendimento({
          atendimentoId,
          arquivoId: entrega.id,
          usuarioId: intruso,
        }),
      ).toBeNull()
    }
  })

  it('outro Cliente não enxerga o atendimento concluído de ninguém', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    await concluirAtendimento({ atendimentoId, usuarioId: contas.ana.id })

    const lista = await listarAtendimentosDoCliente(contas.outroCliente.id)
    expect(lista).toHaveLength(0)
  })

  it('o Cliente é somente leitura: não altera status nem a entrega', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    const entrega = await anexar(atendimentoId, contas.ana.id, 'contrato.txt')
    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Do profissional.',
      arquivoIds: [entrega.id],
    })

    // Nenhuma transição a partir de Concluído, e nenhuma delas pelo Cliente.
    for (const destino of ['em_andamento', 'aguardando_cliente'] as const) {
      const tentativa = await alterarStatusDoAtendimento({
        atendimentoId,
        usuarioId: contas.marina.id,
        destino,
      })
      expect(tentativa.sucesso).toBe(false)
    }

    // Reconcluir para reescrever a observação também é recusado.
    const reconclusao = await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      observacaoFinal: 'Do cliente.',
    })
    expect(reconclusao.sucesso).toBe(false)

    const linha = await statusDoAtendimento(atendimentoId)
    expect(linha.status).toBe('concluido')
    expect(linha.observacaoFinal).toBe('Do profissional.')

    // O DTO do Cliente não carrega nenhuma ação de status.
    const [doCliente] = await listarAtendimentosDoCliente(contas.marina.id)
    expect(doCliente).not.toHaveProperty('acoes')
  })
})

describe('quadro, lista e contadores', () => {
  it('o card passa para a coluna Concluído e leva a entrega junto', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    const entrega = await anexar(atendimentoId, contas.ana.id, 'contrato.txt')
    await concluirAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      observacaoFinal: 'Tudo certo.',
      arquivoIds: [entrega.id],
    })

    const [dto] = await listarAtendimentosDoPrestador(contas.ana.id)
    const card = mapearAtendimentoParaCard(dto, contas.ana.id)

    expect(card.status).toBe('concluido')
    expect(card.real?.info.statusLabel).toBe('Concluído')
    expect(card.real?.conclusion?.byName).toBe('Teste ana')
    expect(card.real?.conclusion?.note).toBe('Tudo certo.')
    expect(card.real?.conclusion?.filesCount).toBe(1)
    expect(card.real?.files.find((f) => f.id === entrega.id)?.isDelivery).toBe(true)
    // Terminal: o menu de status fica sem opção nenhuma.
    expect(card.real?.actions).toHaveLength(0)
  })

  it('os contadores acompanham a mudança sem recontar nada à mão', async () => {
    const emAndamento = await atendimentoEmAndamento('Serviço A')
    await atendimentoEmAndamento('Serviço B')

    const antes = (await listarAtendimentosDoPrestador(contas.ana.id)).map((dto) =>
      mapearAtendimentoParaCard(dto, contas.ana.id),
    )
    expect(contarIndicadores(antes)).toMatchObject({
      total: 2,
      andamento: 2,
      concluidos: 0,
    })

    await concluirAtendimento({
      atendimentoId: emAndamento,
      usuarioId: contas.ana.id,
    })

    const depois = (await listarAtendimentosDoPrestador(contas.ana.id)).map((dto) =>
      mapearAtendimentoParaCard(dto, contas.ana.id),
    )
    expect(contarIndicadores(depois)).toMatchObject({
      total: 2,
      andamento: 1,
      concluidos: 1,
    })
  })

  it('o prazo, os participantes e o protocolo continuam corretos depois de concluir', async () => {
    const atendimentoId = await atendimentoEmAndamento()
    const [antes] = await listarAtendimentosDoPrestador(contas.ana.id)

    await concluirAtendimento({ atendimentoId, usuarioId: contas.ana.id })
    const [depois] = await listarAtendimentosDoPrestador(contas.ana.id)

    expect(depois.protocolo).toBe(antes.protocolo)
    expect(depois.prazoEm).toBe(antes.prazoEm)
    expect(depois.participantes).toEqual(antes.participantes)
    expect(depois.responsavel).toEqual(antes.responsavel)
    // Snapshot financeiro intacto: conclusão não é evento comercial.
    expect(depois.contratacao?.valorCentavos).toBe(antes.contratacao?.valorCentavos)
    expect(depois.contratacao?.modeloPreco).toBe(antes.contratacao?.modeloPreco)
  })
})

describe('modelos de preço', () => {
  it('conclui igual sob orçamento, por hora e a partir de', async () => {
    for (const modelo of ['sob_orcamento', 'por_hora', 'a_partir_de'] as const) {
      entrarComo(contas.ana.token)
      const servico = await criarServico({
        ...SERVICO_BASE,
        nome: `Serviço ${modelo}`,
        modeloPreco: modelo,
        valor: modelo === 'sob_orcamento' ? '' : '250,00',
      })
      if (!servico.sucesso) throw new Error(servico.mensagem)

      entrarComo(contas.marina.token)
      const contratacao = await contratarServico({
        servicoId: (servico as { dados: { id: string } }).dados.id,
      })
      if (!contratacao.sucesso) throw new Error(contratacao.mensagem)
      const { atendimentoId } = contratacao.dados as { atendimentoId: string }

      await alterarStatusDoAtendimento({
        atendimentoId,
        usuarioId: contas.ana.id,
        destino: 'em_andamento',
      })

      const [antes] = await db
        .select({ valor: contratacoesServico.valorSnapshotCentavos })
        .from(contratacoesServico)
        .where(eq(contratacoesServico.id, contratacao.dados.contratacaoId))

      const resultado = await concluirAtendimento({
        atendimentoId,
        usuarioId: contas.ana.id,
      })
      expect(resultado.sucesso).toBe(true)

      // O snapshot financeiro não é tocado pela conclusão.
      const [depois] = await db
        .select({ valor: contratacoesServico.valorSnapshotCentavos })
        .from(contratacoesServico)
        .where(eq(contratacoesServico.id, contratacao.dados.contratacaoId))
      expect(depois.valor).toBe(antes.valor)
    }
  })
})
