import { z } from 'zod'
import {
  SENTIDOS_DOCUMENTO_FISCAL,
  STATUS_PROCESSAMENTO_FISCAL,
  STATUS_REVISAO_FISCAL,
} from '../constants/dominio'

/**
 * Filtros da Central Fiscal — lidos da URL no servidor e escritos pela tela.
 *
 * Ficam na URL de propósito: a lista é filtrada e paginada no banco, então o
 * endereço é o estado. Voltar, recarregar ou compartilhar o link dá a mesma
 * tela, e o navegador nunca recebe documentos que o filtro descartou.
 *
 * Valor desconhecido vira ausência em vez de erro: link antigo ou parâmetro
 * digitado à mão abre a lista inteira do escopo, nunca uma tela quebrada.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/

const opcional = <T extends string>(valores: readonly T[]) =>
  z
    .string()
    .optional()
    .transform((valor) => ((valores as readonly string[]).includes(valor ?? '') ? (valor as T) : null))

export const FiltrosDocumentosFiscaisSchema = z.object({
  pagina: z
    .union([z.string(), z.number()])
    .optional()
    .transform((valor) => {
      const numero = Number(valor ?? 1)
      return Number.isFinite(numero) && numero >= 1 ? Math.floor(numero) : 1
    }),
  /** Id do cliente, ou `sem_cliente` para os documentos do próprio escritório. */
  cliente: z
    .string()
    .optional()
    .transform((valor) =>
      valor === 'sem_cliente' || z.string().uuid().safeParse(valor).success ? (valor as string) : null,
    ),
  sentido: opcional(SENTIDOS_DOCUMENTO_FISCAL),
  processamento: opcional(STATUS_PROCESSAMENTO_FISCAL),
  revisao: opcional(STATUS_REVISAO_FISCAL),
  de: z
    .string()
    .optional()
    .transform((valor) => (valor && ISO.test(valor) ? valor : null)),
  ate: z
    .string()
    .optional()
    .transform((valor) => (valor && ISO.test(valor) ? valor : null)),
  busca: z
    .string()
    .optional()
    .transform((valor) => {
      const texto = valor?.trim().slice(0, 60)
      return texto ? texto : null
    }),
})

export type FiltrosDocumentosFiscaisDTO = z.input<typeof FiltrosDocumentosFiscaisSchema>
export type FiltrosDocumentosFiscaisValidados = z.output<typeof FiltrosDocumentosFiscaisSchema>

/** Parâmetros da URL → filtros da consulta. */
export function lerFiltrosDocumentosFiscais(
  parametros: Record<string, string | string[] | undefined>,
): FiltrosDocumentosFiscaisValidados {
  const simples = Object.fromEntries(
    Object.entries(parametros).map(([chave, valor]) => [chave, Array.isArray(valor) ? valor[0] : valor]),
  )
  return FiltrosDocumentosFiscaisSchema.parse(simples)
}

/** Filtros → query string, sem carregar parâmetro vazio. */
export function montarBuscaDocumentosFiscais(
  filtros: Partial<Record<keyof FiltrosDocumentosFiscaisValidados, string | number | null>>,
): string {
  const parametros = new URLSearchParams()
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor === null || valor === undefined || valor === '') continue
    if (chave === 'pagina' && Number(valor) <= 1) continue
    parametros.set(chave, String(valor))
  }
  const texto = parametros.toString()
  return texto ? `?${texto}` : ''
}
