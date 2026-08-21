import { relations } from 'drizzle-orm'
import { oportunidadeArquivos } from './tabela'
import { oportunidades } from '../oportunidades/tabela'
import { usuarios } from '../usuarios/tabela'

export const oportunidadeArquivosRelations = relations(
  oportunidadeArquivos,
  ({ one }) => ({
    oportunidade: one(oportunidades, {
      fields: [oportunidadeArquivos.oportunidadeId],
      references: [oportunidades.id],
    }),
    remetente: one(usuarios, {
      fields: [oportunidadeArquivos.remetenteId],
      references: [usuarios.id],
    }),
  }),
)
