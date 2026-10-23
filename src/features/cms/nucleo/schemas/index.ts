import { z } from 'zod'
import { conteudoPaginaSchema } from '../conteudo/schema'
import {
  PADRAO_IDENTIFICADOR,
  TAMANHO_MAXIMO_IDENTIFICADOR,
} from '../lib/identificador'
import type { VerificadorSlugReservado } from '../lib/slugs-reservados'
import { LIMITES_CMS, LOCAIS_NAVEGACAO, STATUS_PAGINA } from './constantes'

/**
 * Schemas de entrada do CMS.
 *
 * Saem de uma fábrica porque uma regra depende da aplicação: quais slugs já
 * são rotas. O resto é igual em qualquer projeto. Os mesmos schemas validam o
 * formulário no cliente e a action no servidor — a do servidor é a que vale.
 */
const identificadorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Informe o identificador.')
  .max(TAMANHO_MAXIMO_IDENTIFICADOR, `Use no máximo ${TAMANHO_MAXIMO_IDENTIFICADOR} caracteres.`)
  .regex(
    PADRAO_IDENTIFICADOR,
    'Use só letras minúsculas, números e hífens, sem hífen no começo ou no fim.',
  )

/** Texto opcional: vazio vira `null`, para o banco não guardar string em branco. */
const textoOpcional = (limite: number) =>
  z
    .string()
    .trim()
    .max(limite, `Use no máximo ${limite} caracteres.`)
    .nullable()
    .optional()
    .transform((valor) => valor || null)

const idSchema = (rotulo: string) => z.string().uuid(`${rotulo} inválido(a).`)

export const statusPaginaSchema = z.enum(STATUS_PAGINA)
export const localNavegacaoSchema = z.enum(LOCAIS_NAVEGACAO)

export const idPaginaSchema = z.object({ paginaId: idSchema('Página') })
export const idGrupoSchema = z.object({ grupoId: idSchema('Grupo') })

const listaSemRepeticao = (rotulo: string) =>
  z
    .array(idSchema(rotulo))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, 'A ordenação repete itens.')

export function criarSchemasCms({ slugReservado }: { slugReservado: VerificadorSlugReservado }) {
  const slugSchema = identificadorSchema.refine(
    (slug) => !slugReservado(slug),
    'Este endereço já é usado por uma página do sistema.',
  )

  const camposPagina = {
    titulo: z
      .string()
      .trim()
      .min(1, 'Informe o título.')
      .max(LIMITES_CMS.titulo, `Use no máximo ${LIMITES_CMS.titulo} caracteres.`),
    slug: slugSchema,
    conteudo: conteudoPaginaSchema,
    tituloSeo: textoOpcional(LIMITES_CMS.tituloSeo),
    descricaoSeo: textoOpcional(LIMITES_CMS.descricaoSeo),
  }

  const camposGrupo = {
    nome: z.string().trim().min(1, 'Informe o nome interno.').max(LIMITES_CMS.nomeGrupo),
    tituloPublico: z
      .string()
      .trim()
      .min(1, 'Informe o título público.')
      .max(LIMITES_CMS.tituloPublicoGrupo),
    identificador: identificadorSchema,
    local: localNavegacaoSchema.default('rodape'),
    ativo: z.boolean().default(false),
  }

  return {
    slug: slugSchema,
    /** Página nasce rascunho; publicar é um movimento à parte, auditado à parte. */
    criarPagina: z.object(camposPagina),
    editarPagina: z.object({ paginaId: idSchema('Página'), ...camposPagina }),
    listarPaginas: z.object({
      pagina: z.coerce.number().int().min(1).default(1),
      porPagina: z.coerce.number().int().min(1).max(LIMITES_CMS.porPagina).default(20),
      busca: z.string().trim().max(LIMITES_CMS.titulo).optional(),
      status: statusPaginaSchema.optional(),
    }),
    criarGrupo: z.object(camposGrupo),
    // O local é fixado na criação: mudar de lugar levaria agrupadores ao rodapé.
    editarGrupo: z.object({
      grupoId: idSchema('Grupo'),
      nome: camposGrupo.nome,
      tituloPublico: camposGrupo.tituloPublico,
      identificador: camposGrupo.identificador,
      ativo: camposGrupo.ativo,
    }),
    alterarAtivacaoGrupo: z.object({ grupoId: idSchema('Grupo'), ativo: z.boolean() }),
    /**
     * Sem `paginaId` o item é agrupador (só no cabeçalho, conferido pela
     * action) e precisa de texto, porque não tem título de página para herdar.
     */
    adicionarItem: z
      .object({
        grupoId: idSchema('Grupo'),
        paginaId: idSchema('Página').nullable().optional().transform((valor) => valor ?? null),
        paiId: idSchema('Item pai').nullable().optional().transform((valor) => valor ?? null),
        texto: textoOpcional(LIMITES_CMS.textoItem),
        ativo: z.boolean().default(true),
      })
      .refine((item) => item.paginaId || item.texto, {
        message: 'Escolha uma página ou dê um nome ao agrupador.',
        path: ['texto'],
      }),
    editarItem: z.object({
      itemId: idSchema('Item'),
      texto: textoOpcional(LIMITES_CMS.textoItem),
      ativo: z.boolean(),
    }),
    /** Muda o item de lugar: para a raiz (`null`) ou para o submenu de um agrupador. */
    moverItem: z.object({
      itemId: idSchema('Item'),
      paiId: idSchema('Item pai').nullable(),
    }),
    removerItem: z.object({ itemId: idSchema('Item') }),
    reordenarGrupos: z.object({
      local: localNavegacaoSchema,
      idsOrdenados: listaSemRepeticao('Grupo'),
    }),
    /** Reordena irmãos: raízes do grupo (`paiId` nulo) ou filhos de um agrupador. */
    reordenarItens: z.object({
      grupoId: idSchema('Grupo'),
      paiId: idSchema('Item pai').nullable().optional().transform((valor) => valor ?? null),
      idsOrdenados: listaSemRepeticao('Item'),
    }),
  }
}

export type SchemasCms = ReturnType<typeof criarSchemasCms>
