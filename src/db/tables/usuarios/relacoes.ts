import { relations } from 'drizzle-orm'
import { usuarios } from './tabela'
import { empresas } from '../empresas/tabela'
import { usuariosPerfis } from '../usuarios_perfis/tabela'
import { sessoesUsuario } from '../sessoes_usuario/tabela'
import { empresaMembros } from '../empresa_membros/tabela'
import { perfisProfissionais } from '../perfis_profissionais/tabela'
import { clientes } from '../clientes/tabela'

export const usuariosRelations = relations(usuarios, ({ one, many }) => ({
  empresa: one(empresas, {
    fields: [usuarios.empresaId],
    references: [empresas.id],
  }),
  usuariosPerfis: many(usuariosPerfis),
  sessoesUsuario: many(sessoesUsuario),
  empresasMembros: many(empresaMembros),
  perfilProfissional: one(perfisProfissionais),
  clientesProprios: many(clientes),
}))
