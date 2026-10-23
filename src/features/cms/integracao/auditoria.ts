import { headers } from 'next/headers'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
  type EventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'

/**
 * Trilha do CMS, no mecanismo único de auditoria da Vincis.
 *
 * Os metadados guardam o que identifica a mudança (slug, status, operação) —
 * nunca o conteúdo da página, que já está na própria tabela e pode ser longo.
 */
export const ACOES_CMS = {
  paginaCriada: ACOES_AUDITORIA.cmsPaginaCriada,
  paginaEditada: ACOES_AUDITORIA.cmsPaginaEditada,
  paginaPublicada: ACOES_AUDITORIA.cmsPaginaPublicada,
  paginaDespublicada: ACOES_AUDITORIA.cmsPaginaDespublicada,
  paginaArquivada: ACOES_AUDITORIA.cmsPaginaArquivada,
  navegacaoAlterada: ACOES_AUDITORIA.cmsNavegacaoAlterada,
} as const

type Executor = Parameters<typeof registrarEventoAuditoria>[1]

/**
 * IP de quem fez a requisição, quando houver uma.
 *
 * Fora de uma requisição HTTP (script, teste) não existe cabeçalho, e a
 * ausência do IP não pode impedir a auditoria: grava-se `null`.
 */
async function ipDaRequisicao(): Promise<string | null> {
  try {
    const encaminhado = (await headers()).get('x-forwarded-for')
    return encaminhado?.split(',')[0]?.trim().slice(0, 45) || null
  } catch {
    return null
  }
}

export async function registrarEventoCms(
  evento: {
    acao: (typeof ACOES_CMS)[keyof typeof ACOES_CMS]
    entidade: 'cms_pagina' | 'cms_grupo_navegacao' | 'cms_item_navegacao'
    registroAfetado: string
    autorId: string
    metadados?: EventoAuditoria['metadados']
  },
  executor: Executor,
) {
  return registrarEventoAuditoria(
    { ...evento, origem: 'gestao_vincis', ip: await ipDaRequisicao() },
    executor,
  )
}
