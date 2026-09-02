import { z } from 'zod'

/**
 * O que o servidor aceita do painel do Profissional.
 *
 * ## Unidades da tela, não do banco
 *
 * A pessoa digita reais e porcentagem; a conversão para centavos e milésimos
 * acontece na Server Action, com as mesmas funções que a Precificação da Vincis
 * usa (`features/precificacao/lib/conversao`). Exigir centavos do formulário
 * exporia a implementação como se fosse regra de negócio.
 *
 * ## O que este esquema não valida
 *
 * Ele não sabe se `simples` é um regime que existe, nem se `notas_fiscais/11a30`
 * é uma faixa da grade. Isso é comparação **contra a estrutura da Vincis**, e
 * quem faz é a action, depois de ler a grade: um esquema que carregasse a lista
 * de chaves seria uma terceira declaração da mesma grade.
 *
 * Também não decide se o preço é comercialmente aceitável — quem decide é
 * `violacoesComerciais`, rodando o motor de verdade sobre a tabela derivada.
 * Aqui ficam só os limites que impedem um número absurdo de chegar tão longe.
 */

/** Nenhum preço passa de R$ 1 milhão por mês: acima disso é erro de digitação. */
const REAIS_MAXIMO = 1_000_000

const reais = z
  .number({ message: 'Informe um valor em reais.' })
  .min(0, 'Valor não pode ser negativo.')
  .max(REAIS_MAXIMO, 'Valor acima do limite aceito.')
  // Meio centavo não existe em preço; o banco guarda inteiros.
  .refine(
    (valor) => Number.isFinite(valor) && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6,
    'Use no máximo duas casas decimais.',
  )

/**
 * Acréscimo em porcentagem. O piso é acima de -100% porque -100% zeraria o
 * preço e menos que isso o inverteria — os dois passariam despercebidos.
 */
const acrescimo = z
  .number({ message: 'Informe uma porcentagem.' })
  .gt(-100, 'O acréscimo precisa ser maior que -100%.')
  .max(1000, 'Acréscimo acima do limite aceito.')

const chave = z.string().trim().min(1).max(80)

export const ValoresDoProfissionalSchema = z.object({
  precosBase: z.array(z.object({ chave, valorReais: reais })).min(1),
  faixas: z.array(z.object({ chave, valorReais: reais })),
  fatores: z.array(z.object({ chave, acrescimoPercentual: acrescimo })),
})

export type ValoresDoProfissionalEntrada = z.output<
  typeof ValoresDoProfissionalSchema
>

/** Salvar o rascunho. Não muda nada do que está no ar. */
export const SalvarRascunhoSchema = z.object({
  valores: ValoresDoProfissionalSchema,
})

/**
 * Publicar. Manda os mesmos valores do rascunho de propósito.
 *
 * Publicar "o que estiver gravado" faria a tela publicar uma versão que a
 * pessoa não estava vendo — o rascunho no navegador pode estar à frente do
 * banco. Enviando os valores, a mesma requisição grava o rascunho e o promove,
 * e o que vai ao ar é exatamente o que estava na prévia.
 */
export const PublicarSchema = z.object({
  valores: ValoresDoProfissionalSchema,
})
