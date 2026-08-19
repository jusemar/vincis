import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoConviteMensagens,
  atendimentoConvites,
  atendimentoLeituras,
  atendimentos,
  clientes,
  contratacoesServico,
  empresaMembros,
  empresas,
  notificacoes,
  perfis,
  perfisProfissionais,
  servicos,
  sessoesUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { mapearAtendimentoParaCard } from '@/features/admin/lib/atendimentos-reais'
import { marcarConversaLida } from '@/features/atendimentos/actions/leitura'
import {
  adotarContraproposta,
  convidarParaAtendimento,
  escreverNaNegociacao,
  marcarNegociacaoComoLida,
  responderConvite,
} from '@/features/atendimentos/lib/convites'
import { calcularNaoLidas } from '@/features/atendimentos/lib/leitura'
import { enviarMensagemNoAtendimento } from '@/features/atendimentos/lib/mensagens'
import { listarAtendimentosDoPrestador } from '@/features/atendimentos/queries/listar-atendimentos-do-prestador'
import { listarConvitesDaPessoa } from '@/features/atendimentos/queries/convites-do-atendimento'
import { obterResumoDoPainel } from '@/features/atendimentos/queries/painel-do-prestador'
import {
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
} from '@/features/notificacoes/actions/notificacoes'
import {
  contarNaoLidasDoUsuario,
  listarNotificacoesDoUsuario,
} from '@/features/notificacoes/queries/listar-notificacoes'
import { criarServico } from '@/features/servicos/actions/catalogo'
import { contratarServico } from '@/features/servicos/actions/contratar'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { limparAtendimentosDosPrestadores } from './setup/limpeza-atendimentos'
import { entrarComo, sairDaSessao } from './setup/sessao'

const SUFIXO = '@leitura-notificacoes.teste'

/**
 * As personas do cenário descrito pela operação.
 *
 * Ana é quem convida; Ricardo é o prestador externo; Marina é a Cliente que
 * contratou. `estranho` não participa de nada e existe só para provar
 * isolamento.
 */
type Chave = 'ana' | 'ricardo' | 'marina' | 'estranho'

const DEFINICOES: Record<Chave, { perfil: string; prestador?: 'profissional' }> = {
  ana: { perfil: 'profissional', prestador: 'profissional' },
  ricardo: { perfil: 'profissional', prestador: 'profissional' },
  marina: { perfil: 'cliente' },
  estranho: { perfil: 'profissional', prestador: 'profissional' },
}

type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return

  await db.delete(notificacoes).where(inArray(notificacoes.destinatarioId, ids))
  await db
    .delete(atendimentoLeituras)
    .where(inArray(atendimentoLeituras.usuarioId, ids))
  await limparAtendimentosDosPrestadores(ids)
  await db
    .delete(contratacoesServico)
    .where(inArray(contratacoesServico.prestadorId, ids))
  await db.delete(servicos).where(inArray(servicos.prestadorId, ids))
  await db.delete(clientes).where(inArray(clientes.profissionalId, ids))
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db.delete(empresaMembros).where(inArray(empresaMembros.usuarioId, ids))
  await db
    .delete(perfisProfissionais)
    .where(inArray(perfisProfissionais.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
  await db.delete(empresas).where(like(empresas.nome, `Escritório${SUFIXO}`))
}

async function montar() {
  await limpar()
  const criadas = {} as Record<Chave, Conta>
  let i = 0
  for (const chave of Object.keys(DEFINICOES) as Chave[]) {
    const def = DEFINICOES[chave]
    await db.insert(perfis).values({ nome: def.perfil }).onConflictDoNothing()
    const [perfil] = await db
      .select({ id: perfis.id })
      .from(perfis)
      .where(eq(perfis.nome, def.perfil))
      .limit(1)

    const [usuario] = await db
      .insert(usuarios)
      .values({
        nome: `Leitura ${chave}`,
        email: `${chave}${SUFIXO}`,
        whatsapp: `1193600${String(i).padStart(4, '0')}`,
        senhaHash: 'nao-usado',
        status: 'ativo',
        emailVerificado: true,
        emailVerificadoEm: new Date(),
      })
      .returning({ id: usuarios.id })

    await db
      .insert(usuariosPerfis)
      .values({ usuarioId: usuario.id, perfilId: perfil.id })

    if (def.prestador) {
      await db.insert(perfisProfissionais).values({
        usuarioId: usuario.id,
        tipoPrestador: def.prestador,
        tipoProfissional: 'contabilidade',
        apresentacao: 'Conta de teste de leitura.',
        nomeAtuacao: chave,
        modalidadeAtuacao: 'individual',
        cidade: 'São Paulo',
        estado: 'SP',
        telefoneContato: '11999999999',
        emailProfissional: `${chave}${SUFIXO}`,
        statusAnalise: 'aprovado',
      })
    }

    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600_000),
      userAgent: 'leitura-teste',
    })
    criadas[chave] = { id: usuario.id, token }
    i += 1
  }
  return criadas
}

const BASE = {
  nome: 'Revisão tributária',
  descricaoCurta: 'Revisão dos dois regimes.',
  descricaoDetalhada: 'Inclui apuração e parecer.',
  categoria: 'contabil' as const,
  itensIncluidos: ['Parecer'],
  checklistModelo: ['Documentos'],
  modeloPreco: 'fixo' as const,
  valor: '1.500,00',
  prazoEstimadoDias: 10,
  ativo: true,
  publico: true,
  ordem: 0,
}

/** Serviço da Ana contratado pela Marina: devolve o Atendimento real. */
async function criarAtendimento() {
  entrarComo(contas.ana.token)
  const servico = await criarServico(BASE)
  if (!servico.sucesso) throw new Error(servico.mensagem)

  entrarComo(contas.marina.token)
  const contratacao = await contratarServico({
    servicoId: (servico as { dados: { id: string } }).dados.id,
  })
  if (!contratacao.sucesso) throw new Error(contratacao.mensagem)
  sairDaSessao()

  return (contratacao.dados as { atendimentoId: string }).atendimentoId
}

/** O card do quadro como a pessoa o veria, com as não lidas dela. */
async function cardDe(usuarioId: string, atendimentoId: string) {
  const lista = await listarAtendimentosDoPrestador(usuarioId)
  const alvo = lista.find((item) => item.id === atendimentoId)
  if (!alvo) throw new Error('Atendimento fora do alcance desta pessoa.')
  return { dto: alvo, card: mapearAtendimentoParaCard(alvo, usuarioId) }
}

async function convidarRicardo(atendimentoId: string, valor: number | null = 80000) {
  const resultado = await convidarParaAtendimento({
    atendimentoId,
    usuarioId: contas.ana.id,
    destinatarioId: contas.ricardo.id,
    escopo: 'Revisar os dois regimes tributários.',
    valorOferecidoCentavos: valor,
  })
  if (!resultado.sucesso) throw new Error(resultado.motivo)
  return resultado.id
}

beforeEach(async () => {
  contas = await montar()
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('leitura da Conversa por usuário', () => {
  it('mensagem recebida entra como não lida para quem não escreveu', async () => {
    const atendimentoId = await criarAtendimento()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Bom dia, conseguem revisar o DAS?',
    })

    const { dto, card } = await cardDe(contas.ana.id, atendimentoId)
    expect(dto.naoLidas.total).toBe(1)
    expect(dto.naoLidas.cliente).toBe(1)
    expect(dto.naoLidas.canalPrimeira).toBe('cliente')
    expect(dto.naoLidas.primeiraNaoLidaId).not.toBeNull()
    // É este número que vira a pílula vermelha do card.
    expect(card.unread).toBe(1)
  })

  it('a própria mensagem nunca acende o badge de quem a escreveu', async () => {
    const atendimentoId = await criarAtendimento()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      escopo: 'cliente',
      conteudo: 'Já estamos analisando.',
    })

    const { dto, card } = await cardDe(contas.ana.id, atendimentoId)
    expect(dto.naoLidas.total).toBe(0)
    // Zero vira ausente: o card não desenha pílula vazia.
    expect(card.unread).toBeUndefined()
    // E o total de mensagens continua correto — são números diferentes.
    expect(card.messages).toBe(1)
  })

  it('a leitura é de cada pessoa: a Ana lê e o Ricardo continua com pendência', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId)
    await responderConvite({
      conviteId,
      usuarioId: contas.ricardo.id,
      resposta: 'aceitar',
    })
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Segue o documento que faltava.',
    })

    entrarComo(contas.ana.token)
    await marcarConversaLida({ atendimentoId, canal: 'cliente' })
    sairDaSessao()

    expect((await cardDe(contas.ana.id, atendimentoId)).dto.naoLidas.total).toBe(0)
    // Uma coluna `lido` na mensagem não conseguiria representar isto.
    expect((await cardDe(contas.ricardo.id, atendimentoId)).dto.naoLidas.total).toBe(1)
  })

  it('a leitura é por canal: ler a conversa do Cliente não zera a interna', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId)
    await responderConvite({
      conviteId,
      usuarioId: contas.ricardo.id,
      resposta: 'aceitar',
    })
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Pergunta do cliente.',
    })
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.ricardo.id,
      escopo: 'interno',
      conteudo: 'Nota para a equipe.',
    })

    entrarComo(contas.ana.token)
    await marcarConversaLida({ atendimentoId, canal: 'cliente' })
    sairDaSessao()

    const { dto } = await cardDe(contas.ana.id, atendimentoId)
    expect(dto.naoLidas.cliente).toBe(0)
    expect(dto.naoLidas.interno).toBe(1)
    expect(dto.naoLidas.canalPrimeira).toBe('interno')
  })

  it('a leitura persiste: recarregar não faz o badge voltar', async () => {
    const atendimentoId = await criarAtendimento()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Mensagem do cliente.',
    })

    entrarComo(contas.ana.token)
    await marcarConversaLida({ atendimentoId, canal: 'cliente' })
    sairDaSessao()

    // Duas consultas seguidas simulam o F5: a verdade está no servidor.
    expect((await cardDe(contas.ana.id, atendimentoId)).dto.naoLidas.total).toBe(0)
    expect((await cardDe(contas.ana.id, atendimentoId)).dto.naoLidas.total).toBe(0)
  })

  it('a marca de leitura nunca anda para trás', async () => {
    const atendimentoId = await criarAtendimento()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Primeira.',
    })

    entrarComo(contas.ana.token)
    await marcarConversaLida({ atendimentoId, canal: 'cliente' })
    const [marca] = await db
      .select()
      .from(atendimentoLeituras)
      .where(
        and(
          eq(atendimentoLeituras.usuarioId, contas.ana.id),
          eq(atendimentoLeituras.recursoId, atendimentoId),
          eq(atendimentoLeituras.canal, 'cliente'),
        ),
      )

    // Uma segunda marcação imediata não pode recuar o relógio.
    await marcarConversaLida({ atendimentoId, canal: 'cliente' })
    sairDaSessao()

    const [depois] = await db
      .select()
      .from(atendimentoLeituras)
      .where(eq(atendimentoLeituras.id, marca.id))
    expect(depois.lidoAte.getTime()).toBeGreaterThanOrEqual(marca.lidoAte.getTime())
  })

  it('quem não alcança o Atendimento não grava leitura nele', async () => {
    const atendimentoId = await criarAtendimento()

    entrarComo(contas.estranho.token)
    const resultado = await marcarConversaLida({ atendimentoId, canal: 'cliente' })
    sairDaSessao()

    expect(resultado.sucesso).toBe(false)
    const marcas = await db
      .select()
      .from(atendimentoLeituras)
      .where(eq(atendimentoLeituras.usuarioId, contas.estranho.id))
    expect(marcas).toHaveLength(0)
  })

  it('o Cliente não marca como lido um canal interno que ele não lê', async () => {
    const atendimentoId = await criarAtendimento()

    entrarComo(contas.marina.token)
    const resultado = await marcarConversaLida({ atendimentoId, canal: 'interno' })
    sairDaSessao()

    expect(resultado.sucesso).toBe(false)
  })

  it('calcularNaoLidas ignora autoria e respeita a marca', () => {
    const base = new Date('2026-08-18T10:00:00Z')
    const mensagens = [
      { id: 'm1', autorId: 'outro', criadoEm: new Date(base.getTime() - 60_000) },
      { id: 'm2', autorId: 'eu', criadoEm: new Date(base.getTime() + 60_000) },
      { id: 'm3', autorId: 'outro', criadoEm: new Date(base.getTime() + 120_000) },
    ]
    const resultado = calcularNaoLidas(mensagens, 'eu', base)
    expect(resultado.total).toBe(1)
    expect(resultado.primeiraNaoLidaId).toBe('m3')
  })
})

describe('negociação com botão único', () => {
  it('mensagem sem valor é válida e não cria proposta nenhuma', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId, 80000)

    const resultado = await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      conteudo:
        'Antes de informar um valor preciso entender se a revisão inclui os dois regimes.',
      valorCentavos: null,
    })
    expect(resultado.sucesso).toBe(true)

    const [convite] = await db
      .select()
      .from(atendimentoConvites)
      .where(eq(atendimentoConvites.id, conviteId))
    expect(convite.valorContrapropostaCentavos).toBeNull()
    expect(convite.valorOferecidoCentavos).toBe(80000)

    const linhas = await db
      .select()
      .from(atendimentoConviteMensagens)
      .where(eq(atendimentoConviteMensagens.conviteId, conviteId))
    expect(linhas.find((l) => l.autorId === contas.ricardo.id)?.tipo).toBe('mensagem')
  })

  it('valor preenchido vira contraproposta sem depender do texto', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId, 80000)

    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      // Sem texto: o gesto é só o número, e continua sendo uma contraproposta.
      conteudo: '',
      valorCentavos: 95000,
    })

    const [convite] = await db
      .select()
      .from(atendimentoConvites)
      .where(eq(atendimentoConvites.id, conviteId))
    expect(convite.valorContrapropostaCentavos).toBe(95000)
  })

  it('linha totalmente vazia é recusada', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId)

    expect(
      await escreverNaNegociacao({
        conviteId,
        usuarioId: contas.ricardo.id,
        conteudo: '   ',
        valorCentavos: null,
      }),
    ).toEqual({ sucesso: false, motivo: 'vazio' })
  })

  it('corrigir a contraproposta preserva o valor anterior no histórico', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId, 80000)

    // Ricardo digita 9.500 por engano…
    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      conteudo: 'Faço por este valor.',
      valorCentavos: 950000,
    })
    // …e corrige para 950.
    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      conteudo: 'Desculpe, o valor certo é este.',
      valorCentavos: 95000,
    })

    const [convite] = await db
      .select()
      .from(atendimentoConvites)
      .where(eq(atendimentoConvites.id, conviteId))
    // Só o valor vigente vale.
    expect(convite.valorContrapropostaCentavos).toBe(95000)

    const linhas = await db
      .select()
      .from(atendimentoConviteMensagens)
      .where(eq(atendimentoConviteMensagens.conviteId, conviteId))
    const correcao = linhas.find((l) => l.valorCentavos === 95000)
    // Nada foi apagado: a linha nova carrega de onde veio, com autor e hora.
    expect(correcao?.valorAnteriorCentavos).toBe(950000)
    expect(correcao?.autorId).toBe(contas.ricardo.id)
    expect(correcao?.createdAt).toBeInstanceOf(Date)
    // E a proposta errada continua registrada.
    expect(linhas.some((l) => l.valorCentavos === 950000)).toBe(true)
  })

  it('somente o valor vigente pode ser aceito', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId, 80000)

    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      conteudo: 'Contraproposta.',
      valorCentavos: 95000,
    })
    // Ana adota a contraproposta: ela vira a oferta vigente.
    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ana.id,
      conteudo: 'Fechado.',
      valorCentavos: 95000,
    })

    const resposta = await responderConvite({
      conviteId,
      usuarioId: contas.ricardo.id,
      resposta: 'aceitar',
    })
    expect(resposta.sucesso && resposta.valorAcordadoCentavos).toBe(95000)
  })
})

describe('convites do remetente', () => {
  it('quem enviou o convite o encontra na própria caixa', async () => {
    const atendimentoId = await criarAtendimento()
    await convidarRicardo(atendimentoId)

    const daAna = await listarConvitesDaPessoa(contas.ana.id)
    expect(daAna).toHaveLength(1)
    expect(daAna[0].papel).toBe('remetente')
    // O protocolo vem junto: é como a equipe se refere ao trabalho.
    expect(daAna[0].protocoloRotulo).toMatch(/^#\d{4}-\d{4}$/)
  })

  it('a resposta do convidado aparece como não lida para quem convidou', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId)

    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      conteudo: 'Preciso entender o escopo antes de precificar.',
      valorCentavos: null,
    })

    const daAna = await listarConvitesDaPessoa(contas.ana.id)
    expect(daAna[0].naoLidas).toBe(1)
    expect(daAna[0].primeiraNaoLidaId).not.toBeNull()
    expect(daAna[0].situacao).toBe('em_negociacao')

    // Para o Ricardo, a própria mensagem não conta — mas a linha de abertura
    // escrita pela Ana continua por ler enquanto ele não abrir a negociação.
    const doRicardo = await listarConvitesDaPessoa(contas.ricardo.id)
    expect(doRicardo[0].negociacao).toHaveLength(2)
    expect(doRicardo[0].naoLidas).toBe(1)
    expect(doRicardo[0].primeiraNaoLidaId).toBe(doRicardo[0].negociacao[0].id)

    await marcarNegociacaoComoLida({
      conviteId,
      usuarioId: contas.ricardo.id,
    })
    expect((await listarConvitesDaPessoa(contas.ricardo.id))[0].naoLidas).toBe(0)
  })

  it('abrir a negociação zera as não lidas e resolve o aviso', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId)
    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      conteudo: 'Uma pergunta.',
      valorCentavos: null,
    })

    await marcarNegociacaoComoLida({ conviteId, usuarioId: contas.ana.id })

    expect((await listarConvitesDaPessoa(contas.ana.id))[0].naoLidas).toBe(0)
    const pendentes = await listarNotificacoesDoUsuario(contas.ana.id)
    expect(pendentes.filter((n) => n.recursoId === conviteId && !n.lida)).toHaveLength(0)
  })

  it('contraproposta fica marcada como aguardando decisão de quem convidou', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId, 80000)
    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      conteudo: 'Faço por 950.',
      valorCentavos: 95000,
    })

    const daAna = await listarConvitesDaPessoa(contas.ana.id)
    expect(daAna[0].aguardandoDecisao).toBe(true)
    // Para o convidado, a bola não está com ele.
    const doRicardo = await listarConvitesDaPessoa(contas.ricardo.id)
    expect(doRicardo[0].aguardandoDecisao).toBe(false)
  })
})

describe('notificações reais', () => {
  it('mensagem do Cliente notifica a equipe e não o autor', async () => {
    const atendimentoId = await criarAtendimento()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Bom dia!',
    })

    const daAna = await listarNotificacoesDoUsuario(contas.ana.id)
    expect(daAna).toHaveLength(1)
    expect(daAna[0].tipo).toBe('cliente_respondeu')
    expect(daAna[0].destino.aba).toBe('conversa')
    expect(daAna[0].destino.canal).toBe('cliente')
    expect(daAna[0].protocolo).toMatch(/^#\d{4}-\d{4}$/)

    // Quem escreveu não é avisado da própria ação.
    expect(await contarNaoLidasDoUsuario(contas.marina.id)).toBe(0)
  })

  it('nota interna não chega ao Cliente', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId)
    await responderConvite({
      conviteId,
      usuarioId: contas.ricardo.id,
      resposta: 'aceitar',
    })

    const antes = await contarNaoLidasDoUsuario(contas.marina.id)
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      escopo: 'interno',
      conteudo: 'Conferir a apuração antes de responder.',
    })

    // O Ricardo é da equipe e recebe; a Marina não.
    const doRicardo = await listarNotificacoesDoUsuario(contas.ricardo.id)
    expect(doRicardo.some((n) => n.tipo === 'mensagem_conversa')).toBe(true)
    expect(await contarNaoLidasDoUsuario(contas.marina.id)).toBe(antes)
  })

  it('a resposta do convidado gera notificação real para quem convidou', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId, 80000)

    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      conteudo: 'Consigo por 950.',
      valorCentavos: 95000,
    })

    const daAna = await listarNotificacoesDoUsuario(contas.ana.id)
    const aviso = daAna.find((n) => n.tipo === 'contraproposta_recebida')
    expect(aviso).toBeDefined()
    expect(aviso?.titulo).toContain('Leitura ricardo')
    expect(aviso?.titulo).toMatch(/#\d{4}-\d{4}/)
    expect(aviso?.destino.conviteId).toBe(conviteId)
  })

  it('aceite e recusa avisam quem convidou', async () => {
    const atendimentoId = await criarAtendimento()
    const conviteId = await convidarRicardo(atendimentoId)
    await responderConvite({
      conviteId,
      usuarioId: contas.ricardo.id,
      resposta: 'aceitar',
    })

    const daAna = await listarNotificacoesDoUsuario(contas.ana.id)
    expect(daAna.some((n) => n.tipo === 'convite_aceito')).toBe(true)
  })

  it('o convidado é avisado do convite recebido', async () => {
    const atendimentoId = await criarAtendimento()
    await convidarRicardo(atendimentoId)

    const doRicardo = await listarNotificacoesDoUsuario(contas.ricardo.id)
    expect(doRicardo.some((n) => n.tipo === 'convite_recebido')).toBe(true)
  })

  it('marcar como lida é restrito ao destinatário', async () => {
    const atendimentoId = await criarAtendimento()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Oi.',
    })
    const [aviso] = await listarNotificacoesDoUsuario(contas.ana.id)

    // O estranho tenta marcar a notificação da Ana com o id na mão.
    entrarComo(contas.estranho.token)
    await marcarNotificacaoLida({ notificacaoId: aviso.id })
    sairDaSessao()
    expect(await contarNaoLidasDoUsuario(contas.ana.id)).toBe(1)

    entrarComo(contas.ana.token)
    await marcarNotificacaoLida({ notificacaoId: aviso.id })
    sairDaSessao()
    expect(await contarNaoLidasDoUsuario(contas.ana.id)).toBe(0)
  })

  it('"marcar todas" atinge só a caixa de quem pediu', async () => {
    const atendimentoId = await criarAtendimento()
    await convidarRicardo(atendimentoId)
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Oi.',
    })

    entrarComo(contas.ana.token)
    await marcarTodasNotificacoesLidas()
    sairDaSessao()

    expect(await contarNaoLidasDoUsuario(contas.ana.id)).toBe(0)
    // A caixa do Ricardo continua intacta.
    expect(await contarNaoLidasDoUsuario(contas.ricardo.id)).toBe(1)
  })

  it('ninguém lista a caixa alheia', async () => {
    const atendimentoId = await criarAtendimento()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Oi.',
    })

    expect(await listarNotificacoesDoUsuario(contas.estranho.id)).toEqual([])
    expect(await contarNaoLidasDoUsuario(contas.estranho.id)).toBe(0)
  })

  it('abrir a Conversa resolve o aviso de mensagem', async () => {
    const atendimentoId = await criarAtendimento()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Oi.',
    })
    expect(await contarNaoLidasDoUsuario(contas.ana.id)).toBe(1)

    entrarComo(contas.ana.token)
    await marcarConversaLida({ atendimentoId, canal: 'cliente' })
    sairDaSessao()

    expect(await contarNaoLidasDoUsuario(contas.ana.id)).toBe(0)
  })
})

/**
 * O Dashboard não resume mais a operação.
 *
 * A lista de "Atividades recentes" deixou de sair de `atendimento_eventos` e
 * passou a ser o mural institucional da Vincis (`features/comunicados`). A
 * trilha do que aconteceu num Atendimento continua existindo — no Histórico
 * daquele Atendimento, coberto por `historico preservado` abaixo.
 */
describe('Dashboard', () => {
  it('o resumo do painel usa a mesma contagem de não lidas do card', async () => {
    const atendimentoId = await criarAtendimento()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Uma dúvida.',
    })
    await convidarRicardo(atendimentoId)

    const resumo = await obterResumoDoPainel(contas.ana.id)
    const { dto } = await cardDe(contas.ana.id, atendimentoId)
    expect(resumo.mensagensNaoLidas).toBe(dto.naoLidas.total)
    expect(resumo.atendimentosAtivos).toBe(1)
    expect(resumo.atendimentosNovos).toBe(1)
    expect(resumo.notificacoesNaoLidas).toBe(1)
    // Prazo de 10 dias no catálogo não é "próximo" nem "vencido".
    expect(resumo.prazosVencidos).toBe(0)
    expect(resumo.prazosProximos).toBe(0)
  })

  it('o resumo de quem não tem carteira é zerado, e não um erro', async () => {
    const resumo = await obterResumoDoPainel(contas.estranho.id)
    expect(resumo.atendimentosAtivos).toBe(0)
    expect(resumo.mensagensNaoLidas).toBe(0)
    expect(resumo.convitesPendentes).toBe(0)
  })
})

describe('a tela de Atendimentos não tem mais mocks', () => {
  /**
   * Os nove cards de demonstração foram removidos nesta etapa.
   *
   * O teste olha o módulo, e não a tela: enquanto nenhuma constante de mock
   * for exportada daqui, não há como um card fictício voltar a aparecer no
   * quadro — inclusive para um convidado, que era o efeito colateral que fazia
   * a carteira parecer vazada.
   */
  it('nenhum mock é exportado pelas constantes do quadro', async () => {
    const modulo = await import('@/features/admin/constants/atendimentos')
    expect(Object.keys(modulo).some((chave) => /mock/i.test(chave))).toBe(false)

    const mapeamento = await import('@/features/admin/lib/atendimentos-reais')
    expect(
      Object.keys(mapeamento).some((chave) => /mock/i.test(chave)),
    ).toBe(false)
  })

  it('o quadro devolve apenas Atendimentos gravados', async () => {
    const atendimentoId = await criarAtendimento()
    const quadro = await listarAtendimentosDoPrestador(contas.ana.id)
    const gravados = await db
      .select({ id: atendimentos.id })
      .from(atendimentos)
    const idsGravados = new Set(gravados.map((linha) => linha.id))

    expect(quadro.map((a) => a.id)).toContain(atendimentoId)
    for (const card of quadro) expect(idsGravados.has(card.id)).toBe(true)
  })
})

describe('fluxo completo de negociação — Ana e Ricardo', () => {
  /**
   * O roteiro que a operação descreveu, ponta a ponta.
   *
   * Vale mais que a soma dos testes unitários acima porque exercita a ordem
   * real dos gestos: é onde apareceria um estado que só quebra na sequência —
   * uma leitura marcada cedo demais, um valor congelado errado, um aviso que
   * não chega a quem esperava.
   */
  it('mensagem sem valor, contraproposta, correção, adoção e aceite', async () => {
    const atendimentoId = await criarAtendimento()

    // 1-2. Ana convida; Ricardo é avisado.
    const conviteId = await convidarRicardo(atendimentoId, 80000)
    expect(
      (await listarNotificacoesDoUsuario(contas.ricardo.id)).some(
        (n) => n.tipo === 'convite_recebido',
      ),
    ).toBe(true)

    // 3-4. Ricardo abre e responde só com mensagem, sem valor.
    await marcarNegociacaoComoLida({ conviteId, usuarioId: contas.ricardo.id })
    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      conteudo:
        'Antes de informar um valor preciso entender se a revisão inclui os dois regimes tributários.',
      valorCentavos: null,
    })

    // 5-6. Ana recebe o aviso e a caixa dela sinaliza a resposta.
    const avisos = await listarNotificacoesDoUsuario(contas.ana.id)
    expect(avisos.some((n) => n.tipo === 'mensagem_negociacao')).toBe(true)
    const naCaixaDaAna = (await listarConvitesDaPessoa(contas.ana.id))[0]
    expect(naCaixaDaAna.naoLidas).toBe(1)
    expect(naCaixaDaAna.situacao).toBe('em_negociacao')

    // 7-8. Ana abre: a mensagem passa a lida e o aviso se resolve.
    await marcarNegociacaoComoLida({ conviteId, usuarioId: contas.ana.id })
    expect((await listarConvitesDaPessoa(contas.ana.id))[0].naoLidas).toBe(0)
    expect(
      (await listarNotificacoesDoUsuario(contas.ana.id)).filter(
        (n) => n.recursoId === conviteId && !n.lida,
      ),
    ).toHaveLength(0)

    // 9-10. Ricardo manda contraproposta; Ana é avisada de novo.
    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      conteudo: 'Inclui os dois. Fica em 9.500.',
      valorCentavos: 950000,
    })
    expect(
      (await listarNotificacoesDoUsuario(contas.ana.id)).some(
        (n) => n.tipo === 'contraproposta_recebida' && !n.lida,
      ),
    ).toBe(true)

    // 11-14. Ricardo percebe o erro de digitação e corrige.
    await escreverNaNegociacao({
      conviteId,
      usuarioId: contas.ricardo.id,
      conteudo: 'Corrigindo: são 950, não 9.500.',
      valorCentavos: 95000,
    })
    const negociacao = (await listarConvitesDaPessoa(contas.ana.id))[0]
    expect(negociacao.valorContrapropostaCentavos).toBe(95000)
    // O valor antigo continua auditável na linha que o substituiu.
    const correcao = negociacao.negociacao.find((l) => l.valorCentavos === 95000)
    expect(correcao?.valorAnteriorCentavos).toBe(950000)
    expect(negociacao.negociacao.some((l) => l.valorCentavos === 950000)).toBe(true)
    expect(negociacao.aguardandoDecisao).toBe(true)

    // 15. Ana adota a contraproposta: ela vira a oferta vigente.
    await adotarContraproposta({ conviteId, usuarioId: contas.ana.id })
    const apos = (await listarConvitesDaPessoa(contas.ana.id))[0]
    expect(apos.valorOferecidoCentavos).toBe(95000)
    expect(apos.aguardandoDecisao).toBe(false)

    // 16-17. Ricardo aceita e vira participante, com o valor certo congelado.
    const aceite = await responderConvite({
      conviteId,
      usuarioId: contas.ricardo.id,
      resposta: 'aceitar',
    })
    expect(aceite.sucesso && aceite.valorAcordadoCentavos).toBe(95000)

    const quadroDoRicardo = await listarAtendimentosDoPrestador(contas.ricardo.id)
    expect(quadroDoRicardo.map((a) => a.id)).toContain(atendimentoId)
    expect(
      (await listarNotificacoesDoUsuario(contas.ana.id)).some(
        (n) => n.tipo === 'convite_aceito',
      ),
    ).toBe(true)

  })

  /**
   * O caminho do badge vermelho, do começo ao fim.
   *
   * Cobre exatamente o que a operação pediu: contador aparece, o texto do
   * tooltip fala só de não lidas, o clique tem para onde ir, a leitura persiste
   * e o total de mensagens não se confunde com o de não lidas.
   */
  it('mensagem do Cliente acende o badge, o clique tem destino e a leitura fica', async () => {
    const atendimentoId = await criarAtendimento()
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.marina.id,
      escopo: 'cliente',
      conteudo: 'Recebemos uma divergência no DAS. Podem revisar?',
    })

    const antes = await cardDe(contas.ana.id, atendimentoId)
    expect(antes.card.unread).toBe(1)
    expect(antes.card.messages).toBe(1)
    // O clique sabe para onde ir: canal e mensagem.
    expect(antes.card.real?.unread.canalPrimeira).toBe('cliente')
    expect(antes.card.real?.unread.primeiraNaoLidaId).toBe(
      antes.dto.mensagens[0].id,
    )

    entrarComo(contas.ana.token)
    await marcarConversaLida({ atendimentoId, canal: 'cliente' })
    sairDaSessao()

    const depois = await cardDe(contas.ana.id, atendimentoId)
    // Badge some…
    expect(depois.card.unread).toBeUndefined()
    // …e o total de mensagens continua o mesmo: são números diferentes.
    expect(depois.card.messages).toBe(1)
  })
})
