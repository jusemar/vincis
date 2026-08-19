import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { atendimentos, notificacoes } from '@/db/schema'
import {
  adicionarItemDoChecklist,
  alternarItemDoChecklist,
} from '@/features/atendimentos/lib/checklist'
import { enviarMensagemNoAtendimento } from '@/features/atendimentos/lib/mensagens'
import { definirPrioridadeDoAtendimento } from '@/features/atendimentos/lib/ajustes-operacionais'
import { emitirAvisosDePrazo } from '@/features/notificacoes/lib/avisos-de-prazo'
import { listarNotificacoesDoUsuario } from '@/features/notificacoes/queries/listar-notificacoes'
import { criarServico } from '@/features/servicos/actions/catalogo'
import { contratarServico } from '@/features/servicos/actions/contratar'
import {
  criarContas,
  limparContas,
  type ContaDeTeste,
} from './setup/contas-de-teste'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * O sino é "algo aconteceu **para mim** e merece minha atenção".
 *
 * Este arquivo cobre os dois lados dessa frase: o que precisa acender e,
 * principalmente, o que **não** pode acender. Sino que avisa tudo deixa de ser
 * lido, e aí deixa de avisar o que importa.
 */
const SUFIXO = '@sino-relevancia.teste'
const UM_DIA = 24 * 60 * 60 * 1000

type Chave = 'ana' | 'marina'
let contas: Record<Chave, ContaDeTeste>
let atendimentoId: string

const SERVICO_BASE = {
  nome: 'Declaração de IRPF',
  descricaoCurta: 'Declaração anual.',
  descricaoDetalhada: 'Inclui envio à Receita.',
  categoria: 'contabil' as const,
  itensIncluidos: ['Declaração'],
  checklistModelo: ['Informes de rendimento'],
  modeloPreco: 'fixo' as const,
  valor: '300,00',
  prazoEstimadoDias: 10,
  ativo: true,
  publico: true,
  ordem: 0,
}

beforeEach(async () => {
  contas = await criarContas<Chave>(
    SUFIXO,
    {
      ana: { perfil: 'profissional', prestador: 'profissional' },
      marina: { perfil: 'cliente' },
    },
    '119490',
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
})

afterAll(async () => {
  sairDaSessao()
  await limparContas(SUFIXO)
})

describe('o que não vai para o sino', () => {
  it('checklist mexido pela própria equipe não gera notificação', async () => {
    const antes = (await listarNotificacoesDoUsuario(contas.ana.id)).length

    const item = await adicionarItemDoChecklist({
      atendimentoId,
      usuarioId: contas.ana.id,
      titulo: 'Conferir informes de rendimento',
    })
    if (!item.sucesso) throw new Error(item.motivo)
    await alternarItemDoChecklist({
      itemId: item.id,
      usuarioId: contas.ana.id,
      concluido: true,
    })

    expect(await listarNotificacoesDoUsuario(contas.ana.id)).toHaveLength(antes)
  })

  it('ajuste de campo sem urgência não gera notificação', async () => {
    const antes = (await listarNotificacoesDoUsuario(contas.ana.id)).length
    const ajuste = await definirPrioridadeDoAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      prioridade: 'alta',
    })
    expect(ajuste.sucesso).toBe(true)
    expect(await listarNotificacoesDoUsuario(contas.ana.id)).toHaveLength(antes)
  })

  it('ninguém é avisado da própria mensagem', async () => {
    await enviarMensagemNoAtendimento({
      atendimentoId,
      usuarioId: contas.ana.id,
      escopo: 'cliente',
      conteudo: 'Bom dia, já iniciamos a análise.',
    })

    const daAna = await listarNotificacoesDoUsuario(contas.ana.id)
    expect(daAna.some((n) => n.tipo === 'mensagem_conversa')).toBe(false)
    // E a outra ponta é avisada — o silêncio é só para quem escreveu.
    const daMarina = await listarNotificacoesDoUsuario(contas.marina.id)
    expect(daMarina.some((n) => n.tipo === 'mensagem_conversa')).toBe(true)
  })
})

describe('prazo é atenção sem clique de ninguém', () => {
  it('prazo vencido avisa a equipe, e só a equipe', async () => {
    await db
      .update(atendimentos)
      .set({ prazoEm: new Date(Date.now() - UM_DIA) })
      .where(eq(atendimentos.id, atendimentoId))

    expect(await emitirAvisosDePrazo(contas.ana.id)).toBeGreaterThan(0)

    const daAna = await listarNotificacoesDoUsuario(contas.ana.id)
    const aviso = daAna.find((n) => n.tipo === 'prazo_proximo')
    expect(aviso?.titulo).toContain('prazo vencido')

    // Cobrança de prazo é interna: o Cliente não recebe.
    const daMarina = await listarNotificacoesDoUsuario(contas.marina.id)
    expect(daMarina.some((n) => n.tipo === 'prazo_proximo')).toBe(false)
  })

  it('o mesmo prazo não enche o sino a cada abertura do painel', async () => {
    await db
      .update(atendimentos)
      .set({ prazoEm: new Date(Date.now() + UM_DIA) })
      .where(eq(atendimentos.id, atendimentoId))

    expect(await emitirAvisosDePrazo(contas.ana.id)).toBe(1)
    expect(await emitirAvisosDePrazo(contas.ana.id)).toBe(0)
    expect(await emitirAvisosDePrazo(contas.ana.id)).toBe(0)

    const avisos = await db
      .select()
      .from(notificacoes)
      .where(eq(notificacoes.destinatarioId, contas.ana.id))
    expect(avisos.filter((a) => a.tipo === 'prazo_proximo')).toHaveLength(1)
  })

  it('prazo distante não vira aviso', async () => {
    await db
      .update(atendimentos)
      .set({ prazoEm: new Date(Date.now() + 30 * UM_DIA) })
      .where(eq(atendimentos.id, atendimentoId))

    expect(await emitirAvisosDePrazo(contas.ana.id)).toBe(0)
  })

  it('Atendimento encerrado não cobra prazo', async () => {
    await db
      .update(atendimentos)
      .set({ prazoEm: new Date(Date.now() - UM_DIA), status: 'concluido' })
      .where(eq(atendimentos.id, atendimentoId))

    expect(await emitirAvisosDePrazo(contas.ana.id)).toBe(0)
  })
})
