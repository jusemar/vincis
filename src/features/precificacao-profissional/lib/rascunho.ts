import {
  acrescimoPercentual,
  centavosParaReais,
  percentualParaMultiplicador,
  reaisParaCentavos,
} from '@/features/precificacao/lib/conversao'
import type { TipoDeCobranca } from '../constants/precificacao-profissional'
import type { ValoresDoProfissional } from '../types/precificacao-profissional'

/**
 * O que o Profissional digitou, antes de salvar.
 *
 * ## Mesma ideia do rascunho do Gestor, na escala desta tela
 *
 * `features/precificacao/lib/rascunho.ts` resolve exatamente este problema para
 * a Precificação da Vincis: a prévia precisa responder "e se eu mudar isto?"
 * **enquanto** a pessoa mexe, e a resposta tem de vir do motor de verdade — que
 * exige uma tabela, não campos soltos de formulário. Aqui o desenho é o mesmo e
 * o conteúdo é menor: três famílias de campo em vez de nove seções, sem
 * adicionais e sem descontos.
 *
 * Reaproveitar o módulo do Gestor não daria certo e não seria seguro: o dele é
 * moldado na grade da Vincis (chave `grupo/tipo/codigo`, acréscimo da
 * Consultiva, adicionais, descontos de prazo) e alterá-lo para servir aos dois
 * mexeria no caminho de edição do preço oficial. Esta cópia deliberada custa
 * cinquenta linhas e não toca em nada que já funciona.
 *
 * ## Nada aqui grava
 *
 * O rascunho é do navegador. Ele vira números na hora de salvar, e é o servidor
 * que decide se aqueles números podem entrar — Zod, conferência comercial e
 * transação, como em toda gravação de preço da plataforma.
 *
 * ## Campo no meio da digitação não estraga a prévia
 *
 * Enquanto alguém digita "2", "22", "22," o valor passa por estados que não são
 * número. Nesses instantes o rascunho **mantém o valor salvo** daquele campo,
 * em vez de zerar o preço na tela a cada tecla.
 */
export type RascunhoDoProfissional = {
  /** Código do regime → valor em reais, como está no campo. */
  precosBase: Record<string, string>
  /** `tipo/codigo` da faixa → valor em reais. */
  faixas: Record<string, string>
  /** `dimensao/opcao` → o acréscimo daquela resposta. */
  fatores: Record<string, AcrescimoDoRascunho>
}

/**
 * Um acréscimo em edição — a forma de cobrança e os **dois** campos.
 *
 * Guardar o percentual e o valor em reais lado a lado, e não só o do seletor
 * ativo, é o que faz alternar entre % e R$ não apagar nada: o campo que sai de
 * cena continua com o que a pessoa tinha digitado, e volta como estava. É
 * também o que mantém honesto o "há alterações não salvas?" — ir até R$ e
 * voltar deixa o rascunho idêntico ao que estava gravado.
 */
export type AcrescimoDoRascunho = {
  /** Qual dos dois campos vale. É o que o seletor da tela move. */
  tipo: TipoDeCobranca
  /** Acréscimo em porcentagem ("12" = 12% a mais). */
  percentual: string
  /** Acréscimo fixo em reais ("20" = R$ 20,00 a mais). */
  fixoReais: string
}

/** Texto do campo → número. Aceita a vírgula do teclado brasileiro. */
export function paraNumero(texto: string): number {
  const limpo = texto.replace(/\s/g, '').replace(',', '.')
  return limpo === '' ? Number.NaN : Number(limpo)
}

/** Número → texto do campo, sem casas decimais inúteis. */
export function paraTexto(valor: number): string {
  return String(valor).replace('.', ',')
}

/** O rascunho que espelha exatamente um conjunto de valores. */
export function rascunhoDosValores(
  valores: ValoresDoProfissional,
): RascunhoDoProfissional {
  return {
    precosBase: mapear(valores.precosBase, (centavos) =>
      paraTexto(centavosParaReais(centavos)),
    ),
    faixas: mapear(valores.faixas, (centavos) =>
      paraTexto(centavosParaReais(centavos)),
    ),
    fatores: mapear(valores.fatores, (milesimos, chave) => {
      const fixo = valores.acrescimosFixos[chave]
      return {
        tipo: (fixo === undefined ? 'percentual' : 'fixo') satisfies TipoDeCobranca,
        percentual: paraTexto(acrescimoPercentual(milesimos)),
        fixoReais: paraTexto(centavosParaReais(fixo ?? 0)),
      }
    }),
  }
}

/**
 * Os valores como ficariam se o rascunho fosse salvo agora.
 *
 * Serve à prévia, e só a ela. Campo em branco ou no meio da digitação fica com
 * o valor de referência — a prévia mostra um preço plausível o tempo todo, em
 * vez de piscar zero entre uma tecla e outra.
 */
export function valoresDoRascunho(
  rascunho: RascunhoDoProfissional,
  referencia: ValoresDoProfissional,
): ValoresDoProfissional {
  const centavos = (texto: string | undefined, atual: number) => {
    const numero = paraNumero(texto ?? '')
    return Number.isFinite(numero) && numero >= 0
      ? reaisParaCentavos(numero)
      : atual
  }
  // Um acréscimo de -100% ou menos zeraria ou inverteria o preço. O piso aqui
  // é o mesmo que a conferência comercial exige na hora de publicar.
  const fator = (texto: string | undefined, atual: number) => {
    const numero = paraNumero(texto ?? '')
    if (!Number.isFinite(numero)) return atual
    const milesimos = percentualParaMultiplicador(numero)
    return milesimos > 0 ? milesimos : atual
  }

  return {
    precosBase: mapear(referencia.precosBase, (atual, chave) =>
      centavos(rascunho.precosBase[chave], atual),
    ),
    faixas: mapear(referencia.faixas, (atual, chave) =>
      centavos(rascunho.faixas[chave], atual),
    ),
    // O percentual continua sendo calculado mesmo para quem cobra em reais: ele
    // é o valor guardado, e a prévia precisa dele intacto para o caso de a
    // pessoa voltar o seletor.
    fatores: mapear(referencia.fatores, (atual, chave) =>
      fator(rascunho.fatores[chave]?.percentual, atual),
    ),
    // Só as respostas com o seletor em R$. É o mesmo critério do banco: sem
    // chave aqui, o motor recebe o multiplicador.
    acrescimosFixos: Object.fromEntries(
      Object.entries(rascunho.fatores)
        .filter(([, campo]) => campo.tipo === 'fixo')
        .map(([chave, campo]) => [
          chave,
          centavos(campo.fixoReais, referencia.acrescimosFixos[chave] ?? 0),
        ]),
    ),
  }
}

/** O rascunho tem alguma diferença em relação ao que está gravado? */
export function rascunhoAlterado(
  rascunho: RascunhoDoProfissional,
  salvo: RascunhoDoProfissional,
): boolean {
  return JSON.stringify(rascunho) !== JSON.stringify(salvo)
}

function mapear<Entrada, Saida>(
  origem: Record<string, Entrada>,
  transformar: (valor: Entrada, chave: string) => Saida,
): Record<string, Saida> {
  return Object.fromEntries(
    Object.entries(origem).map(([chave, valor]) => [
      chave,
      transformar(valor, chave),
    ]),
  )
}
