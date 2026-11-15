import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoEncerramentos,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoMensagens,
  atendimentos,
  cobrancasPix,
  contratacoesServico,
  eventosAuditoria,
  notificacoes,
  servicos,
} from '@/db/schema'
import { encerrarAtendimentoSemConclusao } from '@/features/atendimentos/actions/encerramento'
import {
  apresentarAndamento,
  calcularAndamento,
  type ResumoDeInteracoes,
} from '@/features/atendimentos/lib/andamento'
import { alterarStatusDoAtendimento } from '@/features/atendimentos/lib/alterar-status'
import {
  chaveDeInatividade,
  processarInatividadeDosAtendimentos,
} from '@/features/atendimentos/lib/atendimentos-parados'
import { resumirInteracoes } from '@/features/atendimentos/lib/interacoes'
import { enviarMensagemNoAtendimento } from '@/features/atendimentos/lib/mensagens'
import { listarAtendimentosDoCliente } from '@/features/atendimentos/queries/listar-atendimentos-do-cliente'
import { listarAtendimentosParados } from '@/features/atendimentos/queries/atendimentos-parados'
import { criarContas, limparContas, type ContaDeTeste } from './setup/contas-de-teste'
import { contratarServico } from './setup/contratar-servico'
import { efiDeTeste } from './setup/efi-de-teste'
import { comSessao, sairDaSessao } from './setup/sessao'

/**
 * A nova leitura do Atendimento para o Cliente — e a régua de inatividade.
 *
 * Prova que:
 * - a situação ("Aguardando profissional" / "Aguardando você") segue a última
 *   interação real, e que eventos do sistema e a conversa interna não a mudam;
 * - prazo vencido, 3, 7 e 14 dias aparecem e avisam sem cancelar nada;
 * - os avisos da régua são idempotentes;
 * - só o Gestor encerra sem conclusão, com motivo e nota interna, e o Cliente
 *   vê só um texto neutro — nunca promessa de reembolso.
 */

const SUFIXO = '@atendimento-andamento.teste'
const DIA = 24 * 60 * 60 * 1000
const PROMESSA_FINANCEIRA = /reembols|estorn|crédito|credito|devolv|devolu/i

type Chave = 'profissional' | 'cliente' | 'gestor'
let contas: Record<Chave, ContaDeTeste>

const NADA: ResumoDeInteracoes = { ultimaDoCliente: null, ultimaDoProfissional: null }

async function novoAtendimentoPago(mensagem = 'Preciso abrir meu MEI.') {
  const [servico] = await db
    .insert(servicos)
    .values({
      prestadorId: contas.profissional.id,
      nome: `Serviço ${crypto.randomUUID().slice(0, 6)}`,
      descricaoCurta: 'Serviço de teste do andamento.',
      modeloPreco: 'fixo',
      valorCentavos: 100,
      prazoEstimadoDias: 5,
    })
    .returning({ id: servicos.id })
  const contratado = await comSessao(contas.cliente.token, () =>
    contratarServico({ servicoId: servico.id, mensagem }),
  )
  if (!contratado.sucesso) throw new Error(contratado.mensagem)
  return contratado.dados!.atendimentoId
}

async function andamentoDoCliente(atendimentoId: string) {
  const lista = await listarAtendimentosDoCliente(contas.cliente.id)
  const item = lista.find((a) => a.id === atendimentoId)
  if (!item) throw new Error('Atendimento fora da lista do cliente.')
  return item
}

/** Empurra para o passado tudo o que conta como interação/abertura. */
async function envelhecer(atendimentoId: string, dias: number) {
  const quando = new Date(Date.now() - dias * DIA)
  await db.update(atendimentos).set({ createdAt: quando }).where(eq(atendimentos.id, atendimentoId))
  await db.update(atendimentoMensagens).set({ createdAt: quando }).where(eq(atendimentoMensagens.atendimentoId, atendimentoId))
  await db.update(atendimentoManifestacoes).set({ createdAt: quando }).where(eq(atendimentoManifestacoes.atendimentoId, atendimentoId))
  await db.update(atendimentoEventos).set({ createdAt: quando }).where(eq(atendimentoEventos.atendimentoId, atendimentoId))
}

async function avisosDe(usuarioId: string, atendimentoId: string, tipo: string) {
  return db
    .select()
    .from(notificacoes)
    .where(
      and(
        eq(notificacoes.destinatarioId, usuarioId),
        eq(notificacoes.atendimentoId, atendimentoId),
        eq(notificacoes.tipo, tipo),
      ),
    )
}

beforeAll(async () => {
  contas = await criarContas(
    SUFIXO,
    {
      profissional: { perfil: 'profissional', prestador: 'profissional' },
      cliente: { perfil: 'cliente' },
      gestor: { perfil: 'gestor_vincis' },
    },
    '119473',
  )
}, 120_000)

beforeEach(() => {
  efiDeTeste.limpar()
  sairDaSessao()
})

afterAll(async () => {
  const ids = Object.values(contas).map((c) => c.id)
  await db.delete(notificacoes).where(inArray(notificacoes.destinatarioId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.autorId, ids))
  await db.delete(cobrancasPix).where(inArray(cobrancasPix.clienteUsuarioId, ids))
  await limparContas(SUFIXO)
})

describe('lib do andamento (pura)', () => {
  const agora = new Date('2026-10-25T12:00:00Z')
  const criadoEm = new Date('2026-10-24T12:00:00Z')

  it('nasce "Aguardando profissional" com a jornada em "Em atendimento"', () => {
    const a = calcularAndamento({ status: 'novo', criadoEm, prazoEm: null, interacoes: NADA, pago: true, agora })
    expect(a.situacao).toBe('aguardando_profissional')
    expect(a.jornada).toEqual({ passos: ['Pagamento confirmado', 'Em atendimento', 'Concluído'], atual: 1 })
    const texto = apresentarAndamento(a, { profissional: 'Dra. Ana Carolina Silva' })
    expect(texto.rotulo).toBe('Aguardando profissional')
    expect(texto.micro).toBe('Você não precisa fazer nada agora')
    expect(texto.oQueAcontece[0]).toContain('Dra. Ana Carolina Silva recebeu sua contratação')
  })

  it('alterna conforme a última interação real', () => {
    const t1 = new Date('2026-10-24T13:00:00Z')
    const t2 = new Date('2026-10-24T14:00:00Z')
    const profissional = calcularAndamento({
      status: 'em_andamento', criadoEm, prazoEm: null, pago: true, agora,
      interacoes: { ultimaDoCliente: t1, ultimaDoProfissional: t2 },
    })
    expect(profissional.situacao).toBe('aguardando_voce')
    expect(apresentarAndamento(profissional, { profissional: 'Ana' }).micro).toBe('Há uma resposta aguardando sua ação')

    const cliente = calcularAndamento({
      status: 'em_andamento', criadoEm, prazoEm: null, pago: true, agora,
      interacoes: { ultimaDoCliente: t2, ultimaDoProfissional: t1 },
    })
    expect(cliente.situacao).toBe('aguardando_profissional')
    expect(apresentarAndamento(cliente, { profissional: 'Ana' }).oQueAcontece[0]).toMatch(/^Sua resposta foi enviada/)
  })

  it('pedido explícito ao Cliente sem nenhuma interação ainda = "Aguardando você"', () => {
    const a = calcularAndamento({ status: 'aguardando_cliente', criadoEm, prazoEm: null, interacoes: NADA, pago: true, agora })
    expect(a.situacao).toBe('aguardando_voce')
  })

  it('prazo vencido aparece sem mudar a situação', () => {
    const prazoEm = new Date('2026-09-09T15:00:00Z')
    const a = calcularAndamento({ status: 'novo', criadoEm, prazoEm, interacoes: NADA, pago: true, agora })
    const texto = apresentarAndamento(a, { profissional: 'Ana' })
    expect(texto.rotulo).toBe('Prazo vencido · Aguardando profissional')
    expect(texto.oQueAcontece.join(' ')).toContain('O prazo previsto terminou em 09/09/2026. Estamos aguardando uma ação do profissional.')
  })

  it('3, 7 e 14 dias sem interação', () => {
    const dias = (n: number) =>
      calcularAndamento({
        status: 'em_andamento', criadoEm: new Date(agora.getTime() - n * DIA), prazoEm: null,
        interacoes: NADA, pago: true, agora,
      })
    expect(dias(2).degrauInatividade).toBe(0)
    expect(dias(3)).toMatchObject({ degrauInatividade: 3, alerta: null })
    expect(dias(7)).toMatchObject({ degrauInatividade: 7, alerta: 'inativo' })
    expect(apresentarAndamento(dias(7), { profissional: 'Ana' }).rotulo).toBe('Atendimento inativo · Aguardando profissional')
    expect(dias(14)).toMatchObject({ degrauInatividade: 14, alerta: 'em_revisao' })
    expect(apresentarAndamento(dias(14), { profissional: 'Ana' }).oQueAcontece.join(' ')).toContain('sem movimentação há 14 dias')
  })

  it('concluído fecha a jornada; nenhum estado promete dinheiro', () => {
    const concluido = calcularAndamento({ status: 'concluido', criadoEm, prazoEm: null, interacoes: NADA, pago: true, agora })
    expect(concluido.jornada.atual).toBe(3)
    expect(concluido.situacao).toBeNull()

    for (const status of ['novo', 'em_andamento', 'aguardando_cliente', 'concluido', 'recusado', 'cancelado', 'encerrado_sem_conclusao']) {
      for (const dias of [0, 3, 7, 14, 40]) {
        const a = calcularAndamento({
          status, criadoEm: new Date(agora.getTime() - dias * DIA), prazoEm: new Date('2026-01-01'),
          interacoes: NADA, pago: true, agora,
        })
        const texto = apresentarAndamento(a, { profissional: 'Ana' })
        expect(`${texto.rotulo} ${texto.micro ?? ''} ${texto.oQueAcontece.join(' ')}`).not.toMatch(PROMESSA_FINANCEIRA)
      }
    }
  })

  it('encerrado sem conclusão: texto neutro', () => {
    const a = calcularAndamento({ status: 'encerrado_sem_conclusao', criadoEm, prazoEm: null, interacoes: NADA, pago: true, agora })
    const texto = apresentarAndamento(a, { profissional: 'Ana' })
    expect(texto.rotulo).toBe('Atendimento encerrado sem conclusão')
    expect(texto.oQueAcontece[0]).toBe(
      'Este atendimento foi encerrado por falta de retorno. Se precisar de ajuda ou quiser esclarecer a situação, entre em contato com a Vincis.',
    )
  })
})

describe('situação no banco: quem precisa agir', () => {
  it('serviço pago nasce "Aguardando profissional", com jornada "Pagamento confirmado"', async () => {
    const id = await novoAtendimentoPago()
    const item = await andamentoDoCliente(id)
    expect(item.andamento.situacao).toBe('aguardando_profissional')
    expect(item.andamento.jornada.passos[0]).toBe('Pagamento confirmado')
    expect(item.andamento.apresentacao.rotulo).toBe('Aguardando profissional')
    expect(item.andamento.apresentacao.oQueAcontece[0]).toContain('recebeu sua contratação')
  })

  it('profissional responde → "Aguardando você"; cliente responde → "Aguardando profissional"', async () => {
    const id = await novoAtendimentoPago()

    await enviarMensagemNoAtendimento({ atendimentoId: id, usuarioId: contas.profissional.id, escopo: 'cliente', conteudo: 'Preciso do seu RG.' })
    expect((await andamentoDoCliente(id)).andamento.situacao).toBe('aguardando_voce')

    await new Promise((r) => setTimeout(r, 15))
    await enviarMensagemNoAtendimento({ atendimentoId: id, usuarioId: contas.cliente.id, escopo: 'cliente', conteudo: 'Segue o RG.' })
    const depois = await andamentoDoCliente(id)
    expect(depois.andamento.situacao).toBe('aguardando_profissional')
    expect(depois.andamento.apresentacao.oQueAcontece[0]).toMatch(/^Sua resposta foi enviada/)
  })

  it('evento do sistema e conversa interna não trocam o responsável', async () => {
    const id = await novoAtendimentoPago()
    await enviarMensagemNoAtendimento({ atendimentoId: id, usuarioId: contas.cliente.id, escopo: 'cliente', conteudo: 'Alguma novidade?' })
    await new Promise((r) => setTimeout(r, 15))

    // Troca de status pela equipe: registro técnico, não resposta ao Cliente.
    const mudou = await alterarStatusDoAtendimento({ atendimentoId: id, usuarioId: contas.profissional.id, destino: 'em_andamento' })
    expect(mudou.sucesso).toBe(true)
    // Nota interna da equipe: o Cliente nem a vê.
    await enviarMensagemNoAtendimento({ atendimentoId: id, usuarioId: contas.profissional.id, escopo: 'interno', conteudo: 'Lembrar de conferir.' })

    expect((await andamentoDoCliente(id)).andamento.situacao).toBe('aguardando_profissional')
    const resumo = (await resumirInteracoes(db, [id])).get(id)!
    expect(resumo.ultimaDoProfissional).toBeNull()
  })

  it('pedido explícito ao Cliente ("Aguardando cliente") conta como vez do Cliente', async () => {
    const id = await novoAtendimentoPago()
    await alterarStatusDoAtendimento({ atendimentoId: id, usuarioId: contas.profissional.id, destino: 'em_andamento' })
    await new Promise((r) => setTimeout(r, 15))
    await alterarStatusDoAtendimento({ atendimentoId: id, usuarioId: contas.profissional.id, destino: 'aguardando_cliente' })
    expect((await andamentoDoCliente(id)).andamento.situacao).toBe('aguardando_voce')
  })

  it('atendimento antigo com prazo vencido e sem interação: "Prazo vencido · Aguardando profissional", sem alterar nada', async () => {
    const id = await novoAtendimentoPago('')
    await db.update(atendimentos).set({ prazoEm: new Date('2026-09-09T15:00:00Z') }).where(eq(atendimentos.id, id))
    const item = await andamentoDoCliente(id)
    expect(item.status).toBe('novo')
    expect(item.andamento.prazoVencido).toBe(true)
    expect(item.andamento.apresentacao.rotulo).toMatch(/Aguardando profissional$/)
    expect(item.andamento.apresentacao.oQueAcontece.join(' ')).toContain('O prazo previsto terminou em 09/09/2026')
  })
})

describe('régua de inatividade (3 / 7 / 14 dias)', () => {
  it('3 dias: avisa só quem precisa agir, uma vez só', async () => {
    const id = await novoAtendimentoPago()
    await envelhecer(id, 4)

    await processarInatividadeDosAtendimentos()
    await processarInatividadeDosAtendimentos()

    const daEquipe = await avisosDe(contas.profissional.id, id, 'atendimento_sem_movimentacao')
    expect(daEquipe).toHaveLength(1)
    expect(await avisosDe(contas.cliente.id, id, 'atendimento_sem_movimentacao')).toHaveLength(0)
    const [linha] = await db.select({ status: atendimentos.status }).from(atendimentos).where(eq(atendimentos.id, id))
    expect(linha.status).toBe('novo')
  })

  it('7 dias aguardando o Cliente: o Cliente é avisado e a tela mostra "Atendimento inativo"', async () => {
    const id = await novoAtendimentoPago()
    await enviarMensagemNoAtendimento({ atendimentoId: id, usuarioId: contas.profissional.id, escopo: 'cliente', conteudo: 'Preciso do comprovante.' })
    await envelhecer(id, 8)

    await processarInatividadeDosAtendimentos()
    await processarInatividadeDosAtendimentos()

    expect(await avisosDe(contas.cliente.id, id, 'atendimento_sem_movimentacao')).toHaveLength(1)
    expect(await avisosDe(contas.profissional.id, id, 'atendimento_sem_movimentacao')).toHaveLength(0)
    const item = await andamentoDoCliente(id)
    expect(item.andamento.apresentacao.rotulo).toBe('Atendimento inativo · Aguardando você')
    expect(item.andamento.apresentacao.oQueAcontece.join(' ')).toContain('Enviamos um novo aviso para você responder')
  })

  it('14 dias: "Em revisão pela Vincis", Gestão avisada uma vez, nada cancelado nem estornado', async () => {
    const id = await novoAtendimentoPago()
    await envelhecer(id, 15)
    const [contratacao] = await db
      .select({ status: contratacoesServico.status, cobrancaId: contratacoesServico.cobrancaId })
      .from(contratacoesServico)
      .innerJoin(atendimentos, eq(atendimentos.contratacaoId, contratacoesServico.id))
      .where(eq(atendimentos.id, id))

    await processarInatividadeDosAtendimentos()
    await processarInatividadeDosAtendimentos()

    expect(await avisosDe(contas.gestor.id, id, 'atendimento_em_revisao')).toHaveLength(1)
    const item = await andamentoDoCliente(id)
    expect(item.status).toBe('novo')
    expect(item.andamento.apresentacao.rotulo).toBe('Em revisão pela Vincis · Aguardando profissional')
    const [cobranca] = await db.select({ status: cobrancasPix.status }).from(cobrancasPix).where(eq(cobrancasPix.id, contratacao.cobrancaId!))
    expect(cobranca.status).toBe('paga')
    const [depois] = await db.select({ status: contratacoesServico.status }).from(contratacoesServico).where(eq(contratacoesServico.cobrancaId, contratacao.cobrancaId!))
    expect(depois.status).toBe(contratacao.status)

    const fila = await listarAtendimentosParados()
    expect(fila.itens.find((i) => i.id === id)?.emRevisao).toBe(true)
  })

  it('nova interação abre novo ciclo: o mesmo degrau pode avisar de novo depois', () => {
    const t1 = new Date('2026-10-01T00:00:00Z')
    const t2 = new Date('2026-10-10T00:00:00Z')
    expect(chaveDeInatividade('a', 3, t1)).not.toBe(chaveDeInatividade('a', 3, t2))
    expect(chaveDeInatividade('a', 3, t1)).toBe(chaveDeInatividade('a', 3, t1))
  })
})

describe('encerramento sem conclusão (só a Gestão)', () => {
  const OBSERVACAO = 'Cliente não responde após sucessivas tentativas de contato. Serviço não concluído.'

  it('Cliente e Profissional não encerram', async () => {
    const id = await novoAtendimentoPago()
    for (const conta of [contas.cliente, contas.profissional]) {
      const r = await comSessao(conta.token, () =>
        encerrarAtendimentoSemConclusao({ atendimentoId: id, motivo: 'cliente_nao_responde', observacaoInterna: OBSERVACAO }),
      )
      expect(r.sucesso).toBe(false)
    }
    const [linha] = await db.select({ status: atendimentos.status }).from(atendimentos).where(eq(atendimentos.id, id))
    expect(linha.status).toBe('novo')
  })

  it('motivo e observação são obrigatórios', async () => {
    const id = await novoAtendimentoPago()
    const semMotivo = await comSessao(contas.gestor.token, () =>
      encerrarAtendimentoSemConclusao({ atendimentoId: id, observacaoInterna: OBSERVACAO }),
    )
    const semObservacao = await comSessao(contas.gestor.token, () =>
      encerrarAtendimentoSemConclusao({ atendimentoId: id, motivo: 'outro', observacaoInterna: 'curta' }),
    )
    expect(semMotivo.sucesso).toBe(false)
    expect(semObservacao.sucesso).toBe(false)
  })

  it('Gestor encerra: registro completo, Cliente vê só o texto neutro, nada financeiro muda', async () => {
    const id = await novoAtendimentoPago()
    const r = await comSessao(contas.gestor.token, () =>
      encerrarAtendimentoSemConclusao({ atendimentoId: id, motivo: 'cliente_nao_responde', observacaoInterna: OBSERVACAO }),
    )
    expect(r.sucesso).toBe(true)

    const [encerramento] = await db.select().from(atendimentoEncerramentos).where(eq(atendimentoEncerramentos.atendimentoId, id))
    expect(encerramento).toMatchObject({
      gestorId: contas.gestor.id,
      motivo: 'cliente_nao_responde',
      observacaoInterna: OBSERVACAO,
      statusAnterior: 'novo',
    })

    const item = await andamentoDoCliente(id)
    expect(item.status).toBe('encerrado_sem_conclusao')
    expect(item.andamento.fase).toBe('encerrado')
    expect(item.andamento.apresentacao.rotulo).toBe('Atendimento encerrado sem conclusão')
    const tudoQueOClienteRecebe = JSON.stringify(item)
    expect(tudoQueOClienteRecebe).not.toContain(OBSERVACAO)
    expect(tudoQueOClienteRecebe).not.toMatch(PROMESSA_FINANCEIRA)
    const [avisoCliente] = await avisosDe(contas.cliente.id, id, 'atendimento_encerrado_sem_conclusao')
    expect(`${avisoCliente.titulo} ${avisoCliente.resumo}`).not.toMatch(PROMESSA_FINANCEIRA)

    const [cobranca] = await db
      .select({ status: cobrancasPix.status })
      .from(cobrancasPix)
      .innerJoin(contratacoesServico, eq(contratacoesServico.cobrancaId, cobrancasPix.id))
      .innerJoin(atendimentos, eq(atendimentos.contratacaoId, contratacoesServico.id))
      .where(eq(atendimentos.id, id))
    expect(cobranca.status).toBe('paga')

    const segunda = await comSessao(contas.gestor.token, () =>
      encerrarAtendimentoSemConclusao({ atendimentoId: id, motivo: 'outro', observacaoInterna: OBSERVACAO }),
    )
    expect(segunda.sucesso).toBe(false)
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(atendimentoEncerramentos)
      .where(eq(atendimentoEncerramentos.atendimentoId, id))
    expect(n).toBe(1)
  })
})
