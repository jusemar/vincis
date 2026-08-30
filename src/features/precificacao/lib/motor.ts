import {
  arredondarParaCentavos,
  arredondarParaMultiplo,
  exato,
  multiplicarPorMilesimos,
  somarCentavos,
  type ValorExato,
} from './aritmetica'
import { erroPrecificacao } from './erros'
import type {
  FaixaPrecificacao,
  RespostasPrecificacao,
  ResultadoPrecificacao,
  LinhaComposicao,
  FatorAplicado,
  PrecoPeriodo,
  ServicoPrecificacao,
  TabelaPrecificacao,
} from '../types/precificacao'

/**
 * O motor de precificação da Vincis.
 *
 * ## O que ele é
 *
 * Uma função pura: recebe a configuração comercial (`TabelaPrecificacao`, lida
 * do banco por quem chama) e as respostas sobre a empresa, devolve o preço e a
 * conta que levou até ele. Não importa React, não conhece `/precos` e não fala
 * com o banco — é o que permite que a página, uma proposta, uma contratação e
 * um teste calculem pelo mesmo caminho em vez de cada um repetir a fórmula.
 *
 * ## A ordem, que é a regra
 *
 * ```
 * preço-base do grupo × multiplicador do serviço → arredondado
 *   + funcionários excedentes
 *   + faixa de notas fiscais (só quando quem emite é a Vincis)
 *   + faixa de faturamento
 *   × fatores das dimensões que valem para o grupo
 *   + adicionais, pelo valor cheio
 *   → arredondado para o múltiplo configurado
 * ```
 *
 * Cada passo está aqui porque estava na versão anterior, em código. O que
 * mudou foi de onde vêm os números — e nada mais: os fatores incidem sobre o
 * núcleo e não sobre os adicionais, o preço-base é arredondado antes de somar
 * o resto, e o arredondamento final acontece uma única vez.
 *
 * ## As exceções não são condicionais escondidas aqui
 *
 * Que o ramo e a rotina não mexam no preço do Jurídico, e que ele não pague por
 * nota nem por faturamento, é o que a configuração diz: as dimensões declaram
 * `aplicaAGrupos` e as faixas existem só para o grupo que as cobra. O motor
 * aplica o que encontra; ele não tem uma lista de exceções por serviço.
 */

/** Preço de um serviço para um perfil de empresa. */
export function calcularPreco(
  tabela: TabelaPrecificacao,
  servicoCodigo: string,
  respostas: RespostasPrecificacao,
): ResultadoPrecificacao {
  const servico = servicoDe(tabela, servicoCodigo)

  return servico.componentes.length > 0
    ? precoComposto(tabela, servico, respostas)
    : precoSimples(tabela, servico, respostas)
}

/** Preço de todos os serviços ativos de uma vez, na ordem da vitrine. */
export function calcularPrecos(
  tabela: TabelaPrecificacao,
  respostas: RespostasPrecificacao,
): ResultadoPrecificacao[] {
  return tabela.servicos
    .filter((s) => s.ativo)
    .map((s) => calcularPreco(tabela, s.codigo, respostas))
}

/**
 * A primeira linha do preço: a base do grupo com o multiplicador do serviço,
 * já arredondada.
 *
 * Está separada porque a tela do Gestor precisa do mesmo número para mostrar
 * "Padrão R$ 195 → Consultiva R$ 265" enquanto ele edita o acréscimo. Ela
 * chama esta função; não repete a multiplicação.
 */
export function precoBaseDoServico(
  tabela: TabelaPrecificacao,
  servicoCodigo: string,
  regime: string,
): number {
  const servico = servicoDe(tabela, servicoCodigo)
  if (!servico.grupoBase || servico.multiplicadorMilesimos === null) {
    erroPrecificacao(
      'servico_desconhecido',
      `Serviço ${servicoCodigo} não parte de um preço-base.`,
    )
  }

  const precoBase = tabela.precosBase.find(
    (p) => p.grupo === servico.grupoBase && p.regime === regime,
  )
  if (!precoBase) {
    erroPrecificacao(
      'preco_base_ausente',
      `Sem preço-base para ${servico.grupoBase}/${regime}.`,
    )
  }

  return arredondarParaMultiplo(
    multiplicarPorMilesimos(
      exato(precoBase.valorCentavos),
      servico.multiplicadorMilesimos,
    ),
    tabela.parametros.arredondamentoCentavos,
  )
}

/* --------------------------------------------------------------- núcleo */

function precoSimples(
  tabela: TabelaPrecificacao,
  servico: ServicoPrecificacao,
  respostas: RespostasPrecificacao,
): ResultadoPrecificacao {
  const grupo = servico.grupoBase
  if (!grupo || servico.multiplicadorMilesimos === null) {
    erroPrecificacao(
      'servico_desconhecido',
      `Serviço ${servico.codigo} não tem preço-base nem componentes.`,
    )
  }

  const passo = tabela.parametros.arredondamentoCentavos
  const linhas: LinhaComposicao[] = []

  // 1. Preço base do grupo, ajustado pelo multiplicador do serviço e já
  //    arredondado — era assim que a versão anterior montava a primeira linha.
  const baseCentavos = precoBaseDoServico(tabela, servico.codigo, respostas.regime)
  linhas.push({ tipo: 'base', valorCentavos: baseCentavos })

  // 2. Funcionários excedentes. A isenção não é um campo: é onde a faixa começa.
  const funcionarios = respostas.funcionarios
  if (!Number.isInteger(funcionarios) || funcionarios < 0) {
    erroPrecificacao(
      'quantidade_invalida',
      `Quantidade de funcionários inválida: ${funcionarios}.`,
    )
  }
  const faixaFuncionarios = faixaPorQuantidade(
    tabela,
    grupo,
    'funcionarios',
    funcionarios,
  )
  if (faixaFuncionarios) {
    const valor = valorDaFaixa(faixaFuncionarios, funcionarios)
    if (valor > 0) {
      linhas.push({
        tipo: 'funcionarios',
        valorCentavos: valor,
        quantidade: funcionarios,
        codigo: faixaFuncionarios.codigo,
      })
    }
  }

  // 3. Notas fiscais — cobradas só quando o emissor é o exigido pela faixa.
  const faixaNotas = faixaPorCodigo(
    tabela,
    grupo,
    'notas_fiscais',
    respostas.notasFiscais,
  )
  if (
    faixaNotas &&
    (faixaNotas.emissorExigido === null ||
      faixaNotas.emissorExigido === respostas.emissor) &&
    faixaNotas.valorCentavos > 0
  ) {
    linhas.push({
      tipo: 'notas_fiscais',
      valorCentavos: faixaNotas.valorCentavos,
      codigo: faixaNotas.codigo,
      rotulo: faixaNotas.rotulo,
    })
  }

  // 4. Faturamento.
  const faixaFaturamento = faixaPorCodigo(
    tabela,
    grupo,
    'faturamento',
    respostas.faturamento,
  )
  if (faixaFaturamento && faixaFaturamento.valorCentavos > 0) {
    linhas.push({
      tipo: 'faturamento',
      valorCentavos: faixaFaturamento.valorCentavos,
      codigo: faixaFaturamento.codigo,
      rotulo: faixaFaturamento.rotulo,
    })
  }

  // 5. Fatores das dimensões que valem para este grupo, sobre o núcleo.
  const somaNucleo = linhas.reduce((total, l) => total + l.valorCentavos, 0)
  const fatores = fatoresAplicaveis(tabela, grupo, respostas)
  let nucleo: ValorExato = exato(somaNucleo)
  for (const fator of fatores) {
    nucleo = multiplicarPorMilesimos(nucleo, fator.multiplicadorMilesimos)
  }

  // 6. Adicionais, pelo valor cheio: nenhum fator incide sobre eles.
  const linhasAdicionais = adicionaisEscolhidos(tabela, grupo, respostas)
  const adicionaisCentavos = linhasAdicionais.reduce(
    (total, l) => total + l.valorCentavos,
    0,
  )
  linhas.push(...linhasAdicionais)

  const bruto = somarCentavos(nucleo, adicionaisCentavos)
  const mensalCentavos = arredondarParaMultiplo(bruto, passo)
  const nucleoCentavos = arredondarParaCentavos(nucleo)

  return {
    servico: servico.codigo,
    linhas,
    fatores,
    nucleoCentavos,
    adicionaisCentavos,
    arredondamentoCentavos: mensalCentavos - (nucleoCentavos + adicionaisCentavos),
    mensalCentavos,
    periodos: periodosDe(tabela, mensalCentavos),
    combo: null,
  }
}

/**
 * Preço de um serviço que é a soma de outros — hoje, o Pacote Empresarial.
 *
 * Cada componente é calculado pelo mesmo caminho de sempre, e o abatimento
 * incide sobre a soma dos totais **já arredondados** deles. É onde a economia
 * do combo nasce, e ela vem daqui e não da tela: antes o card refazia esta
 * subtração por conta própria, o que era uma segunda fonte para o mesmo número.
 */
function precoComposto(
  tabela: TabelaPrecificacao,
  servico: ServicoPrecificacao,
  respostas: RespostasPrecificacao,
): ResultadoPrecificacao {
  const passo = tabela.parametros.arredondamentoCentavos

  const partes = servico.componentes.map((codigo) => ({
    codigo,
    resultado: calcularPreco(tabela, codigo, respostas),
  }))
  const separadoCentavos = partes.reduce(
    (total, p) => total + p.resultado.mensalCentavos,
    0,
  )

  const desconto = tabela.descontos.find(
    (d) => d.tipo === 'combo' && d.servicoCodigo === servico.codigo,
  )
  if (!desconto) {
    erroPrecificacao(
      'desconto_ausente',
      `Serviço composto sem desconto de combo: ${servico.codigo}.`,
    )
  }

  const mensalCentavos = arredondarParaMultiplo(
    multiplicarPorMilesimos(
      exato(separadoCentavos),
      1000 - desconto.descontoMilesimos,
    ),
    passo,
  )
  const economiaMensalCentavos = arredondarParaMultiplo(
    exato(separadoCentavos - mensalCentavos),
    passo,
  )

  const linhas: LinhaComposicao[] = [
    ...partes.map((p) => ({
      tipo: 'componente' as const,
      valorCentavos: p.resultado.mensalCentavos,
      codigo: p.codigo,
      rotulo: servicoDe(tabela, p.codigo).nome,
    })),
    { tipo: 'desconto_combo', valorCentavos: -economiaMensalCentavos },
  ]

  return {
    servico: servico.codigo,
    linhas,
    fatores: [],
    nucleoCentavos: separadoCentavos,
    adicionaisCentavos: 0,
    arredondamentoCentavos: 0,
    mensalCentavos,
    periodos: periodosDe(tabela, mensalCentavos),
    combo: {
      componentes: partes.map((p) => p.resultado),
      separadoCentavos,
      economiaMensalCentavos,
      economiaAnualCentavos: economiaMensalCentavos * 12,
      descontoMilesimos: desconto.descontoMilesimos,
    },
  }
}

/* ---------------------------------------------------------------- partes */

function servicoDe(
  tabela: TabelaPrecificacao,
  codigo: string,
): ServicoPrecificacao {
  const servico = tabela.servicos.find((s) => s.codigo === codigo)
  if (!servico) {
    erroPrecificacao('servico_desconhecido', `Serviço desconhecido: ${codigo}.`)
  }
  return servico
}

/**
 * Fatores de multiplicação que valem para o grupo, na ordem das dimensões.
 *
 * Uma dimensão sem multiplicador (o regime, o emissor) não entra: ela decide
 * outra coisa. Uma dimensão que vale para o grupo e não foi respondida é erro,
 * não é "sem fator" — calcular sem ela devolveria um preço menor sem sintoma.
 */
function fatoresAplicaveis(
  tabela: TabelaPrecificacao,
  grupo: string,
  respostas: RespostasPrecificacao,
): FatorAplicado[] {
  const fatores: FatorAplicado[] = []

  for (const dimensao of tabela.dimensoes) {
    if (!dimensao.aplicaAGrupos.includes(grupo as never)) continue

    const escolhido = respostaDaDimensao(respostas, dimensao.codigo)
    if (escolhido === null) {
      erroPrecificacao(
        'resposta_ausente',
        `Sem resposta para a dimensão ${dimensao.codigo}.`,
      )
    }

    const opcao = dimensao.opcoes.find((o) => o.codigo === escolhido)
    if (!opcao) {
      erroPrecificacao(
        'opcao_desconhecida',
        `Opção desconhecida em ${dimensao.codigo}: ${escolhido}.`,
      )
    }
    if (opcao.multiplicadorMilesimos === null) continue

    fatores.push({
      dimensao: dimensao.codigo,
      opcao: opcao.codigo,
      rotulo: opcao.rotulo,
      multiplicadorMilesimos: opcao.multiplicadorMilesimos,
    })
  }

  return fatores
}

/**
 * A resposta de uma dimensão.
 *
 * Numa dimensão de escolha múltipla é a **primeira** atividade marcada que
 * multiplica o preço — comportamento da versão anterior, preservado de
 * propósito: marcar Comércio e Indústria juntos nunca multiplicou os dois
 * fatores, e mudar isso aqui seria um reajuste disfarçado de refatoração.
 */
function respostaDaDimensao(
  respostas: RespostasPrecificacao,
  dimensao: string,
): string | null {
  switch (dimensao) {
    case 'regime':
      return respostas.regime
    case 'atividade':
      return respostas.atividades[0] ?? null
    case 'emissor':
      return respostas.emissor
    case 'atendimento':
      return respostas.atendimento
    case 'rotina':
      return respostas.rotina
    default:
      return null
  }
}

/** Faixas de uma família, da menor para a maior. */
function familiaDeFaixas(
  tabela: TabelaPrecificacao,
  grupo: string,
  tipo: string,
): FaixaPrecificacao[] {
  return tabela.faixas
    .filter((f) => f.grupo === grupo && f.tipo === tipo)
    .sort((a, b) => a.limiteMin - b.limiteMin)
}

/**
 * Faixa que contém uma quantidade.
 *
 * Devolve `null` quando a quantidade está **abaixo** do começo da família — é a
 * isenção, e ela é de propósito. Uma quantidade acima do começo que não
 * encontra faixa nenhuma é buraco de configuração, e aí o motor não inventa
 * zero: ele lança.
 */
function faixaPorQuantidade(
  tabela: TabelaPrecificacao,
  grupo: string,
  tipo: string,
  quantidade: number,
): FaixaPrecificacao | null {
  const familia = familiaDeFaixas(tabela, grupo, tipo)
  if (familia.length === 0) return null
  if (quantidade < familia[0].limiteMin) return null

  const faixa = familia.find(
    (f) =>
      quantidade >= f.limiteMin &&
      (f.limiteMax === null || quantidade < f.limiteMax),
  )
  if (!faixa) {
    erroPrecificacao(
      'faixa_desconhecida',
      `Sem faixa de ${tipo} para ${quantidade} em ${grupo}.`,
    )
  }
  return faixa
}

/**
 * Faixa escolhida pelo código.
 *
 * Família vazia significa que o grupo não cobra por isso (o Jurídico não paga
 * por nota nem por faturamento) e devolve `null`. Família existente com código
 * desconhecido é resposta inválida, e lança.
 */
function faixaPorCodigo(
  tabela: TabelaPrecificacao,
  grupo: string,
  tipo: string,
  codigo: string | null,
): FaixaPrecificacao | null {
  const familia = familiaDeFaixas(tabela, grupo, tipo)
  if (familia.length === 0) return null

  const faixa = familia.find((f) => f.codigo === codigo)
  if (!faixa) {
    erroPrecificacao(
      'faixa_desconhecida',
      `Faixa de ${tipo} desconhecida em ${grupo}: ${codigo}.`,
    )
  }
  return faixa
}

/** `fixo` cobra uma vez; `por_unidade` cobra por unidade dentro da faixa. */
function valorDaFaixa(faixa: FaixaPrecificacao, quantidade: number): number {
  if (faixa.modo === 'fixo') return faixa.valorCentavos
  const unidades = Math.max(0, quantidade - faixa.limiteMin + 1)
  return unidades * faixa.valorCentavos
}

function adicionaisEscolhidos(
  tabela: TabelaPrecificacao,
  grupo: string,
  respostas: RespostasPrecificacao,
): LinhaComposicao[] {
  return respostas.adicionais.map((codigo) => {
    const adicional = tabela.adicionais.find((a) => a.codigo === codigo)
    if (!adicional) {
      erroPrecificacao(
        'adicional_desconhecido',
        `Adicional desconhecido: ${codigo}.`,
      )
    }
    if (!adicional.disponivelParaGrupos.includes(grupo as never)) {
      erroPrecificacao(
        'adicional_desconhecido',
        `Adicional ${codigo} não está disponível para ${grupo}.`,
      )
    }
    return {
      tipo: 'adicional' as const,
      valorCentavos: adicional.valorMensalCentavos,
      codigo: adicional.codigo,
      rotulo: adicional.rotulo,
    }
  })
}

/**
 * O mesmo mensal visto em cada prazo de fechamento.
 *
 * O desconto incide sobre o mensal já arredondado e o resultado é arredondado
 * de novo — é o que a página fazia, e é o que faz o valor exibido bater com o
 * "economize X/mês" ao lado dele.
 */
function periodosDe(
  tabela: TabelaPrecificacao,
  mensalCentavos: number,
): PrecoPeriodo[] {
  const passo = tabela.parametros.arredondamentoCentavos
  const periodos = tabela.descontos
    .filter((d) => d.tipo === 'periodo')
    .sort((a, b) => a.ordem - b.ordem)

  if (periodos.length === 0) {
    erroPrecificacao('desconto_ausente', 'Nenhum período de fechamento configurado.')
  }

  return periodos.map((periodo) => {
    const equivalente = arredondarParaMultiplo(
      multiplicarPorMilesimos(
        exato(mensalCentavos),
        1000 - periodo.descontoMilesimos,
      ),
      passo,
    )
    const economia = arredondarParaMultiplo(
      exato(mensalCentavos - equivalente),
      passo,
    )
    const meses = periodo.meses ?? 1

    return {
      periodo: periodo.codigo,
      rotulo: periodo.rotulo,
      meses,
      descontoMilesimos: periodo.descontoMilesimos,
      descontoPercentual: periodo.descontoMilesimos / 10,
      mensalCentavos: equivalente,
      economiaMensalCentavos: economia,
      totalPeriodoCentavos: equivalente * meses,
    }
  })
}
