import { z } from 'zod'
import { LIMITES_CMS } from '../schemas/constantes'

/**
 * A forma aceita do conteúdo de uma página.
 *
 * O editor produz uma árvore JSON (formato ProseMirror/TipTap). Em vez de
 * aceitar qualquer árvore e sanitizar HTML depois, o CMS aceita uma **lista
 * fechada** de nós e marcas: o que não está aqui não chega ao banco nem à
 * tela. Não existe HTML cru em nenhum ponto — o renderizador monta elementos
 * React a partir destes nós, um por um.
 *
 * Ampliar o editor (imagem, tabela, citação) é acrescentar o nó aqui e no
 * renderizador, nos dois lugares, de propósito.
 */

/** Links aceitos: caminho interno, HTTP(S), e-mail e telefone. Nada de `javascript:`. */
export const enderecoLinkSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine((valor) => {
    if (valor.startsWith('/') && !valor.startsWith('//')) return true
    try {
      return ['https:', 'http:', 'mailto:', 'tel:'].includes(new URL(valor).protocol)
    } catch {
      return false
    }
  }, 'O link deve usar HTTPS, HTTP, e-mail, telefone ou caminho interno.')

const marcaConteudoSchema = z.discriminatedUnion('type', [
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
          // O editor (TipTap 3) grava `title: null` em todo link. É texto, e o
          // renderizador o ignora — aceitar evita recusar link legítimo.
          title: z.string().max(300).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
])

export type MarcaConteudo = z.infer<typeof marcaConteudoSchema>

export type NoConteudo = {
  type: string
  attrs?: Record<string, unknown>
  content?: NoConteudo[]
  marks?: MarcaConteudo[]
  text?: string
}

const noConteudoSchema: z.ZodType<NoConteudo> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('doc'), content: z.array(noConteudoSchema) }).strict(),
    z
      .object({ type: z.literal('paragraph'), content: z.array(noConteudoSchema).optional() })
      .strict(),
    z
      .object({
        type: z.literal('heading'),
        attrs: z.object({ level: z.number().int().min(1).max(3) }).strict(),
        content: z.array(noConteudoSchema).optional(),
      })
      .strict(),
    z
      .object({ type: z.literal('bulletList'), content: z.array(noConteudoSchema).min(1) })
      .strict(),
    z
      .object({
        type: z.literal('orderedList'),
        attrs: z
          .object({
            start: z.number().int().positive(),
            type: z.string().nullable().optional(),
          })
          .strict()
          .optional(),
        content: z.array(noConteudoSchema).min(1),
      })
      .strict(),
    z
      .object({ type: z.literal('listItem'), content: z.array(noConteudoSchema).min(1) })
      .strict(),
    z
      .object({
        type: z.literal('text'),
        text: z.string().max(100_000),
        marks: z.array(marcaConteudoSchema).optional(),
      })
      .strict(),
  ]),
)

export const conteudoPaginaSchema = noConteudoSchema
  .refine((conteudo) => conteudo.type === 'doc', 'O conteúdo deve começar por um documento.')
  .refine(
    (conteudo) => JSON.stringify(conteudo).length <= LIMITES_CMS.conteudo,
    'O conteúdo excede o limite de 1 MB.',
  )

export const CONTEUDO_PAGINA_VAZIO: NoConteudo = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}
