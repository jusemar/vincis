import { violacoesComerciais } from '@/features/precificacao/lib/invariantes'
import type { ViolacaoComercial } from '@/features/precificacao/lib/invariantes'
import type { TabelaPrecificacao } from '@/features/precificacao/types/precificacao'
import { chavesDaGrade } from './grade'
import { tabelaDoProfissional } from './tabela-do-profissional'
import type { ValoresDoProfissional } from '../types/precificacao-profissional'

/**
 * A tabela individual pode ir ao ar?
 *
 * ## Duas perguntas, e as duas já tinham resposta na casa
 *
 * **A grade está completa?** Comparar as chaves recebidas com as que a
 * estrutura da Vincis define hoje é o equivalente, nesta escala, ao que
 * `problemasDaTabela` faz na tabela da Vincis: garantir que não falta preço
 * para um regime nem valor para uma faixa. Aqui a comparação basta porque o
 * Profissional não desenha a grade — ele só preenche posições dela, e as
 * posições vêm de uma tabela que já passou por aquela conferência.
 *
 * **O preço é aceitável?** Quem responde é `violacoesComerciais`, sem nenhuma
 * adaptação: ela roda o **motor de verdade** sobre perfis extremos de empresa e
 * confere que nenhum deles chega a zero, que nenhum multiplicador anula o
 * preço e que nenhum preço-base fica em branco. Reescrever essas regras aqui
 * daria duas fontes para a mesma pergunta, e a segunda envelheceria.
 *
 * O que ela não encontra na tabela individual — combo, adicionais, prazos
 * concorrentes — simplesmente não gera violação: as listas estão vazias, e as
 * regras correspondentes não têm sobre o que incidir.
 */
export function conferirValoresDoProfissional(
  estrutura: TabelaPrecificacao,
  valores: ValoresDoProfissional,
): { problemas: string[]; violacoes: ViolacaoComercial[] } {
  const problemas = problemasDaGrade(estrutura, valores)
  if (problemas.length > 0) return { problemas, violacoes: [] }

  const tabela = tabelaDoProfissional(estrutura, valores, {
    // Nome não influencia preço nenhum; a conferência só precisa da grade.
    primeiroNome: 'o profissional',
  })

  return { problemas, violacoes: violacoesComerciais(tabela) }
}

/** As chaves recebidas são exatamente as posições da grade — nem mais, nem menos. */
export function problemasDaGrade(
  estrutura: TabelaPrecificacao,
  valores: ValoresDoProfissional,
): string[] {
  const esperado = chavesDaGrade(estrutura)
  const problemas: string[] = []

  const conferir = (
    nome: string,
    chavesEsperadas: string[],
    recebido: Record<string, number>,
  ) => {
    const recebidas = new Set(Object.keys(recebido))
    for (const chave of chavesEsperadas) {
      if (!recebidas.has(chave)) problemas.push(`Falta o valor de ${nome}: ${chave}.`)
    }
    for (const chave of recebidas) {
      if (!chavesEsperadas.includes(chave)) {
        problemas.push(`Valor de ${nome} que não existe na grade: ${chave}.`)
      }
    }
  }

  conferir('preço por enquadramento', esperado.precosBase, valores.precosBase)
  conferir('faixa', esperado.faixas, valores.faixas)
  conferir('acréscimo', esperado.fatores, valores.fatores)

  return problemas
}
