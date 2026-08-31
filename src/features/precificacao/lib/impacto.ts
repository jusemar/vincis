import { calcularPrecos } from './motor'
import { respostasIniciais } from './respostas'
import type { TabelaPrecificacao } from '../types/precificacao'

/**
 * O tamanho comercial de uma alteração, antes de ela ir ao ar.
 *
 * ## Por que medir
 *
 * As validações desta etapa impedem o **impossível** — preço zero, desconto
 * que anula a mensalidade, pacote acima da soma. Elas não impedem o
 * **inesperado**: derrubar o Simples de R$ 195 para R$ 19 é uma configuração
 * perfeitamente válida, e provavelmente um dígito a menos. Um erro assim vai
 * direto para a vitrine e ninguém percebe até alguém contratar.
 *
 * ## O critério é objetivo, e é um só
 *
 * Compara o preço que a vitrine mostra hoje com o que ela mostraria depois,
 * pelo mesmo motor e no perfil de referência da página. Se algum serviço cair
 * 25% ou mais, a publicação pede uma confirmação a mais. Não há regra por campo
 * nem lista de "campos perigosos": o que importa é o efeito no preço, e é isso
 * que se mede.
 *
 * Os 25% são decisão comercial aprovada, não um chute técnico. Alterações
 * menores — um reajuste de 5%, um adicional de R$ 10 — passam direto: a
 * confirmação existe para o engano grande, não para criar burocracia.
 */
export const QUEDA_QUE_PEDE_CONFIRMACAO = 25

export type ImpactoDaAlteracao = {
  /** Maior queda percentual entre os serviços, no perfil de referência. */
  maiorQuedaPercentual: number
  /** Serviços que caem, do maior tombo para o menor. */
  quedas: { servico: string; nome: string; de: number; para: number; queda: number }[]
  /** A queda passa do limite e merece uma segunda confirmação. */
  exigeConfirmacao: boolean
}

export function impactoDaAlteracao(
  salva: TabelaPrecificacao,
  proposta: TabelaPrecificacao,
): ImpactoDaAlteracao {
  const vazio: ImpactoDaAlteracao = {
    maiorQuedaPercentual: 0,
    quedas: [],
    exigeConfirmacao: false,
  }

  try {
    const perfil = respostasIniciais(salva)
    const antes = calcularPrecos(salva, perfil)
    const depois = calcularPrecos(proposta, perfil)

    const quedas = antes
      .map((precoAntes) => {
        const precoDepois = depois.find((p) => p.servico === precoAntes.servico)
        if (!precoDepois || precoAntes.mensalCentavos <= 0) return null
        const queda =
          ((precoAntes.mensalCentavos - precoDepois.mensalCentavos) /
            precoAntes.mensalCentavos) *
          100
        if (queda <= 0) return null
        return {
          servico: precoAntes.servico,
          nome:
            proposta.servicos.find((s) => s.codigo === precoAntes.servico)?.nome ??
            precoAntes.servico,
          de: precoAntes.mensalCentavos,
          para: precoDepois.mensalCentavos,
          queda: Math.round(queda * 10) / 10,
        }
      })
      .filter((q): q is NonNullable<typeof q> => q !== null)
      .sort((a, b) => b.queda - a.queda)

    const maior = quedas[0]?.queda ?? 0
    return {
      maiorQuedaPercentual: maior,
      quedas,
      exigeConfirmacao: maior >= QUEDA_QUE_PEDE_CONFIRMACAO,
    }
  } catch {
    // Rascunho que ainda não calcula não é uma queda de preço: a validação de
    // salvar cuida desse caso, e medir impacto aqui só produziria ruído.
    return vazio
  }
}
