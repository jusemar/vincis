import { z } from 'zod'

/** Modelos de preço aceitos pelo catálogo. */
/**
 * Teto de itens no catálogo de um prestador.
 *
 * Conta o catálogo cadastrado, não o publicado: um serviço inativo continua
 * ocupando vaga, porque continua cadastrado. Para liberar espaço é preciso
 * excluí-lo — e a exclusão respeita o histórico de contratações.
 */
export const LIMITE_SERVICOS_CATALOGO = 5

export const MODELOS_PRECO = [
  'fixo',
  'a_partir_de',
  'por_hora',
  'sob_orcamento',
] as const
export type ModeloPreco = (typeof MODELOS_PRECO)[number]

export const CATEGORIAS_SERVICO = ['contabil', 'juridico', 'consultoria'] as const
export type CategoriaServico = (typeof CATEGORIAS_SERVICO)[number]

/** Aceita "1.234,56" e "1234.56"; devolve centavos. */
export function converterValorParaCentavos(valor: string): number {
  const limpo = valor.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const numero = Number.parseFloat(limpo)
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0
}

const valorOpcional = z.string().trim().optional().default('')

export const ServicoSchema = z
  .object({
    nome: z.string().trim().min(3, 'Informe o nome do serviço.').max(160),
    descricaoCurta: z
      .string()
      .trim()
      .min(5, 'Descreva o serviço em uma linha.')
      .max(280),
    descricaoDetalhada: z.string().trim().max(2000).optional().default(''),
    categoria: z.enum(CATEGORIAS_SERVICO).default('contabil'),
    itensIncluidos: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
    /**
     * Etapas padrão da execução — o modelo do checklist.
     *
     * Não é o que o Cliente contrata nem o que ele preenche: é como o prestador
     * organiza o trabalho. Vira cópia no Atendimento no momento da contratação.
     */
    checklistModelo: z
      .array(z.string().trim().min(1).max(160))
      .max(40)
      .default([]),
    modeloPreco: z.enum(MODELOS_PRECO).default('fixo'),
    valor: valorOpcional,
    prazoEstimadoDias: z.coerce.number().int().min(0).max(365).optional(),
    ativo: z.boolean().default(true),
    publico: z.boolean().default(true),
    ordem: z.coerce.number().int().min(0).max(999).default(0),
  })
  .superRefine((dados, ctx) => {
    // `sob_orcamento` não tem valor por definição; os demais modelos exigem um
    // número real — zero aqui seria um preço inventado.
    if (dados.modeloPreco === 'sob_orcamento') return
    if (converterValorParaCentavos(dados.valor) <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['valor'],
        message: 'Informe um valor maior que zero para este modelo de preço.',
      })
    }
  })

export const ServicoIdSchema = z.string().uuid('Serviço inválido.')

export const AlternarServicoSchema = z.object({
  servicoId: ServicoIdSchema,
  ativo: z.boolean(),
})

export type ServicoDTO = z.input<typeof ServicoSchema>
export type ServicoValidado = z.output<typeof ServicoSchema>
