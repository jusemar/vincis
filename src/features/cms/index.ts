/**
 * CMS institucional.
 *
 * - `nucleo/`: o que serve para qualquer projeto (conteúdo, schemas, regras).
 * - `integracao/`: o que é da Vincis (rotas reservadas, porta do Gestor,
 *   auditoria).
 * - `queries/` e `actions/`: leitura e escrita administrativas, sempre atrás
 *   da porta do Gestor.
 *
 * Actions são importadas direto de `actions/*` (arquivos `'use server'`).
 */
export * from './nucleo'
export { schemasCms } from './integracao/schemas'
export { ROTAS_RESERVADAS_VINCIS, slugReservadoVincis } from './integracao/rotas-reservadas'
export type * from './types'
