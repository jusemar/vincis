import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Página pública /parceiros: regras reais, simulador fiel ao motor e chamada
 * para participar levando ao fluxo certo.
 *
 * O simulador é conferido contra as funções do motor (as mesmas que gravam a
 * comissão), e a página é renderizada com a configuração publicada pela Gestão
 * no banco descartável da suíte.
 */

const { PaginaParceiros } = await import('@/features/parceiros/components/PaginaParceiros')
const { PERCENTUAL_AVULSO } = await import('@/features/parceiros/constants/programa')
const { calcularComissaoCentavos, calcularComissaoPorCentesimos } = await import('@/features/parceiros/lib/registrar-comissao')
const { nivelPorClientes, obterConfiguracaoVigente, obterNiveisPublicos, publicarConfiguracaoDeNiveis } = await import('@/features/parceiros/lib/niveis')
const { formatarReais, lerReaisEmCentavos, simularAvulso, simularRecorrente } = await import('@/features/parceiros/lib/simulacao')
const { obterSituacaoNaPaginaPublica } = await import('@/features/parceiros/queries/situacao-publica')
const { ativarParceiro } = await import('@/features/parceiros/actions/ativar-parceiro')
const { criarContas, limparContas } = await import('./setup/contas-de-teste')
const { comSessao, sairDaSessao } = await import('./setup/sessao')

const NIVEIS = [
  { codigo: 'bronze', nome: 'Bronze', minimoClientes: 0, percentualCentesimos: 500 },
  { codigo: 'prata', nome: 'Prata', minimoClientes: 4, percentualCentesimos: 750 },
  { codigo: 'ouro', nome: 'Ouro', minimoClientes: 10, percentualCentesimos: 1_000 },
]
const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const pagina = (props: Parameters<typeof PaginaParceiros>[0]) => renderToStaticMarkup(createElement(PaginaParceiros, props))

/* ------------------------------------------------------------------ simulador */

describe('simulador recorrente', () => {
  it('o nível vem dos clientes recorrentes ativos e dos mínimos publicados', () => {
    const nivel = (clientes: number) => simularRecorrente(NIVEIS, { clientesAtivos: clientes, mensalidadeCentavos: 30_000, meses: 1 })!
    expect(nivel(0).nivel.codigo).toBe('bronze')
    expect(nivel(3).nivel.codigo).toBe('bronze')
    expect(nivel(3).proximo).toEqual({ nivel: NIVEIS[1], faltamClientes: 1 })
    expect(nivel(4).nivel.codigo).toBe('prata')
    expect(nivel(9).proximo?.faltamClientes).toBe(1)
    expect(nivel(10).nivel.codigo).toBe('ouro')
    expect(nivel(10).proximo).toBeNull()
  })

  it('calcula como o motor: uma comissão por cliente por mês, em centavos inteiros', () => {
    for (const mensalidade of [30_000, 33_333, 24_000, 10, 99_999]) {
      for (const clientes of [0, 1, 4, 7, 10, 25]) {
        const r = simularRecorrente(NIVEIS, { clientesAtivos: clientes, mensalidadeCentavos: mensalidade, meses: 6 })!
        const configuracao = { versao: 1, protecaoDias: 30, vigenteDesde: new Date(), niveis: NIVEIS.map((n, i) => ({ ...n, ordem: i })) }
        const doMotor = nivelPorClientes(configuracao, clientes)
        expect(r.nivel.codigo).toBe(doMotor.codigo)
        const porCliente = calcularComissaoPorCentesimos(mensalidade, doMotor.percentualCentesimos)
        expect(r.comissaoPorClienteCentavos).toBe(porCliente)
        expect(r.mensalCentavos).toBe(porCliente * clientes)
        expect(r.acumuladoCentavos).toBe(porCliente * clientes * 6)
        expect(Number.isInteger(r.mensalCentavos)).toBe(true)
      }
    }
    // 7,5% de R$ 333,33 = 24,99975 → R$ 25,00 por cliente (meio para cima).
    expect(simularRecorrente(NIVEIS, { clientesAtivos: 4, mensalidadeCentavos: 33_333, meses: 1 })!.comissaoPorClienteCentavos).toBe(2_500)
  })

  it('sem níveis publicados não simula; entradas absurdas são contidas', () => {
    expect(simularRecorrente([], { clientesAtivos: 5, mensalidadeCentavos: 1, meses: 1 })).toBeNull()
    const r = simularRecorrente(NIVEIS, { clientesAtivos: -3, mensalidadeCentavos: Number.NaN, meses: 999 })!
    expect(r.nivel.codigo).toBe('bronze')
    expect(r.mensalCentavos).toBe(0)
    expect(r.meses).toBe(12)
  })
})

describe('simulador avulso', () => {
  it(`${PERCENTUAL_AVULSO}% por contratação, sem nível, com o arredondamento do motor`, () => {
    expect(simularAvulso({ valorServicoCentavos: 50_000, quantidade: 1 })).toEqual({ percentual: PERCENTUAL_AVULSO, porContratacaoCentavos: 5_000, quantidade: 1, totalCentavos: 5_000 })
    expect(simularAvulso({ valorServicoCentavos: 33_335, quantidade: 3 }).porContratacaoCentavos).toBe(calcularComissaoCentavos(33_335, PERCENTUAL_AVULSO))
    expect(simularAvulso({ valorServicoCentavos: 33_335, quantidade: 3 }).totalCentavos).toBe(calcularComissaoCentavos(33_335, PERCENTUAL_AVULSO) * 3)
    expect(simularAvulso({ valorServicoCentavos: 0, quantidade: 5 }).totalCentavos).toBe(0)
  })

  it('lê e mostra reais com centavos', () => {
    expect(lerReaisEmCentavos('1.234,56')).toBe(123_456)
    expect(lerReaisEmCentavos('450')).toBe(45_000)
    expect(lerReaisEmCentavos('R$ 0,5')).toBe(50)
    expect(lerReaisEmCentavos('')).toBe(0)
    expect(formatarReais(2_500).replace(/\s/g, ' ')).toBe('R$ 25,00')
  })
})

/* --------------------------------------------------------- conteúdo honesto */

describe('a página só afirma o que existe', () => {
  const pasta = path.resolve(process.cwd(), 'src/features/parceiros/components')
  const arquivos = ['PaginaParceiros.tsx', ...readdirSync(path.join(pasta, 'publico')).map((f) => `publico/${f}`)]
  const fonte = arquivos.map((f) => readFileSync(path.join(pasta, f), 'utf8')).join('\n')
  // Só o texto visível (fora de comentários de código).
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

  it('sem ranking, depoimentos, pagamentos ao vivo ou promessas sem respaldo', () => {
    for (const proibido of [/Top 3/i, /24 ?h/i, /semana(l|is)/i, /vital[ií]ci/i, /centenas/i, /vagas limitadas/i, /ao vivo/i, /mentoria/i, /Marina|Rafael|Camila|Lucas/, /app\.vincis\.com/, /Mais escolhido/i, /recharts/]) {
      expect(semComentarios, String(proibido)).not.toMatch(proibido)
    }
  })

  it('níveis e percentual recorrente nunca escritos à mão', () => {
    expect(semComentarios).not.toMatch(/7,5%|5%|10%|Bronze|Prata|Ouro/)
    expect(fonte).toMatch(/formatarPercentualCentesimos/)
    expect(fonte).toMatch(/PERCENTUAL_AVULSO/)
  })

  it('renderiza com a configuração, marca o que é ilustrativo e explica quem pode participar', () => {
    const html = texto(pagina({ niveis: { niveis: NIVEIS, protecaoDias: 30 }, situacao: 'visitante', regrasHref: null }))
    expect(html).toContain('Quem pode ser um Parceiro Indicador da Vincis?')
    expect(html).toContain('Não precisa ser contador nem advogado')
    expect(html).toContain('Parceiro Indicador')
    expect(html).toContain('Profissional prestador')
    expect(html).toContain('5% a 10%')
    expect(html).toContain('7,5%')
    expect(html).toContain('A partir de 4 clientes recorrentes ativos')
    expect(html).toContain('Proteção de 30 dias')
    expect(html).toContain('Simulação ilustrativa')
    expect(html).toContain('Estimativa.')
  })

  it('sem configuração publicada: esconde níveis e simula só o avulso, sem inventar percentual', () => {
    const html = texto(pagina({ niveis: null, situacao: 'visitante', regrasHref: null }))
    expect(html).toContain('Os níveis do programa estão sendo atualizados')
    expect(html).toContain('um percentual definido pela Vincis')
    expect(html).toContain(`${PERCENTUAL_AVULSO}% de`)
  })
})

/* -------------------------------------------------- chamada para participar */

describe('o botão leva ao fluxo real', () => {
  const niveis = { niveis: NIVEIS, protecaoDias: 30 }
  it('visitante: login/cadastro; pode ativar e parceiro: área do parceiro; sem área do cliente: contato', () => {
    expect(pagina({ niveis, situacao: 'visitante' })).toContain('href="/parceiros?entrar=1"')
    const ativar = pagina({ niveis, situacao: 'pode_ativar' })
    expect(ativar).toContain('href="/cliente/parceiros"')
    expect(ativar).toContain('Ativar meu link de indicação')
    expect(pagina({ niveis, situacao: 'parceiro_ativo' })).toContain('Abrir meu painel de parceiro')
    const sem = pagina({ niveis, situacao: 'sem_area_cliente' })
    expect(sem).toContain('href="/contato"')
    expect(sem).not.toContain('href="/cliente/parceiros"')
    // Nenhum botão de cadastro rola para o simulador.
    expect(pagina({ niveis, situacao: 'visitante' })).not.toMatch(/href="#simulador"[^>]*>\s*Quero/)
  })

  it('link das regras do CMS só aparece quando publicado', () => {
    expect(pagina({ niveis, situacao: 'visitante', regrasHref: '/regras-do-programa-de-parceiros' })).toContain('href="/regras-do-programa-de-parceiros"')
    expect(pagina({ niveis, situacao: 'visitante', regrasHref: null })).not.toContain('regras-do-programa-de-parceiros')
  })
})

/* ------------------------------------- banco: Gestão → página, conta → botão */

const SUFIXO = '@parceiros-pagina.teste'
type Conta = { id: string; token: string }
let contas: Record<'cliente' | 'profissional', Conta>
let configuracaoOriginal: Awaited<ReturnType<typeof obterConfiguracaoVigente>>

beforeAll(async () => {
  configuracaoOriginal = await obterConfiguracaoVigente()
  contas = await criarContas(SUFIXO, { cliente: { perfil: 'cliente' }, profissional: { perfil: 'profissional', prestador: 'profissional' } }, '119540')
})

afterAll(async () => {
  sairDaSessao()
  if (configuracaoOriginal.ok) {
    const c = configuracaoOriginal.configuracao
    await publicarConfiguracaoDeNiveis({
      protecaoDias: c.protecaoDias,
      regras: c.niveis.map((n) => ({ codigo: n.codigo, minimoClientes: n.minimoClientes, percentualCentesimos: n.percentualCentesimos })),
      autorId: null,
    })
  }
  await limparContas(SUFIXO)
})

describe('Gestão altera os níveis e a página acompanha', () => {
  it('nova configuração aparece na página e no simulador sem mudar código', async () => {
    const r = await publicarConfiguracaoDeNiveis({
      protecaoDias: 45,
      regras: [
        { codigo: 'bronze', minimoClientes: 0, percentualCentesimos: 400 },
        { codigo: 'prata', minimoClientes: 6, percentualCentesimos: 825 },
        { codigo: 'ouro', minimoClientes: 15, percentualCentesimos: 1_200 },
      ],
      autorId: null,
    })
    expect(r.ok).toBe(true)
    const publicos = await obterNiveisPublicos()
    const html = texto(pagina({ niveis: publicos, situacao: 'visitante' }))
    expect(html).toContain('4% a 12%')
    expect(html).toContain('8,25%')
    expect(html).toContain('A partir de 6 clientes recorrentes ativos')
    expect(html).toContain('Proteção de 45 dias')
    const sim = simularRecorrente(publicos!.niveis, { clientesAtivos: 6, mensalidadeCentavos: 30_000, meses: 1 })!
    expect(sim.nivel.codigo).toBe('prata')
    expect(sim.comissaoPorClienteCentavos).toBe(calcularComissaoPorCentesimos(30_000, 825))
  })
})

describe('situação de quem visita', () => {
  it('sem sessão é visitante', async () => {
    expect(await comSessao(null, () => obterSituacaoNaPaginaPublica())).toBe('visitante')
  })

  it('cliente sem programa pode ativar; depois de ativar, vai ao painel', async () => {
    expect(await comSessao(contas.cliente.token, () => obterSituacaoNaPaginaPublica())).toBe('pode_ativar')
    const ativado = await comSessao(contas.cliente.token, () => ativarParceiro())
    expect(ativado.sucesso).toBe(true)
    expect(await comSessao(contas.cliente.token, () => obterSituacaoNaPaginaPublica())).toBe('parceiro_ativo')
  })

  it('conta só profissional não alcança a área do cliente: recebe explicação, não porta fechada', async () => {
    expect(await comSessao(contas.profissional.token, () => obterSituacaoNaPaginaPublica())).toBe('sem_area_cliente')
  })
})
