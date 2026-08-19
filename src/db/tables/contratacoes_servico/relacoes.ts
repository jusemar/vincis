import { relations } from 'drizzle-orm'
import { contratacoesServico } from './tabela'
import { atendimentos } from '../atendimentos/tabela'
import { clientes } from '../clientes/tabela'
import { servicos } from '../servicos/tabela'
import { usuarios } from '../usuarios/tabela'

export const contratacoesServicoRelations = relations(
  contratacoesServico,
  ({ one }) => ({
    /**
     * Atendimento operacional gerado por esta contratação.
     *
     * Lado inverso do vínculo único declarado em `atendimentos.contratacao_id`:
     * é o que torna a relação contratação → Atendimento explícita e navegável
     * nos dois sentidos.
     */
    atendimento: one(atendimentos),
    servico: one(servicos, {
      fields: [contratacoesServico.servicoId],
      references: [servicos.id],
    }),
    prestador: one(usuarios, {
      fields: [contratacoesServico.prestadorId],
      references: [usuarios.id],
      relationName: 'prestador_contratacao',
    }),
    clienteUsuario: one(usuarios, {
      fields: [contratacoesServico.clienteUsuarioId],
      references: [usuarios.id],
      relationName: 'cliente_contratacao',
    }),
    clienteCarteira: one(clientes, {
      fields: [contratacoesServico.clienteCarteiraId],
      references: [clientes.id],
    }),
  }),
)
