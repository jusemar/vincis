import type {
  AudienciaComunicado,
  StatusComunicado,
  TipoComunicado,
} from '../constants/comunicado'

/** Comunicado como o mural do Dashboard precisa dele. */
export type ComunicadoDTO = {
  id: string
  tipo: TipoComunicado
  titulo: string
  resumo: string
  audiencia: AudienciaComunicado
  /** ISO. Nulo só existe em rascunho, que o mural nunca recebe. */
  publicadoEm: string | null
}

/** A mesma linha, com o que só a gestão precisa ver. */
export type ComunicadoGestaoDTO = ComunicadoDTO & {
  status: StatusComunicado
  autorNome: string
  criadoEm: string
  atualizadoEm: string
}
