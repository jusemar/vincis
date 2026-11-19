import { z } from 'zod'
import { enderecoLinkSchema, type NoConteudo } from '@/features/cms/nucleo/conteudo/schema'
import { LIMITES_ARTIGO } from '../../constants/limites'
import { ehImagemDeArtigoPermitida } from './imagens-permitidas'

/**
 * A forma aceita do corpo de um artigo.
 *
 * Mesma filosofia do CMS institucional (`features/cms/nucleo/conteudo`): uma
 * **lista fechada** de nós e marcas, validada no servidor ao gravar e de novo
 * ao exibir. Não existe HTML em nenhum ponto — o renderizador monta elementos
 * React nó a nó —, então não há script, `style`, `on*` nem `iframe` possíveis.
 *
 * Em relação ao CMS, o artigo acrescenta:
 * - `image`, com `src` restrito às imagens enviadas pela própria Vincis
 *   (storage público da plataforma). Imagem de outro domínio é recusada:
 *   evita rastreamento de leitores e conteúdo trocado depois da aprovação;
 * - tabelas (`table`, `tableRow`, `tableHeader`, `tableCell`).
 *
 * Títulos do corpo começam em H2 — o H1 é o título do artigo.
 */

export type { NoConteudo }

const marcaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  z
    .object({
      type: z.literal('link'),
      attrs: z
        .object({
          href: enderecoLinkSchema,
          target: z.enum(['_blank', '_self']).nullable().optional(),
          rel: z.string().max(120).nullable().optional(),
          class: z.null().optional(),
          title: z.string().max(300).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
])

const atributosCelula = z
  .object({
    colspan: z.number().int().min(1).max(20).optional(),
    rowspan: z.number().int().min(1).max(50).optional(),
    colwidth: z.array(z.number().int().min(0).max(4_000)).nullable().optional(),
    // Alinhamento do TipTap 3. Lista fechada: vira classe, nunca `style` livre.
    align: z.enum(['left', 'center', 'right']).nullable().optional(),
  })
  .strict()
  .optional()

const noSchema: z.ZodType<NoConteudo> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('doc'), content: z.array(noSchema) }).strict(),
    z.object({ type: z.literal('paragraph'), content: z.array(noSchema).optional() }).strict(),
    z
      .object({
        type: z.literal('heading'),
        attrs: z.object({ level: z.number().int().min(2).max(3) }).strict(),
        content: z.array(noSchema).optional(),
      })
      .strict(),
    z.object({ type: z.literal('bulletList'), content: z.array(noSchema).min(1) }).strict(),
    z
      .object({
        type: z.literal('orderedList'),
        attrs: z
          .object({ start: z.number().int().positive(), type: z.string().max(10).nullable().optional() })
          .strict()
          .optional(),
        content: z.array(noSchema).min(1),
      })
      .strict(),
    z.object({ type: z.literal('listItem'), content: z.array(noSchema).min(1) }).strict(),
    z
      .object({
        type: z.literal('image'),
        attrs: z
          .object({
            src: z.string().max(2_048).refine(ehImagemDeArtigoPermitida, 'Imagem fora do armazenamento da Vincis.'),
            alt: z.string().max(LIMITES_ARTIGO.capaAlt).nullable().optional(),
            title: z.string().max(300).nullable().optional(),
            width: z.number().nullable().optional(),
            height: z.number().nullable().optional(),
          })
          .strict(),
      })
      .strict(),
    z.object({ type: z.literal('table'), content: z.array(noSchema).min(1).max(200) }).strict(),
    z.object({ type: z.literal('tableRow'), content: z.array(noSchema).min(1).max(20) }).strict(),
    z
      .object({ type: z.literal('tableHeader'), attrs: atributosCelula, content: z.array(noSchema).optional() })
      .strict(),
    z
      .object({ type: z.literal('tableCell'), attrs: atributosCelula, content: z.array(noSchema).optional() })
      .strict(),
    z
      .object({
        type: z.literal('text'),
        text: z.string().max(100_000),
        marks: z.array(marcaSchema).optional(),
      })
      .strict(),
  ]),
)

function contarImagens(no: NoConteudo): number {
  return (no.type === 'image' ? 1 : 0) + (no.content ?? []).reduce((total, filho) => total + contarImagens(filho), 0)
}

/** Estrutura válida: hierarquia de tabela/lista coerente. */
function hierarquiaValida(no: NoConteudo, pai: string | null): boolean {
  const filhos = no.content ?? []
  if (no.type === 'tableRow' && pai !== 'table') return false
  if ((no.type === 'tableCell' || no.type === 'tableHeader') && pai !== 'tableRow') return false
  if (no.type === 'listItem' && pai !== 'bulletList' && pai !== 'orderedList') return false
  if (no.type === 'table' && filhos.some((filho) => filho.type !== 'tableRow')) return false
  return filhos.every((filho) => hierarquiaValida(filho, no.type))
}

export const conteudoArtigoSchema = noSchema
  .refine((conteudo) => conteudo.type === 'doc', 'O conteúdo deve começar por um documento.')
  .refine(
    (conteudo) => JSON.stringify(conteudo).length <= LIMITES_ARTIGO.conteudoBytes,
    'O conteúdo excede o tamanho máximo do artigo.',
  )
  .refine(
    (conteudo) => contarImagens(conteudo) <= LIMITES_ARTIGO.imagensNoCorpo,
    `Use no máximo ${LIMITES_ARTIGO.imagensNoCorpo} imagens no corpo do artigo.`,
  )
  .refine((conteudo) => hierarquiaValida(conteudo, null), 'Estrutura de lista ou tabela inválida.')

export const CONTEUDO_ARTIGO_VAZIO: NoConteudo = { type: 'doc', content: [{ type: 'paragraph' }] }

/** Texto corrido do corpo — tamanho mínimo, tempo de leitura e descrição. */
export function textoDoConteudo(no: NoConteudo): string {
  if (no.type === 'text') return no.text ?? ''
  const filhos = (no.content ?? []).map(textoDoConteudo)
  const bloco = ['paragraph', 'heading', 'listItem', 'tableCell', 'tableHeader'].includes(no.type)
  return bloco ? `${filhos.join('')}\n` : filhos.join('')
}

/** Minutos de leitura (≈ 200 palavras/minuto), mínimo 1. */
export function minutosDeLeitura(no: NoConteudo): number {
  const palavras = textoDoConteudo(no).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(palavras / 200))
}

/** Lê o conteúdo gravado, revalidando. Falha → `null` (quem chama decide). */
export function lerConteudoArtigo(bruto: unknown): NoConteudo | null {
  const resultado = conteudoArtigoSchema.safeParse(bruto)
  return resultado.success ? resultado.data : null
}
