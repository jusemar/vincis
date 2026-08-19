import { relations } from 'drizzle-orm'
import { atendimentoAjustes } from './tabela'
import { atendimentoArquivos } from '../atendimento_arquivos/tabela'
import { atendimentoManifestacoes } from '../atendimento_manifestacoes/tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentoAjustesRelations = relations(
  atendimentoAjustes,
  ({ one }) => ({
    atendimento: one(atendimentos, {
      fields: [atendimentoAjustes.atendimentoId],
      references: [atendimentos.id],
    }),
    cliente: one(usuarios, {
      fields: [atendimentoAjustes.clienteUsuarioId],
      references: [usuarios.id],
      relationName: 'cliente_solicitante_ajuste',
    }),
    analista: one(usuarios, {
      fields: [atendimentoAjustes.analisadoPor],
      references: [usuarios.id],
      relationName: 'analista_do_ajuste',
    }),
    arquivo: one(atendimentoArquivos, {
      fields: [atendimentoAjustes.arquivoId],
      references: [atendimentoArquivos.id],
    }),
    manifestacao: one(atendimentoManifestacoes, {
      fields: [atendimentoAjustes.manifestacaoId],
      references: [atendimentoManifestacoes.id],
      relationName: 'manifestacao_do_ajuste',
    }),
  }),
)
