import { relations } from 'drizzle-orm'
import { oportunidades } from './tabela'
import { oportunidadeArquivos } from '../oportunidade_arquivos/tabela'
import { oportunidadeDispensas } from '../oportunidade_dispensas/tabela'
import { oportunidadePropostas } from '../oportunidade_propostas/tabela'
import { usuarios } from '../usuarios/tabela'

export const oportunidadesRelations = relations(
  oportunidades,
  ({ one, many }) => ({
    cliente: one(usuarios, {
      fields: [oportunidades.clienteUsuarioId],
      references: [usuarios.id],
    }),
    propostas: many(oportunidadePropostas),
    arquivos: many(oportunidadeArquivos),
    dispensas: many(oportunidadeDispensas),
  }),
)
