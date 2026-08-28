import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import {
  atendimentoArquivos,
  atendimentoChecklistItens,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoMensagens,
  atendimentoParticipantes,
  atendimentos,
  clientes,
  consultoriaAgendamentos,
  contratacoesServico,
  usuarios,
} from '@/db/schema'
import type {
  AcessoAtendimento,
  EscopoMensagem,
  FinalidadeArquivo,
  OrigemItemChecklist,
  PapelManifestacao,
  PapelParticipante,
  PrioridadeAtendimento,
  StatusAtendimento,
  VisibilidadeChecklist,
} from '../constants/atendimento'
import {
  condicaoAlcanceAtendimento,
  respondePeloAtendimento,
} from '../lib/autorizacao'
import {
  calcularNaoLidas,
  chaveDaMarca,
  obterMarcasDeLeitura,
} from '../lib/leitura'
import { consultoriaDoAtendimento } from '../lib/consultoria-do-atendimento'
import { condicaoLeituraManifestacao } from '../lib/manifestacoes'
import { obterUltimosAjustes } from '../lib/solicitacoes-ajuste'
import { transicoesPermitidas } from '../lib/transicoes'
import type { AtendimentoOperacionalDTO } from '../types/atendimento'

const responsavelConta = alias(usuarios, 'responsavel_conta')
const clienteConta = alias(usuarios, 'cliente_conta')
const participanteConta = alias(usuarios, 'participante_conta')
const remetenteConta = alias(usuarios, 'remetente_conta')
const autorConta = alias(usuarios, 'autor_conta')
const manifestanteConta = alias(usuarios, 'manifestante_conta')
const conclusaoConta = alias(usuarios, 'conclusao_conta')
const arquivoCitado = alias(atendimentoArquivos, 'arquivo_citado')

/**
 * Teto de Atendimentos carregados de uma vez.
 *
 * O quadro é operacional: ninguém trabalha com mil cards abertos ao mesmo
 * tempo. O corte fica no SQL, e não no navegador, para que a carteira crescer
 * não signifique mandar a carteira inteira pela rede. A tela pagina o que
 * chegou; quem precisa de um Atendimento antigo usa a busca, que consulta o
 * mesmo conjunto ordenado por recência.
 */
export const LIMITE_ATENDIMENTOS_CARREGADOS = 200

/**
 * Atendimentos que uma pessoa da equipe enxerga.
 *
 * O recorte vem de `condicaoAlcanceAtendimento`, a mesma condição usada pelos
 * contadores do painel: prestador dono, responsável atual ou participante
 * daquele Atendimento. Nenhum outro prestador alcança estes dados, mesmo
 * conhecendo os ids — o filtro é aplicado no SQL, não na tela, e um convite
 * para um protocolo não amplia o alcance para os vizinhos.
 *
 * As coleções (participantes, eventos, arquivos) vêm em consultas separadas por
 * `in (...)` em vez de um `join` largo: um join traria o cabeçalho do
 * Atendimento repetido a cada arquivo, e a montagem em memória sairia mais cara
 * do que as três idas ao banco.
 */
export async function listarAtendimentosDoPrestador(
  usuarioId: string,
): Promise<AtendimentoOperacionalDTO[]> {
  const registros = await db
    .select({
      id: atendimentos.id,
      protocolo: atendimentos.protocolo,
      titulo: atendimentos.titulo,
      categoria: atendimentos.categoria,
      status: atendimentos.status,
      prioridade: atendimentos.prioridade,
      acesso: atendimentos.acesso,
      criadoEm: atendimentos.createdAt,
      atualizadoEm: atendimentos.updatedAt,
      prazoEm: atendimentos.prazoEm,
      concluidoEm: atendimentos.concluidoEm,
      concluidoPorNome: conclusaoConta.nome,
      observacaoFinal: atendimentos.observacaoFinal,
      prestadorId: atendimentos.prestadorId,
      responsavelId: atendimentos.responsavelId,
      responsavelNome: responsavelConta.nome,
      clienteUsuarioId: atendimentos.clienteUsuarioId,
      clienteNome: clienteConta.nome,
      clienteCodigo: clientes.codigo,
      contratacaoId: contratacoesServico.id,
      contratacaoNomeServico: contratacoesServico.nomeServicoSnapshot,
      contratacaoModeloPreco: contratacoesServico.modeloPrecoSnapshot,
      contratacaoValorCentavos: contratacoesServico.valorSnapshotCentavos,
      contratacaoPrazoDias: contratacoesServico.prazoEstimadoDias,
      contratacaoStatus: contratacoesServico.status,
      contratacaoCriadaEm: contratacoesServico.createdAt,
      // A terceira porta de entrada: consultoria com hora marcada.
      consultoriaId: consultoriaAgendamentos.id,
      consultoriaInicioEm: consultoriaAgendamentos.inicioEm,
      consultoriaFimEm: consultoriaAgendamentos.fimEm,
      consultoriaTimezone: consultoriaAgendamentos.timezone,
      consultoriaDuracaoMinutos: consultoriaAgendamentos.duracaoMinutos,
      consultoriaStatus: consultoriaAgendamentos.status,
      consultoriaMotivoCancelamento: consultoriaAgendamentos.motivoCancelamento,
      consultoriaValorCentavos: consultoriaAgendamentos.valorCentavos,
    })
    .from(atendimentos)
    .innerJoin(
      responsavelConta,
      eq(responsavelConta.id, atendimentos.responsavelId),
    )
    .innerJoin(clienteConta, eq(clienteConta.id, atendimentos.clienteUsuarioId))
    // Quem concluiu. `left` porque a coluna só existe depois da conclusão.
    .leftJoin(conclusaoConta, eq(conclusaoConta.id, atendimentos.concluidoPor))
    // Ficha de carteira do Cliente: traz o código `CLI-…` usado na busca. É
    // `left` porque o Atendimento pode existir sem ficha vinculada.
    .leftJoin(clientes, eq(clientes.id, atendimentos.clienteCarteiraId))
    .leftJoin(
      contratacoesServico,
      eq(contratacoesServico.id, atendimentos.contratacaoId),
    )
    .leftJoin(
      consultoriaAgendamentos,
      eq(consultoriaAgendamentos.id, atendimentos.consultoriaAgendamentoId),
    )
    .where(condicaoAlcanceAtendimento(usuarioId))
    .orderBy(desc(atendimentos.createdAt))
    .limit(LIMITE_ATENDIMENTOS_CARREGADOS)

  if (!registros.length) return []

  const ids = registros.map((registro) => registro.id)
  // Marcas de leitura de todos os cards numa consulta só: o quadro carrega até
  // 200 Atendimentos, e uma ida ao banco por card seria um problema real.
  const marcasDeLeitura = await obterMarcasDeLeitura(usuarioId, 'atendimento', ids)

  const [
    participantes,
    eventos,
    mensagens,
    manifestacoes,
    checklist,
    arquivos,
    ajustes,
  ] = await Promise.all([
      db
        .select({
          atendimentoId: atendimentoParticipantes.atendimentoId,
          usuarioId: atendimentoParticipantes.usuarioId,
          papel: atendimentoParticipantes.papel,
          nome: participanteConta.nome,
        })
        .from(atendimentoParticipantes)
        .innerJoin(
          participanteConta,
          eq(participanteConta.id, atendimentoParticipantes.usuarioId),
        )
        .where(inArray(atendimentoParticipantes.atendimentoId, ids))
        .orderBy(asc(atendimentoParticipantes.createdAt)),
      db
        .select({
          id: atendimentoEventos.id,
          atendimentoId: atendimentoEventos.atendimentoId,
          tipo: atendimentoEventos.tipo,
          descricao: atendimentoEventos.descricao,
          criadoEm: atendimentoEventos.createdAt,
        })
        .from(atendimentoEventos)
        .where(inArray(atendimentoEventos.atendimentoId, ids))
        // O painel mostra o mais recente no topo, como no mock.
        .orderBy(desc(atendimentoEventos.createdAt)),
      // A equipe lê os dois canais; o filtro por escopo acontece na tela, que já
      // tem a alternância Cliente/Interno.
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
        .where(inArray(atendimentoMensagens.atendimentoId, ids))
        .orderBy(asc(atendimentoMensagens.createdAt)),
      // Protocolo, com a regra assimétrica aplicada **no SQL**: a manifestação do
      // Cliente é de todos, mas a resposta de um participante só volta para quem
      // a escreveu. Filtrar isto na tela deixaria o texto alheio trafegar até o
      // navegador, ao alcance de quem inspecionasse a página.
      db
        .select({
          id: atendimentoManifestacoes.id,
          atendimentoId: atendimentoManifestacoes.atendimentoId,
          papelAutor: atendimentoManifestacoes.papelAutor,
          conteudo: atendimentoManifestacoes.conteudo,
          autorId: atendimentoManifestacoes.autorId,
          autorNome: manifestanteConta.nome,
          respondeManifestacaoId:
            atendimentoManifestacoes.respondeManifestacaoId,
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
        .where(
          and(
            inArray(atendimentoManifestacoes.atendimentoId, ids),
            condicaoLeituraManifestacao(usuarioId, false),
          ),
        )
        .orderBy(asc(atendimentoManifestacoes.createdAt)),
      // Checklist completo: a equipe vê as etapas públicas e as internas.
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
        .where(inArray(atendimentoChecklistItens.atendimentoId, ids))
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
      // A solicitação de ajuste mais recente de cada Atendimento. Os ids já
      // passaram pelo recorte de alcance — esta consulta não amplia nada.
      obterUltimosAjustes(ids),
    ])

  return registros.map((registro) => {
    const mensagensDoAtendimento = mensagens.filter(
      (linha) => linha.atendimentoId === registro.id,
    )
    const arquivosDoAtendimento = arquivos.filter(
      (linha) => linha.atendimentoId === registro.id,
    )
    // O mesmo vínculo que o servidor confere na hora de concluir, calculado
    // aqui a partir das colunas já carregadas — sem uma consulta por card.
    const podeConcluir = respondePeloAtendimento(
      registro.prestadorId === usuarioId
        ? 'prestador'
        : registro.responsavelId === usuarioId
          ? 'responsavel'
          : 'participante',
    )
    // A leitura é por canal: quem leu a conversa com o Cliente pode continuar
    // com nota interna pendente, e o clique no badge precisa abrir a aba certa.
    const naoLidasCliente = calcularNaoLidas(
      mensagensDoAtendimento.filter((linha) => linha.escopo === 'cliente'),
      usuarioId,
      marcasDeLeitura.get(chaveDaMarca(registro.id, 'cliente')),
    )
    const naoLidasInterno = calcularNaoLidas(
      mensagensDoAtendimento.filter((linha) => linha.escopo === 'interno'),
      usuarioId,
      marcasDeLeitura.get(chaveDaMarca(registro.id, 'interno')),
    )
    // A primeira não lida de verdade é a mais antiga entre os dois canais — é
    // para ela que o clique rola.
    const primeiraCliente = mensagensDoAtendimento.find(
      (linha) => linha.id === naoLidasCliente.primeiraNaoLidaId,
    )
    const primeiraInterno = mensagensDoAtendimento.find(
      (linha) => linha.id === naoLidasInterno.primeiraNaoLidaId,
    )
    const primeira =
      primeiraCliente && primeiraInterno
        ? primeiraCliente.criadoEm <= primeiraInterno.criadoEm
          ? { canal: 'cliente' as const, id: primeiraCliente.id }
          : { canal: 'interno' as const, id: primeiraInterno.id }
        : primeiraCliente
          ? { canal: 'cliente' as const, id: primeiraCliente.id }
          : primeiraInterno
            ? { canal: 'interno' as const, id: primeiraInterno.id }
            : null

    return {
    naoLidas: {
      cliente: naoLidasCliente.total,
      interno: naoLidasInterno.total,
      total: naoLidasCliente.total + naoLidasInterno.total,
      canalPrimeira: primeira?.canal ?? null,
      primeiraNaoLidaId: primeira?.id ?? null,
    },
    id: registro.id,
    protocolo: registro.protocolo,
    titulo: registro.titulo,
    categoria: registro.categoria,
    status: registro.status as StatusAtendimento,
    prioridade: registro.prioridade as PrioridadeAtendimento,
    acesso: registro.acesso as AcessoAtendimento,
    criadoEm: registro.criadoEm.toISOString(),
    atualizadoEm: registro.atualizadoEm.toISOString(),
    prazoEm: registro.prazoEm?.toISOString() ?? null,
    // As transições saem da mesma máquina de estados que o servidor aplica: a
    // tela nunca oferece um botão que a regra recusaria. Concluir é a exceção
    // que depende de quem olha — um convidado trabalha no Atendimento, mas não
    // o encerra —, e por isso some do menu dele em vez de virar um erro depois
    // do clique.
    acoes: transicoesPermitidas(registro.status as StatusAtendimento)
      .filter((acao) => acao.destino !== 'concluido' || podeConcluir)
      .map((acao) => ({
        rotulo: acao.rotulo,
        destino: acao.destino,
        encerra: Boolean(acao.encerra),
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
    ajuste: ajustes.get(registro.id) ?? null,
    responsavel: { id: registro.responsavelId, nome: registro.responsavelNome },
    cliente: {
      usuarioId: registro.clienteUsuarioId,
      nome: registro.clienteNome,
      codigo: registro.clienteCodigo,
    },
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
    consultoria: consultoriaDoAtendimento(registro, 'prestador'),
    participantes: participantes
      .filter((linha) => linha.atendimentoId === registro.id)
      .map((linha) => ({
        usuarioId: linha.usuarioId,
        nome: linha.nome,
        papel: linha.papel as PapelParticipante,
      })),
    eventos: eventos
      .filter((linha) => linha.atendimentoId === registro.id)
      .map((linha) => ({
        id: linha.id,
        tipo: linha.tipo,
        descricao: linha.descricao,
        criadoEm: linha.criadoEm.toISOString(),
      })),
    mensagens: mensagensDoAtendimento
      .map((linha) => ({
        id: linha.id,
        escopo: linha.escopo as EscopoMensagem,
        conteudo: linha.conteudo,
        autorId: linha.autorId,
        autorNome: linha.autorNome,
        autorEhCliente: linha.autorId === registro.clienteUsuarioId,
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
        autoria: linha.autorId === usuarioId,
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
        linha.origem as AtendimentoOperacionalDTO['arquivos'][number]['origem'],
      finalidade: linha.finalidade as FinalidadeArquivo,
      remetenteNome: linha.remetenteNome,
      criadoEm: linha.criadoEm.toISOString(),
    })),
    }
  })
}
