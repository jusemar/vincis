import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoArquivos,
  atendimentoChecklistItens,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoMensagens,
  atendimentoParticipantes,
  atendimentos,
  clientes,
  eventosAuditoria,
  notificacoes,
  oportunidadeArquivos,
  oportunidadeContrapropostas,
  oportunidadeDispensas,
  oportunidadePagamentos,
  oportunidadePropostas,
  oportunidades,
  perfis,
  perfisProfissionais,
  sessoesUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { listarAtendimentosDoCliente } from '@/features/atendimentos/queries/listar-atendimentos-do-cliente'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import {
  aceitarProposta,
  criarContraproposta,
  responderContraproposta,
} from '@/features/oportunidades/actions/negociacao'
import { criarOportunidade } from '@/features/oportunidades/actions/oportunidades'
import {
  carregarOportunidadesDisponiveis,
  enviarProposta,
} from '@/features/oportunidades/actions/propostas'
import { obterVinculoComOportunidade } from '@/features/oportunidades/lib/autorizacao'
import { obterArquivoDaOportunidade } from '@/features/oportunidades/queries/obter-arquivo-da-oportunidade'
import { listarOportunidadesDoCliente } from '@/features/oportunidades/queries/listar-oportunidades-do-cliente'
import { listarOportunidadesDoPrestador } from '@/features/oportunidades/queries/listar-oportunidades-do-prestador'
import { pagarAcordoSimulado } from '@/features/pagamentos/actions/pagamento-simulado'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * O caminho inteiro: solicitação → proposta → acordo → pagamento simulado →
 * Atendimento.
 *
 * Três coisas são verificadas aqui e não podem depender de tela nenhuma:
 *
 * 1. **elegibilidade** — quem alcança o quê, inclusive por chamada direta;
 * 2. **acordo** — os dois caminhos (aceite direto e contraproposta aceita)
 *    produzem exatamente o mesmo efeito;
 * 3. **idempotência** — clique duplo, F5 e requisições concorrentes produzem um
 *    pagamento e um protocolo, nunca dois.
 */

const SUFIXO = '@fluxo-pagamento.teste'

type Chave =
  | 'cliente'
  | 'outroCliente'
  | 'contador'
  | 'contadorRival'
  | 'advogado'
  | 'colaboradorContabil'
  | 'colaboradorTI'
  | 'contadorPendente'

const DEFINICOES: Record<
  Chave,
  {
    perfil: string
    prestador?: 'profissional' | 'colaborador'
    tipoProfissional?: string
    statusAnalise?: string
    areasAtuacao?: string[]
    especialidades?: string[]
  }
> = {
  cliente: { perfil: 'cliente' },
  outroCliente: { perfil: 'cliente' },
  contador: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
    statusAnalise: 'aprovado',
  },
  contadorRival: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
    statusAnalise: 'aprovado',
  },
  advogado: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'advocacia',
    statusAnalise: 'aprovado',
  },
  colaboradorContabil: {
    perfil: 'colaborador',
    prestador: 'colaborador',
    tipoProfissional: 'colaborador',
    statusAnalise: 'ativo',
    areasAtuacao: ['Departamento Pessoal'],
    especialidades: ['Folha de pagamento'],
  },
  // Exatamente o dado de teste que existe hoje no ambiente de desenvolvimento.
  // Ter "TI" e "Marketing Digital" no cadastro não pode abrir Contabilidade.
  colaboradorTI: {
    perfil: 'colaborador',
    prestador: 'colaborador',
    tipoProfissional: 'colaborador',
    statusAnalise: 'ativo',
    areasAtuacao: ['TI'],
    especialidades: ['Marketing Digital', 'Melhoria de Processos'],
  },
  contadorPendente: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
    statusAnalise: 'pendente',
  },
}

type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>

const CONTABIL = {
  categoria: 'contabilidade',
  descricao:
    'Preciso regularizar a contabilidade da empresa e as obrigações fiscais do ano.',
  abrangencia: 'BR',
}

const JURIDICO = {
  categoria: 'advocacia',
  descricao:
    'Preciso de orientação jurídica para revisar contratos de prestação de serviço.',
  abrangencia: 'BR',
}

const PROPOSTA = {
  mensagem: 'Assumo a regularização e as obrigações do período, com relatórios mensais.',
  valor: '900,00',
  prazoEstimadoDias: 15,
}

function formulario(dados: Record<string, string>) {
  const dado = new FormData()
  for (const [chave, valor] of Object.entries(dados)) dado.set(chave, valor)
  return dado
}

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return

  const protocolos = await db
    .select({ id: atendimentos.id })
    .from(atendimentos)
    .where(inArray(atendimentos.clienteUsuarioId, ids))
  const protocoloIds = protocolos.map(({ id }) => id)
  if (protocoloIds.length) {
    for (const tabela of [
      atendimentoArquivos,
      atendimentoChecklistItens,
      atendimentoEventos,
      atendimentoManifestacoes,
      atendimentoMensagens,
      atendimentoParticipantes,
    ]) {
      await db
        .delete(tabela)
        .where(inArray(tabela.atendimentoId, protocoloIds))
    }
    await db.delete(atendimentos).where(inArray(atendimentos.id, protocoloIds))
  }

  const solicitacoes = await db
    .select({ id: oportunidades.id })
    .from(oportunidades)
    .where(inArray(oportunidades.clienteUsuarioId, ids))
  const solicitacaoIds = solicitacoes.map(({ id }) => id)
  if (solicitacaoIds.length) {
    const propostas = await db
      .select({ id: oportunidadePropostas.id })
      .from(oportunidadePropostas)
      .where(inArray(oportunidadePropostas.oportunidadeId, solicitacaoIds))
    if (propostas.length) {
      await db.delete(oportunidadeContrapropostas).where(
        inArray(
          oportunidadeContrapropostas.propostaId,
          propostas.map(({ id }) => id),
        ),
      )
    }
    await db
      .delete(oportunidadePagamentos)
      .where(inArray(oportunidadePagamentos.oportunidadeId, solicitacaoIds))
    await db
      .delete(oportunidadeArquivos)
      .where(inArray(oportunidadeArquivos.oportunidadeId, solicitacaoIds))
    await db
      .delete(oportunidadeDispensas)
      .where(inArray(oportunidadeDispensas.oportunidadeId, solicitacaoIds))
    await db
      .delete(oportunidadePropostas)
      .where(inArray(oportunidadePropostas.oportunidadeId, solicitacaoIds))
    await db.delete(oportunidades).where(inArray(oportunidades.id, solicitacaoIds))
  }

  await db.delete(clientes).where(inArray(clientes.usuarioId, ids))
  await db.delete(clientes).where(inArray(clientes.profissionalId, ids))
  await db.delete(notificacoes).where(inArray(notificacoes.destinatarioId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.autorId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.usuarioId, ids))
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db
    .delete(perfisProfissionais)
    .where(inArray(perfisProfissionais.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
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
        nome: `Fluxo ${chave}`,
        email: `${chave}${SUFIXO}`,
        whatsapp: `1194200${String(i).padStart(4, '0')}`,
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
        tipoProfissional: def.tipoProfissional!,
        apresentacao: 'Conta de teste do fluxo de pagamento.',
        nomeAtuacao: chave,
        modalidadeAtuacao: 'individual',
        cidade: 'São Paulo',
        estado: 'SP',
        areasAtuacao: def.areasAtuacao ?? [],
        especialidades: def.especialidades ?? ['Planejamento Tributário'],
        telefoneContato: '11999999999',
        emailProfissional: `${chave}${SUFIXO}`,
        statusAnalise: def.statusAnalise ?? 'aprovado',
      })
    }

    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 3600_000),
      userAgent: 'fluxo-pagamento-teste',
    })
    criadas[chave] = { id: usuario.id, token }
    i += 1
  }
  return criadas
}

async function solicitar(dados = CONTABIL, dono: Chave = 'cliente') {
  entrarComo(contas[dono].token)
  const resultado = await criarOportunidade(formulario(dados))
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  return (resultado as { dados: { oportunidadeId: string } }).dados.oportunidadeId
}

async function propor(chave: Chave, oportunidadeId: string, extra = {}) {
  entrarComo(contas[chave].token)
  const resultado = await enviarProposta({
    ...PROPOSTA,
    oportunidadeId,
    ...extra,
  })
  if (!resultado.sucesso) throw new Error(resultado.mensagem)
  const [proposta] = await db
    .select({ id: oportunidadePropostas.id })
    .from(oportunidadePropostas)
    .where(
      and(
        eq(oportunidadePropostas.oportunidadeId, oportunidadeId),
        eq(oportunidadePropostas.prestadorId, contas[chave].id),
      ),
    )
  return proposta.id
}

/** Solicitação com acordo já fechado pelo aceite direto do Cliente. */
async function comAcordo(extra = {}) {
  const oportunidadeId = await solicitar()
  const propostaId = await propor('contador', oportunidadeId, extra)
  entrarComo(contas.cliente.token)
  const aceite = await aceitarProposta({ propostaId })
  if (!aceite.sucesso) throw new Error(aceite.mensagem)
  return { oportunidadeId, propostaId }
}

beforeEach(async () => {
  contas = await montar()
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

describe('elegibilidade profissional', () => {
  it('contador vê solicitação contábil e não vê a jurídica', async () => {
    const contabil = await solicitar(CONTABIL)
    const juridica = await solicitar(JURIDICO)

    entrarComo(contas.contador.token)
    const lista = await carregarOportunidadesDisponiveis()
    const ids = (lista.dados?.lista ?? []).map((item) => item.id)
    expect(ids).toContain(contabil)
    expect(ids).not.toContain(juridica)
  })

  it('advogado vê a jurídica e não vê a contábil', async () => {
    const contabil = await solicitar(CONTABIL)
    const juridica = await solicitar(JURIDICO)

    const lista = await listarOportunidadesDoPrestador(contas.advogado.id)
    const ids = lista.map((item) => item.id)
    expect(ids).toContain(juridica)
    expect(ids).not.toContain(contabil)
  })

  it('contador não alcança a jurídica por chamada direta nem pelos anexos', async () => {
    const juridica = await solicitar(JURIDICO)
    const [anexo] = await db
      .insert(oportunidadeArquivos)
      .values({
        oportunidadeId: juridica,
        nome: 'contrato.pdf',
        tipoMime: 'application/pdf',
        tamanhoBytes: 1024,
        remetenteId: contas.cliente.id,
        chave: 'teste/contrato.pdf',
      })
      .returning({ id: oportunidadeArquivos.id })

    // Conhecer o id não basta: a autorização é a mesma da vitrine.
    expect(
      await obterVinculoComOportunidade(juridica, contas.contador.id),
    ).toBeNull()
    expect(
      await obterArquivoDaOportunidade({
        oportunidadeId: juridica,
        arquivoId: anexo.id,
        usuarioId: contas.contador.id,
      }),
    ).toBeNull()
    // E o advogado, que é elegível, alcança os dois.
    expect(
      await obterVinculoComOportunidade(juridica, contas.advogado.id),
    ).toBe('prestador')
  })

  it('contador não envia proposta jurídica por chamada direta', async () => {
    const juridica = await solicitar(JURIDICO)
    entrarComo(contas.contador.token)
    const resultado = await enviarProposta({ ...PROPOSTA, oportunidadeId: juridica })
    expect(resultado.sucesso).toBe(false)

    const [gravada] = await db
      .select({ id: oportunidadePropostas.id })
      .from(oportunidadePropostas)
      .where(eq(oportunidadePropostas.oportunidadeId, juridica))
    expect(gravada).toBeUndefined()
  })

  it('dados de teste de TI e Marketing não tornam ninguém elegível para Contabilidade', async () => {
    const contabil = await solicitar(CONTABIL)

    const doTI = await listarOportunidadesDoPrestador(contas.colaboradorTI.id)
    expect(doTI.map((item) => item.id)).not.toContain(contabil)
    expect(
      await obterVinculoComOportunidade(contabil, contas.colaboradorTI.id),
    ).toBeNull()

    // O colaborador com atuação contábil real continua funcionando.
    const doContabil = await listarOportunidadesDoPrestador(
      contas.colaboradorContabil.id,
    )
    expect(doContabil.map((item) => item.id)).toContain(contabil)
  })

  it('prestador não habilitado continua bloqueado', async () => {
    const contabil = await solicitar(CONTABIL)
    expect(
      await listarOportunidadesDoPrestador(contas.contadorPendente.id),
    ).toHaveLength(0)
    expect(
      await obterVinculoComOportunidade(contabil, contas.contadorPendente.id),
    ).toBeNull()

    entrarComo(contas.contadorPendente.token)
    expect(
      (await enviarProposta({ ...PROPOSTA, oportunidadeId: contabil })).sucesso,
    ).toBe(false)
  })
})

describe('acordo comercial pelos dois caminhos', () => {
  it('aceite direto encerra a solicitação e tira os concorrentes', async () => {
    const oportunidadeId = await solicitar()
    const daContador = await propor('contador', oportunidadeId)
    await propor('contadorRival', oportunidadeId)

    entrarComo(contas.cliente.token)
    expect((await aceitarProposta({ propostaId: daContador })).sucesso).toBe(true)

    const [solicitacao] = await db
      .select({ status: oportunidades.status })
      .from(oportunidades)
      .where(eq(oportunidades.id, oportunidadeId))
    expect(solicitacao.status).toBe('encerrada')

    const doRival = await listarOportunidadesDoPrestador(contas.contadorRival.id)
    expect(doRival.map((item) => item.id)).not.toContain(oportunidadeId)
  })

  it('contraproposta aceita produz exatamente o mesmo estado', async () => {
    const oportunidadeId = await solicitar()
    const daContador = await propor('contador', oportunidadeId)
    await propor('contadorRival', oportunidadeId)

    entrarComo(contas.cliente.token)
    const contra = await criarContraproposta({
      propostaId: daContador,
      valor: '750,00',
      mensagem: 'Consigo fechar por este valor.',
    })
    expect(contra.sucesso).toBe(true)

    const [pendente] = await db
      .select({ id: oportunidadeContrapropostas.id })
      .from(oportunidadeContrapropostas)
      .where(eq(oportunidadeContrapropostas.propostaId, daContador))

    entrarComo(contas.contador.token)
    expect(
      (
        await responderContraproposta({
          contrapropostaId: pendente.id,
          decisao: 'aceitar',
        })
      ).sucesso,
    ).toBe(true)

    // O ponto da correção: este caminho encerrava o acordo mas deixava a
    // solicitação aberta, recebendo propostas de quem já tinha perdido.
    const [solicitacao] = await db
      .select({ status: oportunidades.status, encerradaEm: oportunidades.encerradaEm })
      .from(oportunidades)
      .where(eq(oportunidades.id, oportunidadeId))
    expect(solicitacao.status).toBe('encerrada')
    expect(solicitacao.encerradaEm).not.toBeNull()

    const doRival = await listarOportunidadesDoPrestador(contas.contadorRival.id)
    expect(doRival.map((item) => item.id)).not.toContain(oportunidadeId)

    // O valor acordado é o da contraproposta, não o da proposta original.
    const [proposta] = await db
      .select({ valorAcordado: oportunidadePropostas.valorAcordadoCentavos })
      .from(oportunidadePropostas)
      .where(eq(oportunidadePropostas.id, daContador))
    expect(proposta.valorAcordado).toBe(75000)
  })

  it('concorrente não consegue propor depois do acordo, e o histórico fica', async () => {
    const oportunidadeId = await solicitar()
    const daContador = await propor('contador', oportunidadeId)
    await propor('contadorRival', oportunidadeId)

    entrarComo(contas.cliente.token)
    await aceitarProposta({ propostaId: daContador })

    entrarComo(contas.contadorRival.token)
    const tentativa = await enviarProposta({
      ...PROPOSTA,
      oportunidadeId,
      mensagem: 'Consigo fazer por menos, me deixem tentar de novo por favor.',
    })
    expect(tentativa.sucesso).toBe(false)

    // Nada foi apagado: as duas propostas continuam registradas.
    const propostas = await db
      .select({ id: oportunidadePropostas.id })
      .from(oportunidadePropostas)
      .where(eq(oportunidadePropostas.oportunidadeId, oportunidadeId))
    expect(propostas).toHaveLength(2)
  })
})

describe('pagamento simulado', () => {
  it('só o Cliente dono paga', async () => {
    const { oportunidadeId } = await comAcordo()

    entrarComo(contas.outroCliente.token)
    expect((await pagarAcordoSimulado({ oportunidadeId })).sucesso).toBe(false)

    entrarComo(contas.contadorRival.token)
    expect((await pagarAcordoSimulado({ oportunidadeId })).sucesso).toBe(false)

    // O prestador que venceu também não paga: quem contrata é quem pediu.
    entrarComo(contas.contador.token)
    expect((await pagarAcordoSimulado({ oportunidadeId })).sucesso).toBe(false)

    expect(
      await db
        .select({ id: oportunidadePagamentos.id })
        .from(oportunidadePagamentos)
        .where(eq(oportunidadePagamentos.oportunidadeId, oportunidadeId)),
    ).toHaveLength(0)
  })

  it('não existe pagamento antes do acordo', async () => {
    const oportunidadeId = await solicitar()
    await propor('contador', oportunidadeId)

    entrarComo(contas.cliente.token)
    const resultado = await pagarAcordoSimulado({ oportunidadeId })
    expect(resultado.sucesso).toBe(false)
    expect(resultado.mensagem).toContain('acordo')
  })

  it('acordo "a combinar" exige um valor maior que zero', async () => {
    const { oportunidadeId } = await comAcordo({ valor: '' })
    entrarComo(contas.cliente.token)

    expect((await pagarAcordoSimulado({ oportunidadeId })).sucesso).toBe(false)
    expect(
      (await pagarAcordoSimulado({ oportunidadeId, valorAcordado: '0' })).sucesso,
    ).toBe(false)
    expect(
      (await pagarAcordoSimulado({ oportunidadeId, valorAcordado: '-10' })).sucesso,
    ).toBe(false)

    const ok = await pagarAcordoSimulado({
      oportunidadeId,
      valorAcordado: '1.200,00',
    })
    expect(ok.sucesso).toBe(true)

    const [pagamento] = await db
      .select()
      .from(oportunidadePagamentos)
      .where(eq(oportunidadePagamentos.oportunidadeId, oportunidadeId))
    expect(pagamento.valorCentavos).toBe(120000)
  })

  it('valor enviado pelo navegador não sobrescreve um acordo com preço', async () => {
    const { oportunidadeId } = await comAcordo()
    entrarComo(contas.cliente.token)

    await pagarAcordoSimulado({ oportunidadeId, valorAcordado: '1,00' })

    const [pagamento] = await db
      .select({ valorCentavos: oportunidadePagamentos.valorCentavos })
      .from(oportunidadePagamentos)
      .where(eq(oportunidadePagamentos.oportunidadeId, oportunidadeId))
    // 900,00 do acordo, e não 1,00 do formulário.
    expect(pagamento.valorCentavos).toBe(90000)
  })

  it('registra origem simulada, referência e nada de dado financeiro', async () => {
    const { oportunidadeId, propostaId } = await comAcordo()
    entrarComo(contas.cliente.token)
    await pagarAcordoSimulado({ oportunidadeId })

    const [pagamento] = await db
      .select()
      .from(oportunidadePagamentos)
      .where(eq(oportunidadePagamentos.oportunidadeId, oportunidadeId))

    expect(pagamento.status).toBe('aprovado')
    expect(pagamento.origem).toBe('simulado')
    expect(pagamento.referencia).toMatch(/^SIM-\d{4}-[A-Z2-9]{8}$/)
    expect(pagamento.propostaId).toBe(propostaId)
    expect(pagamento.clienteUsuarioId).toBe(contas.cliente.id)
    expect(pagamento.prestadorId).toBe(contas.contador.id)

    // A tabela não tem onde guardar dado financeiro — e o registro prova isso.
    const colunas = Object.keys(pagamento).join(' ').toLowerCase()
    for (const proibido of ['cartao', 'card', 'cvv', 'titular', 'bandeira', 'pix']) {
      expect(colunas).not.toContain(proibido)
    }
  })

  it('refresh e clique duplo não duplicam pagamento nem atendimento', async () => {
    const { oportunidadeId } = await comAcordo()
    entrarComo(contas.cliente.token)

    const primeiro = await pagarAcordoSimulado({ oportunidadeId })
    const segundo = await pagarAcordoSimulado({ oportunidadeId })
    const terceiro = await pagarAcordoSimulado({ oportunidadeId })

    // Repetir não falha: devolve o mesmo desfecho.
    expect(primeiro.sucesso && segundo.sucesso && terceiro.sucesso).toBe(true)
    expect(segundo.dados?.protocolo).toBe(primeiro.dados?.protocolo)
    expect(segundo.dados?.novo).toBe(false)

    expect(
      await db
        .select({ id: oportunidadePagamentos.id })
        .from(oportunidadePagamentos)
        .where(eq(oportunidadePagamentos.oportunidadeId, oportunidadeId)),
    ).toHaveLength(1)
    expect(
      await db
        .select({ id: atendimentos.id })
        .from(atendimentos)
        .where(eq(atendimentos.oportunidadeId, oportunidadeId)),
    ).toHaveLength(1)
  })

  it('duas chamadas concorrentes produzem um pagamento e um protocolo', async () => {
    const { oportunidadeId } = await comAcordo()
    entrarComo(contas.cliente.token)

    const resultados = await Promise.all([
      pagarAcordoSimulado({ oportunidadeId }),
      pagarAcordoSimulado({ oportunidadeId }),
      pagarAcordoSimulado({ oportunidadeId }),
    ])
    expect(resultados.every((item) => item.sucesso)).toBe(true)

    const protocolos = new Set(
      resultados.map((item) => (item as { dados?: { protocolo: string } }).dados?.protocolo),
    )
    expect(protocolos.size).toBe(1)

    expect(
      await db
        .select({ id: oportunidadePagamentos.id })
        .from(oportunidadePagamentos)
        .where(eq(oportunidadePagamentos.oportunidadeId, oportunidadeId)),
    ).toHaveLength(1)
    expect(
      await db
        .select({ id: atendimentos.id })
        .from(atendimentos)
        .where(eq(atendimentos.oportunidadeId, oportunidadeId)),
    ).toHaveLength(1)
  })

  it('concorrente não descobre pagamento nem protocolo', async () => {
    const oportunidadeId = await solicitar()
    const daContador = await propor('contador', oportunidadeId)
    await propor('contadorRival', oportunidadeId)
    entrarComo(contas.cliente.token)
    await aceitarProposta({ propostaId: daContador })
    await pagarAcordoSimulado({ oportunidadeId })

    const doRival = await listarOportunidadesDoPrestador(contas.contadorRival.id)
    expect(JSON.stringify(doRival)).not.toContain('SIM-')
    expect(doRival.map((item) => item.id)).not.toContain(oportunidadeId)
    // Nem por chamada direta: quem não fechou perde o vínculo.
    expect(
      await obterVinculoComOportunidade(oportunidadeId, contas.contadorRival.id),
    ).toBeNull()

    // O vencedor continua enxergando o próprio acordo.
    const doVencedor = await listarOportunidadesDoPrestador(contas.contador.id)
    const minha = doVencedor.find((item) => item.id === oportunidadeId)
    expect(minha?.atendimento?.protocolo).toMatch(/^#\d{4}-\d{4}$/)
  })
})

describe('atendimento criado pelo pagamento', () => {
  it('nasce com protocolo oficial, partes corretas e vínculo com a solicitação', async () => {
    const { oportunidadeId, propostaId } = await comAcordo()
    entrarComo(contas.cliente.token)
    const pagamento = await pagarAcordoSimulado({ oportunidadeId })
    expect(pagamento.sucesso).toBe(true)

    const [atendimento] = await db
      .select()
      .from(atendimentos)
      .where(eq(atendimentos.oportunidadeId, oportunidadeId))

    expect(atendimento.protocolo).toMatch(/^#\d{4}-\d{4}$/)
    // Protocolo é entidade própria: não é o id da oportunidade nem da proposta.
    expect(atendimento.protocolo).not.toContain(oportunidadeId)
    expect(atendimento.protocolo).not.toContain(propostaId)
    expect(atendimento.clienteUsuarioId).toBe(contas.cliente.id)
    expect(atendimento.prestadorId).toBe(contas.contador.id)
    expect(atendimento.responsavelId).toBe(contas.contador.id)
    expect(atendimento.contratacaoId).toBeNull()
    expect(atendimento.categoria).toBe('contabil')
    expect(atendimento.status).toBe('novo')
    // Prazo derivado da proposta aceita (15 dias), não inventado.
    expect(atendimento.prazoEm).not.toBeNull()

    // O prestador entra como participante responsável, como no outro caminho.
    const participantes = await db
      .select({ usuarioId: atendimentoParticipantes.usuarioId })
      .from(atendimentoParticipantes)
      .where(eq(atendimentoParticipantes.atendimentoId, atendimento.id))
    expect(participantes.map((item) => item.usuarioId)).toEqual([
      contas.contador.id,
    ])
  })

  it('leva a descrição da solicitação para o Protocolo e os anexos para o Atendimento', async () => {
    const oportunidadeId = await solicitar()
    await db.insert(oportunidadeArquivos).values({
      oportunidadeId,
      nome: 'balancete.pdf',
      tipoMime: 'application/pdf',
      tamanhoBytes: 2048,
      remetenteId: contas.cliente.id,
      chave: 'teste/balancete.pdf',
    })
    const propostaId = await propor('contador', oportunidadeId)
    entrarComo(contas.cliente.token)
    await aceitarProposta({ propostaId })
    await pagarAcordoSimulado({ oportunidadeId })

    const [atendimento] = await db
      .select({ id: atendimentos.id })
      .from(atendimentos)
      .where(eq(atendimentos.oportunidadeId, oportunidadeId))

    const manifestacoes = await db
      .select({ conteudo: atendimentoManifestacoes.conteudo })
      .from(atendimentoManifestacoes)
      .where(eq(atendimentoManifestacoes.atendimentoId, atendimento.id))
    expect(manifestacoes[0]?.conteudo).toBe(CONTABIL.descricao)

    const anexos = await db
      .select({ nome: atendimentoArquivos.nome, chave: atendimentoArquivos.chave })
      .from(atendimentoArquivos)
      .where(eq(atendimentoArquivos.atendimentoId, atendimento.id))
    expect(anexos).toHaveLength(1)
    // Referência ao mesmo objeto no armazenamento, sem segunda cópia dos bytes.
    expect(anexos[0].chave).toBe('teste/balancete.pdf')
  })

  it('aparece na Área do Cliente apontando para a solicitação de origem', async () => {
    const { oportunidadeId } = await comAcordo()
    entrarComo(contas.cliente.token)
    const pagamento = await pagarAcordoSimulado({ oportunidadeId })

    const doCliente = await listarAtendimentosDoCliente(contas.cliente.id)
    const novo = doCliente.find(
      (item) => item.protocolo === pagamento.dados?.protocolo,
    )
    expect(novo).toBeDefined()
    expect(novo?.origemOportunidade?.oportunidadeId).toBe(oportunidadeId)
    expect(novo?.origemOportunidade?.pagamentoOrigem).toBe('simulado')
    expect(novo?.origemOportunidade?.valorAcordadoCentavos).toBe(90000)

    // E a solicitação aponta de volta para o Atendimento.
    const solicitacoes = await listarOportunidadesDoCliente(contas.cliente.id)
    const solicitacao = solicitacoes.find((item) => item.id === oportunidadeId)
    expect(solicitacao?.etapa).toBe('em_atendimento')
    expect(solicitacao?.atendimento?.protocolo).toBe(pagamento.dados?.protocolo)
    expect(solicitacao?.pagamento?.origem).toBe('simulado')
  })

  it('o concorrente não alcança o atendimento criado', async () => {
    const oportunidadeId = await solicitar()
    const daContador = await propor('contador', oportunidadeId)
    await propor('contadorRival', oportunidadeId)
    entrarComo(contas.cliente.token)
    await aceitarProposta({ propostaId: daContador })
    await pagarAcordoSimulado({ oportunidadeId })

    const [atendimento] = await db
      .select({ id: atendimentos.id, prestadorId: atendimentos.prestadorId })
      .from(atendimentos)
      .where(eq(atendimentos.oportunidadeId, oportunidadeId))
    expect(atendimento.prestadorId).toBe(contas.contador.id)
    expect(atendimento.prestadorId).not.toBe(contas.contadorRival.id)

    const doRival = await listarAtendimentosDoCliente(contas.contadorRival.id)
    expect(doRival).toHaveLength(0)
  })

  it('a jornada completa com contraproposta termina em atendimento', async () => {
    const oportunidadeId = await solicitar()
    const propostaId = await propor('contador', oportunidadeId)

    entrarComo(contas.cliente.token)
    await criarContraproposta({
      propostaId,
      valor: '640,00',
      mensagem: 'Consigo fechar por este valor.',
    })
    const [pendente] = await db
      .select({ id: oportunidadeContrapropostas.id })
      .from(oportunidadeContrapropostas)
      .where(eq(oportunidadeContrapropostas.propostaId, propostaId))

    entrarComo(contas.contador.token)
    await responderContraproposta({
      contrapropostaId: pendente.id,
      decisao: 'aceitar',
    })

    entrarComo(contas.cliente.token)
    const pagamento = await pagarAcordoSimulado({ oportunidadeId })
    expect(pagamento.sucesso).toBe(true)
    expect(pagamento.dados?.valorCentavos).toBe(64000)

    const doCliente = await listarAtendimentosDoCliente(contas.cliente.id)
    expect(
      doCliente.some((item) => item.protocolo === pagamento.dados?.protocolo),
    ).toBe(true)
  })

  it('o prestador vencedor é avisado do pagamento uma vez só', async () => {
    const { oportunidadeId } = await comAcordo()
    entrarComo(contas.cliente.token)
    await pagarAcordoSimulado({ oportunidadeId })
    await pagarAcordoSimulado({ oportunidadeId })

    const avisos = await db
      .select({ id: notificacoes.id, titulo: notificacoes.titulo })
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.destinatarioId, contas.contador.id),
          eq(notificacoes.tipo, 'pagamento_oportunidade_aprovado'),
        ),
      )
    expect(avisos).toHaveLength(1)

    // O Cliente não é avisado da própria ação.
    const doCliente = await db
      .select({ id: notificacoes.id })
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.destinatarioId, contas.cliente.id),
          eq(notificacoes.tipo, 'pagamento_oportunidade_aprovado'),
        ),
      )
    expect(doCliente).toHaveLength(0)
  })
})
