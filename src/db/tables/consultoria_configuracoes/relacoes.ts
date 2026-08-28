import { relations } from 'drizzle-orm'
import { consultoriaConfiguracoes } from './tabela'
import { consultoriaDisponibilidades } from '../consultoria_disponibilidades/tabela'
import { consultoriaExcecoes } from '../consultoria_excecoes/tabela'
import { usuarios } from '../usuarios/tabela'

export const consultoriaConfiguracoesRelations = relations(
  consultoriaConfiguracoes,
  ({ one, many }) => ({
    prestador: one(usuarios, {
      fields: [consultoriaConfiguracoes.prestadorId],
      references: [usuarios.id],
      relationName: 'prestador_consultoria',
    }),
    /** Faixas semanais recorrentes. */
    disponibilidades: many(consultoriaDisponibilidades),
    /** Feriados, bloqueios e atendimentos excepcionais. */
    excecoes: many(consultoriaExcecoes),
  }),
)
