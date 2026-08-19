import { relations } from 'drizzle-orm'
import { atendimentoManifestacoes } from './tabela'
import { atendimentoArquivos } from '../atendimento_arquivos/tabela'
import { atendimentos } from '../atendimentos/tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentoManifestacoesRelations = relations(
  atendimentoManifestacoes,
  ({ one }) => ({
    atendimento: one(atendimentos, {
      fields: [atendimentoManifestacoes.atendimentoId],
      references: [atendimentos.id],
    }),
    autor: one(usuarios, {
      fields: [atendimentoManifestacoes.autorId],
      references: [usuarios.id],
    }),
    arquivo: one(atendimentoArquivos, {
      fields: [atendimentoManifestacoes.arquivoId],
      references: [atendimentoArquivos.id],
    }),
    responde: one(atendimentoManifestacoes, {
      fields: [atendimentoManifestacoes.respondeManifestacaoId],
      references: [atendimentoManifestacoes.id],
      relationName: 'manifestacao_respondida',
    }),
  }),
)
