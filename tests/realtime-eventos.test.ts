import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventoRealtime } from '@/integracoes/realtime/eventos'

/**
 * Único ponto simulado: a saída para o Pusher.
 *
 * O que interessa medir é **o que a aplicação decide publicar** depois de
 * gravar — em que canais, com que conteúdo. A rede em si não é o objeto do
 * teste, e depender dela tornaria a suíte refém de credenciais.
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

const { db } = await import('@/db/connection')
const { atendimentoMensagens } = await import('@/db/schema')
const { convidarParaAtendimento, escreverNaNegociacao, responderConvite } =
  await import('@/features/atendimentos/lib/convites')
const { enviarMensagemNoAtendimento } = await import(
  '@/features/atendimentos/lib/mensagens'
)
const { publicarManifestacaoNoAtendimento } = await import(
  '@/features/atendimentos/lib/manifestacoes'
)
const { alterarStatusDoAtendimento } = await import(
  '@/features/atendimentos/lib/alterar-status'
)
const { criarServico } = await import('@/features/servicos/actions/catalogo')
const { contratarServico } = await import('@/features/servicos/actions/contratar')
const { canalDoAtendimento, canalDoConvite, canalDoUsuario } = await import(
  '@/integracoes/realtime/canais'
)
const { criarContas, limparContas } = await import('./setup/contas-de-teste')
const { entrarComo, sairDaSessao } = await import('./setup/sessao')
const { eq } = await import('drizzle-orm')

const SUFIXO = '@realtime-eventos.teste'

type Chave = 'ana' | 'ricardo' | 'marina'
let contas: Record<Chave, { id: string; token: string }>
let atendimentoId: string

const SERVICO_BASE = {
  nome: 'Abertura de Empresa',
  descricaoCurta: 'Abertura completa de MEI.',
  descricaoDetalhada: 'Inclui CNPJ e alvará.',
  categoria: 'contabil' as const,
  itensIncluidos: ['CNPJ'],
  checklistModelo: ['Documentos do sócio'],
  modeloPreco: 'fixo' as const,
  valor: '100,00',
  prazoEstimadoDias: 5,
  ativo: true,
  publico: true,
  ordem: 0,
}

beforeAll(async () => {
  contas = await criarContas<Chave>(
    SUFIXO,
    {
      ana: { perfil: 'profissional', prestador: 'profissional' },
      ricardo: { perfil: 'profissional', prestador: 'profissional' },
      marina: { perfil: 'cliente' },
    },
    '119470',
  )

  entrarComo(contas.ana.token)
  const servico = await criarServico(SERVICO_BASE)
  if (!servico.sucesso) throw new Error(servico.mensagem)

  entrarComo(contas.marina.token)
  const contratacao = await contratarServico({
    servicoId: (servico as { dados: { id: string } }).dados.id,
  })
  if (!contratacao.sucesso) throw new Error(contratacao.mensagem)
  sairDaSessao()
  atendimentoId = (contratacao.dados as { atendimentoId: string }).atendimentoId
}, 120_000)

beforeEach(() => {
  publicados.length = 0
})

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('a Conversa avisa em tempo real', () => {
  it('mensagem do Cliente chega ao canal da equipe e ao do Atendimento', async () => {
    const enviada = await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Bom dia, conseguem verificar o contrato?',
    })
    expect(enviada.sucesso).toBe(true)

    const canais = publicados.map((p) => p.canal)
    expect(canais).toContain(canalDoUsuario(contas.ana.id))
    expect(canais).toContain(canalDoAtendimento(atendimentoId))
    // O Cliente escreveu: ele não recebe aviso da própria mensagem.
    expect(canais).not.toContain(canalDoUsuario(contas.marina.id))

    const paraAna = publicados.find(
      (p) => p.canal === canalDoUsuario(contas.ana.id),
    )!
    expect(paraAna.evento.tipo).toBe('mensagem')
    expect(paraAna.evento.canalConversa).toBe('cliente')
    expect(paraAna.evento.aba).toBe('conversa')
    // Aviso, não conteúdo: o texto da mensagem não trafega.
    expect(JSON.stringify(publicados)).not.toContain('conseguem verificar')
  })

  it('nota interna não avisa o Cliente', async () => {
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      escopo: 'interno',
      conteudo: 'Conferir a procuração antes de responder.',
    })

    const canais = publicados.map((p) => p.canal)
    expect(canais).not.toContain(canalDoUsuario(contas.marina.id))
    expect(canais).toContain(canalDoAtendimento(atendimentoId))
  })

  it('o aviso só sai depois de a mensagem estar gravada', async () => {
    const enviada = await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      escopo: 'cliente',
      conteudo: 'Verificado, retornamos hoje.',
    })
    if (!enviada.sucesso) throw new Error(enviada.motivo)

    const [gravada] = await db
      .select({ id: atendimentoMensagens.id })
      .from(atendimentoMensagens)
      .where(eq(atendimentoMensagens.id, enviada.id))
      .limit(1)

    expect(gravada).toBeDefined()
    expect(publicados.length).toBeGreaterThan(0)
  })
})

describe('Protocolo e status avisam em tempo real', () => {
  it('manifestação do Cliente avisa a equipe apontando para o Protocolo', async () => {
    await publicarManifestacaoNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      conteudo: 'Segue a documentação solicitada.',
    })

    const paraAna = publicados.find(
      (p) => p.canal === canalDoUsuario(contas.ana.id),
    )
    expect(paraAna?.evento.tipo).toBe('manifestacao')
    expect(paraAna?.evento.aba).toBe('protocolo')
    // O texto da manifestação fica fora do evento: quem receber vai buscar o
    // Protocolo pela consulta que aplica a regra de visibilidade.
    expect(JSON.stringify(publicados)).not.toContain('documentação solicitada')
  })

  it('mudança de status avisa os dois lados', async () => {
    const alterado = await alterarStatusDoAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      destino: 'em_andamento',
    })
    expect(alterado.sucesso).toBe(true)

    const canais = publicados.map((p) => p.canal)
    expect(canais).toContain(canalDoUsuario(contas.marina.id))
    expect(canais).toContain(canalDoAtendimento(atendimentoId))
  })
})

describe('convite e negociação avisam em tempo real', () => {
  it('o convite avisa o convidado no canal dele e no do convite', async () => {
    const convite = await convidarParaAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      destinatarioId: contas.ricardo.id,
      escopo: 'Cuidar do registro na junta.',
      valorOferecidoCentavos: 40000,
    })
    if (!convite.sucesso) throw new Error(convite.motivo)

    const canais = publicados.map((p) => p.canal)
    expect(canais).toContain(canalDoUsuario(contas.ricardo.id))
    expect(canais).toContain(canalDoConvite(convite.id))
    // A negociação não é assunto do Atendimento inteiro.
    expect(canais).not.toContain(canalDoAtendimento(atendimentoId))

    publicados.length = 0
    const contraproposta = await escreverNaNegociacao({
      conviteId: convite.id,
      usuarioId: contas.ricardo.id,
      conteudo: 'Consigo por este valor.',
      valorCentavos: 60000,
    })
    expect(contraproposta.sucesso).toBe(true)

    const daNegociacao = publicados.map((p) => p.canal)
    expect(daNegociacao).toContain(canalDoUsuario(contas.ana.id))
    expect(daNegociacao).toContain(canalDoConvite(convite.id))
    expect(daNegociacao).not.toContain(canalDoUsuario(contas.marina.id))
    // Nenhum valor trafega no evento.
    expect(JSON.stringify(publicados)).not.toContain('60000')

    publicados.length = 0
    const resposta = await responderConvite({
      conviteId: convite.id,
      usuarioId: contas.ricardo.id,
      resposta: 'aceitar',
    })
    expect(resposta.sucesso).toBe(true)
    expect(publicados.map((p) => p.canal)).toContain(
      canalDoUsuario(contas.ana.id),
    )
  })
})
