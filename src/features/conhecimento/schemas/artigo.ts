import { z } from 'zod'
import { LIMITES_ARTIGO, LIMITES_CATEGORIA } from '../constants/limites'
import { AREAS_BUSCA } from '../constants/status'
import { conteudoArtigoSchema, textoDoConteudo } from '../lib/conteudo/schema-conteudo'
import { ehImagemDeArtigoPermitida } from '../lib/conteudo/imagens-permitidas'
import { motivoSlugInvalido, normalizarSlugArtigo } from '../lib/slug-artigo'

/**
 * Validação dupla (formulário e servidor) da Central de Conhecimento.
 *
 * O **rascunho** aceita texto incompleto — salvar no meio do trabalho não pode
 * ser recusado por falta de resumo. O **envio** exige o artigo completo.
 * Nenhum campo de autoria existe aqui: autor vem sempre da sessão.
 */

/** Remove caracteres de controle (exceto quebra de linha) e espaços nas pontas. */
const textoLimpo = (maximo: number) =>
  z
    .string()
    .max(maximo)
    // eslint-disable-next-line no-control-regex
    .transform((valor) => valor.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())

const textoOpcional = (maximo: number) =>
  textoLimpo(maximo)
    .nullable()
    .optional()
    .transform((valor) => (valor ? valor : null))

export const fonteArtigoSchema = z
  .object({
    titulo: textoLimpo(LIMITES_ARTIGO.fonteTitulo).pipe(z.string().min(2, 'Descreva a fonte.')),
    url: z
      .string()
      .trim()
      .max(2_048)
      .nullable()
      .optional()
      .transform((valor) => (valor ? valor : null))
      .refine((valor) => {
        if (!valor) return true
        try {
          return ['https:', 'http:'].includes(new URL(valor).protocol)
        } catch {
          return false
        }
      }, 'Use um endereço http(s) completo.'),
  })
  .strict()

const capaSchema = z
  .string()
  .max(2_048)
  .nullable()
  .optional()
  .transform((valor) => (valor ? valor : null))
  .refine((valor) => valor === null || ehImagemDeArtigoPermitida(valor), 'Envie a capa pelo botão de upload.')

/**
 * URL amigável escolhida pelo autor. Vazia = gerada do título. Normalizada
 * aqui (acentos, espaços) e validada (formato, tamanho, reservados); a
 * unicidade só o banco responde, na action.
 */
export const slugArtigoSchema = z
  .string()
  .max(200)
  .nullable()
  .optional()
  .transform((valor) => (valor ? normalizarSlugArtigo(valor) : null))
  .superRefine((valor, contexto) => {
    if (valor === null) return
    const motivo = motivoSlugInvalido(valor)
    if (motivo) contexto.addIssue({ code: 'custom', message: motivo })
  })

/**
 * Palavras-chave: até 10, sem repetição (ignorando maiúsculas/minúsculas),
 * cada uma com 2 a 40 caracteres. Organização editorial e busca interna.
 */
export const palavrasChaveSchema = z
  .array(z.string())
  .max(LIMITES_ARTIGO.palavrasChave * 3)
  .default([])
  .transform((lista) => {
    const vistas = new Set<string>()
    const resultado: string[] = []
    for (const bruta of lista) {
      // eslint-disable-next-line no-control-regex
      const palavra = bruta.replace(/[\u0000-\u001F\u007F<>]/g, '').replace(/\s+/g, ' ').trim()
      const chave = palavra.toLocaleLowerCase('pt-BR')
      if (!palavra || vistas.has(chave)) continue
      vistas.add(chave)
      resultado.push(palavra)
    }
    return resultado
  })
  .refine((lista) => lista.length <= LIMITES_ARTIGO.palavrasChave, `Use no máximo ${LIMITES_ARTIGO.palavrasChave} palavras-chave.`)
  .refine(
    (lista) => lista.every((p) => p.length >= LIMITES_ARTIGO.palavraChave.min && p.length <= LIMITES_ARTIGO.palavraChave.max),
    `Cada palavra-chave deve ter de ${LIMITES_ARTIGO.palavraChave.min} a ${LIMITES_ARTIGO.palavraChave.max} caracteres.`,
  )

/** Campos editáveis de uma versão. */
export const dadosArtigoSchema = z
  .object({
    titulo: textoLimpo(LIMITES_ARTIGO.titulo.max).pipe(z.string().min(3, 'Informe um título.')),
    /** Só vale antes da primeira publicação; depois a URL fica fixa. */
    slug: slugArtigoSchema,
    palavrasChave: palavrasChaveSchema,
    resumo: textoLimpo(LIMITES_ARTIGO.resumo.max).default(''),
    categoriaId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .transform((valor) => valor ?? null),
    capaUrl: capaSchema,
    capaAlt: textoOpcional(LIMITES_ARTIGO.capaAlt),
    conteudo: conteudoArtigoSchema,
    fontes: z.array(fonteArtigoSchema).max(LIMITES_ARTIGO.fontes).default([]),
    tituloSeo: textoOpcional(LIMITES_ARTIGO.tituloSeo),
    descricaoSeo: textoOpcional(LIMITES_ARTIGO.descricaoSeo),
  })
  .strict()

export type DadosArtigoEntrada = z.input<typeof dadosArtigoSchema>
export type DadosArtigo = z.output<typeof dadosArtigoSchema>

/** O que o envio para aprovação exige além do rascunho. */
export function problemasParaEnvio(dados: DadosArtigo): string[] {
  const problemas: string[] = []
  if (dados.titulo.length < LIMITES_ARTIGO.titulo.min)
    problemas.push(`O título precisa de pelo menos ${LIMITES_ARTIGO.titulo.min} caracteres.`)
  if (dados.resumo.length < LIMITES_ARTIGO.resumo.min)
    problemas.push(`O resumo precisa de pelo menos ${LIMITES_ARTIGO.resumo.min} caracteres.`)
  if (!dados.categoriaId) problemas.push('Escolha uma categoria.')
  if (dados.capaUrl && !dados.capaAlt) problemas.push('Descreva a imagem de capa (texto alternativo).')
  if (textoDoConteudo(dados.conteudo).trim().length < LIMITES_ARTIGO.corpoMinimoEnvio)
    problemas.push(`O texto do artigo precisa de pelo menos ${LIMITES_ARTIGO.corpoMinimoEnvio} caracteres.`)
  return problemas
}

export const identificadorSchema = z.string().uuid()

export const observacaoSchema = textoLimpo(LIMITES_ARTIGO.observacao)

export const observacaoObrigatoriaSchema = observacaoSchema.pipe(
  z.string().min(10, 'Explique ao autor o motivo (mínimo de 10 caracteres).'),
)

export const categoriaSchema = z
  .object({
    nome: textoLimpo(LIMITES_CATEGORIA.nome).pipe(z.string().min(3, 'Informe o nome.')),
    descricao: textoOpcional(LIMITES_CATEGORIA.descricao),
    areaBusca: z
      .enum(AREAS_BUSCA)
      .nullable()
      .optional()
      .transform((valor) => valor ?? null),
    chamadaConversao: textoOpcional(LIMITES_CATEGORIA.chamada),
    ativa: z.boolean().default(true),
    ordem: z.coerce.number().int().min(0).max(999).default(0),
  })
  .strict()

export type CategoriaEntrada = z.input<typeof categoriaSchema>

export const filtrosCentralSchema = z.object({
  busca: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((valor) => valor || undefined),
  categoria: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]*$/)
    .optional()
    .transform((valor) => valor || undefined)
    .catch(undefined),
  pagina: z.coerce.number().int().min(1).max(1_000).catch(1).default(1),
})
