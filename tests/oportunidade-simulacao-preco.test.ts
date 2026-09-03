import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, inArray, like } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  atendimentoLeituras,
  clientes,
  contratacoesServico,
  eventosAuditoria,
  notificacoes,
  oportunidadeContrapropostas,
  oportunidadeDispensas,
  oportunidadePagamentos,
  oportunidadePropostas,
  oportunidades,
  perfis,
  perfisProfissionais,
  precificacaoProfissional,
  precificacaoProfissionalValores,
  sessoesUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { ACOES_AUDITORIA } from '@/features/auditoria/lib/registrar-evento'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import { criarContraproposta } from '@/features/oportunidades/actions/negociacao'
import { registrarVisualizacaoDaOportunidade } from '@/features/oportunidades/actions/oportunidades'
import {
  enviarProposta,
  marcarSemInteresse,
} from '@/features/oportunidades/actions/propostas'
import { obterVinculoComOportunidade } from '@/features/oportunidades/lib/autorizacao'
import { listarOportunidadesDoCliente } from '@/features/oportunidades/queries/listar-oportunidades-do-cliente'
import { listarOportunidadesDoPrestador } from '@/features/oportunidades/queries/listar-oportunidades-do-prestador'
import type { SimulacaoDaOportunidade } from '@/features/oportunidades/types/oportunidade'
import { calcularPreco, calcularPrecos } from '@/features/precificacao/lib/motor'
import { respostasIniciais } from '@/features/precificacao/lib/respostas'
import { obterTabelaPrecificacao } from '@/features/precificacao/queries/obter-tabela-precificacao'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import { demonstrarInteresseNaSimulacao } from '@/features/precificacao-profissional/actions/interesse'
import { publicarPrecos } from '@/features/precificacao-profissional/actions/precificacao-profissional'
import { SERVICO_DO_PROFISSIONAL } from '@/features/precificacao-profissional/constants/precificacao-profissional'
import { valoresDeReferencia } from '@/features/precificacao-profissional/lib/grade'
import { obterPrecificacaoPublicaDoProfissional } from '@/features/precificacao-profissional/queries/precificacao-publica'
import type { ValoresDoProfissional } from '@/features/precificacao-profissional/types/precificacao-profissional'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'
import { entrarComo, sairDaSessao } from './setup/sessao'

/**
 * A simulação de preços do Profissional vira uma Oportunidade.
 *
 * O arquivo responde a três perguntas, nesta ordem de importância:
 *
 * 1. **o que nasce é um lead, e não uma venda** — nenhuma contratação, nenhum
 *    pagamento, nenhuma assinatura, nenhuma comissão sai deste caminho;
 * 2. **o retrato é fiel e congelado** — o preço gravado é o que o cliente viu,
 *    calculado pelo motor sobre a tabela publicada, e ele não muda quando o
 *    Profissional republica;
 * 3. **o módulo é o mesmo** — a solicitação aparece, é lida, aceita, recusada e
 *    negociada pelas Server Actions que já existiam, com o isolamento que já
 *    existia.
 */

const SUFIXO = '@simulacao-preco.teste'

type Chave = 'cliente' | 'outroCliente' | 'ricardo' | 'ana' | 'semPreco'

const DEFINICOES: Record<
  Chave,
  { perfil: string; prestador?: 'profissional'; tipoProfissional?: string }
> = {
  cliente: { perfil: 'cliente' },
  outroCliente: { perfil: 'cliente' },
  ricardo: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
  },
  ana: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
  },
  // Habilitado, compatível — e sem tabela publicada. É ele quem prova que
  // "tenho interesse" não inventa preço para quem não publicou nenhum.
  semPreco: {
    perfil: 'profissional',
    prestador: 'profissional',
    tipoProfissional: 'contabilidade',
  },
}

type Conta = { id: string; token: string }
let contas: Record<Chave, Conta>
let estrutura: TabelaPrecificacao
let retratoDaVincisAntes: string

/** Dois cenários bem diferentes, para que preços iguais não passem por acaso. */
const EMPRESA_PEQUENA: RespostasPrecificacao = {
  regime: 'simples',
  atividades: ['servicos'],
  funcionarios: 0,
  notasFiscais: 'ate10',
  emissor: 'empresa',
  faturamento: 'ate50k',
  atendimento: 'digital',
  rotina: 'compartilhado',
  adicionais: [],
}

const EMPRESA_GRANDE: RespostasPrecificacao = {
  regime: 'presumido',
  atividades: ['industria'],
  funcionarios: 7,
  notasFiscais: '31a100',
  emissor: 'vincis',
  faturamento: '150a500k',
  atendimento: 'prioritario',
  rotina: 'vincis',
  adicionais: [],
}

function entradaDe(valores: ValoresDoProfissional) {
  return {
    valores: {
      precosBase: Object.entries(valores.precosBase).map(([chave, centavos]) => ({
        chave,
        valorReais: centavos / 100,
      })),
      faixas: Object.entries(valores.faixas).map(([chave, centavos]) => ({
        chave,
        valorReais: centavos / 100,
      })),
      fatores: Object.entries(valores.fatores).map(([chave, milesimos]) => ({
        chave,
        acrescimoPercentual: (milesimos - 1000) / 10,
        acrescimoFixoReais:
          chave in valores.acrescimosFixos
            ? valores.acrescimosFixos[chave] / 100
            : null,
      })),
    },
  }
}

/** O retrato da precificação da Vincis — a coisa que não pode mudar. */
function retratoDaVincis(tabela: TabelaPrecificacao) {
  return JSON.stringify({
    configuracao: tabela,
    precos: [respostasIniciais(tabela), EMPRESA_PEQUENA, EMPRESA_GRANDE].map(
      (respostas) => calcularPrecos(tabela, respostas),
    ),
  })
}

async function limpar() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(like(usuarios.email, `%${SUFIXO}`))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return

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
      .delete(oportunidadeDispensas)
      .where(inArray(oportunidadeDispensas.oportunidadeId, solicitacaoIds))
    await db
      .delete(oportunidadePropostas)
      .where(inArray(oportunidadePropostas.oportunidadeId, solicitacaoIds))
    await db
      .delete(atendimentoLeituras)
      .where(inArray(atendimentoLeituras.recursoId, solicitacaoIds))
    await db.delete(oportunidades).where(inArray(oportunidades.id, solicitacaoIds))
  }

  await db
    .delete(precificacaoProfissionalValores)
    .where(inArray(precificacaoProfissionalValores.profissionalId, ids))
  await db
    .delete(precificacaoProfissional)
    .where(inArray(precificacaoProfissional.profissionalId, ids))
  await db.delete(clientes).where(inArray(clientes.usuarioId, ids))
  await db.delete(clientes).where(inArray(clientes.profissionalId, ids))
  await db.delete(notificacoes).where(inArray(notificacoes.destinatarioId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.autorId, ids))
  await db.delete(eventosAuditoria).where(inArray(eventosAuditoria.usuarioId, ids))
  await db
    .delete(atendimentoLeituras)
    .where(inArray(atendimentoLeituras.usuarioId, ids))
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
        nome: `Simulacao ${chave}`,
        email: `${chave}${SUFIXO}`,
        whatsapp: `1194800${String(i).padStart(4, '0')}`,
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
        apresentacao: 'Conta de teste da simulação de preços.',
        nomeAtuacao: chave,
        modalidadeAtuacao: 'individual',
        cidade: 'São Paulo',
        estado: 'SP',
        areasAtuacao: [],
        especialidades: ['Planejamento Tributário'],
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
      userAgent: 'simulacao-preco-teste',
    })
    criadas[chave] = { id: usuario.id, token }
    i += 1
  }
  return criadas
}

/**
 * Publica a tabela do profissional com preços próprios.
 *
 * **Todos** os preços base são deslocados, e não só o do Simples: com um regime
 * só diferente, dois profissionais cobrariam o mesmo por uma empresa do Lucro
 * Presumido, e um teste de isolamento passaria por coincidência.
 */
async function publicarPara(chave: Chave, deslocamentoCentavos: number) {
  entrarComo(contas[chave].token)
  const base = valoresDeReferencia(estrutura)
  const resultado = await publicarPrecos(
    entradaDe({
      ...base,
      precosBase: Object.fromEntries(
        Object.entries(base.precosBase).map(([regime, centavos]) => [
          regime,
          centavos + deslocamentoCentavos,
        ]),
      ),
    }),
  )
  sairDaSessao()
  expect(resultado.sucesso).toBe(true)
}

/** O preço que a página pública exibiria agora, para este cenário. */
async function precoExibido(chave: Chave, respostas: RespostasPrecificacao) {
  const publica = await obterPrecificacaoPublicaDoProfissional(contas[chave].id)
  expect(publica).not.toBeNull()
  return calcularPreco(publica!.tabela, SERVICO_DO_PROFISSIONAL, respostas)
    .mensalCentavos
}

/** Demonstra interesse como um cliente e devolve o resultado da action. */
async function demonstrarInteresse(
  cliente: Chave,
  prestador: Chave,
  respostas: RespostasPrecificacao = EMPRESA_PEQUENA,
) {
  entrarComo(contas[cliente].token)
  const resultado = await demonstrarInteresseNaSimulacao({
    prestadorId: contas[prestador].id,
    respostas,
  })
  sairDaSessao()
  return resultado
}

async function lerOportunidade(id: string) {
  const [linha] = await db
    .select()
    .from(oportunidades)
    .where(eq(oportunidades.id, id))
    .limit(1)
  return linha
}

beforeAll(async () => {
  estrutura = await obterTabelaPrecificacao()
  retratoDaVincisAntes = retratoDaVincis(estrutura)
  contas = await montar()
  await publicarPara('ricardo', 2_000)
  await publicarPara('ana', 9_000)
})

afterAll(async () => {
  sairDaSessao()
  await limpar()
})

beforeEach(async () => {
  sairDaSessao()
  // Cada teste começa sem solicitação nenhuma: a proteção de duplicidade é
  // sobre a intenção **viva**, e um resto do teste anterior a acionaria.
  const ids = Object.values(contas).map((conta) => conta.id)
  const solicitacoes = await db
    .select({ id: oportunidades.id })
    .from(oportunidades)
    .where(inArray(oportunidades.clienteUsuarioId, ids))
  const solicitacaoIds = solicitacoes.map(({ id }) => id)
  if (!solicitacaoIds.length) return

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
    .delete(oportunidadePropostas)
    .where(inArray(oportunidadePropostas.oportunidadeId, solicitacaoIds))
  await db
    .delete(oportunidadeDispensas)
    .where(inArray(oportunidadeDispensas.oportunidadeId, solicitacaoIds))
  await db
    .delete(atendimentoLeituras)
    .where(inArray(atendimentoLeituras.recursoId, solicitacaoIds))
  await db.delete(oportunidades).where(inArray(oportunidades.id, solicitacaoIds))
  await db.delete(notificacoes).where(inArray(notificacoes.destinatarioId, ids))
})

describe('a simulação vira uma oportunidade', () => {
  it('sem sessão, o botão pede para entrar em vez de criar qualquer coisa', async () => {
    sairDaSessao()
    const resultado = await demonstrarInteresseNaSimulacao({
      prestadorId: contas.ricardo.id,
      respostas: EMPRESA_PEQUENA,
    })

    expect(resultado.sucesso).toBe(false)
    expect(resultado.precisaEntrar).toBe(true)

    const [linha] = await db
      .select({ id: oportunidades.id })
      .from(oportunidades)
      .where(eq(oportunidades.destinatarioId, contas.ricardo.id))
      .limit(1)
    expect(linha).toBeUndefined()
  })

  it('a mesma simulação, depois de entrar, cria a solicitação', async () => {
    const resultado = await demonstrarInteresse('cliente', 'ricardo')

    expect(resultado.sucesso).toBe(true)
    const oportunidade = await lerOportunidade(resultado.dados!.oportunidadeId)
    expect(oportunidade.clienteUsuarioId).toBe(contas.cliente.id)
    expect(oportunidade.destinatarioId).toBe(contas.ricardo.id)
    expect(oportunidade.visibilidade).toBe('privada')
    expect(oportunidade.status).toBe('aberta')
  })

  it('a origem fica gravada e distinguível das demais', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')
    const oportunidade = await lerOportunidade(dados!.oportunidadeId)
    expect(oportunidade.origem).toBe('simulacao_preco')

    const daSimulacao = await db
      .select({ id: oportunidades.id })
      .from(oportunidades)
      .where(
        and(
          eq(oportunidades.clienteUsuarioId, contas.cliente.id),
          eq(oportunidades.origem, 'simulacao_preco'),
        ),
      )
    expect(daSimulacao).toHaveLength(1)
  })

  it('o retrato guarda todas as respostas do configurador', async () => {
    const { dados } = await demonstrarInteresse(
      'cliente',
      'ricardo',
      EMPRESA_GRANDE,
    )
    const oportunidade = await lerOportunidade(dados!.oportunidadeId)
    const simulacao = oportunidade.simulacao as SimulacaoDaOportunidade

    expect(simulacao.profissionalId).toBe(contas.ricardo.id)
    expect(simulacao.respostas).toEqual(EMPRESA_GRANDE)
    expect(simulacao.simuladaEm).toBeTruthy()

    // Enquadramento, ramo, emissor, atendimento, rotina, funcionários, notas e
    // faturamento — as oito perguntas que o cliente respondeu.
    const codigos = simulacao.itens.map((item) => item.codigo)
    expect(codigos).toEqual([
      'regime',
      'atividade',
      'emissor',
      'atendimento',
      'rotina',
      'funcionarios',
      'notas_fiscais',
      'faturamento',
    ])
    // Rótulos escritos, e não códigos: o retrato precisa continuar legível se
    // o Profissional renomear uma opção depois.
    expect(simulacao.itens.every((item) => item.valor.length > 0)).toBe(true)
    expect(
      simulacao.itens.find((item) => item.codigo === 'funcionarios')?.valor,
    ).toBe('7')
  })

  it('o preço guardado é exatamente o que a página exibiu', async () => {
    const esperado = await precoExibido('ricardo', EMPRESA_GRANDE)
    const { dados } = await demonstrarInteresse(
      'cliente',
      'ricardo',
      EMPRESA_GRANDE,
    )
    const oportunidade = await lerOportunidade(dados!.oportunidadeId)
    const simulacao = oportunidade.simulacao as SimulacaoDaOportunidade

    expect(simulacao.precoMensalCentavos).toBe(esperado)
    // E não é o preço da outra pessoa: as tabelas foram publicadas diferentes.
    expect(simulacao.precoMensalCentavos).not.toBe(
      await precoExibido('ana', EMPRESA_GRANDE),
    )
  })

  it('o retrato não muda quando o profissional republica a tabela', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')
    const antes = (
      await lerOportunidade(dados!.oportunidadeId)
    ).simulacao as SimulacaoDaOportunidade

    await publicarPara('ricardo', 20_000)
    const depois = (
      await lerOportunidade(dados!.oportunidadeId)
    ).simulacao as SimulacaoDaOportunidade

    expect(depois).toEqual(antes)
    // O preço novo é outro — o retrato é que está congelado.
    expect(await precoExibido('ricardo', EMPRESA_PEQUENA)).not.toBe(
      antes.precoMensalCentavos,
    )
    await publicarPara('ricardo', 2_000)
  })

  it('o valor pretendido continua vazio: o cliente não declarou nenhum', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')
    const oportunidade = await lerOportunidade(dados!.oportunidadeId)
    expect(oportunidade.valorPretendidoCentavos).toBeNull()
  })

  it('a criação é auditada com a origem no metadado', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')
    const [evento] = await db
      .select({ metadados: eventosAuditoria.metadados })
      .from(eventosAuditoria)
      .where(
        and(
          eq(eventosAuditoria.acao, ACOES_AUDITORIA.oportunidadeCriada),
          eq(eventosAuditoria.registroAfetado, dados!.oportunidadeId),
        ),
      )
      .limit(1)

    expect(evento).toBeDefined()
    expect(evento.metadados).toMatchObject({
      origemDaOportunidade: 'simulacao_preco',
      destinatarioId: contas.ricardo.id,
    })
  })
})

describe('o destinatário é decidido pelo servidor', () => {
  it('quem não publicou preço não recebe interesse nenhum', async () => {
    const resultado = await demonstrarInteresse('cliente', 'semPreco')
    expect(resultado.sucesso).toBe(false)

    const linhas = await db
      .select({ id: oportunidades.id })
      .from(oportunidades)
      .where(eq(oportunidades.destinatarioId, contas.semPreco.id))
    expect(linhas).toHaveLength(0)
  })

  it('um id que não é de profissional não cria solicitação', async () => {
    const resultado = await demonstrarInteresse('cliente', 'outroCliente')
    expect(resultado.sucesso).toBe(false)
  })

  it('trocar o profissional na query troca a tabela, e não o destinatário', async () => {
    // A "manipulação": o cliente estava na página do Ricardo e envia o id da
    // Ana. O que ele consegue é uma solicitação para a Ana, com o preço **da
    // Ana** — nunca o preço do Ricardo em nome de outra pessoa.
    const { dados } = await demonstrarInteresse('cliente', 'ana')
    const oportunidade = await lerOportunidade(dados!.oportunidadeId)
    const simulacao = oportunidade.simulacao as SimulacaoDaOportunidade

    expect(oportunidade.destinatarioId).toBe(contas.ana.id)
    expect(simulacao.profissionalId).toBe(contas.ana.id)
    expect(simulacao.precoMensalCentavos).toBe(
      await precoExibido('ana', EMPRESA_PEQUENA),
    )
  })

  it('ninguém demonstra interesse em si mesmo', async () => {
    entrarComo(contas.ricardo.token)
    const resultado = await demonstrarInteresseNaSimulacao({
      prestadorId: contas.ricardo.id,
      respostas: EMPRESA_PEQUENA,
    })
    sairDaSessao()
    expect(resultado.sucesso).toBe(false)
  })

  it('uma resposta que não existe na grade é recusada', async () => {
    const resultado = await demonstrarInteresse('cliente', 'ricardo', {
      ...EMPRESA_PEQUENA,
      regime: 'regime-que-nao-existe',
    })
    expect(resultado.sucesso).toBe(false)
  })
})

describe('a duplicidade é barrada, a intenção nova não', () => {
  it('clicar de novo com a mesma simulação devolve a mesma solicitação', async () => {
    const primeira = await demonstrarInteresse('cliente', 'ricardo')
    const segunda = await demonstrarInteresse('cliente', 'ricardo')

    expect(segunda.sucesso).toBe(true)
    expect(segunda.dados!.oportunidadeId).toBe(primeira.dados!.oportunidadeId)
    expect(segunda.dados!.repetida).toBe(true)

    const linhas = await db
      .select({ id: oportunidades.id })
      .from(oportunidades)
      .where(eq(oportunidades.clienteUsuarioId, contas.cliente.id))
    expect(linhas).toHaveLength(1)
  })

  it('cliques simultâneos não criam duas solicitações', async () => {
    // Sem `await` entre elas: as duas chegam antes de qualquer uma gravar, que
    // é o cenário em que a consulta prévia sozinha falharia.
    entrarComo(contas.cliente.token)
    const entrada = {
      prestadorId: contas.ricardo.id,
      respostas: EMPRESA_PEQUENA,
    }
    const resultados = await Promise.all([
      demonstrarInteresseNaSimulacao(entrada),
      demonstrarInteresseNaSimulacao(entrada),
      demonstrarInteresseNaSimulacao(entrada),
    ])
    sairDaSessao()

    expect(resultados.every((r) => r.sucesso)).toBe(true)
    const linhas = await db
      .select({ id: oportunidades.id })
      .from(oportunidades)
      .where(eq(oportunidades.clienteUsuarioId, contas.cliente.id))
    expect(linhas).toHaveLength(1)
  })

  it('uma simulação diferente é uma intenção diferente', async () => {
    await demonstrarInteresse('cliente', 'ricardo', EMPRESA_PEQUENA)
    const outra = await demonstrarInteresse('cliente', 'ricardo', EMPRESA_GRANDE)

    expect(outra.sucesso).toBe(true)
    const linhas = await db
      .select({ id: oportunidades.id })
      .from(oportunidades)
      .where(eq(oportunidades.clienteUsuarioId, contas.cliente.id))
    expect(linhas).toHaveLength(2)
  })

  it('depois de recusada, a mesma simulação pode voltar', async () => {
    const primeira = await demonstrarInteresse('cliente', 'ricardo')

    entrarComo(contas.ricardo.token)
    await marcarSemInteresse({ oportunidadeId: primeira.dados!.oportunidadeId })
    sairDaSessao()

    const segunda = await demonstrarInteresse('cliente', 'ricardo')
    expect(segunda.sucesso).toBe(true)
    expect(segunda.dados!.oportunidadeId).not.toBe(
      primeira.dados!.oportunidadeId,
    )
  })

  it('a proteção é por par cliente/profissional', async () => {
    await demonstrarInteresse('cliente', 'ricardo')
    const daAna = await demonstrarInteresse('cliente', 'ana')
    const doOutro = await demonstrarInteresse('outroCliente', 'ricardo')

    expect(daAna.sucesso).toBe(true)
    expect(doOutro.sucesso).toBe(true)
  })
})

describe('o profissional recebe, abre, aceita ou recusa', () => {
  it('a solicitação chega ao sino e à lista de oportunidades dele', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')

    const avisos = await db
      .select({ tipo: notificacoes.tipo, recursoId: notificacoes.recursoId })
      .from(notificacoes)
      .where(eq(notificacoes.destinatarioId, contas.ricardo.id))
    expect(avisos).toContainEqual({
      tipo: TIPOS_NOTIFICACAO.oportunidadeDireta,
      recursoId: dados!.oportunidadeId,
    })

    const lista = await listarOportunidadesDoPrestador(contas.ricardo.id)
    const minha = lista.find((item) => item.id === dados!.oportunidadeId)
    expect(minha).toBeDefined()
    expect(minha!.origem).toBe('simulacao_preco')
    expect(minha!.direcionadaAMim).toBe(true)
    expect(minha!.simulacao!.precoMensalCentavos).toBe(
      await precoExibido('ricardo', EMPRESA_PEQUENA),
    )
  })

  it('abrir a solicitação marca a visualização, e o cliente a percebe', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')

    const antes = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(
      antes.find((item) => item.id === dados!.oportunidadeId)!.visualizadaEm,
    ).toBeNull()

    entrarComo(contas.ricardo.token)
    const marca = await registrarVisualizacaoDaOportunidade({
      oportunidadeId: dados!.oportunidadeId,
    })
    sairDaSessao()
    expect(marca.sucesso).toBe(true)

    const depois = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(
      depois.find((item) => item.id === dados!.oportunidadeId)!.visualizadaEm,
    ).not.toBeNull()
  })

  it('só o destinatário marca visualização', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')

    entrarComo(contas.ana.token)
    const daAna = await registrarVisualizacaoDaOportunidade({
      oportunidadeId: dados!.oportunidadeId,
    })
    sairDaSessao()
    expect(daAna.sucesso).toBe(false)

    const lista = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(
      lista.find((item) => item.id === dados!.oportunidadeId)!.visualizadaEm,
    ).toBeNull()
  })

  it('aceitar é responder — e o cliente é avisado', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')

    entrarComo(contas.ricardo.token)
    const resposta = await enviarProposta({
      oportunidadeId: dados!.oportunidadeId,
      mensagem:
        'Tenho interesse em atender sua empresa. Podemos conversar sobre os documentos?',
      valor: '',
    })
    sairDaSessao()
    expect(resposta.sucesso).toBe(true)

    const avisos = await db
      .select({ tipo: notificacoes.tipo })
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.destinatarioId, contas.cliente.id),
          eq(notificacoes.recursoId, dados!.oportunidadeId),
        ),
      )
    expect(avisos.map((a) => a.tipo)).toContain(
      TIPOS_NOTIFICACAO.oportunidadeRespondida,
    )

    const lista = await listarOportunidadesDoCliente(contas.cliente.id)
    const minha = lista.find((item) => item.id === dados!.oportunidadeId)!
    expect(minha.totalPropostas).toBe(1)
    expect(minha.status).toBe('aberta')
    // Aceitar interesse não fecha acordo nem cria protocolo nenhum.
    expect(minha.propostas[0].status).toBe('enviada')
    expect(minha.pagamento).toBeNull()
    expect(minha.atendimento).toBeNull()
  })

  it('recusar encerra a solicitação e avisa o cliente', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')

    entrarComo(contas.ricardo.token)
    const recusa = await marcarSemInteresse({
      oportunidadeId: dados!.oportunidadeId,
    })
    sairDaSessao()
    expect(recusa.sucesso).toBe(true)

    const oportunidade = await lerOportunidade(dados!.oportunidadeId)
    expect(oportunidade.status).toBe('encerrada')
    expect(oportunidade.motivoEncerramento).toBe('sem_interesse')

    const avisos = await db
      .select({ tipo: notificacoes.tipo })
      .from(notificacoes)
      .where(
        and(
          eq(notificacoes.destinatarioId, contas.cliente.id),
          eq(notificacoes.recursoId, dados!.oportunidadeId),
        ),
      )
    expect(avisos.map((a) => a.tipo)).toContain(
      TIPOS_NOTIFICACAO.oportunidadeSemInteresse,
    )

    const lista = await listarOportunidadesDoCliente(contas.cliente.id)
    expect(
      lista.find((item) => item.id === dados!.oportunidadeId)!.semInteresseEm,
    ).not.toBeNull()
  })

  it('a conversa continua dentro da própria oportunidade', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')

    entrarComo(contas.ricardo.token)
    await enviarProposta({
      oportunidadeId: dados!.oportunidadeId,
      mensagem: 'Tenho interesse. Me conta há quanto tempo a empresa existe?',
      valor: '300,00',
    })
    sairDaSessao()

    const doCliente = await listarOportunidadesDoCliente(contas.cliente.id)
    const proposta = doCliente.find(
      (item) => item.id === dados!.oportunidadeId,
    )!.propostas[0]
    expect(proposta.mensagem).toContain('Tenho interesse')

    entrarComo(contas.cliente.token)
    const resposta = await criarContraproposta({
      propostaId: proposta.id,
      valor: '280,00',
      mensagem: 'Existe há dois anos. Consegue esse valor?',
    })
    sairDaSessao()
    expect(resposta.sucesso).toBe(true)

    // A mensagem ficou pendurada nesta oportunidade, e não em outra.
    const doPrestador = await listarOportunidadesDoPrestador(contas.ricardo.id)
    const minha = doPrestador.find((item) => item.id === dados!.oportunidadeId)!
    expect(minha.minhaProposta!.contrapropostaPendente!.mensagem).toBe(
      'Existe há dois anos. Consegue esse valor?',
    )

    const outras = doPrestador.filter(
      (item) => item.id !== dados!.oportunidadeId,
    )
    expect(
      outras.every((item) => item.minhaProposta?.contrapropostaPendente == null),
    ).toBe(true)
  })
})

describe('o isolamento continua valendo', () => {
  it('a Ana não alcança a solicitação dirigida ao Ricardo', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')

    expect(
      await obterVinculoComOportunidade(
        dados!.oportunidadeId,
        contas.ana.id,
      ),
    ).toBeNull()

    const lista = await listarOportunidadesDoPrestador(contas.ana.id)
    expect(lista.some((item) => item.id === dados!.oportunidadeId)).toBe(false)

    entrarComo(contas.ana.token)
    const tentativa = await enviarProposta({
      oportunidadeId: dados!.oportunidadeId,
      mensagem: 'Quero atender esta empresa, mesmo sem ter sido escolhido.',
      valor: '',
    })
    sairDaSessao()
    expect(tentativa.sucesso).toBe(false)
  })

  it('o Ricardo não alcança a solicitação dirigida à Ana', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ana')

    expect(
      await obterVinculoComOportunidade(
        dados!.oportunidadeId,
        contas.ricardo.id,
      ),
    ).toBeNull()

    entrarComo(contas.ricardo.token)
    const tentativa = await marcarSemInteresse({
      oportunidadeId: dados!.oportunidadeId,
    })
    sairDaSessao()
    expect(tentativa.sucesso).toBe(false)
  })

  it('um cliente não vê a solicitação do outro', async () => {
    const doA = await demonstrarInteresse('cliente', 'ricardo')
    const doB = await demonstrarInteresse('outroCliente', 'ana')

    const listaA = await listarOportunidadesDoCliente(contas.cliente.id)
    const listaB = await listarOportunidadesDoCliente(contas.outroCliente.id)

    expect(listaA.map((item) => item.id)).toContain(doA.dados!.oportunidadeId)
    expect(listaA.map((item) => item.id)).not.toContain(
      doB.dados!.oportunidadeId,
    )
    expect(listaB.map((item) => item.id)).not.toContain(
      doA.dados!.oportunidadeId,
    )

    expect(
      await obterVinculoComOportunidade(
        doB.dados!.oportunidadeId,
        contas.cliente.id,
      ),
    ).toBeNull()
  })
})

describe('nada comercial nasce daqui', () => {
  it('demonstrar interesse e ser aceito não cria pedido, pagamento nem cobrança', async () => {
    const { dados } = await demonstrarInteresse('cliente', 'ricardo')

    entrarComo(contas.ricardo.token)
    await enviarProposta({
      oportunidadeId: dados!.oportunidadeId,
      mensagem: 'Tenho interesse em atender e podemos combinar os detalhes.',
      valor: '300,00',
    })
    sairDaSessao()

    const pagamentos = await db
      .select({ id: oportunidadePagamentos.id })
      .from(oportunidadePagamentos)
      .where(eq(oportunidadePagamentos.oportunidadeId, dados!.oportunidadeId))
    expect(pagamentos).toHaveLength(0)

    const contratacoes = await db
      .select({ id: contratacoesServico.id })
      .from(contratacoesServico)
      .where(eq(contratacoesServico.clienteUsuarioId, contas.cliente.id))
    expect(contratacoes).toHaveLength(0)

    const oportunidade = await lerOportunidade(dados!.oportunidadeId)
    expect(oportunidade.status).toBe('aberta')
    expect(oportunidade.motivoEncerramento).toBeNull()
  })
})

describe('o que já existia continua intacto', () => {
  it('a precificação da Vincis não mudou em nada', async () => {
    expect(retratoDaVincis(await obterTabelaPrecificacao())).toBe(
      retratoDaVincisAntes,
    )
  })

  it('a tabela publicada de cada profissional continua sendo só dele', async () => {
    await demonstrarInteresse('cliente', 'ricardo')
    await demonstrarInteresse('cliente', 'ana')

    const doRicardo = await obterPrecificacaoPublicaDoProfissional(
      contas.ricardo.id,
    )
    const daAna = await obterPrecificacaoPublicaDoProfissional(contas.ana.id)

    expect(
      calcularPreco(doRicardo!.tabela, SERVICO_DO_PROFISSIONAL, EMPRESA_PEQUENA)
        .mensalCentavos,
    ).not.toBe(
      calcularPreco(daAna!.tabela, SERVICO_DO_PROFISSIONAL, EMPRESA_PEQUENA)
        .mensalCentavos,
    )
  })

  it('as solicitações antigas continuam com a origem de sempre', async () => {
    // Uma linha no formato anterior a esta etapa: sem origem, sem retrato, sem
    // chave. É exatamente o que o banco já tinha.
    const [antiga] = await db
      .insert(oportunidades)
      .values({
        clienteUsuarioId: contas.cliente.id,
        categoria: 'contabilidade',
        titulo: 'Solicitação anterior à simulação',
        descricao: 'Preciso de ajuda com a contabilidade da minha empresa.',
        abrangencia: 'BR',
      })
      .returning({ id: oportunidades.id, origem: oportunidades.origem })

    expect(antiga.origem).toBe('solicitacao')

    const lista = await listarOportunidadesDoCliente(contas.cliente.id)
    const lida = lista.find((item) => item.id === antiga.id)!
    expect(lida.origem).toBe('solicitacao')
    expect(lida.simulacao).toBeNull()
    expect(lida.visualizadaEm).toBeNull()
  })
})
