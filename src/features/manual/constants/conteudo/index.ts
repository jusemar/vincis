import type { CapituloManual } from '../../types/manual'
import { CAPITULOS_ADMINISTRACAO } from './administracao'
import { CAPITULOS_FLUXOS } from './fluxos'
import { CAPITULOS_PRECOS_E_PARCEIROS } from './precos-e-parceiros'
import { CAPITULOS_PRIMEIROS_PASSOS } from './primeiros-passos'
import { CAPITULOS_SUPORTE } from './suporte'
import { CAPITULOS_USUARIOS } from './usuarios'

/** Título oficial do manual. */
export const TITULO_MANUAL = 'Manual da Vincis — Treinamento, Testes e Suporte'

/** Data do levantamento que deu origem ao conteúdo. */
export const DATA_DO_LEVANTAMENTO = '13 de setembro de 2026'

/** Os capítulos, na ordem de leitura. */
export const CAPITULOS_MANUAL: CapituloManual[] = [
  ...CAPITULOS_PRIMEIROS_PASSOS,
  ...CAPITULOS_USUARIOS,
  ...CAPITULOS_FLUXOS,
  ...CAPITULOS_PRECOS_E_PARCEIROS,
  ...CAPITULOS_ADMINISTRACAO,
  ...CAPITULOS_SUPORTE,
]
