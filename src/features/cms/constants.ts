import type { StatusPagina } from './nucleo/types'

/** Rótulos e variantes de interface do CMS — o núcleo não conhece texto de tela. */
export const ROTULO_STATUS_PAGINA: Record<StatusPagina, string> = {
  rascunho: 'Rascunho',
  publicada: 'Publicada',
  arquivada: 'Arquivada',
}

export const VARIANTE_STATUS_PAGINA: Record<StatusPagina, 'default' | 'secondary' | 'outline'> = {
  publicada: 'default',
  rascunho: 'secondary',
  arquivada: 'outline',
}

export const POR_PAGINA_GESTAO_CMS = 20

export function formatarDataCms(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso))
}
