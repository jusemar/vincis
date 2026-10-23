import { criarSchemasCms } from '../nucleo/schemas'
import { slugReservadoVincis } from './rotas-reservadas'

/** Schemas do núcleo, já com as rotas reais da Vincis reservadas. */
export const schemasCms = criarSchemasCms({ slugReservado: slugReservadoVincis })
