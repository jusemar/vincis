import { relations } from 'drizzle-orm'
import { atendimentos } from './tabela'
import { atendimentoArquivos } from '../atendimento_arquivos/tabela'
import { atendimentoChecklistItens } from '../atendimento_checklist_itens/tabela'
import { atendimentoEventos } from '../atendimento_eventos/tabela'
import { atendimentoManifestacoes } from '../atendimento_manifestacoes/tabela'
import { atendimentoMensagens } from '../atendimento_mensagens/tabela'
import { atendimentoParticipantes } from '../atendimento_participantes/tabela'
import { clientes } from '../clientes/tabela'
import { contratacoesServico } from '../contratacoes_servico/tabela'
import { empresas } from '../empresas/tabela'
import { usuarios } from '../usuarios/tabela'

export const atendimentosRelations = relations(atendimentos, ({ one, many }) => ({
  contratacao: one(contratacoesServico, {
    fields: [atendimentos.contratacaoId],
    references: [contratacoesServico.id],
  }),
  prestador: one(usuarios, {
    fields: [atendimentos.prestadorId],
    references: [usuarios.id],
    relationName: 'prestador_atendimento',
  }),
  responsavel: one(usuarios, {
    fields: [atendimentos.responsavelId],
    references: [usuarios.id],
    relationName: 'responsavel_atendimento',
  }),
  /** Quem efetivamente concluiu. Pode não ser o responsável principal. */
  responsavelConclusao: one(usuarios, {
    fields: [atendimentos.concluidoPor],
    references: [usuarios.id],
    relationName: 'conclusao_atendimento',
  }),
  clienteUsuario: one(usuarios, {
    fields: [atendimentos.clienteUsuarioId],
    references: [usuarios.id],
    relationName: 'cliente_atendimento',
  }),
  clienteCarteira: one(clientes, {
    fields: [atendimentos.clienteCarteiraId],
    references: [clientes.id],
  }),
  empresa: one(empresas, {
    fields: [atendimentos.empresaId],
    references: [empresas.id],
  }),
  participantes: many(atendimentoParticipantes),
  eventos: many(atendimentoEventos),
  mensagens: many(atendimentoMensagens),
  manifestacoes: many(atendimentoManifestacoes),
  arquivos: many(atendimentoArquivos),
  checklist: many(atendimentoChecklistItens),
}))
