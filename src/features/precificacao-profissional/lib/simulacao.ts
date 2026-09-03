import { createHash } from 'node:crypto'
import type {
  ItemDaSimulacao,
  SimulacaoDaOportunidade,
} from '@/features/oportunidades/types/oportunidade'
import type {
  RespostasPrecificacao,
  TabelaPrecificacao,
} from '@/features/precificacao/types/precificacao'
import { SERVICO_DO_PROFISSIONAL } from '../constants/precificacao-profissional'

/**
 * O retrato da simulação, montado a partir da tabela que produziu o preço.
 *
 * ## Por que o retrato guarda texto, e não só códigos
 *
 * A tabela é do Profissional, e ele pode renomear "Híbrido", desativar uma
 * faixa ou republicar tudo dez minutos depois. Um retrato feito só de códigos
 * precisaria da grade **atual** para ser lido, e a grade atual é justamente a
 * que pode ter mudado. Os rótulos ficam congelados; os códigos ficam ao lado,
 * para quem quiser cruzar com a grade viva.
 *
 * ## Versão do formato
 *
 * `versao` existe para que um retrato gravado hoje continue legível quando o
 * configurador ganhar uma pergunta nova. Nenhuma tela dispara em cima dela
 * ainda — ela é o gancho que evita ter de adivinhar o formato depois.
 */
export const VERSAO_DA_SIMULACAO = 1

/** A ordem em que o configurador pergunta — e em que os dois painéis leem. */
const DIMENSOES_NO_RETRATO = [
  'regime',
  'atividade',
  'emissor',
  'atendimento',
  'rotina',
] as const

export function montarSimulacao({
  tabela,
  respostas,
  profissionalId,
  precoMensalCentavos,
  simuladaEm = new Date(),
}: {
  tabela: TabelaPrecificacao
  respostas: RespostasPrecificacao
  profissionalId: string
  /** O valor que o motor devolveu — nunca um número vindo do navegador. */
  precoMensalCentavos: number
  simuladaEm?: Date
}): SimulacaoDaOportunidade {
  return {
    versao: VERSAO_DA_SIMULACAO,
    profissionalId,
    servico: SERVICO_DO_PROFISSIONAL,
    respostas,
    itens: itensDoRetrato(tabela, respostas),
    precoMensalCentavos,
    simuladaEm: simuladaEm.toISOString(),
  }
}

/**
 * As perguntas respondidas, já escritas.
 *
 * Uma resposta que a grade não conhece **não é omitida em silêncio**: ela entra
 * com o próprio código como rótulo. Sumir com a linha faria o retrato afirmar
 * que a pergunta não foi feita, quando o que houve foi a grade ter mudado.
 */
function itensDoRetrato(
  tabela: TabelaPrecificacao,
  respostas: RespostasPrecificacao,
): ItemDaSimulacao[] {
  const itens: ItemDaSimulacao[] = []

  for (const codigo of DIMENSOES_NO_RETRATO) {
    const dimensao = tabela.dimensoes.find((d) => d.codigo === codigo)
    // `atividades` é escolha múltipla no tipo, mas a tabela individual pergunta
    // uma só — e é a primeira que o motor multiplica, como sempre foi.
    const escolhido =
      codigo === 'atividade' ? respostas.atividades[0] : respostas[codigo]
    if (!escolhido) continue
    const opcao = dimensao?.opcoes.find((o) => o.codigo === escolhido)
    itens.push({
      codigo,
      rotulo: dimensao?.rotulo ?? codigo,
      valor: opcao?.rotulo ?? escolhido,
    })
  }

  itens.push({
    codigo: 'funcionarios',
    rotulo: 'Funcionários',
    valor: String(respostas.funcionarios),
  })

  for (const [codigo, rotuloPadrao, escolhido] of [
    ['notas_fiscais', 'Notas fiscais por mês', respostas.notasFiscais],
    ['faturamento', 'Faturamento mensal', respostas.faturamento],
  ] as const) {
    const faixa = tabela.faixas.find(
      (f) => f.tipo === codigo && f.codigo === escolhido,
    )
    itens.push({
      codigo,
      rotulo: rotuloPadrao,
      valor: faixa?.rotulo ?? escolhido,
    })
  }

  // O preço não entra como item: ele é campo próprio do retrato, porque é o
  // único número que as duas telas destacam e a única coisa ali que o motor
  // calculou em vez de o cliente ter respondido.
  return itens
}

/**
 * A impressão digital da intenção.
 *
 * Entram o profissional, as respostas e o preço exibido — e **não** a hora: o
 * mesmo cenário clicado três vezes em dez segundos precisa produzir a mesma
 * chave, que é o que o índice único do banco usa para recusar a segunda e a
 * terceira. Uma simulação diferente (outra resposta, outro preço) gera outra
 * chave e passa, como deve.
 *
 * As chaves das respostas são ordenadas antes de serializar: `JSON.stringify`
 * preserva a ordem de inserção do objeto, e um cliente que montasse o mesmo
 * cenário em outra ordem geraria outra chave para a mesma intenção.
 */
export function assinaturaDaSimulacao(simulacao: SimulacaoDaOportunidade) {
  const canonico = JSON.stringify({
    profissionalId: simulacao.profissionalId,
    servico: simulacao.servico,
    precoMensalCentavos: simulacao.precoMensalCentavos,
    respostas: ordenar(simulacao.respostas),
  })
  return createHash('sha256').update(canonico).digest('hex')
}

function ordenar(respostas: RespostasPrecificacao) {
  return Object.fromEntries(
    Object.entries(respostas)
      .map(([chave, valor]) => [
        chave,
        Array.isArray(valor) ? [...valor].sort() : valor,
      ])
      .sort(([a], [b]) => (a as string).localeCompare(b as string)),
  )
}
