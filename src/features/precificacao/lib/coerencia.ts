import {
  DIMENSOES_PRECIFICACAO,
  GRUPOS_PRECIFICACAO,
  SERVICOS_PRECIFICACAO,
} from '../constants/precificacao'
import type { FaixaPrecificacao, TabelaPrecificacao } from '../types/precificacao'

/**
 * As regras que valem para a grade inteira, e que nenhuma linha sozinha
 * consegue garantir.
 *
 * O banco impede a linha absurda; isto impede o **conjunto** absurdo — um
 * regime sem preço em um dos grupos, uma família de faixas com buraco entre
 * 30 e 41 notas, um Pacote que soma um serviço desligado. São exatamente os
 * defeitos que não derrubam nada: o motor acha "nenhuma faixa", soma zero e
 * devolve um preço menor sem reclamar.
 *
 * Devolve a lista de problemas em vez de lançar, para que a leitura decida se
 * interrompe (é o que ela faz) e para que a tela do Gestor possa um dia mostrar
 * todos de uma vez em vez do primeiro.
 */
export function problemasDaTabela(tabela: TabelaPrecificacao): string[] {
  const problemas: string[] = []

  for (const codigo of SERVICOS_PRECIFICACAO) {
    if (!tabela.servicos.some((s) => s.codigo === codigo)) {
      problemas.push(`Serviço estrutural ausente: ${codigo}.`)
    }
  }

  for (const codigo of DIMENSOES_PRECIFICACAO) {
    if (!tabela.dimensoes.some((d) => d.codigo === codigo)) {
      problemas.push(`Dimensão ausente: ${codigo}.`)
    }
  }

  // Todo serviço com grupo precisa achar preço para todo regime oferecido, e o
  // conjunto de regimes é o que a dimensão `regime` mostra ao cliente.
  const regimes =
    tabela.dimensoes.find((d) => d.codigo === 'regime')?.opcoes ?? []
  for (const grupo of GRUPOS_PRECIFICACAO) {
    for (const regime of regimes) {
      const existe = tabela.precosBase.some(
        (p) => p.grupo === grupo && p.regime === regime.codigo,
      )
      if (!existe) {
        problemas.push(`Sem preço-base para ${grupo}/${regime.codigo}.`)
      }
    }
  }

  for (const servico of tabela.servicos) {
    for (const componente of servico.componentes) {
      const alvo = tabela.servicos.find((s) => s.codigo === componente)
      if (!alvo) {
        problemas.push(`${servico.codigo} compõe serviço inexistente: ${componente}.`)
      } else if (!alvo.ativo) {
        problemas.push(`${servico.codigo} compõe serviço desligado: ${componente}.`)
      }
    }
    if (servico.componentes.length > 0) {
      const temDesconto = tabela.descontos.some(
        (d) => d.tipo === 'combo' && d.servicoCodigo === servico.codigo,
      )
      if (!temDesconto) {
        problemas.push(`Serviço composto sem desconto de combo: ${servico.codigo}.`)
      }
    }
  }

  problemas.push(...problemasDasFaixas(tabela.faixas))

  // O emissor exigido por uma faixa precisa ser uma resposta que o cliente
  // consiga dar; do contrário a faixa nunca é cobrada.
  const emissores =
    tabela.dimensoes.find((d) => d.codigo === 'emissor')?.opcoes ?? []
  for (const faixa of tabela.faixas) {
    if (
      faixa.emissorExigido &&
      !emissores.some((o) => o.codigo === faixa.emissorExigido)
    ) {
      problemas.push(
        `Faixa ${faixa.tipo}/${faixa.codigo} exige emissor inexistente: ${faixa.emissorExigido}.`,
      )
    }
  }

  return problemas
}

/**
 * Cada família de faixas cobre a reta inteira, sem buraco e sem sobreposição.
 *
 * O intervalo é `[min, max)`: o fim de uma faixa é o começo da próxima. A
 * primeira começa em zero e a última não tem teto — sem isso existe uma
 * quantidade para a qual o motor não encontra faixa nenhuma.
 */
function problemasDasFaixas(faixas: FaixaPrecificacao[]): string[] {
  const problemas: string[] = []
  const familias = new Map<string, FaixaPrecificacao[]>()

  for (const faixa of faixas) {
    const chave = `${faixa.grupo}/${faixa.tipo}`
    familias.set(chave, [...(familias.get(chave) ?? []), faixa])
  }

  for (const [familia, itens] of familias) {
    const ordenadas = [...itens].sort((a, b) => a.limiteMin - b.limiteMin)

    // Faixas de funcionários começam onde a isenção termina, e não em zero: as
    // primeiras unidades são de graça de propósito.
    const inicioEsperado = ordenadas[0]?.limiteMin ?? 0
    let anterior: number | null = inicioEsperado

    for (const faixa of ordenadas) {
      if (anterior === null) {
        problemas.push(`${familia}: faixa depois da faixa sem teto.`)
        break
      }
      if (faixa.limiteMin !== anterior) {
        problemas.push(
          `${familia}: ${faixa.limiteMin > anterior ? 'lacuna' : 'sobreposição'} em ${anterior}.`,
        )
      }
      anterior = faixa.limiteMax
    }

    if (anterior !== null) {
      problemas.push(`${familia}: a última faixa precisa ser sem teto.`)
    }
  }

  return problemas
}
