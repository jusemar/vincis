import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import {
  atendimentoArquivos,
  atendimentoChecklistItens,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoMensagens,
  atendimentos,
  contratacoesServico,
  usuarios,
} from '@/db/schema'
import type {
  EscopoMensagem,
  FinalidadeArquivo,
  OrigemItemChecklist,
  PapelManifestacao,
  PrioridadeAtendimento,
  StatusAtendimento,
  VisibilidadeChecklist,
} from '../constants/atendimento'
import type { AtendimentoDoClienteDTO } from '../types/atendimento'

const prestadorConta = alias(usuarios, 'prestador_conta')
const autorConta = alias(usuarios, 'autor_conta')
const remetenteConta = alias(usuarios, 'remetente_conta')
const manifestanteConta = alias(usuarios, 'manifestante_conta')
const conclusaoConta = alias(usuarios, 'conclusao_conta')
const arquivoCitado = alias(atendimentoArquivos, 'arquivo_citado')

/**
 * Atendimentos de um Cliente, no recorte que é dele.
 *
 * Três limites aplicados no SQL, e não na renderização:
 *
 * - `cliente_usuario_id = sessão` — nenhum atendimento de outra pessoa entra;
 * - `escopo = 'cliente'` — nota interna da equipe não sai do banco;
 * - `visivel_cliente = true` — evento de organização interna fica de fora.
 *
 * Também não são selecionados responsável, participantes, prioridade nem
 * acesso: o que o Cliente não precisa ver não é carregado.
 */
export async function listarAtendimentosDoCliente(
  clienteUsuarioId: string,
): Promise<AtendimentoDoClienteDTO[]> {
  const registros = await db
    .select({
      id: atendimentos.id,
      protocolo: atendimentos.protocolo,
      titulo: atendimentos.titulo,
      categoria: atendimentos.categoria,
      status: atendimentos.status,
      prioridade: atendimentos.prioridade,
      criadoEm: atendimentos.createdAt,
      prazoEm: atendimentos.prazoEm,
      // A conclusão é dado do Atendimento: o Cliente lê data, autor e
      // observação sem depender de interpretar o histórico.
      concluidoEm: atendimentos.concluidoEm,
      concluidoPorNome: conclusaoConta.nome,
      observacaoFinal: atendimentos.observacaoFinal,
      prestadorNome: prestadorConta.nome,
      contratacaoId: contratacoesServico.id,
      contratacaoNomeServico: contratacoesServico.nomeServicoSnapshot,
      contratacaoModeloPreco: contratacoesServico.modeloPrecoSnapshot,
      contratacaoValorCentavos: contratacoesServico.valorSnapshotCentavos,
      contratacaoPrazoDias: contratacoesServico.prazoEstimadoDias,
      contratacaoStatus: contratacoesServico.status,
      contratacaoCriadaEm: contratacoesServico.createdAt,
    })
    .from(atendimentos)
    .innerJoin(prestadorConta, eq(prestadorConta.id, atendimentos.prestadorId))
    .leftJoin(conclusaoConta, eq(conclusaoConta.id, atendimentos.concluidoPor))
    .leftJoin(
      contratacoesServico,
      eq(contratacoesServico.id, atendimentos.contratacaoId),
    )
    .where(eq(atendimentos.clienteUsuarioId, clienteUsuarioId))
    .orderBy(desc(atendimentos.createdAt))

  if (!registros.length) return []
  const ids = registros.map((registro) => registro.id)

  const [eventos, mensagens, manifestacoes, checklist, arquivos] = await Promise.all([
    db
      .select({
        id: atendimentoEventos.id,
        atendimentoId: atendimentoEventos.atendimentoId,
        tipo: atendimentoEventos.tipo,
        descricao: atendimentoEventos.descricao,
        criadoEm: atendimentoEventos.createdAt,
      })
      .from(atendimentoEventos)
      .where(
        and(
          inArray(atendimentoEventos.atendimentoId, ids),
          eq(atendimentoEventos.visivelCliente, true),
        ),
      )
      .orderBy(desc(atendimentoEventos.createdAt)),
    db
      .select({
        id: atendimentoMensagens.id,
        atendimentoId: atendimentoMensagens.atendimentoId,
        escopo: atendimentoMensagens.escopo,
        conteudo: atendimentoMensagens.conteudo,
        autorId: atendimentoMensagens.autorId,
        autorNome: autorConta.nome,
        criadoEm: atendimentoMensagens.createdAt,
      })
      .from(atendimentoMensagens)
      .innerJoin(autorConta, eq(autorConta.id, atendimentoMensagens.autorId))
      .where(
        and(
          inArray(atendimentoMensagens.atendimentoId, ids),
          // A trava da privacidade: o canal interno não é lido aqui.
          eq(atendimentoMensagens.escopo, 'cliente'),
        ),
      )
      .orderBy(asc(atendimentoMensagens.createdAt)),
    // O Protocolo do Cliente não tem recorte: ele vê a própria manifestação e
    // **todas** as respostas que ela recebeu. A assimetria é entre
    // participantes, nunca contra o dono do Atendimento.
    db
      .select({
        id: atendimentoManifestacoes.id,
        atendimentoId: atendimentoManifestacoes.atendimentoId,
        papelAutor: atendimentoManifestacoes.papelAutor,
        conteudo: atendimentoManifestacoes.conteudo,
        autorId: atendimentoManifestacoes.autorId,
        autorNome: manifestanteConta.nome,
        respondeManifestacaoId: atendimentoManifestacoes.respondeManifestacaoId,
        arquivoId: atendimentoManifestacoes.arquivoId,
        arquivoNome: arquivoCitado.nome,
        criadoEm: atendimentoManifestacoes.createdAt,
      })
      .from(atendimentoManifestacoes)
      .innerJoin(
        manifestanteConta,
        eq(manifestanteConta.id, atendimentoManifestacoes.autorId),
      )
      .leftJoin(
        arquivoCitado,
        eq(arquivoCitado.id, atendimentoManifestacoes.arquivoId),
      )
      .where(inArray(atendimentoManifestacoes.atendimentoId, ids))
      .orderBy(asc(atendimentoManifestacoes.createdAt)),
    // Checklist do Cliente: só as etapas públicas. A etapa interna da equipe
    // não é selecionada — não existe no que chega ao navegador dele.
    db
      .select({
        id: atendimentoChecklistItens.id,
        atendimentoId: atendimentoChecklistItens.atendimentoId,
        titulo: atendimentoChecklistItens.titulo,
        concluido: atendimentoChecklistItens.concluido,
        visibilidade: atendimentoChecklistItens.visibilidade,
        origem: atendimentoChecklistItens.origem,
        ordem: atendimentoChecklistItens.ordem,
      })
      .from(atendimentoChecklistItens)
      .where(
        and(
          inArray(atendimentoChecklistItens.atendimentoId, ids),
          eq(atendimentoChecklistItens.visibilidade, 'cliente'),
        ),
      )
      .orderBy(asc(atendimentoChecklistItens.ordem)),
    db
      .select({
        id: atendimentoArquivos.id,
        atendimentoId: atendimentoArquivos.atendimentoId,
        nome: atendimentoArquivos.nome,
        tipoMime: atendimentoArquivos.tipoMime,
        tamanhoBytes: atendimentoArquivos.tamanhoBytes,
        origem: atendimentoArquivos.origem,
        finalidade: atendimentoArquivos.finalidade,
        criadoEm: atendimentoArquivos.createdAt,
        remetenteNome: remetenteConta.nome,
      })
      .from(atendimentoArquivos)
      .innerJoin(
        remetenteConta,
        eq(remetenteConta.id, atendimentoArquivos.remetenteId),
      )
      .where(inArray(atendimentoArquivos.atendimentoId, ids))
      .orderBy(desc(atendimentoArquivos.createdAt)),
  ])

  return registros.map((registro) => {
    const arquivosDoAtendimento = arquivos.filter(
      (linha) => linha.atendimentoId === registro.id,
    )

    return {
    id: registro.id,
    protocolo: registro.protocolo,
    titulo: registro.titulo,
    categoria: registro.categoria,
    status: registro.status as StatusAtendimento,
    prioridade: registro.prioridade as PrioridadeAtendimento,
    criadoEm: registro.criadoEm.toISOString(),
    prazoEm: registro.prazoEm?.toISOString() ?? null,
    prestador: { nome: registro.prestadorNome },
    contratacao: registro.contratacaoId
      ? {
          id: registro.contratacaoId,
          nomeServico: registro.contratacaoNomeServico ?? registro.titulo,
          modeloPreco: registro.contratacaoModeloPreco ?? '',
          valorCentavos: registro.contratacaoValorCentavos,
          prazoEstimadoDias: registro.contratacaoPrazoDias,
          status: registro.contratacaoStatus ?? '',
          criadaEm: (
            registro.contratacaoCriadaEm ?? registro.criadoEm
          ).toISOString(),
        }
      : null,
    eventos: eventos
      .filter((linha) => linha.atendimentoId === registro.id)
      .map((linha) => ({
        id: linha.id,
        tipo: linha.tipo,
        descricao: linha.descricao,
        criadoEm: linha.criadoEm.toISOString(),
      })),
    mensagens: mensagens
      .filter((linha) => linha.atendimentoId === registro.id)
      .map((linha) => ({
        id: linha.id,
        escopo: linha.escopo as EscopoMensagem,
        conteudo: linha.conteudo,
        autorId: linha.autorId,
        autorNome: linha.autorNome,
        autorEhCliente: linha.autorId === clienteUsuarioId,
        criadoEm: linha.criadoEm.toISOString(),
      })),
    manifestacoes: manifestacoes
      .filter((linha) => linha.atendimentoId === registro.id)
      .map((linha) => ({
        id: linha.id,
        papelAutor: linha.papelAutor as PapelManifestacao,
        conteudo: linha.conteudo,
        autorId: linha.autorId,
        autorNome: linha.autorNome,
        autoria: linha.autorId === clienteUsuarioId,
        respondeManifestacaoId: linha.respondeManifestacaoId,
        arquivo:
          linha.arquivoId && linha.arquivoNome
            ? { id: linha.arquivoId, nome: linha.arquivoNome }
            : null,
        criadoEm: linha.criadoEm.toISOString(),
      })),
    checklist: checklist
      .filter((linha) => linha.atendimentoId === registro.id)
      .map((linha) => ({
        id: linha.id,
        titulo: linha.titulo,
        concluido: linha.concluido,
        visibilidade: linha.visibilidade as VisibilidadeChecklist,
        origem: linha.origem as OrigemItemChecklist,
        ordem: linha.ordem,
      })),
    arquivos: arquivosDoAtendimento.map((linha) => ({
      id: linha.id,
      nome: linha.nome,
      tipoMime: linha.tipoMime,
      tamanhoBytes: linha.tamanhoBytes,
      origem:
        linha.origem as AtendimentoDoClienteDTO['arquivos'][number]['origem'],
      finalidade: linha.finalidade as FinalidadeArquivo,
      remetenteNome: linha.remetenteNome,
      criadoEm: linha.criadoEm.toISOString(),
    })),
    conclusao: registro.concluidoEm
      ? {
          em: registro.concluidoEm.toISOString(),
          porNome: registro.concluidoPorNome,
          observacaoFinal: registro.observacaoFinal,
          arquivosDeEntrega: arquivosDoAtendimento.filter(
            (linha) => linha.finalidade === 'entrega_final',
          ).length,
        }
      : null,
    }
  })
}
