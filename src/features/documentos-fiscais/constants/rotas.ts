import { PERMISSOES_DOCUMENTOS_FISCAIS, PERMISSOES_FISCAIS_POR_PERFIL } from './permissoes'

/**
 * Onde a Central Fiscal mora e quem a vê no menu.
 *
 * Arquivo puro: a barra lateral e a navegação mobile decidem o que mostrar com a
 * mesma tabela de permissões que o servidor usa para autorizar. Esconder item de
 * menu não protege nada — a rota confere sessão, vínculo e
 * `documentos_fiscais.visualizar` antes de qualquer consulta —, mas evita
 * oferecer uma porta que o servidor vai fechar.
 */
export const ROTA_DOCUMENTOS_FISCAIS = '/admin/documentos-fiscais'

/** Rótulo único da área, no menu e na tela. */
export const ROTULO_DOCUMENTOS_FISCAIS = 'Documentos Fiscais'

export function perfilVeDocumentosFiscais(perfilTipo: string | null | undefined): boolean {
  const permissoes = PERMISSOES_FISCAIS_POR_PERFIL[perfilTipo ?? ''] ?? []
  return permissoes.includes(PERMISSOES_DOCUMENTOS_FISCAIS.visualizar)
}
