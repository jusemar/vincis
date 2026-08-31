import { arredondarParaMultiplo, exato } from './aritmetica'
import { ErroPrecificacao } from './erros'
import { calcularPrecos, precoBaseDoServico } from './motor'
import type { RespostasPrecificacao, TabelaPrecificacao } from '../types/precificacao'

/**
 * As garantias comerciais da tabela de preços.
 *
 * ## O que isto é, e o que já existia
 *
 * `problemasDaTabela` cuida da **estrutura**: falta um preço-base, uma família
 * de faixas tem buraco, o Pacote aponta para um serviço desligado. Nada disso
 * fala sobre dinheiro. Uma tabela pode estar perfeitamente bem formada e ainda
 * assim cobrar zero, prometer uma economia que não existe, ou vender doze meses
 * mais caro que seis — e o motor calcularia tudo isso sem reclamar, porque
 * aritmeticamente não há nada de errado.
 *
 * Esta camada é a que sabe o que é um preço aceitável. Ela roda o motor de
 * verdade sobre perfis extremos e confere o resultado, em vez de reimplementar
 * a fórmula: é a única forma de pegar o caso em que a combinação de várias
 * regras individualmente válidas produz um preço que não pode ir ao ar.
 *
 * ## Cada violação sabe onde nasceu
 *
 * `secao` e `campo` existem para que a tela do Gestor consiga dizer o que
 * corrigir, em vez de recusar a gravação com um "configuração inválida" que
 * não ajuda ninguém. A mensagem é escrita para quem administra preço, não
 * para quem lê log.
 */
export type ViolacaoComercial = {
  /** A seção da tela onde o Gestor conserta isto. */
  secao:
    | 'precos_base'
    | 'funcionarios'
    | 'notas_fiscais'
    | 'faturamento'
    | 'atividade'
    | 'atendimento'
    | 'rotina'
    | 'adicionais'
    | 'descontos'
    | 'geral'
  /** O que exatamente está fora do lugar, quando dá para apontar. */
  campo?: string
  mensagem: string
}

/**
 * Perfis usados para provar que nenhuma combinação vira preço impossível.
 *
 * São os extremos: a empresa mais barata que a plataforma aceita e a mais cara.
 * Se o preço é válido nos dois cantos e as regras são monotônicas — mais
 * funcionários nunca reduz, faixa maior nunca reduz —, o meio está coberto.
 */
function perfisExtremos(tabela: TabelaPrecificacao): RespostasPrecificacao[] {
  const primeiro = (dimensao: string) =>
    tabela.dimensoes.find((d) => d.codigo === dimensao)?.opcoes[0]?.codigo ?? ''
  const ultimo = (dimensao: string) => {
    const opcoes = tabela.dimensoes.find((d) => d.codigo === dimensao)?.opcoes ?? []
    return opcoes[opcoes.length - 1]?.codigo ?? ''
  }
  const faixaExtrema = (tipo: string, maior: boolean) => {
    const familia = tabela.faixas
      .filter((f) => f.grupo === 'contabil' && f.tipo === tipo)
      .sort((a, b) => a.limiteMin - b.limiteMin)
    return (maior ? familia[familia.length - 1] : familia[0])?.codigo ?? ''
  }

  const regimes = tabela.dimensoes.find((d) => d.codigo === 'regime')?.opcoes ?? []

  // Um perfil mínimo por regime: é onde o preço zero apareceria primeiro.
  const minimos = regimes.map((regime) => ({
    regime: regime.codigo,
    atividades: [primeiro('atividade')],
    funcionarios: 0,
    notasFiscais: faixaExtrema('notas_fiscais', false),
    emissor: primeiro('emissor'),
    faturamento: faixaExtrema('faturamento', false),
    atendimento: primeiro('atendimento'),
    rotina: primeiro('rotina'),
    adicionais: [],
  }))

  const maximo: RespostasPrecificacao = {
    regime: regimes[regimes.length - 1]?.codigo ?? '',
    atividades: [ultimo('atividade')],
    funcionarios: 200,
    notasFiscais: faixaExtrema('notas_fiscais', true),
    emissor: ultimo('emissor'),
    faturamento: faixaExtrema('faturamento', true),
    atendimento: ultimo('atendimento'),
    rotina: ultimo('rotina'),
    adicionais: tabela.adicionais.filter((a) => a.ativo).map((a) => a.codigo),
  }

  return [...minimos, maximo]
}

export function violacoesComerciais(tabela: TabelaPrecificacao): ViolacaoComercial[] {
  const violacoes: ViolacaoComercial[] = []
  const anotar = (v: ViolacaoComercial) => violacoes.push(v)

  if (tabela.parametros.arredondamentoCentavos <= 0) {
    anotar({
      secao: 'geral',
      mensagem:
        'O arredondamento precisa ser um valor positivo — sem ele o preço final não pode ser calculado.',
    })
  }

  /* ------------------------------------------------ multiplicadores e bases */

  for (const servico of tabela.servicos) {
    if (servico.multiplicadorMilesimos !== null && servico.multiplicadorMilesimos <= 0) {
      anotar({
        secao: 'precos_base',
        campo: servico.codigo,
        mensagem: `O multiplicador de ${servico.nome} precisa ser maior que zero: com zero o plano sairia de graça.`,
      })
    }
  }

  for (const dimensao of tabela.dimensoes) {
    for (const opcao of dimensao.opcoes) {
      if (opcao.multiplicadorMilesimos !== null && opcao.multiplicadorMilesimos <= 0) {
        anotar({
          secao: dimensao.codigo as ViolacaoComercial['secao'],
          campo: opcao.codigo,
          mensagem: `O multiplicador de "${opcao.rotulo}" precisa ser maior que zero: com zero o preço inteiro seria anulado.`,
        })
      }
    }
  }

  // Preço-base zero deixa o plano de graça em todo o regime — o motor calcula
  // sem reclamar, e o cliente veria R$ 0.
  for (const servico of tabela.servicos.filter((s) => s.ativo && s.grupoBase)) {
    for (const regime of tabela.dimensoes.find((d) => d.codigo === 'regime')?.opcoes ??
      []) {
      try {
        if (precoBaseDoServico(tabela, servico.codigo, regime.codigo) <= 0) {
          anotar({
            secao: 'precos_base',
            campo: `${servico.grupoBase}/${regime.codigo}`,
            mensagem: `O preço-base de ${servico.nome} no ${regime.rotulo} ficaria em zero. Informe um valor maior que zero.`,
          })
        }
      } catch {
        anotar({
          secao: 'precos_base',
          campo: `${servico.grupoBase}/${regime.codigo}`,
          mensagem: `Falta o preço-base de ${servico.nome} no ${regime.rotulo}.`,
        })
      }
    }
  }

  /* --------------------------------------------------------------- descontos */

  const periodos = tabela.descontos
    .filter((d) => d.tipo === 'periodo')
    .sort((a, b) => (a.meses ?? 0) - (b.meses ?? 0))

  for (let i = 1; i < periodos.length; i += 1) {
    const anterior = periodos[i - 1]
    const atual = periodos[i]
    if (atual.descontoMilesimos < anterior.descontoMilesimos) {
      anotar({
        secao: 'descontos',
        campo: atual.codigo,
        mensagem: `O desconto de ${atual.rotulo} (${atual.descontoMilesimos / 10}%) é menor que o de ${anterior.rotulo} (${anterior.descontoMilesimos / 10}%). Os dois são oferecidos como economia por prazo, então o prazo maior não pode sair mais caro.`,
      })
    }
  }

  for (const desconto of tabela.descontos) {
    if (desconto.descontoMilesimos >= 1000) {
      anotar({
        secao: 'descontos',
        campo: desconto.codigo,
        mensagem: `Um desconto de 100% ou mais zeraria a mensalidade de ${desconto.rotulo}. Use um valor abaixo de 100%.`,
      })
    }
  }

  /* --------------------------------------------- o preço que o cliente veria */

  for (const respostas of perfisExtremos(tabela)) {
    let precos
    try {
      precos = calcularPrecos(tabela, respostas)
    } catch (erro) {
      anotar({
        secao: 'geral',
        mensagem:
          erro instanceof ErroPrecificacao
            ? `Um perfil de empresa não consegue ser calculado: ${erro.message}`
            : 'Um perfil de empresa não consegue ser calculado com esta configuração.',
      })
      continue
    }

    for (const preco of precos) {
      const servico = tabela.servicos.find((s) => s.codigo === preco.servico)
      const nome = servico?.nome ?? preco.servico

      if (!Number.isFinite(preco.mensalCentavos) || preco.mensalCentavos <= 0) {
        anotar({
          secao: 'precos_base',
          campo: preco.servico,
          mensagem: `Com esta configuração, ${nome} chegaria a ${preco.mensalCentavos <= 0 ? 'zero ou menos' : 'um valor impossível'} para alguma empresa. Revise o preço-base e os multiplicadores.`,
        })
      }

      for (const periodo of preco.periodos) {
        if (periodo.mensalCentavos <= 0) {
          anotar({
            secao: 'descontos',
            campo: periodo.periodo,
            mensagem: `O desconto de ${periodo.rotulo} zeraria o valor de ${nome}. Reduza o desconto.`,
          })
        }
      }

      if (preco.combo) {
        /*
          O pacote existe para custar menos. Empatar com a soma não é um
          desconto pequeno: é a promessa de economia sendo feita sem economia
          nenhuma — e a vitrine anuncia "Economize R$ 0/mês" com toda a
          confiança. Decisão comercial: economia tem de ser real e maior que
          zero, então empate e inversão são recusados pela mesma regra.
        */
        const componentes = (servico?.componentes ?? [])
          .map((c) => tabela.servicos.find((s) => s.codigo === c)?.nome ?? c)
          .join(' e ')

        if (preco.mensalCentavos >= preco.combo.separadoCentavos) {
          anotar({
            secao: 'descontos',
            campo: 'combo',
            mensagem: `O ${nome} precisa oferecer uma economia real em relação à contratação separada${componentes ? ` da ${componentes}` : ''}. Com o desconto atual ele sairia ${preco.mensalCentavos === preco.combo.separadoCentavos ? 'pelo mesmo valor da soma' : 'mais caro que a soma'}. Aumente o desconto do pacote.`,
          })
        }

        const economiaEsperada = preco.combo.separadoCentavos - preco.mensalCentavos
        if (preco.combo.economiaMensalCentavos !== economiaEsperada) {
          anotar({
            secao: 'descontos',
            campo: 'combo',
            mensagem: `A economia anunciada de ${nome} não corresponde à diferença real entre o pacote e a soma dos serviços.`,
          })
        }
      }
    }
  }

  return violacoes
}

/**
 * Um mesmo preço, calculado duas vezes, é o mesmo preço.
 *
 * Vale como invariante porque o motor arredonda: se a aritmética deixasse de
 * ser determinística, dois cliques na mesma tela dariam valores diferentes e
 * nada no sistema perceberia. Usada nos testes e barata o bastante para
 * qualquer diagnóstico.
 */
export function calculoDeterministico(
  tabela: TabelaPrecificacao,
  respostas: RespostasPrecificacao,
): boolean {
  const a = JSON.stringify(calcularPrecos(tabela, respostas))
  const b = JSON.stringify(calcularPrecos(tabela, respostas))
  return a === b
}

/** O arredondamento aplicado isoladamente, para conferência. */
export function arredondar(tabela: TabelaPrecificacao, centavos: number): number {
  return arredondarParaMultiplo(exato(centavos), tabela.parametros.arredondamentoCentavos)
}
