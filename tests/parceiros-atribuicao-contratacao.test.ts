import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray, sql as sqlBruto } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentos,
  clientes,
  contratacoesServico,
  eventosAuditoria,
  parceiroAtribuicoes,
  parceiroComissoes,
  parceiroEventos,
  parceiroIndicacoes,
  servicos,
  sessoesUsuario,
  tokensUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { COOKIE_INDICACAO } from '@/features/parceiros/constants/indicacao'
import {
  PERCENTUAL_AVULSO,
  estimarComissaoAvulsoCentavos,
} from '@/features/parceiros/constants/programa'
import { gerarTokenDeVisitante } from '@/features/parceiros/lib/visitante'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { criarContas, limparContas } from './setup/contas-de-teste'
import { entrarComo, limparCookies, sairDaSessao } from './setup/sessao'

const enviarEmailConfirmacao = vi.hoisted(() => vi.fn(async () => ({ sucesso: true })))
vi.mock('@/integracoes/email/enviar-confirmacao-email', () => ({
  enviarEmailConfirmacao,
}))

const { ativarParceiro } = await import(
  '@/features/parceiros/actions/ativar-parceiro'
)
const { registrarAcessoPeloLink } = await import(
  '@/features/parceiros/lib/registrar-acesso'
)
const { listarIndicacoesDoParceiro } = await import(
  '@/features/parceiros/queries/listar-indicacoes'
)
const { obterParceiroDoUsuario } = await import(
  '@/features/parceiros/queries/obter-parceiro'
)
const { criarServico } = await import('@/features/servicos/actions/catalogo')
const { moverComissaoDaContratacao } = await import(
  '@/features/parceiros/lib/registrar-comissao'
)
const { listarComissoesDoParceiro } = await import(
  '@/features/parceiros/queries/listar-comissoes'
)
const { alterarStatusDoAtendimento } = await import(
  '@/features/atendimentos/lib/alterar-status'
)
const { concluirAtendimento } = await import(
  '@/features/atendimentos/lib/concluir-atendimento'
)
const { contratarServico } = await import(
  '@/features/servicos/actions/contratar'
)
const { POST } = await import('@/app/api/auth/cadastro/route')

const SUFIXO = '@parceiros.contratacao.teste'
type Chave = 'joao' | 'prestador' | 'estranho'

let contas: Record<Chave, { id: string; token: string }>
let joao: { id: string; codigo: string }
let servicoContabil: string
let servicoJuridico: string
let carlos: { id: string; token: string }

const BASE = {
  descricaoCurta: 'Serviço de teste.',
  descricaoDetalhada: 'Detalhe.',
  itensIncluidos: ['Item'],
  checklistModelo: [] as string[],
  modeloPreco: 'fixo' as const,
  valor: '100,00',
  prazoEstimadoDias: 5,
  ativo: true,
  publico: true,
  ordem: 0,
}

beforeAll(async () => {
  contas = (await criarContas(
    SUFIXO,
    {
      joao: { perfil: 'cliente' },
      prestador: { perfil: 'profissional', prestador: 'profissional' },
      estranho: { perfil: 'cliente' },
    },
    '119491',
  )) as Record<Chave, { id: string; token: string }>

  entrarComo(contas.joao.token)
  await ativarParceiro()
  sairDaSessao()
  joao = (await obterParceiroDoUsuario(contas.joao.id))!

  entrarComo(contas.prestador.token)
  const contabil = await criarServico({
    ...BASE,
    nome: 'Abertura de Empresa MEI',
    categoria: 'contabil',
  })
  const juridico = await criarServico({
    ...BASE,
    nome: 'Contrato Social',
    categoria: 'juridico',
  })
  if (!contabil.sucesso || !juridico.sucesso) throw new Error('serviço não criado')
  servicoContabil = (contabil as { dados: { id: string } }).dados.id
  servicoJuridico = (juridico as { dados: { id: string } }).dados.id
  sairDaSessao()

  // O caminho real inteiro: link → visitante anônimo → cadastro com o cookie.
  const navegador = gerarTokenDeVisitante()
  await registrarAcessoPeloLink({
    codigo: joao.codigo,
    visitanteToken: navegador,
    userAgent: 'Mozilla/5.0 (teste)',
    referenciaHost: null,
  })
  const { NextRequest } = await import('next/server')
  const resposta = await POST(
    new NextRequest(
      new Request('https://vincis.test/api/auth/cadastro', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${COOKIE_INDICACAO}=${navegador}`,
        },
        body: JSON.stringify({
          nome: 'Carlos Indicado',
          email: `carlos${SUFIXO}`,
          whatsapp: '11949199999',
          senha: 'SenhaForte123!',
          confirmarSenha: 'SenhaForte123!',
          perfilTipo: 'cliente',
          aceitouTermos: true,
        }),
      }),
    ),
  )
  const corpo = await resposta.json()
  if (!corpo.dados?.usuarioId) {
    throw new Error(`cadastro falhou: ${resposta.status} ${corpo.mensagem}`)
  }
  const { dados } = corpo

  // A conta nasce `pendente_email`; só a sessão precisa dela ativa para o
  // teste seguir pelo caminho real de contratação.
  await db
    .update(usuarios)
    .set({ status: 'ativo', emailVerificado: true, emailVerificadoEm: new Date() })
    .where(eq(usuarios.id, dados.usuarioId))
  const { token, hash } = gerarTokenSessao()
  await db.insert(sessoesUsuario).values({
    usuarioId: dados.usuarioId,
    tokenHash: hash,
    expiraEm: new Date(Date.now() + 3600_000),
    userAgent: 'suite-vincis',
  })
  carlos = { id: dados.usuarioId, token }
  limparCookies()
})

afterAll(async () => {
  sairDaSessao()
  limparCookies()

  const ids = (
    await db
      .select({ id: contratacoesServico.id })
      .from(contratacoesServico)
      .where(
        inArray(contratacoesServico.clienteUsuarioId, [carlos.id, contas.estranho.id]),
      )
  ).map(({ id }) => id)
  if (ids.length) {
    await db
      .delete(parceiroComissoes)
      .where(inArray(parceiroComissoes.contratacaoId, ids))
    await db
      .delete(parceiroAtribuicoes)
      .where(inArray(parceiroAtribuicoes.contratacaoId, ids))
    await db.delete(atendimentos).where(inArray(atendimentos.contratacaoId, ids))
    await db.delete(contratacoesServico).where(inArray(contratacoesServico.id, ids))
  }
  const ciclos = (
    await db
      .select({ id: parceiroIndicacoes.id })
      .from(parceiroIndicacoes)
      .where(eq(parceiroIndicacoes.parceiroId, joao.id))
  ).map(({ id }) => id)
  if (ciclos.length) {
    await db.delete(parceiroEventos).where(inArray(parceiroEventos.indicacaoId, ciclos))
    await db.delete(parceiroIndicacoes).where(inArray(parceiroIndicacoes.id, ciclos))
  }
  // A ordem é dependência real do banco: o que aponta para a conta sai antes
  // dela. A contratação também deixa o cliente na carteira do prestador.
  await db.delete(clientes).where(eq(clientes.usuarioId, carlos.id))
  await db.delete(eventosAuditoria).where(eq(eventosAuditoria.autorId, carlos.id))
  await db.delete(sessoesUsuario).where(eq(sessoesUsuario.usuarioId, carlos.id))
  await db.delete(tokensUsuario).where(eq(tokensUsuario.usuarioId, carlos.id))
  await db.delete(usuariosPerfis).where(eq(usuariosPerfis.usuarioId, carlos.id))
  await db.delete(usuarios).where(eq(usuarios.id, carlos.id))
  await db
    .delete(servicos)
    .where(inArray(servicos.id, [servicoContabil, servicoJuridico]))
  await limparContas(SUFIXO)
})

async function contratar(token: string, servicoId: string) {
  entrarComo(token)
  const resultado = await contratarServico({ servicoId })
  sairDaSessao()
  return resultado
}

async function negociosDoCiclo() {
  const [ciclo] = await listarIndicacoesDoParceiro(joao.id)
  return ciclo
}

/**
 * A contratação direta do catálogo é um caminho real do Cliente — e era o que
 * o programa de parceiros não enxergava: o cliente indicado contratava, o
 * negócio nascia, e o parceiro que o trouxe não aparecia em lugar nenhum.
 */
describe('atribuição nascida da contratação direta', () => {
  it('a contratação de um cliente indicado nasce sob o parceiro', async () => {
    expect((await contratar(carlos.token, servicoContabil)).sucesso).toBe(true)

    const ciclo = await negociosDoCiclo()
    expect(ciclo.lead?.nome).toBe('Carlos Indicado')
    expect(ciclo.negocios).toHaveLength(1)
    expect(ciclo.negocios[0].servico).toBe('contabilidade')
    expect(ciclo.negocios[0].prazoDias).toBeGreaterThan(0)
    expect(ciclo.negocios[0].expiraEm).toBeInstanceOf(Date)
  })

  it('a contratação efetiva grava o evento de contratação, não o de interesse', async () => {
    const ciclo = await negociosDoCiclo()
    expect(ciclo.eventos.map((evento) => evento.tipo)).toEqual([
      'acessou_link',
      'cadastrou_conta',
      'contratou_servico',
    ])
  })

  it('o evento carrega o nome congelado do serviço', async () => {
    const ciclo = await negociosDoCiclo()
    const contratou = ciclo.eventos.find(
      (evento) => evento.tipo === 'contratou_servico',
    )!
    expect((contratou.dados as { nome?: string }).nome).toBe(
      'Abertura de Empresa MEI',
    )
  })

  it('a jornada respeita a ordem real do relógio', async () => {
    const ciclo = await negociosDoCiclo()
    const instantes = [
      ...ciclo.eventos.map((evento) => evento.ocorridoEm.getTime()),
    ]
    expect(instantes).toEqual([...instantes].sort((a, b) => a - b))
    // O negócio nasce junto com o evento que o registra.
    expect(ciclo.negocios[0].iniciadaEm.getTime()).toBeGreaterThanOrEqual(
      ciclo.eventos[1].ocorridoEm.getTime(),
    )
  })

  it('cada serviço é um negócio, com a sua própria janela', async () => {
    expect((await contratar(carlos.token, servicoJuridico)).sucesso).toBe(true)

    const ciclo = await negociosDoCiclo()
    expect(ciclo.negocios).toHaveLength(2)
    expect(ciclo.negocios.map((negocio) => negocio.servico).sort()).toEqual([
      'advocacia',
      'contabilidade',
    ])
  })

  it('contratar de novo o mesmo serviço não duplica atribuição nem evento', async () => {
    const antes = (await negociosDoCiclo()).negocios.length
    await contratar(carlos.token, servicoContabil)
    await contratar(carlos.token, servicoContabil)

    const ciclo = await negociosDoCiclo()
    expect(ciclo.negocios).toHaveLength(antes)
    // Um evento de contratação por negócio, mesmo depois de dois retries.
    expect(
      ciclo.eventos.filter((evento) => evento.tipo === 'contratou_servico'),
    ).toHaveLength(antes)
  })

  it('o negócio mostra o nome, o tipo e o valor congelados da contratação', async () => {
    const ciclo = await negociosDoCiclo()
    const contabil = ciclo.negocios.find(
      (negocio) => negocio.servico === 'contabilidade',
    )!

    expect(contabil.nome).toBe('Abertura de Empresa MEI')
    expect(contabil.tipo).toBe('avulso')
    expect(contabil.valorCentavos).toBe(10000)
    expect(contabil.contratado).toBe(true)
  })

  it('a estimativa de comissão sai do percentual avulso, sobre o valor congelado', async () => {
    const ciclo = await negociosDoCiclo()
    const contabil = ciclo.negocios.find(
      (negocio) => negocio.servico === 'contabilidade',
    )!

    // 10% de R$ 100,00 — e nada disso vira lançamento em lugar nenhum.
    expect(estimarComissaoAvulsoCentavos(contabil.valorCentavos)).toBe(1000)
    expect(PERCENTUAL_AVULSO).toBe(10)
  })

  it('serviço sob orçamento não inventa valor nem estimativa', async () => {
    expect(estimarComissaoAvulsoCentavos(null)).toBeNull()
  })

  it('nenhuma tabela financeira nasce da atribuição', async () => {
    const [{ colunas }] = await db.execute<{ colunas: number }>(
      sqlBruto`select count(*)::int as colunas from information_schema.columns
        where table_name = 'parceiro_atribuicoes'
          and column_name in ('valor','comissao','percentual','saldo')`,
    )
    expect(Number(colunas)).toBe(0)
  })

  it('a contratação efetiva gera uma comissão real de 10%, congelada', async () => {
    const ciclo = await negociosDoCiclo()
    const contabil = ciclo.negocios.find(
      (negocio) => negocio.servico === 'contabilidade',
    )!

    expect(contabil.comissao).not.toBeNull()
    expect(contabil.comissao!.valorCentavos).toBe(1000)
    expect(contabil.comissao!.percentual).toBe(10)
    expect(contabil.comissao!.status).toBe('gerada')
  })

  it('o card mostra o profissional com o identificador público', async () => {
    const ciclo = await negociosDoCiclo()
    const contabil = ciclo.negocios.find(
      (negocio) => negocio.servico === 'contabilidade',
    )!

    expect(contabil.profissional?.nome).toBe('Teste prestador')
    expect(contabil.profissional?.codigoPublico).toMatch(/^PRO-[2-9A-HJ-NP-Z]{6}$/)
  })

  it('retry não cria a segunda comissão', async () => {
    await contratar(carlos.token, servicoContabil)
    await contratar(carlos.token, servicoContabil)

    const linhas = await db
      .select({ id: parceiroComissoes.id })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.clienteUsuarioId, carlos.id))
    // Um negócio contábil e um jurídico — nunca duas do mesmo.
    expect(linhas).toHaveLength(2)
  })

  it('concluir a contratação libera a comissão; cancelar a encerra', async () => {
    const [comissao] = await db
      .select({
        id: parceiroComissoes.id,
        contratacaoId: parceiroComissoes.contratacaoId,
      })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.clienteUsuarioId, carlos.id))
      .limit(1)

    await moverComissaoDaContratacao(db, comissao.contratacaoId, 'disponivel')
    const [liberada] = await db
      .select({ status: parceiroComissoes.status, em: parceiroComissoes.disponivelEm })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.id, comissao.id))
    expect(liberada.status).toBe('disponivel')
    expect(liberada.em).toBeInstanceOf(Date)

    // Já liberada não volta a ser cancelada por uma transição atrasada.
    await moverComissaoDaContratacao(db, comissao.contratacaoId, 'cancelada')
    const [depois] = await db
      .select({ status: parceiroComissoes.status })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.id, comissao.id))
    expect(depois.status).toBe('disponivel')
  })

  it('o parceiro não enxerga a comissão de outro parceiro', async () => {
    const outro = await listarComissoesDoParceiro(
      '00000000-0000-0000-0000-000000000000',
    )
    expect(outro.comissoes).toHaveLength(0)
    expect(outro.resumo.totalCentavos).toBe(0)

    const minhas = await listarComissoesDoParceiro(joao.id)
    expect(minhas.comissoes.length).toBeGreaterThan(0)
    expect(minhas.resumo.totalCentavos).toBeGreaterThan(0)
  })

  it('o resumo financeiro soma só o que é real, e cancelada fica fora do total', async () => {
    const { comissoes, resumo } = await listarComissoesDoParceiro(joao.id)

    const soma = (estados: string[]) =>
      comissoes
        .filter((comissao) => estados.includes(comissao.status))
        .reduce((total, comissao) => total + comissao.valorCentavos, 0)

    // Os totais batem com as linhas listadas — nenhuma constante de layout
    // entra na conta.
    expect(resumo.totalCentavos).toBe(soma(['gerada', 'disponivel', 'paga']))
    expect(resumo.geradaCentavos).toBe(soma(['gerada']))
    expect(resumo.disponivelCentavos).toBe(soma(['disponivel']))
    expect(resumo.pagaCentavos).toBe(soma(['paga']))
    expect(resumo.canceladaCentavos).toBe(soma(['cancelada']))
  })

  it('concluir o serviço de verdade libera a comissão daquele negócio, e só dela', async () => {
    const antes = await listarComissoesDoParceiro(joao.id)
    const alvo = antes.comissoes.find(
      (comissao) => comissao.servico === 'Contrato Social',
    )!
    const outra = antes.comissoes.find(
      (comissao) => comissao.servico !== 'Contrato Social',
    )!
    expect(alvo.status).toBe('gerada')

    const [atendimento] = await db
      .select({
        id: atendimentos.id,
        prestadorId: atendimentos.prestadorId,
      })
      .from(atendimentos)
      .innerJoin(
        parceiroComissoes,
        eq(parceiroComissoes.contratacaoId, atendimentos.contratacaoId),
      )
      .where(eq(parceiroComissoes.id, alvo.id))
      .limit(1)

    // O caminho real da máquina de estados, não um UPDATE de atalho.
    const iniciou = await alterarStatusDoAtendimento({
      atendimentoId: atendimento.id,
      usuarioId: atendimento.prestadorId,
      destino: 'em_andamento',
    })
    expect(iniciou.sucesso).toBe(true)

    const concluiu = await concluirAtendimento({
      atendimentoId: atendimento.id,
      usuarioId: atendimento.prestadorId,
      observacaoFinal: 'Entregue.',
      confirmarPendencias: true,
    })
    expect(concluiu.sucesso).toBe(true)

    const depois = await listarComissoesDoParceiro(joao.id)
    const liberada = depois.comissoes.find((c) => c.id === alvo.id)!
    expect(liberada.status).toBe('disponivel')
    // Percentual e valor continuam os congelados no nascimento do direito.
    expect(liberada.valorCentavos).toBe(alvo.valorCentavos)
    expect(liberada.percentual).toBe(alvo.percentual)

    // O saldo andou exatamente o valor daquela comissão, e o total não mudou.
    expect(depois.resumo.disponivelCentavos).toBe(
      antes.resumo.disponivelCentavos + alvo.valorCentavos,
    )
    expect(depois.resumo.geradaCentavos).toBe(
      antes.resumo.geradaCentavos - alvo.valorCentavos,
    )
    expect(depois.resumo.totalCentavos).toBe(antes.resumo.totalCentavos)

    // O negócio vizinho não foi tocado.
    expect(depois.comissoes.find((c) => c.id === outra.id)!.status).toBe(
      outra.status,
    )

    const [linha] = await db
      .select({ em: parceiroComissoes.disponivelEm })
      .from(parceiroComissoes)
      .where(eq(parceiroComissoes.id, alvo.id))
    expect(linha.em).toBeInstanceOf(Date)
  })

  it('concluir de novo não mexe na comissão já liberada', async () => {
    const antes = await listarComissoesDoParceiro(joao.id)
    const alvo = antes.comissoes.find((c) => c.status === 'disponivel')!

    const [atendimento] = await db
      .select({ id: atendimentos.id, prestadorId: atendimentos.prestadorId })
      .from(atendimentos)
      .innerJoin(
        parceiroComissoes,
        eq(parceiroComissoes.contratacaoId, atendimentos.contratacaoId),
      )
      .where(eq(parceiroComissoes.id, alvo.id))
      .limit(1)

    const repetido = await concluirAtendimento({
      atendimentoId: atendimento.id,
      usuarioId: atendimento.prestadorId,
      observacaoFinal: 'De novo.',
      confirmarPendencias: true,
    })
    expect(repetido.sucesso).toBe(false)

    const depois = await listarComissoesDoParceiro(joao.id)
    expect(depois.comissoes.find((c) => c.id === alvo.id)!.status).toBe(
      'disponivel',
    )
    expect(depois.resumo.disponivelCentavos).toBe(
      antes.resumo.disponivelCentavos,
    )
  })

  it('cliente que não veio de indicação nenhuma não gera atribuição', async () => {
    expect((await contratar(contas.estranho.token, servicoContabil)).sucesso).toBe(
      true,
    )

    const linhas = await db
      .select({ id: parceiroAtribuicoes.id })
      .from(parceiroAtribuicoes)
      .where(eq(parceiroAtribuicoes.usuarioId, contas.estranho.id))
    expect(linhas).toHaveLength(0)
  })
})
