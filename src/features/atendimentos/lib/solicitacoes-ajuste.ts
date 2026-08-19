import { and, desc, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/db/connection'
import {
  atendimentoAjustes,
  atendimentoArquivos,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentos,
  usuarios,
} from '@/db/schema'
import {
  ACOES_AUDITORIA,
  registrarEventoAuditoria,
} from '@/features/auditoria/lib/registrar-evento'
import { TIPOS_NOTIFICACAO } from '@/features/notificacoes/constants/notificacao'
import {
  emitirNotificacoes,
  resumirTexto,
} from '@/features/notificacoes/lib/emitir'
import {
  ROTULO_STATUS_ATENDIMENTO,
  TAMANHO_MAXIMO_MOTIVO_AJUSTE,
  TAMANHO_MAXIMO_RESPOSTA_AJUSTE,
  TAMANHO_MINIMO_JUSTIFICATIVA_RECUSA,
  TIPOS_EVENTO_ATENDIMENTO,
  type StatusAtendimento,
  type StatusSolicitacaoAjuste,
} from '../constants/atendimento'
import type { SolicitacaoDeAjusteDTO } from '../types/atendimento'
import { anexarArquivoNoAtendimento } from './anexar-arquivo'
import { obterAudienciaDoAtendimento } from './audiencia'
import { obterAcessoAtendimento, respondePeloAtendimento } from './autorizacao'
import { difundirNoAtendimento, difundirSegmentado } from './difusao'
import type { ExecutorDb } from './executor'

/** Status a partir do qual — e só a partir do qual — cabe pedir ajuste. */
const STATUS_QUE_ACEITA_PEDIDO: StatusAtendimento = 'concluido'
/** Para onde o Atendimento volta quando o pedido é aceito. */
const STATUS_DA_REABERTURA: StatusAtendimento = 'em_andamento'

export type MotivoRecusaSolicitacao =
  | 'sem-acesso'
  | 'nao-encontrado'
  | 'nao-concluido'
  | 'motivo-vazio'
  | 'ja-existe-pendente'

export type ResultadoSolicitacao =
  | {
      sucesso: true
      solicitacaoId: string
      manifestacaoId: string
      arquivoId: string | null
    }
  | { sucesso: false; motivo: MotivoRecusaSolicitacao }

export type MotivoRecusaAnalise =
  | 'sem-acesso'
  | 'nao-encontrada'
  | 'ja-analisada'
  | 'justificativa-obrigatoria'
  | 'atendimento-nao-concluido'

export type ResultadoAnalise =
  | {
      sucesso: true
      decisao: 'aceitar' | 'recusar'
      /** `true` quando a decisão devolveu o Atendimento ao fluxo operacional. */
      reaberto: boolean
      solicitacaoId: string
      manifestacaoId: string
    }
  | { sucesso: false; motivo: MotivoRecusaAnalise }

/**
 * Sinaliza que o Atendimento deixou de estar concluído no meio da análise.
 *
 * Existe para desfazer a transação inteira: a solicitação já foi marcada como
 * aceita quando descobrimos que a reabertura não pôde acontecer, e deixar as
 * duas coisas em desacordo seria pior do que recusar a operação.
 */
class ReaberturaImpossivel extends Error {}

/**
 * Texto formal do pedido, para o Protocolo.
 *
 * Uma redação só, montada em um lugar: a manifestação é a comunicação oficial
 * do Cliente sobre a entrega, e precisa dizer o que é antes de dizer o que
 * aconteceu. O motivo entra literal — é a palavra do Cliente, não um resumo.
 */
export function montarTextoDaSolicitacao(motivo: string) {
  return `Solicitação de ajuste.\n\n${motivo}`
}

/** Texto formal da decisão. Mesma ideia: uma redação, um lugar. */
export function montarTextoDaDecisao({
  aceita,
  resposta,
}: {
  aceita: boolean
  resposta: string | null
}) {
  const partes = [
    aceita
      ? 'Solicitação de ajuste aceita. O atendimento foi reaberto.'
      : 'Solicitação de ajuste recusada. O atendimento permanece concluído.',
  ]
  if (resposta) partes.push(resposta)
  return partes.join('\n\n')
}

/**
 * A solicitação de ajuste mais recente de cada Atendimento.
 *
 * Em lote, por `in (...)`: o quadro carrega até duzentos Atendimentos e uma ida
 * ao banco por card seria um problema real. O recorte de quem pode ler já foi
 * feito por quem montou a lista de ids — esta função não amplia alcance.
 */
export async function obterUltimosAjustes(
  atendimentoIds: string[],
): Promise<Map<string, SolicitacaoDeAjusteDTO>> {
  const mapa = new Map<string, SolicitacaoDeAjusteDTO>()
  const ids = Array.from(new Set(atendimentoIds.filter(Boolean)))
  if (!ids.length) return mapa

  const solicitanteConta = alias(usuarios, 'ajuste_solicitante')
  const analistaConta = alias(usuarios, 'ajuste_analista')

  const linhas = await db
    .select({
      id: atendimentoAjustes.id,
      atendimentoId: atendimentoAjustes.atendimentoId,
      status: atendimentoAjustes.status,
      motivo: atendimentoAjustes.motivo,
      resposta: atendimentoAjustes.resposta,
      arquivoId: atendimentoAjustes.arquivoId,
      arquivoNome: atendimentoArquivos.nome,
      solicitanteNome: solicitanteConta.nome,
      analisadoPorNome: analistaConta.nome,
      analisadoEm: atendimentoAjustes.analisadoEm,
      criadoEm: atendimentoAjustes.createdAt,
    })
    .from(atendimentoAjustes)
    .innerJoin(
      solicitanteConta,
      eq(solicitanteConta.id, atendimentoAjustes.clienteUsuarioId),
    )
    .leftJoin(analistaConta, eq(analistaConta.id, atendimentoAjustes.analisadoPor))
    .leftJoin(
      atendimentoArquivos,
      eq(atendimentoArquivos.id, atendimentoAjustes.arquivoId),
    )
    .where(inArray(atendimentoAjustes.atendimentoId, ids))
    .orderBy(desc(atendimentoAjustes.createdAt))

  for (const linha of linhas) {
    // Ordenado do mais recente para o mais antigo: o primeiro de cada
    // Atendimento é o que fica, e os anteriores são ignorados.
    if (mapa.has(linha.atendimentoId)) continue
    mapa.set(linha.atendimentoId, {
      id: linha.id,
      status: linha.status as StatusSolicitacaoAjuste,
      motivo: linha.motivo,
      resposta: linha.resposta,
      arquivo:
        linha.arquivoId && linha.arquivoNome
          ? { id: linha.arquivoId, nome: linha.arquivoNome }
          : null,
      solicitanteNome: linha.solicitanteNome,
      analisadoPorNome: linha.analisadoPorNome,
      analisadoEm: linha.analisadoEm?.toISOString() ?? null,
      criadoEm: linha.criadoEm.toISOString(),
    })
  }

  return mapa
}

/** Existe pedido em aberto neste Atendimento? */
async function temPendente(executor: ExecutorDb, atendimentoId: string) {
  const [linha] = await executor
    .select({ id: atendimentoAjustes.id })
    .from(atendimentoAjustes)
    .where(
      and(
        eq(atendimentoAjustes.atendimentoId, atendimentoId),
        eq(atendimentoAjustes.status, 'pendente'),
      ),
    )
    .limit(1)
  return Boolean(linha)
}

/**
 * O Cliente sinaliza um problema — ou pede um ajuste — no Atendimento concluído.
 *
 * Três coisas que **não** acontecem aqui, e são o coração desta etapa:
 *
 * - o Atendimento **não** muda de status. Ele continua `concluido` até que
 *   alguém autorizado analise. Pedir não é reabrir;
 * - nada é escrito na Conversa. O pedido é manifestação formal e vai para o
 *   Protocolo, que é onde manifestação formal mora;
 * - nenhum sistema novo de arquivo é criado. O anexo opcional passa por
 *   `anexarArquivoNoAtendimento` — mesma validação, mesmo armazenamento
 *   privado, mesma rota autorizada de download.
 *
 * Só o Cliente proprietário pede: a comparação é contra
 * `atendimentos.cliente_usuario_id` lido do banco, e o autor vem da sessão.
 * Nenhum prestador — com ou sem vínculo — pede ajuste em nome de ninguém.
 *
 * **Uma solicitação pendente por Atendimento**, garantida pelo índice parcial do
 * banco e não por este código: o clique duplo e a requisição repetida disputam a
 * mesma linha e uma delas perde com `ja-existe-pendente`, sem ter escrito
 * manifestação, evento nem aviso.
 */
export async function solicitarAjusteNoAtendimento({
  atendimentoId,
  usuarioId,
  motivo,
  arquivo,
}: {
  atendimentoId: string
  /** Quem pede. Vem da sessão — nunca do formulário. */
  usuarioId: string
  motivo: string
  /** Anexo opcional do problema relatado. */
  arquivo?: File | null
}): Promise<ResultadoSolicitacao> {
  const texto = motivo.trim().slice(0, TAMANHO_MAXIMO_MOTIVO_AJUSTE)
  if (!texto) return { sucesso: false, motivo: 'motivo-vazio' }

  const [alvo] = await db
    .select({
      id: atendimentos.id,
      status: atendimentos.status,
      clienteUsuarioId: atendimentos.clienteUsuarioId,
    })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimentoId))
    .limit(1)

  if (!alvo) return { sucesso: false, motivo: 'nao-encontrado' }
  // Um id manipulado morre aqui: quem não é o dono recebe a mesma recusa,
  // esteja ligado ao Atendimento de outra forma ou não ligado a nada.
  if (alvo.clienteUsuarioId !== usuarioId) {
    return { sucesso: false, motivo: 'sem-acesso' }
  }
  if (alvo.status !== STATUS_QUE_ACEITA_PEDIDO) {
    return { sucesso: false, motivo: 'nao-concluido' }
  }
  // Conferência antecipada, para não subir um arquivo que seria descartado logo
  // em seguida. A palavra final continua sendo o índice parcial, mais abaixo.
  if (await temPendente(db, atendimentoId)) {
    return { sucesso: false, motivo: 'ja-existe-pendente' }
  }

  // O anexo entra pelo caminho de sempre, antes da transação: gravar a
  // solicitação e só então descobrir que o armazenamento recusou o arquivo
  // deixaria um pedido citando um anexo que não existe.
  const anexado = arquivo
    ? await anexarArquivoNoAtendimento({ atendimentoId, usuarioId, arquivo })
    : null

  const [autor] = await db
    .select({ nome: usuarios.nome, empresaId: usuarios.empresaId })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  const nomeCliente = autor?.nome ?? 'O cliente'

  try {
    const gravado = await db.transaction(async (tx) => {
      const [solicitacao] = await tx
        .insert(atendimentoAjustes)
        .values({
          atendimentoId,
          clienteUsuarioId: usuarioId,
          status: 'pendente',
          motivo: texto,
          arquivoId: anexado?.id ?? null,
        })
        .returning({ id: atendimentoAjustes.id })

      const [manifestacao] = await tx
        .insert(atendimentoManifestacoes)
        .values({
          atendimentoId,
          autorId: usuarioId,
          papelAutor: 'cliente',
          conteudo: montarTextoDaSolicitacao(texto),
          // Manifestação do Cliente: todo mundo com acesso ao Atendimento
          // precisa lê-la para poder analisar.
          visibilidade: 'participantes_e_cliente',
          arquivoId: anexado?.id ?? null,
        })
        .returning({ id: atendimentoManifestacoes.id })

      await tx
        .update(atendimentoAjustes)
        .set({ manifestacaoId: manifestacao.id })
        .where(eq(atendimentoAjustes.id, solicitacao.id))

      await tx.insert(atendimentoEventos).values({
        atendimentoId,
        tipo: TIPOS_EVENTO_ATENDIMENTO.ajusteSolicitado,
        descricao: `${nomeCliente} solicitou um ajuste no atendimento.`,
        autorId: usuarioId,
        // O Cliente vê o próprio pedido na linha do tempo dele.
        visivelCliente: true,
        metadados: {
          solicitacaoId: solicitacao.id,
          manifestacaoId: manifestacao.id,
          arquivoId: anexado?.id ?? null,
          // O status não mudou, e o histórico registra isso de propósito: é o
          // fato mais importante deste evento.
          statusAtendimento: alvo.status,
        },
      })

      await registrarEventoAuditoria(
        {
          acao: ACOES_AUDITORIA.ajusteSolicitado,
          entidade: 'atendimento_ajustes',
          registroAfetado: solicitacao.id,
          autorId: usuarioId,
          empresaId: autor?.empresaId ?? null,
          origem: 'sistema',
          metadados: {
            atendimentoId,
            temAnexo: Boolean(anexado),
            statusAtendimento: alvo.status,
          },
        },
        tx,
      )

      const audiencia = await obterAudienciaDoAtendimento(tx, atendimentoId)
      let aviso: { destinatarios: string[]; titulo: string; protocolo: string } | null =
        null

      if (audiencia) {
        const titulo = `${nomeCliente} solicitou um ajuste no atendimento ${audiencia.protocolo}.`
        // Só a equipe: o Cliente é o autor, e `emitirNotificacoes` já o
        // descartaria de qualquer forma.
        await emitirNotificacoes(tx, {
          destinatarios: audiencia.equipe,
          autorId: usuarioId,
          tipo: TIPOS_NOTIFICACAO.ajusteSolicitado,
          titulo,
          resumo: resumirTexto(texto),
          recursoTipo: 'atendimento',
          recursoId: atendimentoId,
          atendimentoId,
          protocolo: audiencia.protocolo,
          destino: {
            pagina: 'atendimentos',
            atendimento: audiencia.protocolo,
            aba: 'protocolo',
          },
        })
        aviso = {
          destinatarios: audiencia.equipe,
          titulo,
          protocolo: audiencia.protocolo,
        }
      }

      return { solicitacaoId: solicitacao.id, manifestacaoId: manifestacao.id, aviso }
    })

    // Depois do commit, como todo aviso do Atendimento: quem receber e
    // recarregar encontra o pedido já no Protocolo.
    if (gravado.aviso) {
      await difundirNoAtendimento({
        tipo: 'ajuste',
        atendimentoId,
        protocolo: gravado.aviso.protocolo,
        autorId: usuarioId,
        destinatarios: gravado.aviso.destinatarios,
        titulo: gravado.aviso.titulo,
        aba: 'protocolo',
        // Pede uma decisão de alguém: é atenção, não comemoração nem erro.
        severidade: 'atencao',
      })
    }

    return {
      sucesso: true,
      solicitacaoId: gravado.solicitacaoId,
      manifestacaoId: gravado.manifestacaoId,
      arquivoId: anexado?.id ?? null,
    }
  } catch (erro) {
    // O índice parcial é a última palavra sobre "um pedido pendente por
    // Atendimento": duas requisições simultâneas chegam aqui e uma delas sai
    // com a recusa de domínio, sem ter gravado nada.
    if (ehViolacaoDePendenteUnico(erro)) {
      return { sucesso: false, motivo: 'ja-existe-pendente' }
    }
    throw erro
  }
}

/**
 * O erro (ou a causa dele) é a violação do índice de pedido pendente único?
 *
 * A cadeia de `cause` é percorrida porque o driver embrulha o erro do Postgres:
 * o que chega aqui é o erro de consulta do Drizzle, e o código `23505` está uma
 * ou duas camadas abaixo. Olhar só a superfície faria a violação escapar como
 * erro inesperado — e o Cliente veria uma falha genérica no lugar de "já existe
 * uma solicitação em análise".
 */
function ehViolacaoDePendenteUnico(erro: unknown) {
  let atual: unknown = erro
  for (let nivel = 0; atual && nivel < 5; nivel += 1) {
    const { code, constraint_name: restricao } = atual as {
      code?: string
      constraint_name?: string
    }
    if (
      code === '23505' &&
      (!restricao || restricao === 'atendimento_ajustes_pendente_unico')
    ) {
      return true
    }
    atual = (atual as { cause?: unknown }).cause
  }
  return false
}

/**
 * O Prestador analisa a solicitação: aceita e reabre, ou recusa e mantém.
 *
 * Quem pode decidir é quem responde pelo Atendimento — o prestador dono e o
 * responsável atual. É a mesma régua da conclusão, e pelo mesmo motivo: aceitar
 * é desfazer uma entrega declarada. Um convidado trabalha no Atendimento, mas
 * não decide se ele volta a ficar aberto; e o Cliente, que pediu, nunca decide
 * sobre o próprio pedido.
 *
 * **A trava da concorrência e da idempotência é a mesma linha de SQL**: o UPDATE
 * exige `status = 'pendente'`. Dois membros autorizados decidindo ao mesmo tempo
 * disputam essa condição, uma decisão vence e a outra sai com `ja-analisada` sem
 * ter escrito manifestação, evento, aviso — nem reaberto coisa alguma.
 *
 * A reabertura **não apaga a conclusão anterior**: `concluido_em`,
 * `concluido_por`, a observação final, os arquivos de entrega, o Histórico e a
 * avaliação continuam exatamente como estavam. O que muda é o status. O evento
 * de reabertura guarda uma cópia dos dados daquela conclusão justamente porque
 * uma conclusão futura vai sobrescrever as colunas — e o ciclo anterior precisa
 * sobreviver no Histórico.
 */
export async function analisarSolicitacaoDeAjuste({
  solicitacaoId,
  usuarioId,
  decisao,
  resposta,
}: {
  solicitacaoId: string
  /** Quem decide. Vem da sessão — nunca do formulário. */
  usuarioId: string
  decisao: 'aceitar' | 'recusar'
  /** Obrigatória na recusa; observação opcional no aceite. */
  resposta?: string | null
}): Promise<ResultadoAnalise> {
  const [solicitacao] = await db
    .select({
      id: atendimentoAjustes.id,
      atendimentoId: atendimentoAjustes.atendimentoId,
      status: atendimentoAjustes.status,
      motivo: atendimentoAjustes.motivo,
      clienteUsuarioId: atendimentoAjustes.clienteUsuarioId,
    })
    .from(atendimentoAjustes)
    .where(eq(atendimentoAjustes.id, solicitacaoId))
    .limit(1)

  if (!solicitacao) return { sucesso: false, motivo: 'nao-encontrada' }

  const acesso = await obterAcessoAtendimento(
    solicitacao.atendimentoId,
    usuarioId,
  )
  if (!acesso || !respondePeloAtendimento(acesso.vinculo)) {
    return { sucesso: false, motivo: 'sem-acesso' }
  }
  if (solicitacao.status !== 'pendente') {
    return { sucesso: false, motivo: 'ja-analisada' }
  }

  const texto = resposta?.trim().slice(0, TAMANHO_MAXIMO_RESPOSTA_AJUSTE) || null
  if (
    decisao === 'recusar' &&
    (!texto || texto.length < TAMANHO_MINIMO_JUSTIFICATIVA_RECUSA)
  ) {
    return { sucesso: false, motivo: 'justificativa-obrigatoria' }
  }

  const [atual] = await db
    .select({
      status: atendimentos.status,
      concluidoEm: atendimentos.concluidoEm,
      concluidoPor: atendimentos.concluidoPor,
      observacaoFinal: atendimentos.observacaoFinal,
    })
    .from(atendimentos)
    .where(eq(atendimentos.id, solicitacao.atendimentoId))
    .limit(1)
  if (!atual) return { sucesso: false, motivo: 'nao-encontrada' }
  if (decisao === 'aceitar' && atual.status !== STATUS_QUE_ACEITA_PEDIDO) {
    return { sucesso: false, motivo: 'atendimento-nao-concluido' }
  }

  const [autor] = await db
    .select({ nome: usuarios.nome, empresaId: usuarios.empresaId })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  const nomeAutor = autor?.nome ?? 'Equipe'
  const aceita = decisao === 'aceitar'
  const agora = new Date()

  let gravado: {
    conflito: boolean
    manifestacaoId: string
    aviso: {
      protocolo: string
      clienteUsuarioId: string
      equipe: string[]
      tituloCliente: string
      tituloEquipe: string
    } | null
  }

  try {
    gravado = await db.transaction(async (tx) => {
      // A disputa acontece nesta linha, e só nela. Quem não encontrar a
      // solicitação pendente perdeu — e não escreveu nada.
      const [decidida] = await tx
        .update(atendimentoAjustes)
        .set({
          status: aceita ? 'aceita' : 'recusada',
          resposta: texto,
          analisadoPor: usuarioId,
          analisadoEm: agora,
          updatedAt: agora,
        })
        .where(
          and(
            eq(atendimentoAjustes.id, solicitacaoId),
            eq(atendimentoAjustes.status, 'pendente'),
          ),
        )
        .returning({ id: atendimentoAjustes.id })

      if (!decidida) {
        return { conflito: true, manifestacaoId: '', aviso: null }
      }

      const conteudo = montarTextoDaDecisao({ aceita, resposta: texto })
      const [manifestacao] = await tx
        .insert(atendimentoManifestacoes)
        .values({
          atendimentoId: solicitacao.atendimentoId,
          autorId: usuarioId,
          papelAutor: 'participante',
          conteudo,
          // A decisão sobre um pedido do Cliente é do registro formal inteiro:
          // a equipe e o Cliente leem a mesma linha, como na conclusão.
          visibilidade: 'participantes_e_cliente',
          respondeManifestacaoId: null,
        })
        .returning({ id: atendimentoManifestacoes.id })

      await tx.insert(atendimentoEventos).values({
        atendimentoId: solicitacao.atendimentoId,
        tipo: aceita
          ? TIPOS_EVENTO_ATENDIMENTO.ajusteAceito
          : TIPOS_EVENTO_ATENDIMENTO.ajusteRecusado,
        descricao: aceita
          ? `${nomeAutor} aceitou a solicitação de ajuste do cliente.`
          : `${nomeAutor} recusou a solicitação de ajuste do cliente.`,
        autorId: usuarioId,
        visivelCliente: true,
        metadados: {
          solicitacaoId,
          manifestacaoId: manifestacao.id,
          decisao,
          temResposta: Boolean(texto),
        },
      })

      let reaberturaEventoId: string | null = null

      if (aceita) {
        // A reabertura exige o status esperado: se o Atendimento deixou de estar
        // concluído entre a leitura e a escrita, nada acontece — e a decisão
        // acima é desfeita junto, pela exceção logo abaixo.
        const [reaberto] = await tx
          .update(atendimentos)
          .set({ status: STATUS_DA_REABERTURA, updatedAt: agora })
          .where(
            and(
              eq(atendimentos.id, solicitacao.atendimentoId),
              eq(atendimentos.status, STATUS_QUE_ACEITA_PEDIDO),
            ),
          )
          .returning({ id: atendimentos.id })

        if (!reaberto) throw new ReaberturaImpossivel()

        const [evento] = await tx
          .insert(atendimentoEventos)
          .values({
            atendimentoId: solicitacao.atendimentoId,
            // Tipo próprio, e não uma alteração genérica de status: "reaberto
            // após solicitação do cliente" é um fato diferente de "mudou de
            // coluna", e o Histórico precisa poder dizer qual dos dois foi.
            tipo: TIPOS_EVENTO_ATENDIMENTO.atendimentoReaberto,
            descricao: `Atendimento reaberto após solicitação do cliente por ${nomeAutor}.`,
            autorId: usuarioId,
            visivelCliente: true,
            metadados: {
              de: STATUS_QUE_ACEITA_PEDIDO,
              para: STATUS_DA_REABERTURA,
              deRotulo: ROTULO_STATUS_ATENDIMENTO[STATUS_QUE_ACEITA_PEDIDO],
              paraRotulo: ROTULO_STATUS_ATENDIMENTO[STATUS_DA_REABERTURA],
              solicitacaoId,
              motivoDoCliente: solicitacao.motivo,
              reabertoPor: usuarioId,
              reabertoEm: agora.toISOString(),
              /**
               * A conclusão que existia neste instante.
               *
               * Cópia deliberada, e a única do sistema: as colunas
               * `concluido_*` guardam só a conclusão mais recente, e uma
               * conclusão futura vai sobrescrevê-las. Sem este retrato, o ciclo
               * anterior desapareceria — e o Histórico precisa mostrar todos.
               */
              conclusaoAnterior: {
                em: atual.concluidoEm?.toISOString() ?? null,
                por: atual.concluidoPor,
                observacaoFinal: atual.observacaoFinal,
              },
            },
          })
          .returning({ id: atendimentoEventos.id })
        reaberturaEventoId = evento.id
      }

      await tx
        .update(atendimentoAjustes)
        .set({
          respostaManifestacaoId: manifestacao.id,
          reaberturaEventoId,
        })
        .where(eq(atendimentoAjustes.id, solicitacaoId))

      await registrarEventoAuditoria(
        {
          acao: aceita
            ? ACOES_AUDITORIA.atendimentoReaberto
            : ACOES_AUDITORIA.ajusteAnalisado,
          entidade: 'atendimento_ajustes',
          registroAfetado: solicitacaoId,
          autorId: usuarioId,
          empresaId: autor?.empresaId ?? null,
          origem: 'admin',
          metadados: {
            atendimentoId: solicitacao.atendimentoId,
            decisao,
            reaberto: aceita,
          },
        },
        tx,
      )

      const audiencia = await obterAudienciaDoAtendimento(
        tx,
        solicitacao.atendimentoId,
      )
      if (!audiencia) {
        return { conflito: false, manifestacaoId: manifestacao.id, aviso: null }
      }

      const tituloCliente = aceita
        ? `Sua solicitação de ajuste do atendimento ${audiencia.protocolo} foi aceita.`
        : `Sua solicitação de ajuste do atendimento ${audiencia.protocolo} foi analisada.`
      const tituloEquipe = aceita
        ? `${audiencia.protocolo} foi reaberto por ${nomeAutor} após solicitação do cliente.`
        : `${nomeAutor} recusou a solicitação de ajuste do ${audiencia.protocolo}.`
      const resumo = resumirTexto(conteudo)

      await emitirNotificacoes(tx, {
        destinatarios: [audiencia.clienteUsuarioId],
        autorId: usuarioId,
        tipo: TIPOS_NOTIFICACAO.ajusteAnalisado,
        titulo: tituloCliente,
        resumo,
        recursoTipo: 'atendimento',
        recursoId: solicitacao.atendimentoId,
        atendimentoId: solicitacao.atendimentoId,
        protocolo: audiencia.protocolo,
        destino: {
          pagina: 'atendimentos',
          atendimento: audiencia.protocolo,
          aba: 'protocolo',
        },
      })

      await emitirNotificacoes(tx, {
        destinatarios: audiencia.equipe,
        autorId: usuarioId,
        tipo: TIPOS_NOTIFICACAO.ajusteAnalisado,
        titulo: tituloEquipe,
        resumo,
        recursoTipo: 'atendimento',
        recursoId: solicitacao.atendimentoId,
        atendimentoId: solicitacao.atendimentoId,
        protocolo: audiencia.protocolo,
        destino: {
          pagina: 'atendimentos',
          atendimento: audiencia.protocolo,
          aba: 'protocolo',
        },
      })

      return {
        conflito: false,
        manifestacaoId: manifestacao.id,
        aviso: {
          protocolo: audiencia.protocolo,
          clienteUsuarioId: audiencia.clienteUsuarioId,
          equipe: audiencia.equipe,
          tituloCliente,
          tituloEquipe,
        },
      }
    })
  } catch (erro) {
    if (erro instanceof ReaberturaImpossivel) {
      return { sucesso: false, motivo: 'atendimento-nao-concluido' }
    }
    throw erro
  }

  if (gravado.conflito) return { sucesso: false, motivo: 'ja-analisada' }

  if (gravado.aviso) {
    await difundirSegmentado({
      // Aceitar move o card de coluna: para as telas abertas isso é um evento de
      // status, o mesmo que a conclusão publica. Recusar não move nada, e vai
      // como o que é — a resposta a um pedido, no Protocolo.
      tipo: aceita ? 'status' : 'ajuste',
      atendimentoId: solicitacao.atendimentoId,
      protocolo: gravado.aviso.protocolo,
      autorId: usuarioId,
      aba: 'protocolo',
      severidade: aceita ? 'sucesso' : 'informacao',
      avisos: [
        {
          destinatarios: [gravado.aviso.clienteUsuarioId],
          titulo: gravado.aviso.tituloCliente,
        },
        { destinatarios: gravado.aviso.equipe, titulo: gravado.aviso.tituloEquipe },
      ],
    })
  }

  return {
    sucesso: true,
    decisao,
    reaberto: aceita,
    solicitacaoId,
    manifestacaoId: gravado.manifestacaoId,
  }
}

/**
 * Encerra as solicitações que a nova conclusão resolve.
 *
 * Chamada de dentro da transação da conclusão. Um pedido `aceita` significa "o
 * Atendimento foi reaberto por causa disto"; concluir de novo é o fim daquele
 * ciclo, e deixar o pedido eternamente "aceito" faria o portal do Cliente
 * mostrar um ajuste em curso sobre um serviço já entregue outra vez.
 *
 * Pedido `pendente` **não** é tocado: ele não provocou reabertura nenhuma e
 * continua esperando análise.
 */
export async function encerrarAjustesResolvidos(
  executor: ExecutorDb,
  atendimentoId: string,
  agora = new Date(),
) {
  const encerrados = await executor
    .update(atendimentoAjustes)
    .set({ status: 'encerrada', updatedAt: agora })
    .where(
      and(
        eq(atendimentoAjustes.atendimentoId, atendimentoId),
        eq(atendimentoAjustes.status, 'aceita'),
      ),
    )
    .returning({ id: atendimentoAjustes.id })
  return encerrados.length
}
