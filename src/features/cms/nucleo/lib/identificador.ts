/**
 * Slugs e identificadores do CMS.
 *
 * Um formato só para os dois: minúsculas, números e hífens, sem hífen nas
 * pontas nem repetido. É o que cabe numa URL sem codificação e o que uma
 * integração pode comparar como texto puro.
 */
export const PADRAO_IDENTIFICADOR = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const TAMANHO_MAXIMO_IDENTIFICADOR = 120

/** Converte um título legível em identificador: "Política de Privacidade" → "politica-de-privacidade". */
export function gerarIdentificador(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TAMANHO_MAXIMO_IDENTIFICADOR)
    .replace(/-+$/g, '')
}
