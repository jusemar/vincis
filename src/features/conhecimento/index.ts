/**
 * Central de Conhecimento Vincis — artigos da plataforma e dos profissionais,
 * com moderação editorial, autoria identificada e integração com os perfis.
 *
 * Público: `/conhecimento`, `/conhecimento/<slug>`.
 * Privado: `/conhecimento/previa/<id>`, `/admin/artigos` (profissional),
 * `/admin/conhecimento` (Gestão).
 */
export { ROTA_CONHECIMENTO, ROTA_MEUS_ARTIGOS, caminhoArtigo } from './constants/rotas'
export { listarArtigosPublicadosDoAutor, listarArtigosParaSitemap } from './queries/publico'
export type { CardArtigo, ArtigoCompleto, AutorPublico } from './types/artigo'
