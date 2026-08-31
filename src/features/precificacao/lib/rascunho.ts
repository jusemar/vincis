import { percentualParaDesconto, percentualParaMultiplicador, reaisParaCentavos } from './conversao'
import {
  acrescimoPercentual,
  centavosParaReais,
  descontoPercentual,
} from './conversao'
import type { TabelaPrecificacao } from '../types/precificacao'

/**
 * O que o Gestor digitou, antes de salvar.
 *
 * ## Por que existe
 *
 * A prévia lateral precisa responder "e se eu mudar isto?" **enquanto** a
 * pessoa mexe, e a resposta tem de vir do motor de verdade — o mesmo que
 * `/precos` usa. Para isso o motor precisa de uma `TabelaPrecificacao`, e não
 * de campos soltos de formulário. O rascunho é a ponte: guarda o texto dos
 * campos e sabe produzir uma tabela hipotética com ele.
 *
 * ## O que ele não é
 *
 * Não é persistência. Nada aqui toca o banco, e o motor oficial não sabe que
 * ele existe: `aplicarRascunho` devolve uma cópia da tabela, usada só para
 * simular. Gravar continua sendo o caminho de sempre — Server Action, Zod,
 * impressão da seção, transação e conferência de coerência.
 *
 * ## Campo inválido não estraga a prévia
 *
 * Enquanto alguém digita "1", "1,", "1,9" o valor passa por estados que não
 * são número. Nesses instantes o rascunho **mantém o valor salvo** para aquele
 * campo, em vez de zerar o preço na tela a cada tecla.
 */
export type RascunhoPrecificacao = {
  /** Chave `grupo/regime` → valor em reais, como está no campo. */
  precosBase: Record<string, string>
  /** Acréscimo da Consultiva sobre a base contábil, em porcentagem. */
  acrescimoConsultiva: string
  /** Chave `grupo/tipo/codigo` → valor em reais. */
  faixas: Record<string, string>
  /** Chave `dimensao/codigo` → acréscimo em porcentagem. */
  fatores: Record<string, string>
  adicionais: Record<string, { valor: string; ativo: boolean }>
  /** Código do desconto → porcentagem. */
  descontos: Record<string, string>
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

export const chaveDoPreco = (grupo: string, regime: string) => `${grupo}/${regime}`
export const chaveDaFaixa = (grupo: string, tipo: string, codigo: string) =>
  `${grupo}/${tipo}/${codigo}`
export const chaveDoFator = (dimensao: string, codigo: string) =>
  `${dimensao}/${codigo}`

/** O rascunho que espelha exatamente o que está salvo. */
export function rascunhoDaTabela(
  tabela: TabelaPrecificacao,
): RascunhoPrecificacao {
  return {
    precosBase: Object.fromEntries(
      tabela.precosBase.map((p) => [
        chaveDoPreco(p.grupo, p.regime),
        paraTexto(centavosParaReais(p.valorCentavos)),
      ]),
    ),
    acrescimoConsultiva: paraTexto(
      acrescimoPercentual(
        tabela.servicos.find((s) => s.codigo === 'consultiva')
          ?.multiplicadorMilesimos ?? 1000,
      ),
    ),
    faixas: Object.fromEntries(
      tabela.faixas.map((f) => [
        chaveDaFaixa(f.grupo, f.tipo, f.codigo),
        paraTexto(centavosParaReais(f.valorCentavos)),
      ]),
    ),
    fatores: Object.fromEntries(
      tabela.dimensoes.flatMap((d) =>
        d.opcoes
          .filter((o) => o.multiplicadorMilesimos !== null)
          .map((o) => [
            chaveDoFator(d.codigo, o.codigo),
            paraTexto(acrescimoPercentual(o.multiplicadorMilesimos ?? 1000)),
          ]),
      ),
    ),
    adicionais: Object.fromEntries(
      tabela.adicionais.map((a) => [
        a.codigo,
        { valor: paraTexto(centavosParaReais(a.valorMensalCentavos)), ativo: a.ativo },
      ]),
    ),
    descontos: Object.fromEntries(
      tabela.descontos.map((d) => [
        d.codigo,
        paraTexto(descontoPercentual(d.descontoMilesimos)),
      ]),
    ),
  }
}

/**
 * A tabela como ficaria se o rascunho fosse salvo agora.
 *
 * Serve à prévia, e só a ela. Campos em branco ou no meio da digitação ficam
 * com o valor gravado — a prévia mostra um preço plausível o tempo todo, em
 * vez de piscar zero entre uma tecla e outra.
 */
export function aplicarRascunho(
  tabela: TabelaPrecificacao,
  rascunho: RascunhoPrecificacao,
): TabelaPrecificacao {
  const centavos = (texto: string | undefined, atual: number) => {
    const numero = paraNumero(texto ?? '')
    return Number.isFinite(numero) && numero >= 0 ? reaisParaCentavos(numero) : atual
  }
  const multiplicador = (texto: string | undefined, atual: number) => {
    const numero = paraNumero(texto ?? '')
    return Number.isFinite(numero) && numero >= 0
      ? percentualParaMultiplicador(numero)
      : atual
  }
  const desconto = (texto: string | undefined, atual: number) => {
    const numero = paraNumero(texto ?? '')
    return Number.isFinite(numero) && numero >= 0 && numero < 100
      ? percentualParaDesconto(numero)
      : atual
  }

  return {
    ...tabela,
    servicos: tabela.servicos.map((s) =>
      s.codigo === 'consultiva' && s.multiplicadorMilesimos !== null
        ? {
            ...s,
            multiplicadorMilesimos: multiplicador(
              rascunho.acrescimoConsultiva,
              s.multiplicadorMilesimos,
            ),
          }
        : s,
    ),
    precosBase: tabela.precosBase.map((p) => ({
      ...p,
      valorCentavos: centavos(
        rascunho.precosBase[chaveDoPreco(p.grupo, p.regime)],
        p.valorCentavos,
      ),
    })),
    dimensoes: tabela.dimensoes.map((d) => ({
      ...d,
      opcoes: d.opcoes.map((o) =>
        o.multiplicadorMilesimos === null
          ? o
          : {
              ...o,
              multiplicadorMilesimos: multiplicador(
                rascunho.fatores[chaveDoFator(d.codigo, o.codigo)],
                o.multiplicadorMilesimos,
              ),
            },
      ),
    })),
    faixas: tabela.faixas.map((f) => ({
      ...f,
      valorCentavos: centavos(
        rascunho.faixas[chaveDaFaixa(f.grupo, f.tipo, f.codigo)],
        f.valorCentavos,
      ),
    })),
    adicionais: tabela.adicionais.map((a) => ({
      ...a,
      valorMensalCentavos: centavos(
        rascunho.adicionais[a.codigo]?.valor,
        a.valorMensalCentavos,
      ),
      ativo: rascunho.adicionais[a.codigo]?.ativo ?? a.ativo,
    })),
    descontos: tabela.descontos.map((d) => ({
      ...d,
      descontoMilesimos: desconto(
        rascunho.descontos[d.codigo],
        d.descontoMilesimos,
      ),
    })),
  }
}

/** As seções que o Gestor edita, para saber qual delas tem alteração pendente. */
export const SECOES_RASCUNHO = [
  'precos_base',
  'funcionarios',
  'notas_fiscais',
  'faturamento',
  'atividade',
  'atendimento',
  'rotina',
  'adicionais',
  'descontos',
] as const

export type SecaoRascunho = (typeof SECOES_RASCUNHO)[number]

/** O recorte do rascunho que uma seção controla. Base da comparação "mudou?". */
export function fatiaDaSecao(
  rascunho: RascunhoPrecificacao,
  secao: SecaoRascunho,
): unknown {
  switch (secao) {
    case 'precos_base':
      return { precos: rascunho.precosBase, acrescimo: rascunho.acrescimoConsultiva }
    case 'funcionarios':
    case 'notas_fiscais':
    case 'faturamento':
      return Object.fromEntries(
        Object.entries(rascunho.faixas).filter(([chave]) =>
          chave.includes(`/${secao}/`),
        ),
      )
    case 'atividade':
    case 'atendimento':
    case 'rotina':
      return Object.fromEntries(
        Object.entries(rascunho.fatores).filter(([chave]) =>
          chave.startsWith(`${secao}/`),
        ),
      )
    case 'adicionais':
      return rascunho.adicionais
    case 'descontos':
      return rascunho.descontos
  }
}

/** A seção tem alteração ainda não salva? */
export function secaoAlterada(
  rascunho: RascunhoPrecificacao,
  salvo: RascunhoPrecificacao,
  secao: SecaoRascunho,
): boolean {
  return (
    JSON.stringify(fatiaDaSecao(rascunho, secao)) !==
    JSON.stringify(fatiaDaSecao(salvo, secao))
  )
}
