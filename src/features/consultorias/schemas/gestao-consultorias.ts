import { z } from 'zod'
import { STATUS_AGENDAMENTO } from '../constants/ciclo'

/**
 * O que a Gestão pode perguntar sobre as consultorias.
 *
 * Tudo com `default`, e nada obrigatório: a tela abre sem filtro nenhum e a
 * consulta continua válida. `porPagina` tem teto porque uma listagem
 * administrativa sem limite é um jeito silencioso de derrubar o banco no dia em
 * que a plataforma crescer.
 */
export const PERIODOS_GESTAO = [
  'todos',
  'hoje',
  'semana',
  'mes',
  'personalizado',
] as const
export type PeriodoGestao = (typeof PERIODOS_GESTAO)[number]

export const BuscaConsultoriasGestaoSchema = z.object({
  /** Protocolo, nome do Cliente ou nome do Profissional. */
  busca: z.string().trim().max(120).default(''),
  status: z.enum(['todos', ...STATUS_AGENDAMENTO]).default('todos'),
  periodo: z.enum(PERIODOS_GESTAO).default('todos'),
  /** Só usados quando `periodo === 'personalizado'`. */
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Id do Profissional, quando a Gestão quer olhar a operação de um só. */
  prestadorId: z.string().uuid().optional(),
  pagamento: z.enum(['todos', 'aprovado', 'sem_pagamento']).default('todos'),
  avaliacao: z.enum(['todos', 'avaliadas', 'sem_avaliacao']).default('todos'),
  /** Só as consultorias com alguma inconsistência estrutural. */
  somenteProblemas: z.coerce.boolean().default(false),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(5).max(50).default(20),
})

export type FiltrosConsultoriasGestao = z.output<
  typeof BuscaConsultoriasGestaoSchema
>

export const ConsultoriaGestaoIdSchema = z.string().uuid('Consultoria inválida.')
