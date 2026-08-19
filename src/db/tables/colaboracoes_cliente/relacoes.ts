import { relations } from 'drizzle-orm'
import { clientes } from '../clientes/tabela'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'
import { colaboracoesCliente } from './tabela'

export const colaboracoesClienteRelations = relations(
  colaboracoesCliente,
  ({ one }) => ({
    cliente: one(clientes, {
      fields: [colaboracoesCliente.clienteId],
      references: [clientes.id],
    }),
    empresaOrigem: one(empresas, {
      fields: [colaboracoesCliente.empresaOrigemId],
      references: [empresas.id],
    }),
    remetente: one(usuarios, {
      fields: [colaboracoesCliente.remetenteId],
      references: [usuarios.id],
      relationName: 'colaboracoesEnviadas',
    }),
    destinatario: one(usuarios, {
      fields: [colaboracoesCliente.destinatarioId],
      references: [usuarios.id],
      relationName: 'colaboracoesRecebidas',
    }),
  }),
)
